/* v58 聚焦测试：提醒入口从顶栏撤下，改成「断掉时出现」的卡片
   1) 顶栏不再有铃铛按钮
   2) 新用户不触发（inputDayCount < 5）
   3) 近 7 天留白 >= 2 且有来过的记录 -> 触发，返回留白天数
   4) 只断 1 天 / 这周完全没来 -> 不触发
   5) 用户关过 -> 30 天内不再出现
   6) remindCard() 只在触发时渲染，且按钮走 data-act="remind" */
const fs = require('fs');
const vm = require('vm');

const DIR = '/Users/davidma/WorkBuddy/daily list/morning-list/';
const html = fs.readFileSync(DIR + 'index.html', 'utf8');
const sw = fs.readFileSync(DIR + 'sw.js', 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ok  - ' + name); } else { fail++; console.log('  FAIL- ' + name); } }

ok('sw 版本不低于 v58', (() => { const m = sw.match(/morning-three-v(\d+)/); return !!m && +m[1] >= 58; })());

/* ---------- 静态检查：铃铛彻底下线 ---------- */
ok('顶栏不再渲染铃铛', !/sync\+ft\+bell/.test(html));
ok('svgBell 函数已移除', !/function svgBell/.test(html));
ok('仍有 remindSheet 面板', /function remindSheet/.test(html));

/* ---------- 运行时装桩（复用 v40 的写法） ---------- */
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let big = blocks.sort((a, b) => b.length - a.length)[0];
const expose = '{remindDue:remindDue,remindGap:remindGap,remindCard:remindCard,header:header,DB:DB,ymd:ymd,inputDayCount:inputDayCount}';
const i = big.lastIndexOf('})();');
big = big.slice(0, i) + ';window.__T=' + expose + ';' + big.slice(i);

function makeEl(id){
  const cls = {}; const listeners = {};
  const el = {
    id, innerHTML:'', value:'', style:{},
    classList:{ contains:k=>!!cls[k], add:k=>{cls[k]=1;}, remove:k=>{delete cls[k];} },
    querySelector:()=>null, querySelectorAll:()=>[],
    addEventListener:(t,fn)=>{ (listeners[t]=listeners[t]||[]).push(fn); },
    setAttribute(){}, getAttribute(){return null;}, closest:()=>el,
    appendChild(){}, getContext(){return null;}, focus(){}
  };
  return el;
}
const els = {};
['shell','ovRoot','briefRoot','instRoot','valRoot','rmRoot','celebRoot','toast'].forEach(id=>els[id]=makeEl(id));
const store = {};
const ctx = {
  console, Date, Math, JSON, RegExp, parseInt, parseFloat, isNaN, String, Number, Array, Object, Boolean,
  setTimeout:()=>{}, setInterval:()=>{}, clearTimeout:()=>{}, clearInterval:()=>{},
  location:{ href:'', search:'' }, navigator:{},
  localStorage:{ getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} },
  document:{ getElementById:id=>els[id]||makeEl(id), querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){}, createElement:()=>makeEl('x') },
  addEventListener(){}, removeEventListener(){}, matchMedia:()=>({ matches:false, addListener(){}, removeListener(){} }),
  window:{}, self:{}
};
ctx.window = ctx; ctx.self = ctx; ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(big, ctx);
const T = ctx.__T;

/* 造数据工具：dayOff = 距今天几天前的记录 */
function putDay(api, off, filled){
  const d = new Date(); d.setDate(d.getDate() - off);
  const k = api.ymd(d);
  api.DB.days[k] = filled ? { tasks:[{ text:'写了一句' }] } : { tasks:[] };
}

/* 1. 新用户：不催 */
ok('新用户 remindDue=0', T.remindDue() === 0);

/* 2. 只断 1 天（近 7 天 6 天有写，共 9 天输入）：不打扰 */
(function(){
  const s = {};
  for(let off=0; off<9; off++) putDay(T, off, off !== 3);
  ok('只留白 1 天 -> 0', T.remindDue() === 0);
})();

/* 3. 断 2 天：触发，且返回留白天数 */
(function(){
  for(let off=0; off<9; off++) putDay(T, off, off !== 2 && off !== 5);
  const n = T.remindDue();
  ok('留白 2 天 -> 触发且返回 2', n === 2);
  const card = T.remindCard();
  ok('触发时渲染卡片', /guard-t/.test(card) && card.indexOf('2') > -1);
  ok('卡片按钮指向 remind', /data-act="remind"/.test(card));
  ok('卡片带关闭键', /data-act="rmcardclose"/.test(card));
})();

/* 4. 关过：30 天内静默 */
(function(){
  store['mt.rmDismiss'] = new Date().toISOString();
  ok('刚关过 -> 0', T.remindDue() === 0);
  ok('刚关过 -> 不渲染', T.remindCard() === '');
})();

/* 5. 关了 40 天：重新出现 */
(function(){
  const d = new Date(); d.setDate(d.getDate() - 40);
  store['mt.rmDismiss'] = d.toISOString();
  ok('关过 40 天 -> 再次出现', T.remindDue() === 2);
})();

/* 6. 这周一天都没来：不算「断」，不追 */
(function(){
  delete store['mt.rmDismiss'];
  for(let off=0; off<=6; off++) putDay(T, off, false);
  for(let off=7; off<12; off++) putDay(T, off, true);
  ok('这周完全没来 -> 0', T.remindDue() === 0);
})();

console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败\n');
process.exit(fail ? 1 : 0);
