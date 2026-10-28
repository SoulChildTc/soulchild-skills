#!/usr/bin/env python3
"""
从 content.json 生成单文件 HTML。

用法：
    python3 build.py content.json                 # 输出同目录 index.html
    python3 build.py content.json -o out.html
    python3 build.py content.json --check         # 只校验，不生成

职责分离：
    AI 只负责写 content.json（内容）
    build.py 负责校验 + 注入 + 输出（呈现）

这样样式不会被 AI 每次重新发明。
"""
import html as html_lib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "assets", "template.html")
SCHEMA = os.path.join(HERE, "assets", "schema.json")


# ══════════════════════════════════════════════════════════════
# 校验
# ══════════════════════════════════════════════════════════════
def load_schema():
    return json.load(open(SCHEMA))


def try_jsonschema(data):
    """如果装了 jsonschema，用它做完整校验。返回错误列表或 None（表示跳过）。"""
    try:
        import jsonschema
    except ImportError:
        return None
    try:
        jsonschema.validate(data, load_schema())
        return []
    except jsonschema.ValidationError as e:
        path = "/".join(str(p) for p in e.absolute_path) or "(root)"
        return [f"{path}: {e.message}"]
    except jsonschema.SchemaError as e:
        return [f"schema 本身有错: {e.message}"]


def manual_check(data):
    """不依赖 jsonschema 的兜底检查。覆盖最常犯的错。"""
    errs = []

    for f in ("slug", "project", "version", "subtitle", "intro", "sources", "stages"):
        if f not in data or data[f] in (None, "", {}, []):
            errs.append(f"缺少必填字段: {f}")

    slug = data.get("slug", "")
    if slug and not re.match(r"^[a-z0-9][a-z0-9-]*$", slug):
        errs.append(f"slug 只能小写字母数字连字符: {slug}")

    intro = data.get("intro", "")
    if intro and len(intro) < 40:
        errs.append(f"intro 太短（{len(intro)} 字），应写明版本、范围、不覆盖什么")

    src = data.get("sources") or {}
    for k, v in src.items():
        if not isinstance(v, dict):
            errs.append(f"来源 {k} 不是对象")
            continue
        if v.get("kind") not in ("run", "code", "doc"):
            errs.append(f"来源 {k} 的 kind 必须是 run/code/doc，实际 {v.get('kind')!r}")
        if not v.get("path"):
            errs.append(f"来源 {k} 缺 path")
        if not v.get("why"):
            errs.append(f"来源 {k} 缺 why")

    stages = data.get("stages") or []
    if not stages:
        errs.append("stages 为空")

    total_pages = 0
    for si, st in enumerate(stages):
        loc = f"第 {si+1} 章「{st.get('name','?')}」"
        if not st.get("name"):
            errs.append(f"{loc} 缺 name")
        if not st.get("desc"):
            errs.append(f"{loc} 缺 desc")
        steps = st.get("steps") or []
        if not steps:
            errs.append(f"{loc} 没有 steps")
        for ii, sp in enumerate(steps):
            total_pages += 1
            p = f"{loc} 第 {ii+1} 节「{sp.get('title','?')}」"
            if not sp.get("title"):
                errs.append(f"{p} 缺 title")

            keys = sp.get("sources") or []
            if not keys:
                errs.append(f"{p} 没有来源")
            for k in keys:
                if k not in src:
                    errs.append(f"{p} 引用了不存在的来源: {k}")

            blocks = sp.get("blocks") or []
            if not blocks:
                errs.append(f"{p} 没有内容")
            if len(blocks) > 12:
                errs.append(f"{p} 有 {len(blocks)} 个块，超过 12，应拆页")

            blob = json.dumps(blocks, ensure_ascii=False)
            for num in re.findall(r"\{\{(\d+)\}\}", blob):
                n = int(num)
                if n < 1 or n > len(keys):
                    errs.append(f"{p} 角标 {{{{{n}}}}} 超出 {len(keys)} 条来源")

            for b in blocks:
                t = b.get("type")
                if t == "table":
                    head = b.get("head") or []
                    rows = b.get("rows") or []
                    for r in rows:
                        if len(r) != len(head):
                            errs.append(f"{p} 表格行列数不一致: head={len(head)} row={len(r)}")
                            break

    # 参考条目
    for r in data.get("reference") or []:
        if not r.get("cat"):
            errs.append(f"参考条目缺 cat: {r.get('key','?')}")
        if not r.get("key"):
            errs.append("参考条目缺 key")
        if not r.get("short"):
            errs.append(f"参考条目缺 short: {r.get('key','?')}")

    return errs, total_pages


def check(data):
    """两份校验都跑，错误合并。

    jsonschema 表达不了的检查（来源 key 存在性、角标越界、表格行列、
    单页块数）只有 manual_check 有。装了 jsonschema 时不能丢掉它。
    """
    manual_errs, pages = manual_check(data)
    schema_errs = try_jsonschema(data)

    if schema_errs is None:
        return manual_errs, pages, "manual"

    # 去重：同一个问题两边都可能报，保留 manual 的中文版
    seen = set(manual_errs)
    merged = list(manual_errs)
    for e in schema_errs:
        if e not in seen:
            merged.append(e)

    return merged, pages, "schema+manual"


# ══════════════════════════════════════════════════════════════
# 生成
# ══════════════════════════════════════════════════════════════
def build(data, out_path):
    tpl = open(TEMPLATE).read()

    payload = json.dumps(data, ensure_ascii=False, indent=1)
    # 转义 < > &：同时干掉 </script>、<!--、<script 三种注入
    # 用 \u003c 而不是 \/ —— 前者是 JSON 合法转义，json.loads 能还原
    payload = (payload
               .replace("<", "\\u003c")
               .replace(">", "\\u003e")
               .replace("&", "\\u0026"))

    # 单次替换：避免 project 里含 {{DATA}} 被二次扫描
    def sub(m):
        key = m.group(1)
        if key == "LANG":
            return "zh-CN"
        if key == "PROJECT":
            return html_lib.escape(data["project"])
        if key == "DATA":
            return payload
        raise KeyError(f"未知占位符: {{{{key}}}}")

    out = re.sub(r"\{\{(\w+)\}\}", sub, tpl)

    # 断言模板里的占位符都换掉了。
    # 只查模板原有的，不扫输出 —— 用户内容里可能真的含 {{...}}，
    # 那是数据，不是漏替换。
    left = set(re.findall(r"\{\{(\w+)\}\}", tpl)) - {"LANG", "PROJECT", "DATA"}
    if left:
        raise RuntimeError(f"模板里有未知占位符: {', '.join(sorted(left))}")

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w") as f:
        f.write(out)

    return len(out)


# ══════════════════════════════════════════════════════════════
def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)

    src = sys.argv[1]
    out = None
    check_only = "--check" in sys.argv

    if "-o" in sys.argv:
        i = sys.argv.index("-o")
        if i + 1 < len(sys.argv):
            out = sys.argv[i + 1]

    try:
        data = json.load(open(src))
    except json.JSONDecodeError as e:
        print(f"FAIL  content.json 不是合法 JSON")
        print(f"      第 {e.lineno} 行第 {e.colno} 列: {e.msg}")
        if e.doc:
            lines = e.doc.split("\n")
            if 0 < e.lineno <= len(lines):
                print(f"      {lines[e.lineno-1][:100]}")
        sys.exit(1)

    errs, pages, mode = check(data)

    if errs:
        print(f"\n❌ {len(errs)} 个问题（校验方式: {mode}）\n")
        for e in errs[:30]:
            print("   ✗", e)
        if len(errs) > 30:
            print(f"   ... 还有 {len(errs)-30} 个")
        sys.exit(1)

    stages = len(data["stages"])
    refs = len(data.get("reference") or [])

    if check_only:
        print(f"✅  校验通过（{mode}）  {stages} 章  {pages} 节  {refs} 条参考")
        return

    if not out:
        out = os.path.join(os.path.dirname(os.path.abspath(src)), "index.html")

    size = build(data, out)
    print(f"✅  {out}")
    print(f"    {stages} 章 · {pages} 节 · {refs} 条参考 · {size/1024:.0f} KB")


if __name__ == "__main__":
    main()
