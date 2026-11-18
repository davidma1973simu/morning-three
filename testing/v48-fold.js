const fs = require('fs'), vm = require('vm');

function fakeEl(){
  return { innerHTML:'', textContent:'', value:'', style:{},
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, setAttribute(){}, getAttribute(){ return null; },
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    appendChild(){}, closest(){ return null; }, remove(){} };
}
function makeDoc(){
  return { getElementById:()=>fakeEl(), querySelector:()=>null, querySelectorAll:()=>[],
    addEventListener(){}, createElement:()=>fakeEl(), body:{ style:{} },
    documentElement:{ classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; }, lang:'' } } };
}
function build(expose){
  const s = fs.readFileSync('success.html','utf8');
  const blocks = [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  let big = blocks.sort((a,b)=>b.length-a.length)[0];
  const i = big.lastIndexOf('})();');
  big = big.slice(0,i) + ';window.__T=' + expose + ';' + big.slice(i);
  const store = {};
  const ctx = { console, Math, JSON, Date, parseInt, parseFloat, isNaN,
    setTimeout:()=>{}, setInterval:()=>{}, clearInterval:()=>{}, clearTimeout:()=>{},
    location:{ href:'', search:'' }, navigator:{ language:'zh-CN' },
    localStorage:{ getItem:k=>store[k]||null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} },
    document: makeDoc() };
  ctx.window = ctx; ctx.window.addEventListener = ()=>{}; ctx.global = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  try{ vm.runInContext(big, ctx, { filename:'success.html' }); } catch(e){ console.log('LOAD ERR', e.message); }
  return { ctx, store };
}
let pass=0, fail=0;
function ok(name, cond, extra){ if(cond){ pass++; console.log('  ok  -', name); } else { fail++; console.log('  FAIL-', name, extra||''); } }

const EXPOSE = '{foldWindow,changePairHTML,DB,ymd,addDays,t}';
const NOW = new Date(2026, 10, 17); // 2026-11-17 固定，便于断言

console.log('--- v48 时间折叠地基 ---');
{
  const sw = fs.readFileSync('sw.js','utf8');
  ok('T0 sw 版本不低于 v48', (()=>{ const m = sw.match(/morning-three-v(\d+)/); return !!m && +m[1] >= 48; })());
}
{
  const { ctx } = build(EXPOSE); const T = ctx.__T;
  // 造 100 天数据：每天一笔，空白日若干
  T.DB.days = {};
  for(let i=99;i>=0;i--){
    const k = T.ymd(T.addDays(NOW,-i));
    if(i%10===5){ T.DB.days[k] = { items:['',''], energy:'' }; continue; }  // 空白日
    const energy = ['calm','full','flow','tired','tense','bright'][i%6];
    T.DB.days[k] = { items:['第'+i+'天的记录 '+i,'','',], energy, note:'' };
  }
  const storeBefore = Object.keys(T.DB.days).length;

  // 近 7 天：7 个 key，含今天
  const f7 = T.foldWindow('recent', 7, NOW);
  ok('T1 recent7 出 7 个 key', f7.keys.length===7, f7.keys.length);
  ok('T2 recent7 含今天', f7.keys[f7.keys.length-1]===T.ymd(NOW), f7.keys.slice(-1));
  ok('T3 recent7 entries 对齐 keys', f7.entries.length===7);

  // 近 30 / 90 天
  ok('T4 recent30 出 30 个 key', T.foldWindow('recent',30,NOW).keys.length===30);
  ok('T5 recent90 出 90 个 key', T.foldWindow('recent',90,NOW).keys.length===90);

  // 阶段：距今 N 月，取该月 31 天窗口，不收未来
  const f1 = T.foldWindow('stage', 1, NOW);
  ok('T6 stage1 窗口约31天且不超今天', f1.keys.length>=28 && f1.keys.length<=31 && f1.keys[f1.keys.length-1]<=T.ymd(NOW), f1.keys.length);
  const f12 = T.foldWindow('stage', 12, NOW);
  ok('T7 stage12 落在更久之前', f12.keys.length>0 && f12.keys[0] < f1.keys[0]);

  // 纯读：不改库、不写 localStorage
  ok('T8 纯读不改 DB', Object.keys(T.DB.days).length===storeBefore);

  // 空白日如实计数
  ok('T9 空白日被统计', f7.blanks>=0 && (f7.blanks+f7.words)>=7, 'blanks='+f7.blanks+' words='+f7.words);

  // then / now：最早与最近有字的两条
  ok('T10 then 早于 now', f7.then && f7.now && f7.then.k < f7.now.k, JSON.stringify(f7.then)+' / '+JSON.stringify(f7.now));
  ok('T11 now 是窗口内最近有字日', f7.now.k===f7.keys[f7.keys.length-1], f7.now.k);

  // 六态分布口径
  ok('T12 能量分布 total 合理', f7.dist.total>=0 && f7.dist.total<=7, f7.dist.total);

  // 变化并排：两端有字才出，只陈列原文
  const pair = T.changePairHTML(f7);
  ok('T13 变化并排有 then/now 两块', pair.indexOf('fl-side')>=0 && (pair.match(/fl-side/g)||[]).length===2);
  ok('T14 变化并排无评判词', !/变|成长|进步|超越|你变了/.test(pair));
  ok('T15 变化并排含原文', pair.indexOf(f7.then.text)>=0);
}
{
  // 全空库：fold 不报错，then/now 为空，变化并排不渲染
  const { ctx } = build(EXPOSE); const T = ctx.__T;
  T.DB.days = {};
  const f = T.foldWindow('recent', 7, NOW);
  ok('T16 空库 fold 不报错', f.keys.length===7 && f.words===0 && f.blanks===7);
  ok('T17 空库 then/now 为空', !f.then && !f.now);
  ok('T18 空库变化并排不渲染', T.changePairHTML(f)==='');
}
console.log('\n结果: '+pass+' 通过 / '+fail+' 失败');
process.exit(fail?1:0);
