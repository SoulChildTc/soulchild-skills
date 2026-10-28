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

# ── 软化措辞：技术文档里不该出现 ──
SOFT_WORDS = ["建议", "可以考虑", "根据情况", "视情况", "酌情", "尽量", "大概", "或许", "可能"]

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
    """收集所有可读文本，标注来源位置。"""
    out = []
    for si, st in enumerate(data.get("stages") or []):
        for ii, sp in enumerate(st.get("steps") or []):
            loc = f"{si+1}-{ii+1}「{sp.get('title','?')}」"
            for b in sp.get("blocks") or []:
                t = b.get("type")
                if t in ("p", "h3", "note", "warn"):
                    out.append((loc, plain(b.get("text", ""))))
                elif t in ("ul", "ol"):
                    for x in b.get("items") or []:
                        out.append((loc, plain(x)))
                elif t == "table":
                    for r in b.get("rows") or []:
                        for c in r:
                            out.append((loc, plain(c)))
                elif t == "kv":
                    for pair in b.get("items") or []:
                        for c in pair:
                            out.append((loc, plain(c)))
                elif t == "split":
                    for c in b.get("items") or []:
                        out.append((loc, plain(c.get("p", ""))))
                elif t == "opts":
                    for o in b.get("items") or []:
                        out.append((loc, plain(o.get("title",""))))
                        out.append((loc, plain(o.get("desc",""))))
    return out


def check(data):
    errors = []
    warns = []

    texts = collect_text(data)

    # 1. AI 腔
    for loc, t in texts:
        for ph in AI_PHRASES:
            if re.search(ph, t):
                errors.append(f"{loc} AI 腔：「{ph}」— {t[:50]}")

    # 2. 软化措辞
    soft_hits = 0
    for loc, t in texts:
        for w in SOFT_WORDS:
            if w in t:
                soft_hits += 1
                warns.append(f"{loc} 软化措辞：「{w}」— {t[:50]}")
                break
    if soft_hits >= 3:
        errors.append(f"软化措辞出现 {soft_hits} 处（阈值 3），应改成明确指令")

    # 3. 正确的废话
    for loc, t in texts:
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
