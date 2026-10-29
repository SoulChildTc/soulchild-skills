/* ══════════════════════════════════════════════════════════════
   DATA
   ══════════════════════════════════════════════════════════════ */
const DATA = {{DATA}};

const SRC = DATA.sources || {};
const STAGES = DATA.stages || [];
const REF = DATA.reference || [];
const CATS = [...new Set(REF.map(x=>x.cat))];

const SLUG = DATA.slug || 'book';
const K_SEEN = SLUG + '.seen';
const K_POS = SLUG + '.pos';

/* ══════════════════════════════════════════════════════════════
   屏幕序列：封面 → (章首页 → 内容页…) × N
   ══════════════════════════════════════════════════════════════ */
const SCREENS = [{type:'cover'}];
STAGES.forEach((st,si)=>{
  SCREENS.push({type:'opener', s:si});
  st.steps.forEach((_,ii)=>SCREENS.push({type:'page', s:si, i:ii}));
});

let idx = 0;
let seen = new Set();
try{ seen = new Set(JSON.parse(localStorage.getItem(K_SEEN)||"[]")); }catch(e){}

const $ = id => document.getElementById(id);

function esc(s){
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/* ══════════════════════════════════════════════════════════════
   代码高亮：先用占位符，避免正则匹配到生成的标签
   ══════════════════════════════════════════════════════════════ */
function hl(code, lang){
  const isYaml = /yaml|yml/i.test(lang||"");

  return String(code).split("\n").map(line=>{
    if(/^\s*#/.test(line)){
      return `<span class="tk-c">${esc(line)}</span>`;
    }

    const slots = [];
    const put = (cls, txt) => {
      slots.push(`<span class="${cls}">${esc(txt)}</span>`);
      return `\u0000${slots.length-1}\u0000`;
    };

    let s = line;

    if(isYaml){
      s = s.replace(/^(\s*)(-\s+)?([\w.\-\/]+)(:)/,
        (m,sp,dash,key) => `${sp}${dash||""}${put("tk-k",key)}:`);
      s = s.replace(/(\s{2,})(#.*)$/, (m,sp,c) => `${sp}${put("tk-c",c)}`);
      s = s.replace(/:\s*("[^"]*")/, (m,val) => `: ${put("tk-s",val)}`);
    } else {
      s = s.replace(/(\s{2,})(#\s.*)$/, (m,sp,c) => `${sp}${put("tk-c",c)}`);
      s = s.replace(/"[^"]*"/g, m => put("tk-s", m));
      s = s.replace(/(^|\s)(--[a-zA-Z][\w-]*)/g,
        (m,sp,opt) => `${sp}${put("tk-f",opt)}`);
      s = s.replace(/(^|\s)(-[a-zA-Z])(?=\s|$)/g,
        (m,sp,opt) => `${sp}${put("tk-f",opt)}`);
      s = s.replace(/^(\s*(?:\$\s+)?)([a-zA-Z][\w.\/-]*)/,
        (m,sp,cmd) => `${sp}${put("tk-n",cmd)}`);
      s = s.replace(/[→↓]/g, m => put("tk-a", m));
    }

    s = esc(s).replace(/\u0000(\d+)\u0000/g, (m,n) => slots[+n]);
    return s;
  }).join("\n");
}

function codeBlock(c, lang){
  return `<div class="codeWrap">${lang?`<span class="lang">${esc(lang)}</span>`:""}<pre data-copy><code>${hl(c,lang)}</code></pre></div>`;
}

/* ══════════════════════════════════════════════════════════════
   块渲染
   ══════════════════════════════════════════════════════════════ */
function blockHTML(b){
  let out = "";
  switch(b.type){
    case "p":  out = `<p>${b.text}</p>`; break;
    case "h3": out = `<h3>${b.text}</h3>`; break;
    case "ul": out = `<ul>${b.items.map(x=>`<li>${x}</li>`).join("")}</ul>`; break;
    case "ol": out = `<ol>${b.items.map(x=>`<li>${x}</li>`).join("")}</ol>`; break;
    case "note": out = `<div class="aside"><span class="lbl">${b.label||"要点"}</span>${b.text}</div>`; break;
    case "warn": out = `<div class="aside warn"><span class="lbl">${b.label||"小心"}</span>${b.text}</div>`; break;
    case "code": out = codeBlock(b.code, b.lang||""); break;
    case "table":
      out = `<div class="tbl"><table><thead><tr>${b.head.map(h=>`<th>${h}</th>`).join("")}</tr></thead>`
          + `<tbody>${b.rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      break;
    case "kv":
      out = `<dl class="kv">${b.items.map(([k,v])=>`<div class="row"><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
      break;
    case "split":
      out = `<div class="split">${b.items.map(c=>`<div><h4>${c.h}</h4><p>${c.p}</p></div>`).join("")}</div>`;
      break;
    case "opts":
      out = `<div class="opts">` + b.items.map((o,k)=>{
        const pick = o.pick ? " pick" : "";
        const tag = o.pick ? `<span class="tag">${o.tag||"推荐"}</span>` : "";
        return `<div class="opt${pick}"><div class="h"><span class="u">${b.unit||"选项"} ${k+1}</span><span class="t">${o.title}</span>${tag}</div>`
          + (o.desc?`<p class="d">${o.desc}</p>`:"")
          + (o.code?codeBlock(o.code, o.lang||""):"")
          + (o.note?`<p class="n">${o.note}</p>`:"")
          + `</div>`;
      }).join("") + `</div>`;
      break;
    default: out = "";
  }
  return out.replace(/\{\{(\d+)\}\}/g,'<sup class="cit">$1</sup>');
}

/* ══════════════════════════════════════════════════════════════
   进度
   ══════════════════════════════════════════════════════════════ */
function pageTotal(){ return STAGES.reduce((a,s)=>a+s.steps.length,0); }
function pageRead(){ return [...seen].filter(k=>/^\d+:\d+$/.test(k)).length; }
function markSeen(si,ii){
  seen.add(si+":"+ii);
  try{ localStorage.setItem(K_SEEN, JSON.stringify([...seen])); }catch(e){}
}
function stageDone(si){
  return STAGES[si].steps.filter((_,ii)=>seen.has(si+":"+ii)).length;
}

/* ══════════════════════════════════════════════════════════════
   左目录：全文所有章，当前章展开节
   ══════════════════════════════════════════════════════════════ */
function renderToc(sc){
  // 版本行
  const ver = (DATA.version || "").trim();
  $("tocVer").textContent = ver || "";

  const box = $("tocList");
  let html = "";

  STAGES.forEach((st,si)=>{
    const done = stageDone(si);
    const full = done === st.steps.length;
    const isCur = sc.type !== "cover" && sc.s === si;
    const cls = "ch" + (isCur ? " cur" : "") + (full ? " done" : "");

    html += `<button class="${cls}" onclick="goScreen(${SCREENS.findIndex(x=>x.type==='opener'&&x.s===si)})">
      <span class="n">${String(si+1).padStart(2,"0")}</span>
      <span class="t">${esc(st.name)}</span>
      <span class="c">${st.steps.length}</span>
    </button>`;

    if(isCur){
      html += `<ul class="secs">`;
      st.steps.forEach((sp,ii)=>{
        const cur = sc.type === "page" && sc.i === ii;
        const scls = "sc" + (cur ? " cur" : "");
        html += `<li><button class="${scls}" onclick="goScreen(${SCREENS.findIndex(x=>x.type==='page'&&x.s===si&&x.i===ii)})">
          <span class="n">${String(ii+1).padStart(2,"0")}</span>
          <span class="t">${esc(sp.title)}</span>
        </button></li>`;
      });
      html += `</ul>`;
    }
  });

  box.innerHTML = html;

  // 把当前项滚进视野
  const active = box.querySelector(".sc.cur") || box.querySelector(".ch.cur");
  if(active){
    const r = active.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    if(r.top < br.top + 10 || r.bottom > br.bottom - 10){
      active.scrollIntoView({block:"center"});
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   封面
   ══════════════════════════════════════════════════════════════ */
function renderCover(){
  let html = `<div class="opener" style="padding-top:140px">`;

  html += `<div class="kicker">${esc(DATA.project)}</div>`;
  html += `<h1 style="font-size:clamp(44px,5.4vw,70px)">${esc(DATA.subtitle || DATA.project)}</h1>`;

  if(DATA.version){
    html += `<div style="display:inline-flex;align-items:center;gap:9px;font-family:var(--mono);font-size:11px;color:var(--ink-3);padding:7px 12px;border:1px solid var(--rule);margin-bottom:34px">
      <span style="width:5px;height:5px;background:var(--ok)"></span>${esc(DATA.version)}
    </div>`;
  }

  if(DATA.intro){
    html += `<p class="abs" style="max-width:620px">${esc(DATA.intro)}</p>`;
  }

  html += `<div class="mini-label">${STAGES.length} 章 · ${pageTotal()} 节</div>`;
  html += `<ul class="mini-toc">`;
  STAGES.forEach((st,si)=>{
    const done = stageDone(si);
    html += `<li><button onclick="goScreen(${SCREENS.findIndex(x=>x.type==='opener'&&x.s===si)})">
      <span class="n">${String(si+1).padStart(2,"0")}</span>
      <span class="t">${esc(st.name)}</span>
      <span class="r">${st.steps.length} 节${done?` · 已读 ${done}`:""}</span>
    </button></li>`;
  });
  html += `</ul>`;

  html += `</div>`;
  $("screenPage").innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════
   章首页
   ══════════════════════════════════════════════════════════════ */
function renderOpener(si){
  const st = STAGES[si];
  const done = stageDone(si);

  let html = `<div class="opener">`;
  html += `<div class="ghost">${String(si+1).padStart(2,"0")}</div>`;
  html += `<div class="kicker">第 ${si+1} 章</div>`;
  html += `<h1>${esc(st.name)}</h1>`;
  if(st.desc) html += `<p class="abs">${esc(st.desc)}</p>`;

  if(done === st.steps.length){
    html += `<div style="font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ok);margin-bottom:24px">✓ 本章已读完</div>`;
  }

  html += `<div class="mini-label">本章 ${st.steps.length} 节</div>`;
  html += `<ul class="mini-toc">`;
  st.steps.forEach((sp,ii)=>{
    const target = SCREENS.findIndex(x=>x.type==='page'&&x.s===si&&x.i===ii);
    html += `<li><button onclick="goScreen(${target})">
      <span class="n">${String(ii+1).padStart(2,"0")}</span>
      <span class="t">${esc(sp.title)}</span>
      <span class="r">${seen.has(si+":"+ii)?"读过":""}</span>
    </button></li>`;
  });
  html += `</ul>`;
  html += `</div>`;

  $("screenPage").innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════
   正文页
   ══════════════════════════════════════════════════════════════ */
function srcNote(key, n){
  const s = SRC[key];
  if(!s) return "";
  const kindMap = {code:"源码", doc:"文档", run:"实测"};
  const kind = kindMap[s.kind] || "源码";
  const cls = s.kind === "run" ? "k run" : "k";
  const loc = s.line ? `:${s.line}` : "";
  const label = s.path || s.href || "";
  const href = s.href || "";
  const inner = href
    ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}${loc}</a>`
    : `${esc(label)}${loc}`;
  return `<div class="note">
    <span class="n">${n}</span><span class="${cls}">${kind}</span>
    <code>${inner}</code>
    ${s.why?`<span class="why">${esc(s.why)}</span>`:""}
  </div>`;
}

function footSrcHTML(step){
  const keys = step.sources || [];
  if(!keys.length) return "";
  const items = keys.map(k=>{
    const s = SRC[k];
    if(!s) return "";
    const label = s.path || s.href || "";
    const loc = s.line ? `:${s.line}` : "";
    return `<li><code>${esc(label)}${loc}</code>${s.why?` — ${esc(s.why)}`:""}</li>`;
  }).join("");
  return `<div class="foot-src"><div class="h">本页依据</div><ol>${items}</ol></div>`;
}

function renderPage(si, ii){
  const st = STAGES[si];
  const sp = st.steps[ii];

  markSeen(si, ii);

  const firstP = sp.blocks.findIndex(b=>b.type==="p");
  const lead = firstP>=0
    ? String(sp.blocks[firstP].text).replace(/\{\{(\d+)\}\}/g,'<sup class="cit">$1</sup>')
    : "";

  const body = sp.blocks.map((b,k)=>{
    if(k===firstP) return "";
    return blockHTML(b);
  }).join("");

  const keys = sp.sources || [];
  let notes;
  if(keys.length){
    notes = `<div class="head">本页依据</div>` + keys.map((k,n)=>srcNote(k, n+1)).join("");
  } else {
    notes = `<div class="empty">本页无外部依据。</div>`;
  }

  const html = `<div class="page">
    <div class="content">
      <div class="running">${esc(st.name)}</div>
      <h2>${esc(sp.title)}</h2>
      ${lead?`<div class="lead">${lead}</div>`:""}
      ${body}
      ${footSrcHTML(sp)}
    </div>
    <aside class="notes"><div class="stick">${notes}</div></aside>
  </div>`;

  $("screenPage").innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════
   导航
   ══════════════════════════════════════════════════════════════ */
function goScreen(n, keepScroll){
  if(n < 0) n = 0;
  if(n >= SCREENS.length) n = SCREENS.length-1;
  idx = n;

  const sc = SCREENS[idx];
  const sp = $("screenPage");
  sp.classList.add("on");

  if(sc.type === "cover") renderCover();
  else if(sc.type === "opener") renderOpener(sc.s);
  else renderPage(sc.s, sc.i);

  // 重触发入场动画：强制回流一次，否则连续翻页只有第一页会动
  sp.classList.remove("enter");
  void sp.offsetWidth;
  sp.classList.add("enter");

  renderToc(sc);
  updateChrome(sc);
  if(!keepScroll) $("main").scrollTop = 0;

  try{ localStorage.setItem(K_POS, String(idx)); }catch(e){}
}

function nav(d){ goScreen(idx + d); }

function toggleToc(open){
  $("toc").classList.toggle("open", open);
  $("mask").classList.toggle("on", open);
}

/* 字号：3 档，存 localStorage */
const SIZES = [15, 17, 19];
let sizeIdx = 1;
try{
  const v = parseInt(localStorage.getItem(SLUG + ".font"), 10);
  if(!isNaN(v) && v >= 0 && v < SIZES.length) sizeIdx = v;
}catch(e){}

function applySize(){
  document.documentElement.style.setProperty("--read-size", SIZES[sizeIdx] + "px");
  const ctl = $("fontCtl");
  if(ctl){
    ctl.querySelector('[data-size="down"]').disabled = sizeIdx === 0;
    ctl.querySelector('[data-size="up"]').disabled = sizeIdx === SIZES.length - 1;
  }
  try{ localStorage.setItem(SLUG + ".font", String(sizeIdx)); }catch(e){}
}

function changeSize(d){
  const next = sizeIdx + d;
  if(next < 0 || next >= SIZES.length) return;
  sizeIdx = next;
  applySize();
}

function renderBar(sc){
  const crumb = $("crumb");
  const meta = $("barMeta");

  if(sc.type === "cover"){
    crumb.innerHTML = `<button class="cur" onclick="goScreen(0)">
      <span class="cn">目录</span></button>`;
    meta.textContent = `${STAGES.length} 章 · ${pageTotal()} 节`;
    return;
  }

  const st = STAGES[sc.s];
  let html = `<button onclick="goScreen(0)"><span class="cn">目录</span></button>`;
  html += `<span class="sep">/</span>`;

  const openerIdx = SCREENS.findIndex(x => x.type === "opener" && x.s === sc.s);
  if(sc.type === "opener"){
    html += `<button class="cur"><span class="cn">${String(sc.s+1).padStart(2,"0")}</span>
      <span class="ct">${esc(st.name)}</span></button>`;
  } else {
    html += `<button onclick="goScreen(${openerIdx})">
      <span class="cn">${String(sc.s+1).padStart(2,"0")}</span>
      <span class="ct">${esc(st.name)}</span></button>`;
    html += `<span class="sep">/</span>`;
    html += `<button class="cur"><span class="cn">${String(sc.i+1).padStart(2,"0")}</span>
      <span class="ct">${esc(st.steps[sc.i].title)}</span></button>`;
  }
  crumb.innerHTML = html;

  if(sc.type === "opener"){
    meta.textContent = `${st.steps.length} 节`;
  } else {
    meta.textContent = `${sc.i+1} / ${st.steps.length}`;
  }
}

function updateChrome(sc){
  renderBar(sc);
  $("btnPrev").disabled = idx === 0;
  $("btnNext").disabled = idx === SCREENS.length-1;
  $("btnNext").innerHTML = idx === SCREENS.length-1
    ? `已读完 <span class="k">✓</span>`
    : `下一节 <span class="k">→</span>`;

  const segs = $("segs");
  if(sc.type === "page"){
    const st = STAGES[sc.s];
    segs.innerHTML = st.steps.map((_,k)=>{
      const cls = k < sc.i ? "done" : (k === sc.i ? "now" : "");
      return `<i class="${cls}"></i>`;
    }).join("");
    $("cnt").innerHTML = `<b>${sc.i+1}</b> / ${st.steps.length}`;
  } else if(sc.type === "opener"){
    const st = STAGES[sc.s];
    segs.innerHTML = st.steps.map((_,k)=>
      `<i class="${seen.has(sc.s+':'+k)?'done':''}"></i>`).join("");
    $("cnt").textContent = `第 ${sc.s+1} 章 · ${st.steps.length} 节`;
  } else {
    segs.innerHTML = STAGES.map((st,k)=>{
      const d = stageDone(k);
      const cls = d === st.steps.length ? "done" : (d > 0 ? "now" : "");
      return `<i class="${cls}"></i>`;
    }).join("");
    $("cnt").innerHTML = `已读 <b>${pageRead()}</b> / ${pageTotal()}`;
  }
}

/* ══════════════════════════════════════════════════════════════
   查阅面板
   ══════════════════════════════════════════════════════════════ */
let lookOpen = false;
let lookCat = null;

function openLook(){
  if(!REF.length) return;
  lookOpen = true; lookCat = null;
  $("look").classList.add("on");
  $("lookInput").value = "";
  renderLook("");
  setTimeout(()=>$("lookInput").focus(), 30);
}
function closeLook(){
  lookOpen = false;
  $("look").classList.remove("on");
}

function renderLook(q){
  const ql = (q||"").trim().toLowerCase();

  const counts = {};
  REF.forEach(it=>{
    const hit = !ql
      || it.key.toLowerCase().includes(ql)
      || (it.short||"").toLowerCase().includes(ql)
      || (it.doc||"").toLowerCase().includes(ql);
    if(hit) counts[it.cat] = (counts[it.cat]||0)+1;
  });

  let cats = `<button class="cat${lookCat===null?" on":""}" onclick="pickCat(null)">
    全部<span class="n">${Object.values(counts).reduce((a,b)=>a+b,0)}</span></button>`;
  CATS.forEach(c=>{
    cats += `<button class="cat${lookCat===c?" on":""}" onclick="pickCat('${esc(c)}')">
      ${esc(c)}<span class="n">${counts[c]||0}</span></button>`;
  });
  $("lookCats").innerHTML = cats;

  let rows;
  if(!ql){
    rows = lookCat ? REF.filter(x=>x.cat===lookCat) : REF;
  } else {
    rows = REF.map(it=>{
      const k = it.key.toLowerCase();
      let sc = 0;
      if(k===ql) sc=100;
      else if(k.startsWith(ql)) sc=80;
      else if(k.includes(ql)) sc=60;
      else if((it.short||"").toLowerCase().includes(ql)) sc=40;
      else if((it.doc||"").toLowerCase().includes(ql)) sc=20;
      return {it, sc};
    }).filter(x=>x.sc>0).sort((a,b)=>b.sc-a.sc).map(x=>x.it);
    if(lookCat) rows = rows.filter(x=>x.cat===lookCat);
  }

  if(!rows.length){
    $("lookBody").innerHTML = `<div class="none">没有匹配「${esc(q)}」。<br>换个更短的词试试。</div>`;
    return;
  }

  $("lookBody").innerHTML = rows.map(it=>{
    const label = ql ? mark(esc(it.key), ql) : esc(it.key);
    const short = ql ? mark(esc(it.short||""), ql) : esc(it.short||"");
    return `<div class="item">
      <button class="btn" onclick="this.parentElement.classList.toggle('open')">
        <span class="k">${label}</span>
        <span class="plus">+</span>
        <span class="s">${short}</span>
      </button>
      <div class="doc">${it.doc || '<p style="color:var(--ink-4)">这条只有一句话。</p>'}</div>
    </div>`;
  }).join("");
}

function pickCat(c){
  lookCat = c;
  renderLook($("lookInput").value);
  $("lookBody").scrollTop = 0;
}

function mark(html, q){
  const i = html.toLowerCase().indexOf(q);
  if(i<0) return html;
  return html.slice(0,i)
    + `<mark style="background:var(--accent-2);color:var(--accent);padding:0 1px">`
    + html.slice(i, i+q.length) + `</mark>` + html.slice(i+q.length);
}

/* ══════════════════════════════════════════════════════════════
   事件
   ══════════════════════════════════════════════════════════════ */
document.addEventListener("click", e=>{
  const pre = e.target.closest("pre[data-copy]");
  if(!pre) return;
  navigator.clipboard.writeText(pre.innerText).then(()=>{
    pre.classList.add("copied");
    setTimeout(()=>pre.classList.remove("copied"),1200);
  }).catch(()=>{});
});

document.addEventListener("keydown", e=>{
  if(lookOpen){
    if(e.key === "Escape"){ e.preventDefault(); closeLook(); }
    return;
  }
  if(e.target.tagName === "INPUT") return;

  if((e.metaKey||e.ctrlKey) && e.key.toLowerCase() === "k"){
    e.preventDefault(); openLook(); return;
  }
  if(e.key === "/"){ e.preventDefault(); openLook(); return; }

  if(e.key === "ArrowRight"){ e.preventDefault(); nav(1); }
  else if(e.key === "ArrowLeft"){ e.preventDefault(); nav(-1); }
  else if(e.key === "Escape"){ e.preventDefault(); toggleToc(false); }
});

$("lookInput").addEventListener("input", e=>renderLook(e.target.value));

document.getElementById("fontCtl").addEventListener("click", e=>{
  const btn = e.target.closest("button[data-size]");
  if(!btn) return;
  changeSize(btn.dataset.size === "up" ? 1 : -1);
});

/* ══════════════════════════════════════════════════════════════
   启动
   ══════════════════════════════════════════════════════════════ */
(function(){
  if(!STAGES.length){
    $("screenPage").classList.add("on");
    $("screenPage").innerHTML = `<div class="opener"><div class="kicker">数据缺失</div><h1>没有内容</h1><p class="abs">DATA.stages 为空。检查注入的数据。</p></div>`;
    return;
  }

  let start = 0;
  try{
    const v = localStorage.getItem(K_POS);
    if(v !== null){
      const n = parseInt(v, 10);
      if(!isNaN(n) && n >= 0 && n < SCREENS.length) start = n;
    }
  }catch(e){}

  applySize();
  goScreen(start);
})();
