#!/usr/bin/env python3
"""
校验产出的 HTML。

和 build.py 的分工：
    build.py  校验 content.json（数据对不对）
    verify.py 校验 index.html（注入有没有损坏）

不重复业务检查 —— 那些 build.py 已经做过了。这里只验三件
「只有看产物才知道」的事：

    1. DATA 能不能完整还原回来（注入过程有没有损坏）
    2. HTML 结构有没有被内容破坏（script 标签闭合、占位符残留）
    3. 覆盖率文件（可选）

用法：
    python3 verify.py index.html
    python3 verify.py index.html --coverage coverage.json
    python3 verify.py index.html --expect content.json    # 往返比对
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import load


def extract_payload(html):
    """从 HTML 里抠出 DATA 的 JSON 原文。

    支持两种写法：
        const DATA = {...};
        <script type="application/json" id="data">{...}</script>
    """
    m = re.search(r"const DATA = (\{.*?\});\s*\n", html, re.S)
    if m:
        return m.group(1)

    m = re.search(r'<script[^>]*id="data"[^>]*>(.*?)</script>', html, re.S)
    if m:
        return m.group(1)

    return None


def unescape_json(raw):
    """还原 \\u003c 这类转义，让 JSON 能被 json.loads 解析。

    json.loads 本来就能处理 \\u003c，所以这里其实不需要做什么。
    保留这个函数是为了显式说明：转义是合法的 JSON，不是字符串替换。
    """
    return raw


def check_structure(html):
    """HTML 结构完整性。这类问题 build.py 看不到。"""
    errors = []
    warns = []

    # script 标签必须成对
    opens = len(re.findall(r"<script\b", html))
    closes = len(re.findall(r"</script>", html))
    if opens != closes:
        errors.append(
            f"script 标签不配对：{opens} 个 <script>，{closes} 个 </script>。"
            f"通常是内容里含 <!--<script> 之类的片段破坏了 HTML 解析"
        )

    # 占位符不该残留
    left = set(re.findall(r"\{\{(\w+)\}\}", html))
    known = {"LANG", "PROJECT", "DATA"}
    if left & known:
        errors.append(f"模板占位符没替换：{', '.join(sorted(left & known))}")

    # 必须有内容容器。目录的容器名随模板不同（toc / index），
    # 但必须存在一个。
    for markers, desc in [
        (('id="toc"', 'id="index"'), "目录"),
        (('id="main"',), "正文区"),
        (('const DATA =',), "数据"),
    ]:
        if not any(m in html for m in markers):
            errors.append(f"缺少{desc}（找不到 {' 或 '.join(markers)}）")

    # 空数据
    if "const DATA = {}" in html or "const DATA = {\n}" in html:
        errors.append("DATA 是空对象")

    return errors, warns


def check_roundtrip(html, content_path):
    """把 HTML 里的 DATA 抠出来，和原始 content.json 比对。

    这是唯一能发现「注入过程损坏了数据」的检查。
    """
    errors = []

    raw = extract_payload(html)
    if raw is None:
        return ["找不到 DATA，无法做往返比对"]

    try:
        embedded = json.loads(unescape_json(raw))
    except json.JSONDecodeError as e:
        return [f"HTML 里的 DATA 不是合法 JSON：{e.msg}（位置 {e.pos}）"]

    original, err = load(content_path)
    if err:
        return [f"读不到对照文件：{err}"]

    if embedded != original:
        # 找第一处不同，给出定位
        def diff(a, b, path=""):
            if type(a) is not type(b):
                return f"{path}: 类型不同 {type(a).__name__} vs {type(b).__name__}"
            if isinstance(a, dict):
                for k in set(a) | set(b):
                    if k not in a:
                        return f"{path}.{k}: 只在产出里有"
                    if k not in b:
                        return f"{path}.{k}: 只在源文件里有"
                    d = diff(a[k], b[k], f"{path}.{k}")
                    if d:
                        return d
            elif isinstance(a, list):
                if len(a) != len(b):
                    return f"{path}: 长度不同 {len(a)} vs {len(b)}"
                for i, (x, y) in enumerate(zip(a, b)):
                    d = diff(x, y, f"{path}[{i}]")
                    if d:
                        return d
            elif a != b:
                sa, sb = str(a)[:40], str(b)[:40]
                return f"{path}: {sa!r} vs {sb!r}"
            return None

        d = diff(embedded, original) or "未知差异"
        errors.append(f"产出的 DATA 和源文件不一致 — {d}")
    else:
        # 顺手统计一下规模
        n_stages = len(original.get("stages") or [])
        n_pages = sum(len(s.get("steps") or []) for s in original.get("stages") or [])
        errors.append(None)  # 占位，下面过滤

    return [e for e in errors if e]


def check_coverage(path):
    """可选：覆盖度文件。"""
    d, err = load(path)
    if err:
        return f"覆盖度文件读不了：{err}"

    total = d.get("total") or 0
    written = d.get("written") or 0
    if total <= 0:
        return "coverage.total 必须大于 0"

    skipped = d.get("skipped") or []
    no_reason = [s for s in skipped if not s.get("reason")]
    if no_reason:
        return f"{len(no_reason)} 个跳过项没写原因"

    pct = written / total * 100
    if pct < 80:
        return f"覆盖度 {pct:.1f}% < 80%，不合格"
    if pct < 95:
        return f"覆盖度 {pct:.1f}%，需在 intro 说明没覆盖什么"
    return None


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)

    html_path = sys.argv[1]
    try:
        html = open(html_path).read()
    except FileNotFoundError:
        print(f"❌ 文件不存在: {html_path}")
        sys.exit(1)

    errors = []
    warns = []

    e, w = check_structure(html)
    errors += e
    warns += w

    expect = None
    if "--expect" in sys.argv:
        i = sys.argv.index("--expect")
        if i + 1 < len(sys.argv):
            expect = sys.argv[i + 1]

    if expect:
        errors += check_roundtrip(html, expect)

    cov_msg = None
    if "--coverage" in sys.argv:
        i = sys.argv.index("--coverage")
        if i + 1 < len(sys.argv):
            cov_msg = check_coverage(sys.argv[i + 1])
            if cov_msg:
                errors.append(cov_msg)

    # 统计
    raw = extract_payload(html)
    stats = ""
    if raw:
        try:
            d = json.loads(raw)
            n_stages = len(d.get("stages") or [])
            n_pages = sum(len(s.get("steps") or []) for s in d.get("stages") or [])
            n_ref = len(d.get("reference") or [])
            n_cat = len({r.get("cat") for r in d.get("reference") or [] if r.get("cat")})
            stats = f"{n_stages} 章  {n_pages} 节  {n_ref} 条参考  {n_cat} 个分类"
        except Exception:
            pass

    if errors:
        print(f"\n✗ {len(errors)} 个问题\n")
        for e in errors:
            print("   ", e)
        sys.exit(1)

    if warns:
        print(f"\n! {len(warns)} 条提醒\n")
        for w in warns:
            print("   ", w)

    size_kb = len(html) / 1024
    print(f"OK  {stats}  {size_kb:.0f} KB")

    if expect:
        print("    往返比对一致")
    if cov_msg is None and "--coverage" in sys.argv:
        print("    覆盖度达标")


if __name__ == "__main__":
    main()
