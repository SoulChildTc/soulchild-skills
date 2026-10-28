#!/usr/bin/env python3
"""
内容质量检查。build.py 只管结构合法，这个管「读起来像不像人话」。

用法：
    python3 lint.py content.json
    python3 lint.py content.json --strict    # 把警告也当错误

分两级：
    ✗ 硬伤  必须改，否则生成出来的东西是错的
    ! 建议  改不改都行，但改了更好
"""
import json
import re
import sys


# ── AI 腔词表 ──
AI_PHRASES = [
    "值得注意的是", "换句话说", "总的来说", "综上所述", "总而言之",
    "不难看出", "显而易见", "众所周知", "毋庸置疑",
    "不仅仅是", "不只是", "而是", "至关重要", "极其重要", "非常实用",
    "赋能", "闭环", "抓手", "打法", "颗粒度",
    "在当今", "随着.*?的发展", "日益", "愈发",
]

# ── 软化措辞：只抓「不给依据的空话」，不抓「给出具体值的建议」 ──
#
# 「建议」本身是好事：它替读者做了决策。要抓的是「建议」后面没内容。
# 判定方式：句子里有软化词 + 没有具体值/命令/明确动作 = 空话
SOFT_WORDS = ["可以考虑", "根据情况", "视情况", "酌情", "尽量", "大概", "或许", "可能"]

# 「建议」单独判定：有具体依据就放行
ADVICE_WORDS = ["建议"]

# 出现这些 = 给了具体依据，不算空话
CONCRETE = [
    r"\d",                                    # 任何数字
    r"<code>",                                 # 行内代码标签
    r"`[^`]+`",                                # markdown 行内代码
    r"(?:^|\s)--?[a-zA-Z][\w-]*",             # --flag / -f
    r"[\u4e00-\u9fa5]{1,6}(?:命令|参数|选项|字段|变量)",
]

# 出现这些 = 明确的动作（不是「调整」「优化」这种空动作）
CONCRETE_VERBS = ["改成", "换成", "设为", "设置成", "用在", "配成",
                  "写在", "跑一遍", "执行", "加上", "删掉", "关掉", "打开"]

# 「调整」「优化」「关注」「处理」这类是空动作，不算依据
VAGUE_VERBS = ["调整", "优化", "关注", "处理", "改进", "完善", "把握"]

# ── 正确但没用的句子 ──
EMPTY_PATTERNS = [
    r"是一个开源的",
    r"是一个强大的",
    r"根据自己的需求",
    r"配置正确非常重要",
    r"可以帮助你",
]


def plain(t):
    """去 HTML，拿纯文本。"""
    if not isinstance(t, str):
        return ""
    return re.sub(r"<[^>]+>", "", t)


def collect_text(data):
    """收集所有可读文本。返回 (位置, 纯文本, 原始 HTML)。

    两个都要：判断「有没有具体值」要看原始 HTML（<code> 标签），
    判断「说了什么」要看纯文本。
    """
    out = []

    def add(loc, raw):
        if not isinstance(raw, str) or not raw.strip():
            return
        out.append((loc, plain(raw), raw))

    for si, st in enumerate(data.get("stages") or []):
        for ii, sp in enumerate(st.get("steps") or []):
            loc = f"{si+1}-{ii+1}「{sp.get('title','?')}」"
            for b in sp.get("blocks") or []:
                t = b.get("type")
                if t in ("p", "h3", "note", "warn"):
                    add(loc, b.get("text", ""))
                elif t in ("ul", "ol"):
                    for x in b.get("items") or []:
                        add(loc, x)
                elif t == "table":
                    for r in b.get("rows") or []:
                        for c in r:
                            add(loc, c)
                elif t == "kv":
                    for pair in b.get("items") or []:
                        for c in pair:
                            add(loc, c)
                elif t == "split":
                    for c in b.get("items") or []:
                        add(loc, c.get("p", ""))
                elif t == "opts":
                    for o in b.get("items") or []:
                        add(loc, o.get("title",""))
                        add(loc, o.get("desc",""))
    return out


def check(data):
    errors = []
    warns = []

    texts = collect_text(data)

    # 1. AI 腔
    for loc, t, raw in texts:
        for ph in AI_PHRASES:
            if re.search(ph, t):
                errors.append(f"{loc} AI 腔：「{ph}」— {t[:50]}")

    # 2. 软化措辞：只报「没有具体依据」的那些
    soft_hits = 0
    for loc, t, raw in texts:
        has_concrete = (
            any(re.search(c, raw) for c in CONCRETE)
            or any(v in t for v in CONCRETE_VERBS)
        )
        # 全是空动作的话，即使没有软化词也算空话
        is_vague_only = (
            not has_concrete
            and any(v in t for v in VAGUE_VERBS)
        )

        hit = None
        for w in SOFT_WORDS:
            if w in t:
                hit = w
                break
        if not hit:
            for w in ADVICE_WORDS:
                if w in t:
                    hit = w
                    break

        if not hit:
            continue

        if has_concrete:
            # 给了具体值或做法，是有效建议，放行
            continue

        soft_hits += 1
        warns.append(f"{loc} 空泛措辞：「{hit}」但没给具体值 — {t[:50]}")

    # 2b. 只有空动作、没有具体值
    for loc, t, raw in texts:
        if any(v in t for v in VAGUE_VERBS):
            has_concrete = (
                any(re.search(c, raw) for c in CONCRETE)
                or any(v in t for v in CONCRETE_VERBS)
            )
            if not has_concrete:
                soft_hits += 1
                warns.append(f"{loc} 只有空动作没有具体做法 — {t[:50]}")

    if soft_hits >= 3:
        errors.append(f"空泛措辞出现 {soft_hits} 处（阈值 3），应补上具体值或做法")

    # 3. 正确的废话
    for loc, t, raw in texts:
        for pat in EMPTY_PATTERNS:
            if re.search(pat, t):
                warns.append(f"{loc} 疑似空话：「{t[:50]}」")

    # 4. 段落过长
    for si, st in enumerate(data.get("stages") or []):
        for ii, sp in enumerate(st.get("steps") or []):
            loc = f"{si+1}-{ii+1}「{sp.get('title','?')}」"
            for b in sp.get("blocks") or []:
                if b.get("type") == "p":
                    t = plain(b.get("text", ""))
                    if len(t) > 220:
                        warns.append(f"{loc} 段落 {len(t)} 字，建议拆成两段")

    # 5. 加粗过多（一页最多两处）
    for si, st in enumerate(data.get("stages") or []):
        for ii, sp in enumerate(st.get("steps") or []):
            loc = f"{si+1}-{ii+1}「{sp.get('title','?')}」"
            blob = json.dumps(sp.get("blocks") or [], ensure_ascii=False)
            n = len(re.findall(r"<strong>|<b>", blob))
            if n > 2:
                warns.append(f"{loc} 加粗 {n} 处，一页最多两处")

    # 6. 标题声称的数量 vs 实际条目
    CN = {"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10}
    for si, st in enumerate(data.get("stages") or []):
        for ii, sp in enumerate(st.get("steps") or []):
            loc = f"{si+1}-{ii+1}"
            m = re.match(r"^[^：:]*[：:]\s*([二三四五六七八九十]+)\s*[种个类条]", sp.get("title",""))
            if m and m.group(1) in CN:
                claimed = CN[m.group(1)]
                actual = 0
                for b in sp.get("blocks") or []:
                    if b.get("type") in ("opts","ul","ol"):
                        actual = max(actual, len(b.get("items") or []))
                if actual and claimed != actual:
                    errors.append(f"{loc}「{sp['title']}」声称 {claimed}，实际 {actual}")

    # 7. 术语未定义：英文术语首次出现，前后 40 字内没有中文解释
    #    只提示，不强制（误报率高）
    # 跳过，避免噪音

    # 8. 建议项：来源类型分布
    src = data.get("sources") or {}
    kinds = {}
    for v in src.values():
        kinds[v.get("kind")] = kinds.get(v.get("kind"), 0) + 1
    total_src = sum(kinds.values())
    if total_src and not kinds.get("run"):
        warns.append(f"全部 {total_src} 条来源里没有一条 run（实测），可信度打折")
    if total_src >= 5 and kinds.get("doc", 0) / total_src > 0.9:
        warns.append(f"{kinds.get('doc',0)}/{total_src} 条来源都是文档，没交叉验证源码")

    # 9. 参考条目的 doc 字段太空
    thin = [r.get("key") for r in (data.get("reference") or [])
            if len(plain(r.get("doc",""))) < 12]
    if thin:
        warns.append(f"{len(thin)} 条参考只有一句话没有细节：{', '.join(thin[:5])}")

    return errors, warns


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)

    strict = "--strict" in sys.argv
    data = json.load(open(sys.argv[1]))
    errors, warns = check(data)

    if errors:
        print(f"\n✗ {len(errors)} 个硬伤\n")
        for e in errors[:25]:
            print("   ", e)
        if len(errors) > 25:
            print(f"    ... 还有 {len(errors)-25} 个")

    if warns:
        print(f"\n! {len(warns)} 条建议\n")
        for w in warns[:20]:
            print("   ", w)
        if len(warns) > 20:
            print(f"    ... 还有 {len(warns)-20} 条")

    if not errors and not warns:
        print("✅  没有发现问题")
        return

    if errors or (strict and warns):
        sys.exit(1)


if __name__ == "__main__":
    main()
