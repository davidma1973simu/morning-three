/* v37 聚焦测试：高亮标签（决定/情绪/顿悟）
   复用 DOM 桩运行时，直接跑 index.html 的日历/详情逻辑 */
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('/Users/davidma/WorkBuddy/daily list/morning-list/index.html', 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let big = blocks.sort((a, b) => b.length - a.length)[0];

/* 注入测试钩子（在 IIFE 关闭前） */
const expose = '{rec:rec,DB:DB,S:S,t:t,todayKey:todayKey,dayDetail:dayDetail,calendarHTML:calendarHTML,recentCard:recentCard,loadEvening:loadEvening,hasInput:hasInput,save:save,ymd:ymd,parseYmd:parseYmd,fmtDate:fmtDate,wdShort:wdShort,pad:pad}';
const i = big.lastIndexOf('})();');
big = big.slice(0, i) + ';window.__T=' + expose + ';' + big.slice(i);

/* 桩 */
const store = {};
function fakeEl() {
  return { innerHTML: '', value: '', style: {}, classList: { contains: () => false, add(){}, remove(){} },
    querySelector: () => null, querySelectorAll: () => [], addEventListener(){}, setAttribute(){}, getAttribute(){return null;},
    closest: () => null, appendChild(){}, getContext(){return null;}, focus(){} };
}
const ctx = {
  console,
  Date, Math, JSON, RegExp, parseInt, parseFloat, isNaN, String, Number, Array, Object, Boolean,
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

/* 准备数据 */
const now = new Date();
const A = T.ymd(now);                                   // 今天
const B = T.ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)); // 昨天
const C = T.ymd(new Date(now.getFullYear(), now.getYear ? now.getYear() : now.getFullYear(), now.getMonth(), now.getDate() + 1)); // 明天

const ra = T.rec(A); ra.tasks = [{ text: '推进项目', done: false }, { text: '', done: false }, { text: '', done: false }];
ra.hl.decision = '坚决买房用于养老出租';
const rb = T.rec(B); rb.hl.emotion = '很妒忌别人的某次成功';   // 仅高亮、无其它内容
const rc = T.rec(C); rc.tasks = [{ text: '明天的事', done: false }, { text: '', done: false }, { text: '', done: false }];

/* T1 hl 默认三键 */
ok('T1 hl 三键默认空', T.rec(A).hl && 'decision' in T.rec(A).hl && 'emotion' in T.rec(A).hl && 'realize' in T.rec(A).hl);

/* T2 今天详情：显示已存高亮段 + 标记入口 */
const dA = T.dayDetail(A);
ok('T2a 今天含标记入口', dA.indexOf('cal-hl-mark') >= 0);
ok('T2b 今天含高亮段标题', dA.indexOf('这一天的标记') >= 0);
ok('T2c 今天显示决定标签', dA.indexOf('做了重要决定') >= 0);
ok('T2d 今天已存高亮渲染出行', dA.indexOf('cal-hl-row') >= 0 && dA.indexOf('cal-hl-tx') >= 0);

/* T3 未来日不显示标记入口 */
const dC = T.dayDetail(C);
ok('T3 未来日无标记入口', dC.indexOf('cal-hl-mark') < 0);

/* T4 昨天显示标记入口（过去可标） */
const dB = T.dayDetail(B);
ok('T4 昨天含标记入口', dB.indexOf('cal-hl-mark') >= 0);

/* T5 日历：仅高亮日也可点开 + 暖色标记；有记录日可点开 */
const recSet = {}; recSet[A] = 1; recSet[C] = 1;
const hlSet = {}; hlSet[A] = 1; hlSet[B] = 1;
const ym = A.slice(0, 7); const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
const cal = T.calendarHTML(y, m, recSet, hlSet, T.todayKey());
ok('T5a 仅高亮日 B 可点开', cal.indexOf('data-k="' + B + '"') >= 0 && cal.indexOf('cal-hl') >= 0);
ok('T5b 今天 A 同时有绿点+暖点', cal.indexOf('cal-dot') >= 0 && cal.indexOf('cal-hl') >= 0);
ok('T5c 今天 A(有记录)可点开', cal.indexOf('data-k="' + A + '"') >= 0 && cal.indexOf('data-act="recday"') >= 0);

/* T6 recentCard：高亮-only 日(昨天)也能展开详情 */
T.S.recOpen = true; T.S.archMonth = B.slice(0, 7); T.S.archDay = B; T.S.hlOpen = {};
const rec = T.recentCard();
ok('T6a recentCard 含昨天高亮详情', rec.indexOf('很妒忌别人的某次成功') >= 0);
ok('T6b recentCard 含昨天标记入口', rec.indexOf('cal-hl-mark') >= 0);

/* T7 hlOpen 开启时显示输入框 */
T.S.archDay = A; T.S.hlOpen = { realize: true };
const dA2 = T.dayDetail(A);
ok('T7 开启 hlOpen 显示输入框', dA2.indexOf('data-act="hltext"') >= 0 && dA2.indexOf('data-t="realize"') >= 0);

/* T8 存/读 roundtrip */
T.rec(A).hl.realize = '意识到自己已经财务自由'; T.save();
ok('T8a 存入 realize', T.DB.days[A].hl.realize === '意识到自己已经财务自由');
ok('T8b 详情回显 realize', T.dayDetail(A).indexOf('意识到自己已经财务自由') >= 0);

/* T9 老数据无 hl 不报错 */
const dOld = T.dayDetail('2000-01-01');
ok('T9 老数据无 hl 安全', dOld.indexOf('hl_sec') < 0);

console.log('\n=== v37 结果: ' + pass + ' pass / ' + fail + ' fail ===');
process.exit(fail ? 1 : 0);
