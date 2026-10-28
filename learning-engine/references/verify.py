#!/usr/bin/env python3
"""
校验 learning-engine 产出的 HTML。

用法：python3 verify.py output.html [--coverage coverage.json]

检查项：
  1. slug 存在（localStorage 隔离）
  2. 每页角标 {{n}} 不越界
  3. 每页有来源
  4. 来源 key 存在
  5. 标题里的数字与实际条目数一致
  6. 参考条目字段完整
  7. 覆盖度（如果提供 coverage.json）
"""
import json
import re
import sys
import os


def load_data(html):
    """从 HTML 里抠出 DATA。支持任意缩进（json.dumps 有无 indent 都行）。"""
    m = re.search(r'const DATA = (\{.*?\});\s*\n', html, re.S)
    if not m:
        # 兜底：从 const DATA = 到 const SRC 之间
        m2 = re.search(r'const DATA = (\{.*?\})\s*;', html, re.S)
        if not m2:
            return None
        m = m2
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError as e:
        print(f"FAIL: DATA 不是合法 JSON: {e}")
        # 打印出错位置附近内容，方便定位
        raw = m.group(1)
        pos = getattr(e, "pos", 0)
        print(f"  位置 {pos} 附近: ...{raw[max(0,pos-60):pos+60]}...")
        return None


CN = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
      "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


def check(data):
    errors = []
    warnings = []

    if not data.get("slug"):
        errors.append("slug 缺失，进度会与其他页面串台")

    stages = data.get("stages") or []
    if not stages:
        errors.append("stages 为空，页面无内容")

    sources = data.get("sources") or {}
    total_steps = 0

    for st in stages:
        name = st.get("name", "?")
        for ii, sp in enumerate(st.get("steps") or []):
            total_steps += 1
            loc = f"{name} 第{ii+1}页「{sp.get('title','?')}」"
            keys = sp.get("sources") or []

            if not keys:
                errors.append(f"{loc} 没有来源")

            for k in keys:
                if k not in sources:
                    errors.append(f"{loc} 引用了不存在的来源 key: {k}")

            blob = json.dumps(sp.get("blocks") or [], ensure_ascii=False)
            for num in re.findall(r'\{\{(\d+)\}\}', blob):
                n = int(num)
                if n < 1 or n > len(keys):
                    errors.append(f"{loc} 角标 {{{{{n}}}}} 超出 {len(keys)} 条来源")

            if not sp.get("blocks"):
                errors.append(f"{loc} 内容为空")

            # 标题数字核对：只认「二三四…」+ 明确量词
            t = sp.get("title", "")
            m = re.match(r"^[^：:]*[：:]\s*([二三四五六七八九十]+)\s*[种个类条]", t)
            if m and m.group(1) in CN:
                claimed = CN[m.group(1)]
                actual = 0
                for b in sp.get("blocks") or []:
                    if b.get("type") in ("opts", "ul", "ol"):
                        actual = max(actual, len(b.get("items") or []))
                if actual and claimed != actual:
                    errors.append(f"{loc} 标题称 {claimed}，实际 {actual}")

    ref = data.get("reference") or []
    for r in ref:
        if not r.get("cat"):
            errors.append(f"参考条目缺分类: {r.get('key','?')}")
        if not r.get("key"):
            errors.append(f"参考条目缺 key: {r}")
        if not r.get("short"):
            errors.append(f"参考条目缺一句话说明: {r.get('key','?')}")
        if not (r.get("doc") or "").strip():
            warnings.append(f"参考条目「{r.get('key','?')}」只有一句话，没有细节")

    # 参考分类不能只有一个（说明可能没抽全）
    cats = {r.get("cat") for r in ref if r.get("cat")}
    if len(ref) > 20 and len(cats) < 2:
        warnings.append(f"{len(ref)} 条参考只分了 1 类，检查是不是该按用途分组")

    return errors, warnings, total_steps, len(ref), len(cats)


def check_coverage(path):
    """读 coverage.json：{ "total": 104, "written": 98, "skipped": [...] }"""
    try:
        c = json.load(open(path))
    except Exception as e:
        return None, f"coverage 文件读不了: {e}"

    total = c.get("total") or 0
    written = c.get("written") or 0
    if total <= 0:
        return None, "coverage.total 必须大于 0"

    pct = written / total * 100
    skipped = c.get("skipped") or []
    bad_skip = [s for s in skipped if not s.get("reason")]

    msgs = []
    if 0 < len(skipped) and bad_skip:
        msgs.append(f"{len(bad_skip)} 个跳过项没有写原因")

    return (pct, written, total, skipped), "; ".join(msgs) if msgs else None


def main():
    if len(sys.argv) < 2:
        print("用法: python3 verify.py output.html [--coverage coverage.json]")
        sys.exit(2)

    html = open(sys.argv[1]).read()
    data = load_data(html)
    if data is None:
        sys.exit(1)

    errors, warnings, steps, nref, ncats = check(data)

    cov_path = None
    if "--coverage" in sys.argv:
        i = sys.argv.index("--coverage")
        if i + 1 < len(sys.argv):
            cov_path = sys.argv[i + 1]

    cov_result = None
    if cov_path:
        cov_result, cov_msg = check_coverage(cov_path)
        if cov_msg:
            errors.append(cov_msg)

    if errors:
        print(f"\n{len(errors)} 个错误：\n")
        for e in errors:
            print("  ✗", e)
    if warnings:
        print(f"\n{len(warnings)} 个提醒：\n")
        for w in warnings[:10]:
            print("  !", w)
    if errors:
        sys.exit(1)

    line = f"OK  {len(data['stages'])} 关  {steps} 页  {nref} 条参考  {ncats} 个分类"

    if cov_result:
        pct, written, total, skipped = cov_result
        line += f"  覆盖 {written}/{total} = {pct:.1f}%"
        if pct < 80:
            print(line)
            print("\n  ✗ 覆盖度 < 80%，不合格")
            sys.exit(1)
        elif pct < 95:
            print(line)
            print(f"\n  ! 覆盖度 {pct:.1f}%，需在 intro 说明没覆盖什么")
            sys.exit(0)

    print(line)


if __name__ == "__main__":
    main()
