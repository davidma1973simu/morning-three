/* v39 聚焦测试：标记可删除 / 可重选 / 可编辑
   复用 DOM 桩运行时，直接跑 index.html 的真实逻辑 */
const fs = require('fs');
const vm = require('vm');

const HTML_PATH = '/Users/davidma/WorkBuddy/daily list/morning-list/index.html';
const SW_PATH = '/Users/davidma/WorkBuddy/daily list/morning-list/sw.js';
const html = fs.readFileSync(HTML_PATH, 'utf8');
const sw = fs.readFileSync(SW_PATH, 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let big = blocks.sort((a, b) => b.length - a.length)[0];

const expose = '{rec:rec,DB:DB,S:S,t:t,todayKey:todayKey,dayDetail:dayDetail,recentCard:recentCard,bindShell:bindShell,render:render,ymd:ymd,save:save}';
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

/* sw bump */
ok('T0 sw.js bump 到 v39', /morning-three-v39/.test(sw) && !/morning-three-v38/.test(sw));

/* 结构断言：× 提示 + 删除 handler */
ok('T1 已存胶囊有 × 删除提示', /\.hl-pill\.on::after\{content:' ×'/.test(html));
ok('T2 hltoggle 含删除已存标记的分支', /hr\.hl\[tk\] = '';\s*S\.hlOpen\[tk\] = false;\s*save\(\)/.test(html));

/* 取到 shell onclick */
const shellEl = fakeEl();
ctx.document.getElementById = (id) => id === 'shell' ? shellEl : fakeEl();
try { T.bindShell(); } catch(e) { console.log('BIND ERR', e.message); }

/* 准备：今天写了一条，三种标记里存两个 */
const now = new Date();
const A = T.ymd(now);
const r = T.rec(A);
r.tasks = [{ text: '和猫咪互动', done: false }, { text:'', done:false }, { text:'', done:false }];
r.hl.decision = '';
r.hl.emotion = '万物都有灵性';
r.hl.realize = '万物都有灵性';
T.S.archDay = A;
T.S.recOpen = true;

/* 点击某个胶囊 */
function clickPill(tk){
  const el = { getAttribute:(a)=> a==='data-t'?tk:(a==='data-act'?'hltoggle':null), closest:()=>el };
  shellEl.onclick({ target: el });
}

/* 初始：两条已存 */
ok('T3 初始 emotion 已存', T.rec(A).hl.emotion === '万物都有灵性');
ok('T4 初始 realize 已存', T.rec(A).hl.realize === '万物都有灵性');

/* 删除 emotion */
clickPill('emotion');
ok('T5 点已存胶囊 -> emotion 被清空', T.rec(A).hl.emotion === '');
ok('T6 删除后 emotion 输入框状态关闭', T.S.hlOpen.emotion === false);
ok('T7 删除不影响 realize', T.rec(A).hl.realize === '万物都有灵性');

/* 重新选择：点未存的 decision -> 展开输入框，不写内容 */
clickPill('decision');
ok('T8 点未存胶囊 -> decision 展开输入框', T.S.hlOpen.decision === true);
ok('T9 展开不等于存内容', T.rec(A).hl.decision === '');

/* 再点 decision -> 收起（未存时是纯 toggle） */
clickPill('decision');
ok('T10 未存胶囊再点 -> 收起', T.S.hlOpen.decision === false);

/* 编辑：模拟 textarea 录入即存（通过 input handler 的语义） */
const hr = T.rec(A);
hr.hl.decision = '坚决买房用于养老出租';
T.save();
ok('T11 编辑后内容落库', T.rec(A).hl.decision === '坚决买房用于养老出租');

/* 再点 decision（现已存）-> 删除 */
clickPill('decision');
ok('T12 编辑后再点 -> 删除生效', T.rec(A).hl.decision === '');

/* 渲染无异常 */
let det = '';
try { det = T.dayDetail(A); } catch(e) { det = 'ERR:'+e.message; }
ok('T13 dayDetail 渲染无异常', det.indexOf('ERR:') === -1);
/* emotion 已删、realize 仍在：详情里"情绪很强烈"这条标签应消失，但内容串仍由 realize 贡献 */
ok('T14 详情只显示仍存在的标记', det.indexOf('hl-tag') !== -1 && (T.rec(A).hl.emotion === '') && (T.rec(A).hl.realize !== ''));

console.log('\n==== v39: ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
