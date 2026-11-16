/* v38 聚焦测试：首页去重 + 输入区强化 + whisper 弱化 + 日历详情可折叠
   复用 DOM 桩运行时，直接跑 index.html 的真实逻辑 */
const fs = require('fs');
const vm = require('vm');

const HTML_PATH = '/Users/davidma/WorkBuddy/daily list/morning-list/index.html';
const SW_PATH = '/Users/davidma/WorkBuddy/daily list/morning-list/sw.js';
const html = fs.readFileSync(HTML_PATH, 'utf8');
const sw = fs.readFileSync(SW_PATH, 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let big = blocks.sort((a, b) => b.length - a.length)[0];

const expose = '{rec:rec,DB:DB,S:S,t:t,todayKey:todayKey,viewToday:viewToday,whisperCard:whisperCard,curatedEcho:curatedEcho,dayDetail:dayDetail,recentCard:recentCard,bindShell:bindShell,render:render,ymd:ymd,wordsIn:wordsIn,hasInput:hasInput,save:save}';
const i = big.lastIndexOf('})();');
big = big.slice(0, i) + ';window.__T=' + expose + ';' + big.slice(i);

const store = {};
function fakeEl() {
  return { innerHTML: '', value: '', style: {}, classList: { contains: () => false, add(){}, remove(){} },
    querySelector: () => null, querySelectorAll: () => [], addEventListener(){}, setAttribute(){}, getAttribute(k){return this._a&&this._a[k]||null;},
    closest: () => null, appendChild(){}, getContext(){return null;}, focus(){} };
}
const ctx = {
  console, Date, Math, JSON, RegExp, parseInt, parseFloat, isNaN, String, Number, Array, Object, Boolean,
  setTimeout: () => {}, setInterval: () => {}, clearTimeout: () => {}, clearInterval: () => {},
  location: { href: '' }, navigator: {},
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  document: { getElementById: () => fakeEl(), querySelector: () => null, querySelectorAll: () => [], addEventListener(){}, createElement: () => fakeEl() },
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
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

/* ---- 缓存版本 ---- */
ok('T0 sw.js bump 到 v38', /morning-three-v38/.test(sw) && !/morning-three-v37/.test(sw));

/* ---- 源文本断言（砍掉的东西确实不在渲染链/词典里） ---- */
ok('T1 render 链不再插入 echoLine()', !/(S\.view==='today'\s*\?\s*echoLine\(\))/.test(html));
ok('T2 中文 lock_hint 已删「要事 = 」', !/要事 = 今天最想推进的那一件事/.test(html));
ok('T3 中文 t_sub_exec 文案已不再渲染（viewToday 无 t_sub_exec 调用）', !/t\('t_sub_exec'\)/.test(html));
ok('T4 whisper 已去 card 胶囊类', /class="whisper"/.test(html) && !/class="card whisper"/.test(html));
ok('T5 whisper 渐变背景已删', !/linear-gradient\(180deg,var\(--brand-soft\),var\(--card\)\)/.test(html));
ok('T6 输入区 .items 有柔和底色', /\.items\{[^}]*background:var\(--fill3\)/.test(html));

/* ---- 运行时：whisper 输出不再是 section.card ---- */
const now = new Date();
const A = T.ymd(now);
const days = [0,1,2,3].map(d => T.ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate()-d)));
days.forEach(k => { const r = T.rec(k); r.tasks = [{text:'重复词 eureka', done:false},{text:'',done:false},{text:'',done:false}]; });
let wc = '';
try { wc = T.whisperCard(); } catch(e) { wc = 'ERR:'+e.message; }
ok('T7 whisperCard 渲染用 div.whisper', /<div class="whisper">/.test(wc) && !/<section/.test(wc));

/* ---- 运行时：首页 viewToday 不含被删文案 ---- */
let vt = '';
try { vt = T.viewToday(); } catch(e) { vt = 'ERR:'+e.message; }
ok('T8 viewToday 不含「白天随时可写」', vt.indexOf('白天随时可写') === -1);
ok('T9 viewToday 不含「要事 = 」', vt.indexOf('要事 =') === -1);
ok('T10 viewToday 含书写区 items', vt.indexOf('class="items"') !== -1);
ok('T11 viewToday 无渲染异常', vt.indexOf('ERR:') === -1);

/* ---- 运行时：日历详情折叠 toggle（通过 act('recday')） ---- */
T.S.recOpen = true;
T.S.archMonth = A.slice(0,7);
T.S.archDay = null;
let det = '';
try { det = T.dayDetail(A); } catch(e) { det='ERR:'+e.message; }
ok('T12 dayDetail 可渲染', det.indexOf('ERR:') === -1 && det.length > 0);

/* 取到 shell 的 onclick handler（bindShell 会把它挂上）。render 用桩吞掉，只验 S 变化 */
const shellEl = fakeEl();
ctx.document.getElementById = (id) => id === 'shell' ? shellEl : fakeEl();
try { T.bindShell(); } catch(e) { console.log('BIND ERR', e.message); }
function clickDay(k){
  const el = { getAttribute:(a)=> a==='data-k'?k:(a==='data-act'?'recday':null), closest:()=>el };
  shellEl.onclick({ target: el });
}
clickDay(A);
ok('T13 第一次点某天 -> archDay 选中', T.S.archDay === A);
clickDay(A);
ok('T14 再点同一天 -> archDay 清空（折叠）', T.S.archDay === null);
clickDay(A);
const B = T.ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate()-1));
clickDay(B);
ok('T15 点另一天 -> archDay 切换到新日期', T.S.archDay === B);

/* ---- 折叠后 recentCard 不再输出该日详情 ---- */
clickDay(A);
let rcOpen = '';
try { rcOpen = T.recentCard(); } catch(e) { rcOpen = 'ERR:'+e.message; }
ok('T16 展开态 recentCard 含 cal-det', rcOpen.indexOf('cal-det') !== -1);
clickDay(A); // 折叠
let rcClosed = '';
try { rcClosed = T.recentCard(); } catch(e) { rcClosed = 'ERR:'+e.message; }
ok('T17 折叠态 recentCard 不含 cal-det', rcClosed.indexOf('cal-det') === -1);
ok('T18 折叠态仍显示日历网格', rcClosed.indexOf('cal-hint') !== -1 || rcClosed.indexOf('class="cal"') !== -1);
ok('T19 recentCard 无渲染异常', rcOpen.indexOf('ERR:') === -1 && rcClosed.indexOf('ERR:') === -1);

console.log('\n==== v38: ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
