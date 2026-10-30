#!/usr/bin/env python3
"""
从 content.json 生成单文件 HTML。

用法：
    python3 build.py content.json                        # 输出同目录 index.html
    python3 build.py content.json -o out.html
    python3 build.py content.json --theme longread        # 换模板
    python3 build.py content.json --check                 # 只校验，不生成

主题在 assets/templates/<name>/ 下，每个目录自足：
    template.html   骨架 + 样式
    engine.js       渲染引擎（含块渲染）

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
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, "assets")
TEMPLATES = os.path.join(ASSETS, "templates")
SCHEMA = os.path.join(ASSETS, "schema.json")

# 每个模板是一个自足的目录：骨架 + 样式 + 引擎 + 块渲染全在里面。
# 模板之间不共享文件，改一个不会波及另一个。
THEMES = {
    "paper": "paper",
    "longread": "longread",
}
DEFAULT_THEME = "paper"

# 引擎只认这十一种块；写差一个字，模板走 default 分支输出空字符串，
# 页面看着"校验全过"，实际整段内容丢了。所以必须在这里拦住。
BLOCK_TYPES = {"p", "h3", "ul", "ol", "note", "warn", "code", "table", "kv", "split", "opts"}
BLOCK_REQUIRED = {
    "p": ("text",), "h3": ("text",),
    "ul": ("items",), "ol": ("items",),
    "note": ("text",), "warn": ("text",),
    "code": ("code",),
    "table": ("head", "rows"),
    "kv": ("items",), "split": ("items",), "opts": ("items",),
}


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
    if len(intro) > 400:
        errs.append(f"intro 有 {len(intro)} 字，超过 400，读者不会读完")

    # 字段长度：schema 里有限制，零依赖环境下也得拦
    for f, lo, hi in (("project", 1, 40), ("subtitle", 2, 60)):
        v = str(data.get(f) or "")
        if hi and len(v) > hi:
            errs.append(f"{f} 有 {len(v)} 字，超过 {hi}")

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
        elif len(v["why"]) > 80:
            errs.append(f"来源 {k} 的 why 有 {len(v['why'])} 字，超过 80，写成一句话")

    stages = data.get("stages") or []
    if not stages:
        errs.append("stages 为空")

    total_pages = 0
    for si, st in enumerate(stages):
        loc = f"第 {si+1} 章「{st.get('name','?')}」"
        if not st.get("name"):
            errs.append(f"{loc} 缺 name")
        elif len(st["name"]) > 20:
            errs.append(f"{loc} 章名 {len(st['name'])} 字，超过 20")
        if not st.get("desc"):
            errs.append(f"{loc} 缺 desc")
        elif len(st.get("desc", "")) > 150:
            errs.append(f"{loc} 的 desc 超过 150 字")
        steps = st.get("steps") or []
        if not steps:
            errs.append(f"{loc} 没有 steps")
        if len(steps) > 8:
            errs.append(f"{loc} 有 {len(steps)} 节，超过 8 节，应拆成两章")
        for ii, sp in enumerate(steps):
            total_pages += 1
            p = f"{loc} 第 {ii+1} 节「{sp.get('title','?')}」"
            if not sp.get("title"):
                errs.append(f"{p} 缺 title")
            elif len(sp["title"]) > 40:
                errs.append(f"{p} 标题 {len(sp['title'])} 字，超过 40")

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
                if t not in BLOCK_TYPES:
                    errs.append(f"{p} 未知块类型 {t!r}，渲染时会被静默丢弃")
                    continue
                # 顶层必填：缺了整块渲染成空
                for fld in BLOCK_REQUIRED.get(t, ()):
                    if not b.get(fld):
                        errs.append(f"{p} 的 {t} 块缺 {fld}，渲染时会被静默丢弃")

                # 嵌套字段：缺了会渲染出 "undefined"，比整块丢失更难看
                if t in ("ul", "ol"):
                    items = b.get("items") or []
                    if len(items) < 2:
                        errs.append(f"{p} 的 {t} 只有 {len(items)} 项，列表至少要 2 项")
                    if len(items) > 12:
                        errs.append(f"{p} 的 {t} 有 {len(items)} 项，超过 12")
                elif t == "kv":
                    for it in b.get("items") or []:
                        if not isinstance(it, list) or len(it) != 2:
                            errs.append(f"{p} 的 kv 每行必须是 [键, 值] 两个元素，实际 {it!r}")
                            break
                elif t == "split":
                    for it in b.get("items") or []:
                        if not isinstance(it, dict) or not it.get("h") or not it.get("p"):
                            errs.append(f"{p} 的 split 每栏必须有 h 和 p，实际缺 "
                                        f"{'h' if not (it or {}).get('h') else 'p'}")
                            break
                elif t == "opts":
                    for it in b.get("items") or []:
                        if not isinstance(it, dict) or not it.get("title"):
                            errs.append(f"{p} 的 opts 每个选项必须有 title，"
                                        f"否则渲染成 undefined")
                            break
                elif t == "table":
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
        for f, hi in (("key", 60), ("short", 60), ("cat", 12)):
            if len(str(r.get(f) or "")) > hi:
                errs.append(f"参考条目 {r.get('key','?')} 的 {f} 超过 {hi} 字")

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
def build(data, out_path, theme=DEFAULT_THEME):
    tdir = os.path.join(TEMPLATES, THEMES[theme])
    tpl = open(os.path.join(tdir, "template.html")).read()
    engine = open(os.path.join(tdir, "engine.js")).read()

    payload = json.dumps(data, ensure_ascii=False, indent=1)
    # 转义 < > &：同时干掉 </script>、<!--、<script 三种注入
    # 用 \u003c 而不是 \/ —— 前者是 JSON 合法转义，json.loads 能还原
    payload = (payload
               .replace("<", "\\u003c")
               .replace(">", "\\u003e")
               .replace("&", "\\u0026"))

    # 引擎先填 DATA，再整体塞进模板。
    # re.sub 只扫一遍，所以 {{DATA}} 必须先在这一步换掉。
    engine = engine.replace("{{DATA}}", payload)

    # 单次替换：避免 project 里含 {{DATA}} 被二次扫描
    def sub(m):
        key = m.group(1)
        if key == "LANG":
            return "zh-CN"
        if key == "PROJECT":
            return html_lib.escape(data["project"])
        if key == "DATA":
            return payload
        if key == "ENGINE":
            return engine
        raise KeyError(f"未知占位符: {{{{key}}}}")

    out = re.sub(r"\{\{(\w+)\}\}", sub, tpl)

    # 断言模板里的占位符都换掉了。
    # 只查模板原有的，不扫输出 —— 用户内容里可能真的含 {{...}}，
    # 那是数据，不是漏替换。
    left = set(re.findall(r"\{\{(\w+)\}\}", tpl)) - {"LANG", "PROJECT", "DATA", "ENGINE"}
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
    theme = DEFAULT_THEME

    if "-o" in sys.argv:
        i = sys.argv.index("-o")
        if i + 1 < len(sys.argv):
            out = sys.argv[i + 1]

    if "--theme" in sys.argv:
        i = sys.argv.index("--theme")
        if i + 1 >= len(sys.argv):
            print("--theme 需要一个值: " + " / ".join(THEMES))
            sys.exit(2)
        theme = sys.argv[i + 1]
        if theme not in THEMES:
            print(f"未知主题: {theme}，可选: {', '.join(THEMES)}")
            sys.exit(2)

    try:
        data = json.load(open(src))
    except FileNotFoundError:
        print(f"FAIL  文件不存在: {src}")
        print(f"      当前目录: {os.getcwd()}")
        print(f"      提示: 路径相对当前目录解析，检查是不是少写了目录前缀")
        sys.exit(1)
    except IsADirectoryError:
        print(f"FAIL  这是个目录，不是文件: {src}")
        sys.exit(1)
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

    # 一本书只能有一个 HTML。part1/part2 这种拆法会让读者在文件间跳，
    # 丢掉统一目录和统一进度。
    base = os.path.basename(out)
    if re.match(r"^(part|vol|book)[-_]?\d+\.html$", base, re.I):
        print(f"❌ 不要按册拆分文件：{base}")
        print("   所有章节放进同一个 index.html，左栏会自动列出全部章节。")
        sys.exit(1)

    size = build(data, out, theme)
    print(f"✅  {out}  [{theme}]")
    print(f"    {stages} 章 · {pages} 节 · {refs} 条参考 · {size/1024:.0f} KB")


if __name__ == "__main__":
    main()
