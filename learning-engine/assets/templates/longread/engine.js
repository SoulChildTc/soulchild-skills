/* ══════════════════════════════════════════════════════════════
   longread 引擎
   整本书一次铺开，靠滚动读。没有屏幕索引，没有翻页序列。
   ══════════════════════════════════════════════════════════════ */
const DATA = {{DATA}};

const SRC = DATA.sources || {};
const STAGES = DATA.stages || [];
const REF = DATA.reference || [];
const CATS = [...new Set(REF.map(x => x.cat))];

const SLUG = DATA.slug || 'book';
const K_SEEN = SLUG + '.seen';
const K_POS = SLUG + '.pos';
const K_ZOOM = SLUG + '.zoom';

const $ = id => document.getElementById(id);

/* ── 基础 ── */
function esc(s){
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function citify(html){
  return String(html).replace(/\{\{(\d+)\}\}/g,
    (m,n) => `<sup class="cn" data-c="${n}" title="第 ${n} 条依据">${n}</sup>`);
}

/* ── 代码高亮 ── */
function paint(src, lang){
  const yaml = /yaml|yml/i.test(lang || "");

  return String(src).split("\n").map(line => {
    if(/^\s*#/.test(line)) return `<span class="tc">${esc(line)}</span>`;

    const slot = [];
    const keep = (cls, txt) => {
      slot.push(`<span class="${cls}">${esc(txt)}</span>`);
      return `\u0001${slot.length - 1}\u0001`;
    };

    let s = line;
    if(yaml){
      s = s.replace(/^(\s*)(-\s+)?([\w.\-\/]+):/, (m, sp, dash, key) =>
        `${sp}${dash || ""}${keep("tk", key)}:`);
      s = s.replace(/(\s{2,})(#.*)$/, (m, sp, c) => `${sp}${keep("tc", c)}`);
      s = s.replace(/:\s*("[^"]*")/, (m, v) => `: ${keep("ts", v)}`);
    } else {
      s = s.replace(/"([^"]*)"/g, m => keep("ts", m));
      s = s.replace(/(^|\s)(--[a-zA-Z][\w-]*)/g, (m, sp, o) => `${sp}${keep("tf", o)}`);
      s = s.replace(/(^|\s)(-[a-zA-Z])(?=\s|$)/g, (m, sp, o) => `${sp}${keep("tf", o)}`);
      s = s.replace(/^(\s*(?:\$\s+)?)([a-zA-Z][\w.\/-]*)/, (m, sp, c) => `${sp}${keep("tn", c)}`);
    }
    return esc(s).replace(/\u0001(\d+)\u0001/g, (m, n) => slot[+n]);
  }).join("\n");
}

function sheet(code, lang){
  const cap = lang ? `<figcaption>${esc(lang)}</figcaption>` : `<figcaption>命令</figcaption>`;
  return `<figure class="sh">${cap}<pre data-copy><code>${paint(code, lang)}</code></pre></figure>`;
}

/* ── 块：每个块都映射到 longread 自己的结构 ── */
function renderBlock(b){
  switch(b.type){
    case "p":
      return `<p>${citify(b.text)}</p>`;

    case "h3":
      return `<h4>${esc(b.text)}</h4>`;

    case "ul":
      return `<ul>${b.items.map(x => `<li>${citify(x)}</li>`).join("")}</ul>`;

    case "ol":
      return `<ol>${b.items.map(x => `<li>${citify(x)}</li>`).join("")}</ol>`;

    case "note":
      return `<div class="call" data-tag="${esc(b.label || "要点")}">${citify(b.text)}</div>`;

    case "warn":
      return `<div class="call warn" data-tag="${esc(b.label || "注意")}">${citify(b.text)}</div>`;

    case "code":
      return sheet(b.code, b.lang || "");

    case "table": {
      const head = b.head.map(h => `<th>${citify(h)}</th>`).join("");
      const rows = b.rows.map(r => `<tr>${r.map(c => `<td>${citify(c)}</td>`).join("")}</tr>`).join("");
      return `<div class="tb"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    case "kv": {
      const pairs = b.items.map(([k, v]) =>
        `<div class="pair"><dt>${k}</dt><dd>${citify(v)}</dd></div>`).join("");
      return `<dl class="defs">${pairs}</dl>`;
    }

    case "split": {
      const cells = b.items.map(c =>
        `<div><h5>${esc(c.h)}</h5><p>${citify(c.p)}</p></div>`).join("");
      return `<div class="pair2">${cells}</div>`;
    }

    case "opts": {
      const keys = b.items.map((o, i) => {
        const best = o.pick ? " best" : "";
        const flag = o.pick ? `<span class="flag">${esc(o.tag || "推荐")}</span>` : "";
        return `<div class="way${best}">
          <div class="top"><span class="name">${esc(o.title)}</span>${flag}</div>
          ${o.desc ? `<div class="txt">${citify(o.desc)}</div>` : ""}
          ${o.code ? sheet(o.code, o.lang || "") : ""}
          ${o.note ? `<p class="fine">${citify(o.note)}</p>` : ""}
        </div>`;
      }).join("");
      return `<div class="ways">${keys}</div>`;
    }

    default:
      return "";
  }
}

/* ── 依据：脚注 ── */
const KIND = {run: "实测", code: "源码", doc: "文档"};

function footnotes(sp){
  const keys = sp.sources || [];
  if(!keys.length){
    return `<div class="notes"><div class="lbl">依据</div>
      <div class="n"><span class="i">–</span><span>本页没有外部依据。</span></div></div>`;
  }
  const rows = keys.map((k, n) => {
    const s = SRC[k];
    if(!s) return "";
    const path = (s.path || s.href || "") + (s.line ? ":" + s.line : "");
    const body = s.href
      ? `<a href="${esc(s.href)}" target="_blank" rel="noopener">${esc(path)}</a>`
      : esc(path);
    const tagCls = s.kind === "run" ? "tag raw" : "tag";
    return `<div class="n" data-i="${n + 1}">
      <span class="i">${n + 1}</span>
      <span class="${tagCls}">${KIND[s.kind] || "源码"}</span>
      <span>${body}${s.why ? ` <span class="w">— ${esc(s.why)}</span>` : ""}</span>
    </div>`;
  }).join("");
  return `<div class="notes"><div class="lbl">依据</div>${rows}</div>`;
}

/* ══════════════════════════════════════════════════════════════
   进度
   ══════════════════════════════════════════════════════════════ */
const FLAT = [];
STAGES.forEach((st, si) => st.steps.forEach((sp, ii) => FLAT.push({si, ii, st, sp})));
const TOTAL = FLAT.length;

const stepId = (si, ii) => `p-${si}-${ii}`;
const stageId = si => `c-${si}`;

let seen = new Set();
try{ seen = new Set(JSON.parse(localStorage.getItem(K_SEEN) || "[]")); }catch(e){}

const readCount = () => [...seen].filter(k => /^\d+:\d+$/.test(k)).length;
const stageRead = si => STAGES[si].steps.filter((_, ii) => seen.has(si + ":" + ii)).length;

function noteSeen(si, ii){
  if(seen.has(si + ":" + ii)) return;
  seen.add(si + ":" + ii);
  try{ localStorage.setItem(K_SEEN, JSON.stringify([...seen])); }catch(e){}
}

/* ══════════════════════════════════════════════════════════════
   渲染全书
   ══════════════════════════════════════════════════════════════ */
function renderHero(){
  const meta = [];
  if(DATA.version) meta.push(`<span>版本 <b>${esc(DATA.version)}</b></span>`);
  meta.push(`<span><b>${STAGES.length}</b> 章</span>`);
  meta.push(`<span><b>${TOTAL}</b> 节</span>`);
  if(REF.length) meta.push(`<span><b>${REF.length}</b> 条速查</span>`);

  const links = STAGES.map((st, si) => `<button onclick="go('${stageId(si)}')">
      <span class="cn">${String(si + 1).padStart(2, "0")}</span>
      <span class="ct">${esc(st.name)}</span>
    </button>`).join("");

  return `<section class="hero col">
    <div class="eyebrow">${esc(DATA.project)} · 读本</div>
    <div class="mid">
      <h1>${esc(DATA.subtitle || DATA.project)}</h1>
      ${DATA.intro ? `<div class="dek">${esc(DATA.intro)}</div>` : ""}
      <div class="stamp">${meta.join("")}</div>
    </div>
    <div class="chapters">${links}</div>
  </section>`;
}

function renderOpening(st, si){
  const done = stageRead(si) === st.steps.length;
  return `<section class="opening" id="${stageId(si)}"><div class="col">
    <div class="big">${String(si + 1).padStart(2, "0")}</div>
    <div class="k">第 ${si + 1} 章</div>
    <h2>${esc(st.name)}</h2>
    ${st.desc ? `<div class="sub">${esc(st.desc)}</div>` : ""}
    ${done ? `<div class="st"><i></i>本章已读完</div>` : ""}
  </div></section>`;
}

function renderStep(sp, si, ii){
  const lead = sp.blocks.find(b => b.type === "p");
  const leadHTML = lead ? `<p class="lede">${citify(lead.text)}</p>` : "";

  const rest = sp.blocks
    .filter(b => b !== lead)
    .map(renderBlock)
    .join("");

  return `<section class="step col" id="${stepId(si, ii)}">
    <div class="head">
      <span class="no">${String(ii + 1).padStart(2, "0")}</span>
      <h3>${esc(sp.title)}</h3>
    </div>
    <div class="prose">
      ${leadHTML}
      ${rest}
      ${footnotes(sp)}
    </div>
  </section>`;
}

function renderBook(){
  let out = renderHero();

  STAGES.forEach((st, si) => {
    out += renderOpening(st, si);
    st.steps.forEach((sp, ii) => { out += renderStep(sp, si, ii); });
    out += `<div class="col"><div class="close">第 ${si + 1} 章完</div></div>`;
  });

  const tail = [
    `<button onclick="go('top')">回到开头</button>`,
    REF.length ? `<button onclick="openFind()">查阅参数</button>` : "",
    `<button onclick="openIndex()">全文目录</button>`
  ].join("");

  out += `<div class="col"><div class="fin">
    <div class="h">读到这里</div>
    <div class="d">${STAGES.length} 章 · ${TOTAL} 节${REF.length ? ` · ${REF.length} 条参数速查` : ""}。
      按 ⌘K 或 Ctrl+K 随时开查。</div>
    <div class="go">${tail}</div>
  </div></div>`;

  $("book").innerHTML = out;
}

/* ══════════════════════════════════════════════════════════════
   刻度
   ══════════════════════════════════════════════════════════════ */
function renderTicks(){
  const groups = STAGES.map((st, si) => {
    const dots = st.steps.map((sp, ii) =>
      `<button data-to="${stepId(si, ii)}" data-say="${String(si + 1).padStart(2, "0")} ${esc(st.name)} / ${esc(sp.title)}"></button>`
    ).join("");
    return `<div class="g">${dots}</div>`;
  }).join("");
  $("ticks").innerHTML = groups;
}

/* ══════════════════════════════════════════════════════════════
   滚动
   ══════════════════════════════════════════════════════════════ */
let steps = [];
let active = -1;
let ticking = false;

function measure(){
  steps = [...document.querySelectorAll(".step")];

  const max = document.documentElement.scrollHeight - innerHeight;
  const ratio = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  $("hairline").firstElementChild.style.width = (ratio * 100).toFixed(2) + "%";
  $("pct").textContent = Math.round(ratio * 100) + "%";

  const line = innerHeight * 0.3;
  let hit = -1;
  for(let i = 0; i < steps.length; i++){
    if(steps[i].getBoundingClientRect().top <= line) hit = i;
    else break;
  }

  if(hit !== active){
    active = hit;
    const now = hit >= 0 ? FLAT[hit] : null;
    const nowId = now ? stepId(now.si, now.ii) : null;

    [...$("ticks").children].forEach(g => {
      [...g.children].forEach(b => {
        const at = FLAT.findIndex(f => stepId(f.si, f.ii) === b.dataset.to);
        b.classList.toggle("on", b.dataset.to === nowId);
        b.classList.toggle("done", at > -1 && at < hit);
      });
    });

    if(now){
      $("where").classList.add("on");
      $("whereT").textContent = `${String(now.si + 1).padStart(2, "0")} ${now.st.name}`;
      // 只记当前这一节。跳读不该把中间章节标成已读。
      noteSeen(now.si, now.ii);
    } else {
      $("where").classList.remove("on");
    }
  }

  try{ localStorage.setItem(K_POS, String(Math.round(scrollY))); }catch(e){}
  ticking = false;
}

function onScroll(){
  if(ticking) return;
  ticking = true;
  requestAnimationFrame(measure);
}

/* ══════════════════════════════════════════════════════════════
   跳转
   ══════════════════════════════════════════════════════════════ */
const reduceMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function go(id){
  closeIndex();
  const behavior = reduceMotion() ? "auto" : "smooth";
  if(id === "top"){
    scrollTo({top:0, behavior});
    return;
  }
  const el = document.getElementById(id);
  if(!el) return;
  const y = el.getBoundingClientRect().top + scrollY - 46;
  scrollTo({top:y, behavior});
}

/* 点角标 → 滚到该节依据并高亮 */
document.addEventListener("click", e => {
  const sup = e.target.closest("sup.cn");
  if(!sup) return;
  e.preventDefault();
  const step = sup.closest(".step");
  const note = step && step.querySelector('.notes .n[data-i="' + sup.dataset.c + '"]');
  if(!note) return;
  note.classList.add("hit");
  const y = note.getBoundingClientRect().top + scrollY - innerHeight / 2;
  scrollTo({top: Math.max(0, y), behavior: reduceMotion() ? "auto" : "smooth"});
  setTimeout(() => note.classList.remove("hit"), 1600);
});

/* 复制代码 */
document.addEventListener("click", e => {
  const pre = e.target.closest("pre[data-copy]");
  if(!pre) return;
  navigator.clipboard.writeText(pre.innerText).then(() => {
    pre.classList.add("done");
    setTimeout(() => pre.classList.remove("done"), 1300);
  }).catch(() => {});
});

/* ══════════════════════════════════════════════════════════════
   全屏索引
   ══════════════════════════════════════════════════════════════ */
let indexOn = false;

function buildIndex(){
  const rows = STAGES.map((st, si) => {
    const links = st.steps.map((sp, ii) => {
      const done = seen.has(si + ":" + ii);
      return `<a href="#${stepId(si, ii)}" class="${done ? "seen" : ""}" onclick="closeIndex()">
        <span class="q">${String(ii + 1).padStart(2, "0")}</span>
        <span class="r">${esc(sp.title)}</span>
      </a>`;
    }).join("");

    return `<div class="grp">
      <div class="h">
        <span class="i">${String(si + 1).padStart(2, "0")}</span>
        <button class="n" onclick="go('${stageId(si)}')">${esc(st.name)}</button>
        <span class="c">${st.steps.length} 节</span>
      </div>
      ${st.desc ? `<div class="d">${esc(st.desc)}</div>` : ""}
      ${links}
    </div>`;
  }).join("");

  $("idxRows").innerHTML = rows;
  $("idxStat").textContent = `${STAGES.length} 章 · ${TOTAL} 节 · 已读 ${readCount()}`;
}

function openIndex(){
  buildIndex();
  indexOn = true;
  $("index").classList.add("show");
  $("index").classList.add("on");
  $("index").scrollTop = 0;
}

function closeIndex(){
  indexOn = false;
  $("index").classList.remove("on");
  $("index").classList.remove("show");
}

/* ══════════════════════════════════════════════════════════════
   字号
   ══════════════════════════════════════════════════════════════ */
const ZOOMS = [17, 19, 21];
let zoom = 1;
try{
  const v = parseInt(localStorage.getItem(K_ZOOM), 10);
  if(!isNaN(v) && v >= 0 && v < ZOOMS.length) zoom = v;
}catch(e){}

function applyZoom(){
  document.documentElement.style.setProperty("--read", ZOOMS[zoom] + "px");
  const box = $("zoom");
  box.querySelector('[data-z="-"]').disabled = zoom === 0;
  box.querySelector('[data-z="+"]').disabled = zoom === ZOOMS.length - 1;
  try{ localStorage.setItem(K_ZOOM, String(zoom)); }catch(e){}
}

$("zoom").addEventListener("click", e => {
  const b = e.target.closest("button[data-z]");
  if(!b) return;
  const next = zoom + (b.dataset.z === "+" ? 1 : -1);
  if(next < 0 || next >= ZOOMS.length) return;
  zoom = next;
  applyZoom();
});

/* ══════════════════════════════════════════════════════════════
   参数查阅
   ══════════════════════════════════════════════════════════════ */
let findOn = false;
let findCat = null;

function openFind(){
  if(!REF.length) return;
  findOn = true;
  findCat = null;
  $("find").classList.add("on");
  $("findQ").value = "";
  drawFind("");
  setTimeout(() => $("findQ").focus(), 30);
}

function closeFind(){
  findOn = false;
  $("find").classList.remove("on");
}

function drawFind(q){
  const key = (q || "").trim().toLowerCase();

  const tally = {};
  REF.forEach(it => {
    if(hit(it, key)) tally[it.cat] = (tally[it.cat] || 0) + 1;
  });

  const allCount = Object.values(tally).reduce((a, b) => a + b, 0);
  let tabs = `<button class="tab${findCat === null ? " on" : ""}" onclick="pickCat(null)">全部<span class="c">${allCount}</span></button>`;
  CATS.forEach(c => {
    tabs += `<button class="tab${findCat === c ? " on" : ""}" onclick="pickCat('${esc(c)}')">${esc(c)}<span class="c">${tally[c] || 0}</span></button>`;
  });
  $("findTabs").innerHTML = tabs;

  let rows = REF.filter(it => (!key || hit(it, key)) && (!findCat || it.cat === findCat));
  if(key){
    rows = rows.map(it => ({it, score: rank(it, key)}))
               .filter(x => x.score > 0)
               .sort((a, b) => b.score - a.score)
               .map(x => x.it);
  }

  if(!rows.length){
    $("findList").innerHTML = `<div class="void">没有匹配「${esc(q)}」。<br>换个更短的词。</div>`;
    return;
  }

  $("findList").innerHTML = rows.map(it => {
    const k = key ? ink(esc(it.key), key) : esc(it.key);
    const s = key ? ink(esc(it.short || ""), key) : esc(it.short || "");
    return `<div class="rec">
      <button class="t" onclick="this.parentElement.classList.toggle('open')">
        <span class="k">${k}</span>
        <span class="p">+</span>
        <span class="s">${s}</span>
      </button>
      <div class="doc">${it.doc || '<p style="color:var(--gray-3)">这条只有一句话。</p>'}</div>
    </div>`;
  }).join("");
}

function hit(it, key){
  if(!key) return true;
  return it.key.toLowerCase().includes(key)
    || (it.short || "").toLowerCase().includes(key)
    || (it.doc || "").toLowerCase().includes(key);
}

function rank(it, key){
  const k = it.key.toLowerCase();
  if(k === key) return 100;
  if(k.startsWith(key)) return 80;
  if(k.includes(key)) return 60;
  if((it.short || "").toLowerCase().includes(key)) return 40;
  if((it.doc || "").toLowerCase().includes(key)) return 20;
  return 0;
}

function pickCat(c){
  findCat = c;
  drawFind($("findQ").value);
  $("findList").scrollTop = 0;
}

function ink(html, key){
  const at = html.toLowerCase().indexOf(key);
  if(at < 0) return html;
  return html.slice(0, at)
    + `<mark style="background:var(--green);color:var(--white);padding:0 1px">`
    + html.slice(at, at + key.length) + `</mark>`
    + html.slice(at + key.length);
}

$("findQ").addEventListener("input", e => drawFind(e.target.value));

/* ══════════════════════════════════════════════════════════════
   刻度交互
   ══════════════════════════════════════════════════════════════ */
$("ticks").addEventListener("mouseover", e => {
  const b = e.target.closest("button[data-say]");
  const tip = $("tip");
  if(!b){ tip.classList.remove("on"); return; }
  tip.textContent = b.dataset.say;
  tip.style.top = (b.getBoundingClientRect().top + 1) + "px";
  tip.classList.add("on");
});
$("ticks").addEventListener("mouseleave", () => $("tip").classList.remove("on"));
$("ticks").addEventListener("click", e => {
  const b = e.target.closest("button[data-to]");
  if(b) go(b.dataset.to);
});

/* ══════════════════════════════════════════════════════════════
   键盘
   ══════════════════════════════════════════════════════════════ */
document.addEventListener("keydown", e => {
  if(findOn){
    if(e.key === "Escape"){ e.preventDefault(); closeFind(); }
    return;
  }
  if(e.target.tagName === "INPUT") return;

  if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"){
    e.preventDefault(); openFind(); return;
  }
  if(e.key === "/"){ e.preventDefault(); openFind(); return; }
  if(e.key === "i" || e.key === "I"){
    e.preventDefault();
    indexOn ? closeIndex() : openIndex();
    return;
  }
  if(e.key === "Escape" && indexOn){ e.preventDefault(); closeIndex(); }
});

addEventListener("scroll", onScroll, {passive: true});
addEventListener("resize", onScroll, {passive: true});

/* ══════════════════════════════════════════════════════════════
   启动
   ══════════════════════════════════════════════════════════════ */
(function(){
  if(!STAGES.length){
    $("book").innerHTML = `<section class="hero col">
      <div class="eyebrow">数据缺失</div>
      <div class="mid"><h1>没有内容</h1>
      <div class="dek">DATA.stages 为空。检查注入的数据。</div></div>
    </section>`;
    return;
  }

  renderBook();
  renderTicks();
  applyZoom();

  try{
    const y = parseInt(localStorage.getItem(K_POS), 10);
    if(!isNaN(y) && y > 0) scrollTo(0, y);
  }catch(e){}

  measure();
})();
