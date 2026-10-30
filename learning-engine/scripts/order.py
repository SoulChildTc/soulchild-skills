#!/usr/bin/env python3
"""
阅读顺序检查：概念依赖 + 具体优先。

用法：
    python3 order.py content.json             # 报告
    python3 order.py content.json --strict    # 有问题就退出 1

检查四件事：

  1. 前向引用（prerequisite）
     某页用了术语 T，但 T 的定义在后面的页才出现。
     这是「读到一半看不懂」的最大来源。

  2. 概念跳跃
     两页之间同时引入超过 N 个新术语（默认 6），说明这页塞太满或顺序乱了。

  3. 抽象先行
     某章的第一次出现不是具体例子（代码/表格/步骤），而是纯概念段落。

  4. 章内结构
     章的第一页是否回答了「这章解决什么问题」，最后一页是否收尾。

术语的定义怎么判定：
    某页第一次出现 T，且该页的 title 或 h3 里包含 T
    → 视为这一页「引入了」T
    其他页首次出现 → 视为「使用」T
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import plain, load

# ── 这些不算术语：常见子命令动词、shell 参数、通用词 ──
# 项目自己的名字不写死在这里 —— 见 tool_names()，从 data 里现推。
STOP = set("""
run ps images start stop kill rm create exec logs inspect stats top diff cp
save load export import tag push pull login logout version info search
build builder system container image manifest
bash sh sh -it -i -t -d -p -v -f -m -u -e
true false none null yes no
localhost stdout stdin stderr exit
""".split())


def tool_names(data):
    """从数据里推出「这个项目自己叫什么」。

    代码块首词常常就是工具名（`rg 'fn main' src/` 的 `rg`）。
    把它当术语抽出来，就会出现「1-1 用了 rg，但 2-1 才讲它」这种假报。
    工具名从三处取：slug、project、reference 的 key 首词。
    """
    names = set()
    blob = [data.get("slug") or "", data.get("project") or ""]
    for r in data.get("reference") or []:
        key = (r.get("key") or "").strip()
        if key:
            blob.append(key.split()[0])
    for w in blob:
        w = w.strip().lower()
        if w:
            names.add(w)
            names.add(w.replace("-", ""))

    # 兜底：代码块首词在所有页里都出现 → 那是工具名，不是概念
    firsts = {}
    for st in data.get("stages") or []:
        for sp in st.get("steps") or []:
            for b in sp.get("blocks") or []:
                if b.get("type") == "code":
                    for line in (b.get("code") or "").split("\n"):
                        line = line.strip()
                        if line and not line.startswith("#"):
                            t = line.split()[0]
                            if re.match(r"^[a-zA-Z][\w.-]*$", t):
                                firsts[t.lower()] = firsts.get(t.lower(), 0) + 1
    pages = sum(len(st.get("steps") or []) for st in data.get("stages") or [])
    if pages:
        for t, n in firsts.items():
            if n >= max(2, pages // 2):
                names.add(t)

    return names


def extract_terms(blocks, extra_stop=()):
    """从代码标签和代码块里提取候选术语。"""
    blob = json.dumps(blocks, ensure_ascii=False)
    terms = set()

    # <code>xxx</code> 里的：保留前两个 token（子命令也是术语）
    for m in re.findall(r"<code>(.*?)</code>", blob):
        t = plain(m).strip()
        toks = t.split()
        if not toks:
            continue
        # "docker volume create" → 同时抓 "docker volume" 和 "volume"
        if len(toks) >= 2 and toks[0].lower() in ("docker", "kubectl", "git", "npm", "npx", "pip", "cargo", "go"):
            terms.add(f"{toks[0]} {toks[1]}")
            if len(toks[1]) >= 3:
                terms.add(toks[1])
        else:
            cand = toks[0]
            if 2 <= len(cand) <= 28:
                terms.add(cand)

    # 代码块里的命令名（首行首个词）
    for b in blocks:
        if b.get("type") == "code":
            for line in (b.get("code") or "").split("\n"):
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                tok = line.split()[0]
                if 2 <= len(tok) <= 28 and re.match(r"^[a-zA-Z][\w.-]*$", tok):
                    terms.add(tok)

    skip = STOP | {x.lower() for x in extra_stop}
    return {t for t in terms if t.lower() not in skip and len(t) >= 2}


def check(data):
    errors = []
    warns = []

    stages = data.get("stages") or []

    # 建页序
    pages = []
    for si, st in enumerate(stages):
        for ii, sp in enumerate(st["steps"]):
            pages.append({
                "si": si, "ii": ii,
                "loc": f"{si+1}-{ii+1}",
                "title": sp.get("title", ""),
                "blocks": sp.get("blocks") or [],
                "chapter": st.get("name", ""),
            })

    extra = tool_names(data)

    # ── 1. 建立术语 → 引入位置 ──
    #
    # 「引入」的判定：该页是术语的**首次出现**，且这一页给了它足够篇幅
    # （有 h3 提到它，或者这页标题就是它，或者它不止出现一次）。
    # 只出现一次且没有小标题 —— 视为「顺带提到」，不算引入。
    first_use = {}     # term -> index
    occurrences = {}   # term -> [(index, count)]

    for i, p in enumerate(pages):
        terms = extract_terms(p["blocks"], extra)
        for t in terms:
            if t not in first_use:
                first_use[t] = i
            occurrences.setdefault(t, []).append(i)

    # 收集每页的标题集合（title + h3）
    heads_of = []
    for p in pages:
        h = p["title"] + " " + " ".join(
            plain(b.get("text", "")) for b in p["blocks"] if b.get("type") == "h3")
        heads_of.append(h)

    intro_at = {}
    for t, i in first_use.items():
        # 首次出现的那页：标题里有，或者这页提到它 >= 2 次
        if t in heads_of[i] or len(occurrences.get(t, [])) >= 2:
            intro_at[t] = i
        else:
            # 否则往后找第一个标题里有的页
            for j in range(i + 1, len(pages)):
                if t in heads_of[j]:
                    intro_at[t] = j
                    break

    # ── 2. 前向引用 ──
    forward = []
    for t, use_i in first_use.items():
        def_i = intro_at.get(t)
        if def_i is not None and def_i > use_i:
            forward.append((t, pages[use_i]["loc"], pages[def_i]["loc"]))

    # 按首次使用位置排序，只报前 10 个
    forward.sort(key=lambda x: x[1])
    for t, use_loc, def_loc in forward[:10]:
        errors.append(
            f"{use_loc} 用了「{t}」，但 {def_loc} 才讲它 — 读到这页会卡住"
        )
    if len(forward) > 10:
        errors.append(f"... 还有 {len(forward)-10} 处前向引用")

    # ── 3. 概念跳跃：单页新术语太多 ──
    seen = set()
    for p in pages:
        terms = extract_terms(p["blocks"], extra)
        new = terms - seen
        seen |= terms
        if len(new) > 6:
            warns.append(
                f"{p['loc']}「{p['title']}」一次引入 {len(new)} 个新术语："
                f"{', '.join(sorted(new)[:6])}… 考虑拆页"
            )

    # ── 4. 抽象先行：第一页没有任何具体内容 ──
    for si, st in enumerate(stages):
        first = st["steps"][0]
        kinds = {b.get("type") for b in first.get("blocks") or []}
        concrete = kinds & {"code", "table", "ol", "opts", "kv"}
        if not concrete:
            warns.append(
                f"第 {si+1} 章「{st.get('name')}」的第一页"
                f"「{first.get('title')}」没有代码/表格/步骤，纯概念开头。"
                f"读者缺少抓手。"
            )

    # ── 5. 章内结构 ──
    for si, st in enumerate(stages):
        steps = st["steps"]
        if len(steps) < 2:
            continue
        # 最后一页应该收尾（有列表/表格/总结类）
        last = steps[-1]
        kinds = {b.get("type") for b in last.get("blocks") or []}
        if not (kinds & {"table", "ul", "ol", "note"}):
            warns.append(
                f"第 {si+1} 章「{st.get('name')}」的最后一页"
                f"「{last.get('title')}」没有小结或对照表，读者不知道这章结束了"
            )

    # ── 6. 术语只出现一次就消失 ──
    counts = {}
    for p in pages:
        for t in extract_terms(p["blocks"]):
            counts[t] = counts.get(t, 0) + 1
    one_off = [t for t, c in counts.items() if c == 1 and len(t) > 4]
    if len(one_off) > 8:
        warns.append(
            f"{len(one_off)} 个术语只出现过一次，可能是随口一提没展开："
            f"{', '.join(sorted(one_off)[:5])}…"
        )

    return errors, warns, len(pages), len(forward)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)

    strict = "--strict" in sys.argv
    data, err = load(sys.argv[1])
    if err:
        print(f"❌ {err}")
        sys.exit(1)

    errors, warns, npages, nforward = check(data)

    print(f"\n阅读顺序检查 · {npages} 页\n")

    if errors:
        print(f"✗ {len(errors)} 个硬伤\n")
        for e in errors:
            print("   ", e)
    if warns:
        print(f"\n! {len(warns)} 条建议\n")
        for w in warns:
            print("   ", w)

    if not errors and not warns:
        print("✅  顺序没问题")
        return

    if errors or (strict and warns):
        sys.exit(1)


if __name__ == "__main__":
    main()
