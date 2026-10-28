# 校验

生成后必须跑。这些检查能抓住大部分事实错误，剩下的靠人读。

---

## 一、结构与覆盖度校验

```bash
python3 references/verify.py output.html --coverage coverage.json
```

`coverage.json` 是清点结果：

```json
{
  "total": 104,
  "written": 101,
  "skipped": [
    {"item": "--engine", "reason": "需要特定硬件"},
    {"item": "--legacy-env", "reason": "已废弃"}
  ]
}
```

`total` 是清点出的全部公开能力条目数，`written` 是已经写进页面的数量，
`skipped` 每条都必须有 `reason`。

判定：

| 覆盖度 | 结果 |
|---|---|
| ≥ 95% | 通过 |
| 80–95% | 通过但提醒，需在 intro 说明没覆盖什么 |
| < 80% | 不合格，退出码 1 |

检查项：

- `slug` 存在（进度隔离）
- 每页角标 `{{n}}` 不越界
- 每页有来源、来源 key 存在
- 标题里的数字与实际条目数一致
- 参考条目字段完整
- 覆盖度达标

通过输出：

```
OK  4 关  36 页  82 条参考  7 个分类  覆盖 101/104 = 97.1%
```

## 二、来源校验

### 源码行号

逐个核对，不要批量信任：

```bash
# 从 DATA 里抽出所有 code 类型的来源
python3 - <<'PY' > /tmp/srcs.txt
import json,re
html=open("index.html").read()
data=json.loads(re.search(r'const DATA = (\{.*?\n\});',html,re.S).group(1))
for k,v in data["sources"].items():
    if v.get("kind")=="code" and v.get("line"):
        print(v["path"], v["line"], k)
PY

# 逐条打出来看内容对不对
while read path line key; do
  f="${path#/}"        # 去掉开头的斜杠
  printf "%-40s %5s | " "$path" "$line"
  sed -n "${line}p" "$f" | cut -c1-60
done < /tmp/srcs.txt
```

判断标准：打出来的那一行**确实支持你在正文里说的那句话**。不是"大概相关"。

### 文档 URL

```bash
# 抽出所有 doc 类型来源，逐个 curl 看是否 200
python3 - <<'PY' > /tmp/urls.txt
import json,re
html=open("index.html").read()
data=json.loads(re.search(r'const DATA = (\{.*?\n\});',html,re.S).group(1))
for k,v in data["sources"].items():
    if v.get("kind")=="doc" and v.get("href"):
        print(v["href"])
PY
while read u; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -L "$u")
  echo "$code  $u"
done < /tmp/urls.txt
```

---

## 三、渲染校验

用无头浏览器逐页打开，检查不报错、不空白、不溢出：

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# 逐页渲染
python3 - <<'PY'
html = open("index.html").read()
probe = """
<script>
const E=[];window.onerror=(m,u,l)=>E.push(m+'@'+l);
const R=[];
for(let s=0;s<STAGES.length;s++)for(let i=0;i<STAGES[s].steps.length;i++){
  try{ go(s,i); }catch(e){ R.push(s+':'+i+' '+e.message); }
  const a=document.getElementById('art');
  if(!a.querySelector('h2')) R.push(s+':'+i+' 无标题');
  if([...a.children].some(c=>getComputedStyle(c).opacity==='0')) R.push(s+':'+i+' 不可见');
  if(document.getElementById('read').scrollWidth > document.getElementById('read').clientWidth+2) R.push(s+':'+i+' 横向溢出');
}
const d=document.createElement('div');
d.style.cssText='position:fixed;left:0;top:0;z-index:99999;background:#0f0;color:#000;font:12px monospace;padding:8px;white-space:pre-wrap';
d.textContent='err='+E.length+' bad='+R.length+'\\n'+R.join('\\n');
document.body.appendChild(d);
</script>
"""
open("/tmp/probe.html","w").write(html.replace("</body>", probe+"</body>"))
PY

"$CHROME" --headless=new --disable-gpu --virtual-time-budget=6000 \
  --screenshot=/tmp/probe.png --window-size=1200,400 file:///tmp/probe.html
```

看截图：`err=0 bad=0` 才算过。

---

## 四、内容校验（人读）

机器查不出的：

- [ ] 有没有两句在说同一件事
- [ ] 有没有段落整段删掉不损失信息
- [ ] 同一个概念解释了几遍
- [ ] 加粗超过两处
- [ ] 有没有"正确但没用"的句子
- [ ] 有没有装深刻的句式（"不只是 X，而是 Y"）
- [ ] 配置入口有没有说清是哪种（参数/环境变量/配置项）
- [ ] 术语第一次出现有没有定义
- [ ] experimental / deprecated 有没有标
- [ ] 代码块有没有标明是示意还是真实输出

---

## 五、让另一个模型挑错

自己写的东西自己看不出问题。起草后直接问一个没有上下文的模型：

```
下面是一段技术说明，请只做一件事：找出其中没有依据、或者表述含糊的地方。
不要夸奖，不要总结，不要改写。只列问题，每条一句话。

<粘贴正文>
```

它挑出来的不一定对，但**每一条都值得复核**。

---

## 常见失败模式

| 症状 | 原因 | 修法 |
|---|---|---|
| 参数表有官方文档里没有的选项 | 从记忆里抄的 | 只从签名生成 |
| 行号对不上 | 版本变了 | 钉 commit，或去掉行号 |
| 标题说三种，正文四条 | 没数 | 加数字校验 |
| 术语读者看不懂 | 没给定义 | 首次出现加一句 |
| 配置改动无效 | 没说是环境变量还是配置项 | 点名类型 |
| 页面空白 | 渲染报错 | 跑渲染校验 |
| 窄屏横向溢出 | 表格或代码太宽 | `overflow-x:auto` |
| 进度串台 | slug 没设 | 每个项目唯一 slug |
