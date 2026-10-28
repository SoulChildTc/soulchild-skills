import json, re, sys
html = open(sys.argv[1]).read()
m = re.search(r'const DATA = (\{.*?\n\});', html, re.S)
if not m:
    print("FAIL: 找不到 DATA"); sys.exit(1)
data = json.loads(m.group(1))
errors = []
if not data.get("slug"): errors.append("slug 缺失")
CN = {"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10}
for st in data["stages"]:
    for ii, sp in enumerate(st["steps"]):
        n_src = len(sp.get("sources") or [])
        blob = json.dumps(sp["blocks"], ensure_ascii=False)
        for num in re.findall(r'\{\{(\d+)\}\}', blob):
            if int(num) < 1 or int(num) > n_src:
                errors.append(f"{st['name']} 第{ii+1}页 角标 {num} 超出 {n_src}")
        if not sp.get("sources"):
            errors.append(f"{st['name']} 第{ii+1}页「{sp['title']}」无来源")
        for k in (sp.get("sources") or []):
            if k not in data["sources"]:
                errors.append(f"来源 key 不存在: {k}")
        t = sp["title"]
        # 只抓「三种方式」「四个问题」这类明确列举；「一个告警」这种不算
        m2 = re.match(r"^[^：:]*[：:]\s*([二三四五六七八九十]+)\s*[种个类条]", t)
        if m2 and CN.get(m2.group(1)):
            claimed = CN[m2.group(1)]
            actual = 0
            for b in sp["blocks"]:
                if b["type"] in ("opts","ul","ol"): actual = max(actual, len(b["items"]))
            if actual and claimed != actual:
                errors.append(f"「{t}」声称 {claimed}，实际 {actual}")
for r in data.get("reference", []):
    if not r.get("key") or not r.get("short"):
        errors.append(f"参考条目缺字段: {r.get('key')}")
if errors:
    print(f"\n{len(errors)} 个问题：\n")
    for e in errors: print("  ✗", e)
    sys.exit(1)
cats = {r["cat"] for r in data.get("reference",[])}
print(f"OK  {len(data['stages'])} 关  {sum(len(s['steps']) for s in data['stages'])} 页  "
      f"{len(data.get('reference',[]))} 条参考  {len(cats)} 个分类")
