#!/usr/bin/env python3
"""
文风检查。规则在 assets/lint-rules.json，改规则不用改代码。

用法：
    python3 lint.py content.json
    python3 lint.py content.json --strict    # 建议也当错误

设计参考 Vale：规则是数据，引擎是通用的。
四种规则类型：
    existence    出现即报
    conditional  出现 A 但缺 B（空话检测）
    occurrence   单页出现次数超限
    length       文本长度超限
"""
import json
import re
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from _common import plain, load, claimed_count

HERE = __file__.rsplit("/", 1)[0]
RULES = HERE + "/assets/lint-rules.json"


def load_rules():
    d, err = load(RULES)
    if err:
        raise SystemExit(f"规则文件有问题：{err}")
    return d


def collect(data):
    """收集所有文本，返回 [(位置, 纯文本, 原始HTML, 块类型)]。"""
    out = []

    def add(loc, raw, kind=""):
        if isinstance(raw, str) and raw.strip():
            out.append((loc, plain(raw), raw, kind))

    for si, st in enumerate(data.get("stages") or []):
        for ii, sp in enumerate(st.get("steps") or []):
            loc = f"{si+1}-{ii+1}「{sp.get('title','?')}」"
            for b in sp.get("blocks") or []:
                t = b.get("type", "")
                if t in ("p", "h3", "note", "warn"):
                    add(loc, b.get("text", ""), t)
                elif t in ("ul", "ol"):
                    for x in b.get("items") or []:
                        add(loc, x, t)
                elif t == "table":
                    for r in b.get("rows") or []:
                        for c in r:
                            add(loc, c, t)
                elif t == "kv":
                    for pair in b.get("items") or []:
                        for c in pair:
                            add(loc, c, t)
                elif t == "split":
                    for c in b.get("items") or []:
                        add(loc, c.get("p", ""), t)
                elif t == "opts":
                    for o in b.get("items") or []:
                        add(loc, o.get("title", ""), t)
                        add(loc, o.get("desc", ""), t)
    return out


def run(rules, data):
    errors, warns = [], []
    texts = collect(data)
    agg = rules.get("aggregate", {}).get("warn_to_error_at", 3)

    def hit(level, msg, bucket):
        bucket.append(msg)

    # ── existence ──
    cfg = rules.get("existence", {})
    for r in cfg.get("rules", []):
        for loc, t, raw, _ in texts:
            for tok in r["tokens"]:
                if tok in t:
                    bucket = errors if cfg.get("level") == "error" else warns
                    hit(None, f"{loc} {r['message']}：「{tok}」— {t[:48]}", bucket)
                    break

    # ── conditional ──
    cond_soft = 0
    cfg = rules.get("conditional", {})
    for r in cfg.get("rules", []):
        for loc, t, raw, _ in texts:
            first = next((f for f in r["first"] if f in t), None)
            if not first:
                continue
            ok = any(re.search(p, raw) for p in r["need_one_of"])
            if ok:
                continue
            cond_soft += 1
            warns.append(f"{loc} {r['message']}：「{first}」— {t[:48]}")

    if cond_soft >= agg:
        errors.append(f"空泛表述 {cond_soft} 处（阈值 {agg}），应补上具体值或做法")

    # ── occurrence ── 按页统计
    cfg = rules.get("occurrence", {})
    for r in cfg.get("rules", []):
        for si, st in enumerate(data.get("stages") or []):
            for ii, sp in enumerate(st.get("steps") or []):
                blob = json.dumps(sp.get("blocks") or [], ensure_ascii=False)
                n = sum(blob.count(tok) for tok in r["tokens"])
                if n > r["max"]:
                    warns.append(
                        f"{si+1}-{ii+1}「{sp.get('title','?')}」"
                        f"{r['message']}（实际 {n} 处）"
                    )

    # ── length ──
    cfg = rules.get("length", {})
    for r in cfg.get("rules", []):
        for loc, t, raw, kind in texts:
            if kind != r["type"]:
                continue
            if len(t) > r["max_chars"]:
                warns.append(f"{loc} {r['message']}（{len(t)} 字）")

    # ── domain ──
    dom = rules.get("domain", {})

    if dom.get("check_title_count"):
        for si, st in enumerate(data.get("stages") or []):
            for ii, sp in enumerate(st.get("steps") or []):
                claimed = claimed_count(sp.get("title", ""))
                if not claimed:
                    continue
                actual = 0
                for b in sp.get("blocks") or []:
                    if b.get("type") in ("opts", "ul", "ol"):
                        actual = max(actual, len(b.get("items") or []))
                if actual and claimed != actual:
                    errors.append(
                        f"{si+1}-{ii+1}「{sp['title']}」声称 {claimed}，实际 {actual}"
                    )

    if dom.get("check_source_kind_mix"):
        src = data.get("sources") or {}
        kinds = {}
        for v in src.values():
            kinds[v.get("kind")] = kinds.get(v.get("kind"), 0) + 1
        total = sum(kinds.values())
        if total and not kinds.get("run"):
            warns.append(f"{total} 条来源里没有一条 run（实测），可信度打折")
        if total >= 5 and kinds.get("doc", 0) / total > 0.9:
            warns.append(f"{kinds.get('doc',0)}/{total} 条来源都是文档，没交叉验证源码")

    if dom.get("check_thin_reference"):
        floor = dom.get("thin_reference_min_chars", 12)
        thin = [r.get("key") for r in (data.get("reference") or [])
                if len(plain(r.get("doc", ""))) < floor]
        if thin:
            warns.append(
                f"{len(thin)} 条参考只有一句话没有细节：{', '.join(thin[:5])}"
            )

    return errors, warns


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)

    strict = "--strict" in sys.argv
    data, err = load(sys.argv[1])
    if err:
        print(f"❌ {err}")
        sys.exit(1)

    errors, warns = run(load_rules(), data)

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

    if errors or (strict and warns):
        sys.exit(1)


if __name__ == "__main__":
    main()
