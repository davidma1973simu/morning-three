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
function build(file, search, expose){
  const s = fs.readFileSync(file,'utf8');
  const blocks = [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  let big = blocks.sort((a,b)=>b.length-a.length)[0];
  const i = big.lastIndexOf('})();');
  big = big.slice(0,i) + ';window.__T=' + expose + ';' + big.slice(i);
  const store = {};
  const ctx = {
    console, __CTX:{}, Math, JSON, Date, parseInt, parseFloat, isNaN,
    setTimeout:()=>{}, setInterval:()=>{}, clearInterval:()=>{}, clearTimeout:()=>{},
    location:{ href:'', search:search||'' }, navigator:{ language:'zh-CN' },
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

const EXPOSE = '{insightLines,energyDist,viewWall,viewToday,unlock,DB,S,t,save,seedVerifyDays}';

console.log('--- v47 一键验收通道 ---');
{
  const sw = fs.readFileSync('sw.js','utf8');
  ok('T0 sw bump 到 v47', /morning-three-v47/.test(sw) && !/morning-three-v46/.test(sw));
}
{
  // ?test=unlock：加载即解锁 + 种子晚间数据
  const { ctx } = build('success.html', '?test=unlock', EXPOSE);
  const T = ctx.__T;
  ok('T1 门已开 (state=open)', T.unlock().state === 'open', T.unlock().state);
  const keys = Object.keys(T.DB.days);
  ok('T2 种子 8 天晚间记录', keys.length === 8, 'got '+keys.length);

  // 每条结构完整：三问 + 能量 + 时间 + 备注
  const one = T.DB.days[keys[0]];
  ok('T3 三问均非空', one.items.length===3 && one.items.every(x=>x&&x.trim()), JSON.stringify(one.items));
  ok('T4 能量已标注', ['calm','full','flow','tired','tense','bright'].indexOf(one.energy)>=0, one.energy);
  ok('T5 有保存时间与备注', !!one.at && !!one.note, one.at);

  // 六态分布达标 -> 洞察句成形
  const dist = T.energyDist();
  ok('T6 能量累计 >=3 天', dist.total >= 3, 'total='+dist.total);
  const lines = T.insightLines(keys.length, dist);
  ok('T7 洞察句成形 (≥3行)', lines.length >= 3, JSON.stringify(lines));

  // 今日页 UX：三问输入 + 保存按钮 + 状态芯片 + 自由补充
  const todayHTML = T.viewToday();
  ok('T8 今日页有三问输入', (todayHTML.match(/class="inp/g)||[]).length >= 3);
  ok('T9 今日页有保存按钮', todayHTML.indexOf('data-act="save"')>=0);
  ok('T10 今日页有六态芯片', todayHTML.indexOf('data-act="energy"')>=0);
  ok('T11 今日页有自由补充', todayHTML.indexOf('data-f="note"')>=0);

  // 洞察视图：hero + 雷达 + 档案入口；默认不展开相片墙
  T.S.archiveOpen = false;
  const wall = T.viewWall();
  ok('T12 洞察 hero 首屏', wall.indexOf('ins-hero')>=0 && wall.indexOf('ins-l')>=0);
  ok('T13 六态雷达证据', wall.indexOf('radar-card')>=0);
  ok('T14 档案入口收起态', wall.indexOf('data-act="archtoggle"')>=0 && wall.indexOf('ins-archive')>=0);
  ok('T15 默认不展开相片墙', wall.indexOf('class="ig"')<0);

  T.S.archiveOpen = true;
  const wallOpen = T.viewWall();
  ok('T16 点开才出现相片墙', wallOpen.indexOf('class="ig"')>=0);
}
{
  // 不覆盖已有数据：库非空时不种子
  const { ctx } = build('success.html', '?test=unlock', EXPOSE);
  const T = ctx.__T;
  T.DB.days = { '2026-01-01': { items:['我的真实记录','',''], energy:'calm' } };
  T.save();
  // 重新加载（沿用同一 store 需重 build；此处直接验证 seed 函数只在空库被调用的守卫条件）
  ok('T17 seed 守卫条件存在', /if\(!Object\.keys\(DB\.days\)\.length\)\s*seedVerifyDays\(\)/.test(fs.readFileSync('success.html','utf8')));
}
{
  // ?test=reset：清回锁门态
  const { ctx } = build('success.html', '?test=reset', EXPOSE);
  const T = ctx.__T;
  ok('T18 reset 后回到未解锁', T.unlock().state !== 'open');
}

console.log('\n结果: '+pass+' 通过 / '+fail+' 失败');
process.exit(fail? 1:0);
