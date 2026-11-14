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
    documentElement:{ classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } } }
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
    setTimeout:()=>{}, setInterval:()=>{}, clearInterval:()=>{}, clearTimeout:()=>{}, location:{ href:'' }, navigator:{},
    localStorage:{ getItem:k=>store[k]||null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} },
    document: makeDoc()
  };
  ctx.window = ctx; ctx.window.addEventListener = ()=>{};
  ctx.global = ctx;
  vm.createContext(ctx);
  try{ vm.runInContext(big, ctx, { filename:file }); }
  catch(e){ console.log('LOAD ERR', file, '::', e.message); }
  return { ctx, store };
}

let pass=0, fail=0;
function ok(name, cond, extra){ if(cond){ pass++; console.log('  ok  -', name); } else { fail++; console.log('  FAIL-', name, extra||''); } }

/* ===== index: 跨库三问显示 ===== */
console.log('--- index dayDetail (跨库三问) ---');
{
  const { ctx, store } = build('index.html', '{dayDetail:dayDetail,loadEvening:loadEvening,DB:DB}');
  const K = '2026-11-14';
  store['morning-three.v1'] = JSON.stringify({ days:{ [K]:{ tasks:[{text:'看书中',done:true},{text:'跑步',done:false}] } } });
  store['success-diary.v1'] = JSON.stringify({ days:{ [K]:{ items:['做对A','做错B','改正C'], note:'补充X' } } });
  // 强制 DB 重新载入
  ctx.__T.DB.days = JSON.parse(store['morning-three.v1']).days;
  const h = ctx.__T.dayDetail(K);
  ok('含 晚上三问 标题', h.indexOf('晚上三问')>=0);
  ok('含 做对了 标签', h.indexOf('做对了')>=0);
  ok('含 做错了 标签', h.indexOf('做错了')>=0);
  ok('含 要改正 标签', h.indexOf('要改正')>=0);
  ok('显示三问内容 A/B/C', h.indexOf('做对A')>=0 && h.indexOf('做错B')>=0 && h.indexOf('改正C')>=0);
  ok('显示晨间计划 看书', h.indexOf('看书中')>=0);
  ok('显示 note 补充X', h.indexOf('补充X')>=0);
  // 无 success 数据时不崩、只显示晨间
  const K2='2026-11-10';
  store['morning-three.v1'] = JSON.stringify({ days:{ [K2]:{ tasks:[{text:'写作'} ] } } });
  delete store['success-diary.v1'];
  ctx.__T.DB.days = JSON.parse(store['morning-three.v1']).days;
  const h2 = ctx.__T.dayDetail(K2);
  ok('无晚间数据不显示 晚上三问', h2.indexOf('晚上三问')<0);
  ok('无晚间数据仍显示晨间 写作', h2.indexOf('写作')>=0);
}

/* ===== success: 三问输入 / 存储 / 日期切换 ===== */
console.log('--- success viewToday + saveTonight + editday ---');
{
  const { ctx, store } = build('success.html', '{viewToday:viewToday,saveTonight:saveTonight,rec:rec,S:S,DB:DB,todayKey:todayKey,addDays:addDays,ymd:ymd,fmtFull:fmtFull}');
  const T = ctx.__T;
  // 设 today 的 rec
  const tk = T.todayKey();
  T.rec(tk);
  const v = T.viewToday();
  ok('viewToday 含三问占位符 今天做对了什么', v.indexOf('今天做对了什么')>=0);
  ok('viewToday 含 今天做错了什么', v.indexOf('今天做错了什么')>=0);
  ok('viewToday 含 明天要改正什么', v.indexOf('明天要改正什么')>=0);
  ok('viewToday 含 daypick 切换', v.indexOf('daypick')>=0);
  ok('viewToday 含 note 可选框', v.indexOf('data-f="note"')>=0);
  ok('viewToday 含 今晚三问 标题', v.indexOf('今晚三问')>=0);

  // 模拟保存：桩 document 的 querySelectorAll / querySelector
  const rc = [{value:'对X'},{value:'错Y'},{value:'改Z'}];
  const noteEl = { value:'自由补充N' };
  ctx.document.querySelectorAll = (sel)=> sel==='.rc' ? rc : [];
  ctx.document.querySelector = (sel)=> sel==='textarea[data-f="note"]' ? noteEl : null;
  T.S.editK = null; // 今天
  T.saveTonight();
  const r = T.DB.days[tk];
  ok('saveTonight 存 items 三问', r.items[0]==='对X' && r.items[1]==='错Y' && r.items[2]==='改Z');
  ok('saveTonight 存 note', r.note==='自由补充N');
  ok('saveTonight 写 at 时间戳', !!r.at);

  // 日期切换：编辑昨天
  const yk = T.ymd(T.addDays(new Date(),-1));
  T.S.editK = yk;
  const v2 = T.viewToday();
  const yFull = T.fmtFull(yk);
  ok('editK=昨天 视图显示昨天日期', v2.indexOf(yFull)>=0);
  // 昨天保存
  ctx.document.querySelectorAll = (sel)=> sel==='.rc' ? [{value:'对Y'},{value:'错Y2'},{value:'改Y3'}] : [];
  ctx.document.querySelector = (sel)=> sel==='textarea[data-f="note"]' ? {value:''} : null;
  T.saveTonight();
  ok('昨天三问存入昨天 key', T.DB.days[yk] && T.DB.days[yk].items[0]==='对Y');
  ok('昨天保存不影响今天', T.DB.days[tk].items[0]==='对X');
}

console.log('\n=== v36 测试结果: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail? 1 : 0);
