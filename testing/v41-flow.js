/* v41 聚焦测试：数据守护 + 首次回报前置 + 日历图例
   复用 DOM 桩运行时，直接跑 index.html 的真实逻辑 */
const fs = require('fs');
const vm = require('vm');

const DIR = '/Users/davidma/WorkBuddy/daily list/morning-list/';
const html = fs.readFileSync(DIR + 'index.html', 'utf8');
const sw = fs.readFileSync(DIR + 'sw.js', 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

ok('T0 sw.js bump 到 v41', /morning-three-v41/.test(sw) && !/morning-three-v40/.test(sw));

const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let big = blocks.sort((a, b) => b.length - a.length)[0];
const expose = '{rec:rec,DB:DB,S:S,t:t,todayKey:todayKey,ymd:ymd,hasInput:hasInput,whisperCard:whisperCard,calendarHTML:calendarHTML,guardDue:guardDue,guardCard:guardCard,inputDayCount:inputDayCount,render:render,bindShell:bindShell,T:T,KEY:KEY,SKEY:SKEY}';
const i = big.lastIndexOf('})();');
big = big.slice(0, i) + ';window.__T=' + expose + ';' + big.slice(i);

function makeEl(id) {
  const cls = {}, listeners = {};
  const el = {
    id, innerHTML:'', value:'', style:{},
    classList:{ contains:k=>!!cls[k], add:k=>{cls[k]=1;}, remove:k=>{delete cls[k];} },
    querySelector:()=>null, querySelectorAll:()=>[],
    addEventListener:(t,fn)=>{ (listeners[t]=listeners[t]||[]).push(fn); },
    setAttribute(){}, getAttribute(){return null;},
    closest:()=>el, appendChild(){}, getContext(){return null;}, focus(){}, click(){},
    _fire:(t,ev)=>{ (listeners[t]||[]).forEach(fn=>fn(ev)); }
  };
  return el;
}
const store = {};
const els = {};
['shell','toast'].forEach(id=>els[id]=makeEl(id));
const ctx = {
  console, Date, Math, JSON, RegExp, parseInt, parseFloat, isNaN, String, Number, Array, Object, Boolean,
  Blob: function(){}, URL:{ createObjectURL:()=> 'blob:x', revokeObjectURL(){} },
  setTimeout: () => {}, setInterval: () => {}, clearTimeout: () => {}, clearInterval: () => {},
  location: { href: '', search: '' }, navigator: {},
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  document: { getElementById: id => els[id] || (els[id]=makeEl(id)), querySelector: () => null, querySelectorAll: () => [], addEventListener(){}, createElement: () => makeEl('a') },
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

/* ============ 改动 2：首次回报前置 ============ */
ok('T1 zh 有 ws_first/ws_two', !!T.T.zh.ws_first && !!T.T.zh.ws_two);
ok('T2 en 有 ws_first/ws_two', !!T.T.en.ws_first && !!T.T.en.ws_two);

function daysWithInput(n){
  const now = new Date();
  T.DB.days = {};
  for(let j=0;j<n;j++){
    const k = T.ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate()-j));
    T.DB.days[k] = { tasks:[{text:'一件真实的事 '+j, done:false}], writtenAt:k+'T07:00:00' };
  }
}
daysWithInput(0);
ok('T3 0 天 whisper 沉默', T.whisperCard() === '');
daysWithInput(1);
let w1 = T.whisperCard();
ok('T4 第 1 天给第一笔确认（真实文案）', w1.indexOf('第一笔') !== -1);
daysWithInput(2);
let w2 = T.whisperCard();
ok('T5 第 2 天给两天确认', w2.indexOf('两天') !== -1);
daysWithInput(9);
let w9 = T.whisperCard();
ok('T6 第 3 天起走词云/痕迹逻辑（不再用首两句）', w9.indexOf('第一笔') === -1 && w9.indexOf('两天了') === -1 && w9.length > 0);

/* ============ 改动 3：日历图例 ============ */
ok('T7 zh/en 有 cal_legend', !!T.T.zh.cal_legend && !!T.T.en.cal_legend);
daysWithInput(3);
const now = new Date();
const tk = T.ymd(now);
const recSet = {}; Object.keys(T.DB.days).forEach(k=>recSet[k]=1);
let cal = T.calendarHTML(now.getFullYear(), now.getMonth()+1, recSet, {}, tk);
ok('T8 calendarHTML 输出 cal-legend 图例行', cal.indexOf('cal-legend') !== -1);
ok('T9 图例文案含"点开…补标记"语义', T.T.zh.cal_legend.indexOf('补标记') !== -1);
ok('T10 CSS 有 .cal-legend 定义', /\.cal-legend\{/.test(html));

/* ============ 改动 1：数据守护 ============ */
ok('T11 zh/en 有 guard 全套文案', ['guard_t','guard_sub','guard_btn','guard_done','guard_close'].every(k=>!!T.T.zh[k]&&!!T.T.en[k]));
/* 清理导出/关闭状态 */
delete store['mt.exportAt']; delete store['mt.guardDismiss'];

daysWithInput(3);
ok('T12 不足 7 天不提醒（新用户干净）', T.guardDue() === 0 && T.guardCard() === '');
daysWithInput(10);
ok('T13 满 7 天且从未导出 -> 触发提醒', T.guardDue() === 10);
let gc = T.guardCard();
ok('T14 提醒卡含一键导出按钮', gc.indexOf('guardexport') !== -1 && gc.indexOf(T.T.zh.guard_btn) !== -1);
ok('T15 提醒卡含关闭按钮', gc.indexOf('guardclose') !== -1);

/* 关闭后：多攒 <7 天不提醒 */
store['mt.guardDismiss'] = '10';
ok('T16 关闭后未多攒 7 天 -> 不提醒', T.guardDue() === 0);
ok('T17a 关闭后仅多攒 6 天(16) -> 仍不提醒', (daysWithInput(16), T.guardDue() === 0));
ok('T17 关闭后多攒到 17 天 -> 再提醒', (daysWithInput(17), T.guardDue() === 17));

/* 导出后：14 天内不提醒 */
delete store['mt.guardDismiss'];
store['mt.exportAt'] = new Date().toISOString();
ok('T18 刚导出过 -> 14 天内不提醒', T.guardDue() === 0);
store['mt.exportAt'] = new Date(Date.now()-15*86400000).toISOString();
ok('T19 导出 15 天后 -> 再提醒', T.guardDue() === 17);

/* handler 存在性 + payload 兼容导入 */
ok('T20 bindShell 有 guardexport/guardclose 分支', /a==='guardexport'[\s\S]{0,160}a==='guardclose'/.test(html));
ok('T21 导出 payload 含 morning+evening（导入可识别）', /morning:\s*morning[\s\S]{0,120}evening:/.test(html));
ok('T22 导出写 mt.exportAt', /setItem\('mt\.exportAt'/.test(html));
ok('T23 render 链含 guardCard()', /valueLink\(\)\+guardCard\(\)/.test(html) && /viewStats\(\)\+guardCard\(\)/.test(html));
ok('T24 CSS 有 .guard 定义', /\.guard\{/.test(html));

console.log('\n==== v41: ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
