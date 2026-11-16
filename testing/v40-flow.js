/* v40 聚焦测试：About 关闭键 + 语言跟随主页
   1) valRoot 自己接 valclose（在 shell 之外）
   2) iframe src 带 ?lang= 跟随主页 LANG
   3) value.html 优先读 URL lang 参数，其次 value.lang，再浏览器语言 */
const fs = require('fs');
const vm = require('vm');

const DIR = '/Users/davidma/WorkBuddy/daily list/morning-list/';
const html = fs.readFileSync(DIR + 'index.html', 'utf8');
const valHtml = fs.readFileSync(DIR + 'value.html', 'utf8');
const sw = fs.readFileSync(DIR + 'sw.js', 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

ok('T0 sw.js bump 到 v40', /morning-three-v40/.test(sw) && !/morning-three-v39/.test(sw));

/* ---------- index.html 运行时 ---------- */
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let big = blocks.sort((a, b) => b.length - a.length)[0];
const expose = '{S:S,LANG:function(){return LANG;},setLANG:function(x){LANG=x;},openValue:openValue,closeValue:closeValue,bindOverlay:bindOverlay}';
const i = big.lastIndexOf('})();');
big = big.slice(0, i) + ';window.__T=' + expose + ';' + big.slice(i);

function fakeEl(id) {
  const listeners = {};
  return { id, innerHTML: '', value: '', style: {}, _cls:{}, _listeners:listeners,
    classList: { contains: k => !!this_owner._cls[k], add(k){ this_owner._cls[k]=1; }, remove(k){ delete this_owner._cls[k]; } },
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener(t, fn){ (listeners[t]=listeners[t]||[]).push(fn); },
    setAttribute(){}, getAttribute(){return null;},
    closest: () => this_owner, appendChild(){}, getContext(){return null;}, focus(){} };
}
/* classList 需要闭包指向自身，重写工厂 */
function makeEl(id){
  const cls = {};
  const listeners = {};
  const el = {
    id, innerHTML:'', value:'', style:{},
    classList:{ contains:k=>!!cls[k], add:k=>{cls[k]=1;}, remove:k=>{delete cls[k];} },
    querySelector:()=>null, querySelectorAll:()=>[],
    addEventListener:(t,fn)=>{ (listeners[t]=listeners[t]||[]).push(fn); },
    setAttribute(){}, getAttribute(){return null;},
    closest:()=>el, appendChild(){}, getContext(){return null;}, focus(){},
    _fire:(t,ev)=>{ (listeners[t]||[]).forEach(fn=>fn(ev)); }
  };
  return el;
}
const els = {};
['shell','ovRoot','briefRoot','instRoot','valRoot','rmRoot','celebRoot','toast'].forEach(id=>els[id]=makeEl(id));
const store = {};
const ctx = {
  console, Date, Math, JSON, RegExp, parseInt, parseFloat, isNaN, String, Number, Array, Object, Boolean,
  setTimeout: () => {}, setInterval: () => {}, clearTimeout: () => {}, clearInterval: () => {},
  location: { href: '', search: '' }, navigator: {},
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  document: { getElementById: id => els[id] || makeEl(id), querySelector: () => null, querySelectorAll: () => [], addEventListener(){}, createElement: () => makeEl('x') },
  window: {}, self: {}
};
ctx.window = ctx; ctx.self = ctx; ctx.global = ctx;
ctx.window.addEventListener = () => {};
ctx.window.localStorage = ctx.localStorage;
ctx.window.document = ctx.document;
ctx.window.location = ctx.location;
ctx.window.navigator = ctx.navigator;
vm.createContext(ctx);
try { vm.runInContext(big, ctx, { filename: 'index.js' }); }
catch (e) { console.log('LOAD ERR', e.message); process.exit(1); }
const T = ctx.__T;

/* valRoot 已自己绑了 click */
els.valRoot._fire('click', { target: { closest: sel => sel === '[data-act]' ? { getAttribute: a => a === 'data-act' ? 'valclose' : null } : null } });

/* T1: 中文主页 -> iframe 带 zh */
T.setLANG('zh');
T.openValue();
let src = /src="([^"]+)"/.exec(els.valRoot.innerHTML);
ok('T1 中文主页 About iframe 带 lang=zh', !!src && /value\.html\?lang=zh/.test(src[1]));

/* T2: 英文主页 -> iframe 带 en */
T.setLANG('en');
T.openValue();
src = /src="([^"]+)"/.exec(els.valRoot.innerHTML);
ok('T2 英文主页 About iframe 带 lang=en', !!src && /value\.html\?lang=en/.test(src[1]));

/* T3: bindOverlay 源码里 valRoot 自己接 valclose（结构断言，防桩事件误判） */
ok('T3 valRoot 独立监听 valclose', /valRoot[\s\S]{0,80}addEventListener\('click'[\s\S]{0,200}valclose/.test(html));

/* ---------- value.html 语言解析 ---------- */
function runValue(search, savedLang, navLang){
  const scripts = [...valHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  let code = scripts.sort((a,b)=>b.length-a.length)[0];
  /* 简化 DOM：只需 getElementById('langBtn') 与 v_* 元素 */
  const node = () => ({ innerHTML:'', textContent:'', setAttribute(){}, addEventListener(){} });
  const vNodes = {};
  const c = {
    console, Date, Math, RegExp, String,
    location: { search: search },
    navigator: { language: navLang },
    document: {
      documentElement: { classList:{ toggle(){} }, lang:'', setAttribute(){} },
      getElementById: id => (vNodes[id] = vNodes[id] || node()),
      querySelector: () => ({ setAttribute(){} })
    },
    localStorage: { getItem: k => k === 'value.lang' ? savedLang : null, setItem(){} }
  };
  c.window = c; c.self = c; c.global = c;
  vm.createContext(c);
  try { vm.runInContext(code, c, { filename:'value.js' }); } catch(e){ return { err:e.message, nodes:vNodes }; }
  return { nodes: vNodes, docLang: c.document.documentElement.lang, btn: vNodes['langBtn'] && vNodes['langBtn'].textContent };
}

/* T4: URL 参数 zh 覆盖浏览器 en */
let r = runValue('?lang=zh', null, 'en-US');
ok('T4 URL lang=zh 生效（覆盖浏览器 en）', !!r && !r.err && r.docLang === 'zh-CN');

/* T5: URL 参数 en 覆盖已存 zh */
r = runValue('?lang=en', 'zh', 'zh-CN');
ok('T5 URL lang=en 生效（覆盖已存 zh）', !!r && !r.err && r.docLang === 'en');

/* T6: 无 URL 参数时用已存 value.lang */
r = runValue('', 'zh', 'en-US');
ok('T6 无参数用已存 value.lang=zh', !!r && !r.err && r.docLang === 'zh-CN');

/* T7: 无参数无已存 -> 浏览器语言 */
r = runValue('', null, 'en-US');
ok('T7 无参数无已存用浏览器 en', !!r && !r.err && r.docLang === 'en');

/* T8: value.html 有 ?lang= 解析正则 */
ok('T8 value.html 含 URL lang 解析', /[?&]lang=\(en\|zh\)/.test(valHtml) || /lang=\(en\|zh\)/.test(valHtml));

console.log('\n==== v40: ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
