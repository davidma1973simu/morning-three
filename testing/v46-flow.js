const fs = require('fs'), vm = require('vm');

function fakeEl(){
  return {
    innerHTML:'', textContent:'', value:'', style:{},
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, setAttribute(){}, getAttribute(){ return null; },
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    appendChild(){}, closest(){ return null; }, remove(){}
  };
}
function makeDoc(){
  return {
    getElementById:()=>fakeEl(), querySelector:()=>null, querySelectorAll:()=>[],
    addEventListener(){}, createElement:()=>fakeEl(), body:{ style:{} },
    documentElement:{ classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; }, lang:'' } }
  };
}
function build(file, expose){
  const s = fs.readFileSync(file,'utf8');
  const blocks = [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  let big = blocks.sort((a,b)=>b.length-a.length)[0];
  const i = big.lastIndexOf('})();');
  big = big.slice(0,i) + ';window.__T=' + expose + ';' + big.slice(i);
  const store = {};
  const ctx = {
    console, __CTX:{}, Math, JSON, Date, parseInt, parseFloat, isNaN,
    setTimeout:()=>{}, setInterval:()=>{}, clearInterval:()=>{}, clearTimeout:()=>{},
    location:{ href:'', search:'' }, navigator:{ language:'zh-CN' },
    localStorage:{ getItem:k=>store[k]||null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} },
    document: makeDoc()
  };
  ctx.window = ctx; ctx.window.addEventListener = ()=>{};
  ctx.global = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  try{ vm.runInContext(big, ctx, { filename:file }); }
  catch(e){ console.log('LOAD ERR', file, '::', e.message); }
  return { ctx, store };
}

let pass=0, fail=0;
function ok(name, cond, extra){ if(cond){ pass++; console.log('  ok  -', name); } else { fail++; console.log('  FAIL-', name, extra||''); } }

const EXPOSE = '{insightLines,energyDist,viewWall,energyAdvice,ins_title_check:1,S,DB,t}';

console.log('--- v46 sw ---');
{
  const sw = fs.readFileSync('sw.js','utf8');
  ok('T0 sw bump 到 v46', /morning-three-v46/.test(sw) && !/morning-three-v45/.test(sw));
}

console.log('--- insightLines 真实数据逻辑 ---');
{
  const { ctx } = build('success.html', EXPOSE);
  const T = ctx.__T;
  // 无数据：只给安静提示，不编造
  let lines = T.insightLines(0, {cnt:{},total:0});
  ok('T1 无数据 -> 只一句 ins_none', lines.length===1 && lines[0].indexOf('写')>=0, JSON.stringify(lines));

  // 2 天：洞察未成形，不硬报状态
  lines = T.insightLines(2, {cnt:{calm:2},total:2});
  ok('T2 少于3天 -> 不报状态', lines.length===1, JSON.stringify(lines));

  // 5 天，calm 主导（非低态）：天数 + 最常状态 + high 建议
  lines = T.insightLines(5, {cnt:{calm:3,full:2},total:5});
  ok('T3 达标 -> 三行（天数/状态/建议）', lines.length===3, JSON.stringify(lines));
  ok('T4 含真实天数 5', lines.join('').indexOf('5')>=0, JSON.stringify(lines));
  ok('T5 含最常状态 平静', lines.join('').indexOf('平静')>=0, JSON.stringify(lines));

  // 5 天，tired 主导：应给 low 建议
  lines = T.insightLines(5, {cnt:{tired:3,calm:2},total:5});
  ok('T6 疲惫主导 -> low 建议', lines.join('').indexOf('减一点')>=0, JSON.stringify(lines));

  // total 与 dayCount 独立：无能量标注但写了 8 天 -> 不编造状态
  lines = T.insightLines(8, {cnt:{},total:0});
  ok('T7 无能量数据 -> 不编造状态', lines.length===1, JSON.stringify(lines));
}

console.log('--- viewWall 结构（洞察主导 + 相片档案） ---');
{
  const { ctx } = build('success.html', EXPOSE);
  const T = ctx.__T;
  const K1='2026-11-10', K2='2026-11-11', K3='2026-11-12', K4='2026-11-13';
  T.DB.days = {
    [K1]:{items:['做对A','',''] ,energy:'calm'},
    [K2]:{items:['做对B','',''],energy:'tired'},
    [K3]:{items:['做对C','',''],energy:'calm'},
    [K4]:{items:['做对D','',''],energy:'calm'}
  };
  T.S.archiveOpen = false;
  let h = T.viewWall();
  ok('T8 默认收起 -> 有展开入口', h.indexOf('data-act="archtoggle"')>=0);
  ok('T9 默认收起 -> 无相片网格 ig', h.indexOf('class="ig"')<0);
  ok('T10 首屏有洞察 hero', h.indexOf('ins-hero')>=0 && h.indexOf('ins-l')>=0);
  ok('T11 页面内不再有重复大字「成就墙」标题', h.indexOf('font-size:30px')<0);
  ok('T12 相片条中间无 ig-title', h.indexOf('ig-title')<0);
  ok('T13 达标 -> 雷达出现', h.indexOf('radar-card')>=0);
  ok('T14 只有一处 archtoggle', (h.match(/data-act="archtoggle"/g)||[]).length===1);

  T.S.archiveOpen = true;
  h = T.viewWall();
  ok('T15 展开 -> 相片网格出现', h.indexOf('class="ig"')>=0);
  ok('T16 展开 -> 按钮变收起态', h.indexOf('收起相片')>=0);
  ok('T17 展开后雷达不重复（仅一处）', (h.match(/radar-card/g)||[]).length===1);
  ok('T18 相片卡仍点得开（open）', h.indexOf('data-act="open"')>=0);

  // 空数据：不崩，给空态
  T.DB.days = {};
  T.S.archiveOpen = false;
  h = T.viewWall();
  ok('T19 空数据不崩 -> 空态', h.indexOf('empty')>=0 || h.indexOf('还没有相片')>=0);
  ok('T20 空数据不显示展开入口', h.indexOf('archtoggle')<0);
}

console.log('--- 词典 zh/en 对齐 ---');
{
  const { ctx } = build('success.html', EXPOSE);
  const s = fs.readFileSync('success.html','utf8');
  ['ins_title','ins_none','ins_days','ins_top','ins_low','ins_high','ins_open','ins_close'].forEach(function(k){
    const n = (s.match(new RegExp(k+":",'g'))||[]).length;
    ok('T词典 '+k+' zh/en 各一', n===2, 'count='+n);
  });
}

console.log('\nRESULT: '+pass+' passed, '+fail+' failed');
process.exit(fail? 1 : 0);
