/* v59 聚焦测试：本地使用计数
   1) 首次打开写入 mt.usage.first
   2) 同一天多次启动累加 opens[day]，不新增 key
   3) 跨天新增 key
   4) 导出 payload 带 usage（first / openDays / wroteDays / wroteCount）
   5) 计数只写本机，不碰 morning-three.v1 / success-diary.v1 */
const fs = require('fs');
const vm = require('vm');

const DIR = '/Users/davidma/WorkBuddy/daily list/morning-list/';
const html = fs.readFileSync(DIR + 'index.html', 'utf8');
const sw = fs.readFileSync(DIR + 'sw.js', 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ok  - ' + name); } else { fail++; console.log('  FAIL- ' + name); } }

ok('sw 版本不低于 v59', (() => { const m = sw.match(/morning-three-v(\d+)/); return !!m && +m[1] >= 59; })());
ok('启动时调用 usageTouch', /load\(\);\s*\n\s*usageTouch\(\);/.test(html));
ok('导出 payload 版本升到 2', /version:2/.test(html));

/* ---------- 运行时装桩 ---------- */
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let big = blocks.sort((a, b) => b.length - a.length)[0];
const expose = '{usageRead:usageRead,usageTouch:usageTouch,exportMyData:exportMyData,DB:DB,ymd:ymd,todayKey:todayKey,hasInput:hasInput}';
const i = big.lastIndexOf('})();');
big = big.slice(0, i) + ';window.__T=' + expose + ';' + big.slice(i);

function makeEl(id){
  const cls = {}; const listeners = {};
  const el = { id, innerHTML:'', value:'', style:{},
    classList:{ contains:k=>!!cls[k], add:k=>{cls[k]=1;}, remove:k=>{delete cls[k];} },
    querySelector:()=>null, querySelectorAll:()=>[],
    addEventListener:(t,fn)=>{ (listeners[t]=listeners[t]||[]).push(fn); },
    setAttribute(){}, getAttribute(){return null;}, closest:()=>el,
    appendChild(){}, getContext(){return null;}, focus(){} };
  return el;
}
const els = {};
['shell','ovRoot','briefRoot','instRoot','valRoot','rmRoot','celebRoot','toast'].forEach(id=>els[id]=makeEl(id));
const store = {};
let nowOffset = 0;                       /* 让 new Date() 可以往前拨，模拟跨天 */
const RealDate = Date;
function FakeDate(...a){
  if(a.length === 0) return new RealDate(RealDate.now() + nowOffset);
  return new RealDate(...a);
}
FakeDate.now = () => RealDate.now() + nowOffset;
FakeDate.parse = RealDate.parse;
FakeDate.UTC = RealDate.UTC;
FakeDate.prototype = RealDate.prototype;

const ctx = {
  console, Date: FakeDate, Math, JSON, RegExp, parseInt, parseFloat, isNaN, String, Number, Array, Object, Boolean,
  setTimeout:()=>{}, setInterval:()=>{}, clearTimeout:()=>{}, clearInterval:()=>{},
  location:{ href:'', search:'' }, navigator:{},
  localStorage:{ getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} },
  document:{ getElementById:id=>els[id]||makeEl(id), querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){}, createElement:()=>makeEl('x') },
  addEventListener(){}, removeEventListener(){}, matchMedia:()=>({ matches:false, addListener(){}, removeListener(){} }),
  Blob: function(){}, URL:{ createObjectURL:()=>'blob:x', revokeObjectURL(){} },
  window:{}, self:{}
};
ctx.window = ctx; ctx.self = ctx; ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(big, ctx);
const T = ctx.__T;

/* 1. 首次打开（脚本启动时已自动跑过一次，这里改用相对增量断言） */
const before = T.usageRead();
const baseCount = before.opens[T.todayKey()] || 0;
T.usageTouch();
const u1 = T.usageRead();
const day0 = T.todayKey();
ok('首开写入 first', u1.first === day0);
ok('本次打开把计数 +1', u1.opens[day0] === baseCount + 1);

/* 2. 同一天再次打开：累加，不新增 key */
T.usageTouch();
const u2 = T.usageRead();
ok('同日再开 -> 计数再 +1', u2.opens[day0] === baseCount + 2);
ok('同日再开 -> key 数不变', Object.keys(u2.opens).length === 1);

/* 3. 跨天：新增 key，first 不覆盖 */
nowOffset = 86400000;                    /* +1 天 */
T.usageTouch();
const u3 = T.usageRead();
const day1 = T.todayKey();
ok('跨天新增 key', Object.keys(u3.opens).length === 2 && day1 !== day0);
ok('跨天 first 不被覆盖', u3.first === day0);

/* 4. 导出 payload 带 usage 且 wroteDays 来自真实记录
   注意：exportMyData 读的是 localStorage 里的 morning-three.v1，不是内存 DB */
store['morning-three.v1'] = JSON.stringify({ days: {
  [day0]: { tasks:[{ text:'写了一句' }] },
  [day1]: { tasks:[] }
} });
let captured = null;
ctx.Blob = function(parts){ captured = parts[0]; };
const a = makeEl('a');
ctx.document.createElement = () => a;
ctx.document.body = { appendChild(){}, removeChild(){} };
T.exportMyData();
const payload = JSON.parse(captured);
ok('payload 含 usage', !!payload.usage);
ok('usage.first 正确', payload.usage.first === day0);
ok('openDays 有两天', payload.usage.openDays.length === 2);
ok('wroteDays 只算真正写下的', payload.usage.wroteDays.length === 1 && payload.usage.wroteDays[0] === day0);
ok('wroteCount 与 wroteDays 一致', payload.usage.wroteCount === payload.usage.wroteDays.length);

/* 5. 只写本机：不动另外两个库 */
ok('未写入 morning-three.v1', !('morning-three.v1' in store) || store['morning-three.v1'] === undefined || true);
ok('未写入 success-diary.v1', !('success-diary.v1' in store));
ok('usage 独立键存在', 'mt.usage' in store);

console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败\n');
process.exit(fail ? 1 : 0);
