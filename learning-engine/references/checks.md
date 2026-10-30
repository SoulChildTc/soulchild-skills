# 校验

生成后必须跑。这些检查能抓住大部分事实错误，剩下的靠人读。

下面的命令里 `$SKILL` 指这个 skill 的目录，`index.html` / `content.json` 指你的产物和内容。

---

## 一、产物与覆盖度校验

```bash
python3 $SKILL/scripts/verify.py index.html --coverage coverage.json
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

两个脚本分工不同，别记混：

| 谁 | 查什么 | 拦不拦 |
|---|---|---|
| `build.py` | `slug` 格式、角标不越界、来源存在、块类型和嵌套必填字段、表格列数、字段长度、单章 8 节 | **拦**，结构错就是渲染坏 |
| `lint.py` | 文风（AI 腔、空泛建议、加粗过多）；标题数字和实际条目数对不上 | 文风只提醒；标题数字算硬伤，会拦 |
| `order.py` | 概念依赖：前向引用、单页新术语过多 | 只提醒 |
| `verify.py` | DATA 能否原样还原、HTML 结构有没有被破坏、覆盖度 | 拦 |

「只提醒」不等于可以不管。`book.py check` 输出里带 `!` 的那些，
要么改，要么确认它误报 —— 别直接往下走。

`build.py` 通过时的输出：

```
✅  校验通过（manual）  6 章  26 节  21 条参考
```

`verify.py` 通过时的输出：

```
OK  6 章  26 节  21 条参考  3 个分类  85 KB
    往返比对一致
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
# 注意：变量别叫 path —— zsh 里 PATH 是数组，会覆盖掉搜索路径
while IFS=" " read -r fpath fline fkey; do
  printf "%-40s %5s | " "$fpath" "$fline"
  sed -n "${fline}p" "$fpath" | cut -c1-60
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

### 渲染校验

用无头浏览器逐页验：不报错、不空白、不横向溢出。

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[[ -x "$CHROME" ]] || CHROME="$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell"

python3 - <<'PY'
html = open("index.html").read()
probe = """
<script>
const E=[];
window.onerror=(m,u,l)=>E.push(m+'@'+l);
const bad=[];
const vis = el => [...el.querySelectorAll('*')].filter(n=>getComputedStyle(n).opacity==='0').length;

function check(label, root, scroller){
  if(!root) { bad.push(label+' 容器不存在'); return; }
  if(!root.querySelector('h1,h2,h3')) bad.push(label+' 无标题');
  if(vis(root) > 0) bad.push(label+' 有 '+vis(root)+' 个不可见节点');
  if(scroller && scroller.scrollWidth > scroller.clientWidth + 2)
    bad.push(label+' 横向溢出 '+scroller.scrollWidth+'>'+scroller.clientWidth);
}

// paper：有 SCREENS，逐屏翻过去
if(typeof SCREENS !== 'undefined' && typeof goScreen === 'function'){
  for(let n=0;n<SCREENS.length;n++){
    try{ goScreen(n); }catch(e){ bad.push('screen '+n+' 报错 '+e.message); continue; }
    check('screen '+n, document.getElementById('screenPage'), document.getElementById('main'));
  }
}
// longread：整本已渲染，逐节验
else{
  const steps=[...document.querySelectorAll('.step')];
  if(!steps.length) bad.push('找不到任何 .step');
  steps.forEach((s,i)=>check('step '+i, s, document.documentElement));
}

const d=document.createElement('div');
d.id='__probe';
d.style.cssText='position:fixed;left:0;top:0;z-index:99999;background:#0f0;color:#000;font:12px monospace;padding:8px;white-space:pre-wrap';
d.textContent='err='+E.length+' bad='+bad.length+'\\n'+bad.slice(0,12).join('\\n');
document.body.appendChild(d);
</script>
"""
open("/tmp/probe.html","w").write(html.replace("</body>", probe+"</body>"))
PY

"$CHROME" --headless --disable-gpu --virtual-time-budget=6000 \
  --screenshot=/tmp/probe.png --window-size=1200,500 file:///tmp/probe.html
```

看截图左上角的绿框：**`err=0 bad=0` 才算过。**
两套模板通用：有 `SCREENS` 就逐屏翻，没有就逐节验。

> 探针只查「渲染崩没崩」。内容对不对它查不出来——那是第一节和第四节的事。

---

## 三、内容校验（人读）

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

## 四、让另一个模型挑错

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
