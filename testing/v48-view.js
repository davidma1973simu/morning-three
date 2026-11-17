const fs = require('fs'), vm = require('vm');
function fakeEl(){return{innerHTML:'',textContent:'',value:'',style:{},classList:{add(){},remove(){},toggle(){},contains(){return false;}},addEventListener(){},setAttribute(){},getAttribute(){return null;},querySelector(){return null;},querySelectorAll(){return[];},appendChild(){},closest(){return null;},remove(){}};}
function makeDoc(){return{getElementById:()=>fakeEl(),querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>fakeEl(),body:{style:{}},documentElement:{classList:{add(){},remove(){},toggle(){},contains(){return false;},lang:''}}};}
function build(){
  const s=fs.readFileSync('success.html','utf8');const blocks=[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  let big=blocks.sort((a,b)=>b.length-a.length)[0];const i=big.lastIndexOf('})();');
  big=big.slice(0,i)+';window.__T={foldCardHTML,viewWall,foldWindow,S,DB,ymd,addDays};'+big.slice(i);
  const store={};const ctx={console,Math,JSON,Date,parseInt,parseFloat,isNaN,setTimeout:()=>{},setInterval:()=>{},clearInterval:()=>{},clearTimeout:()=>{},location:{href:'',search:''},navigator:{language:'zh-CN'},localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}},document:makeDoc()};
  ctx.window=ctx;ctx.window.addEventListener=()=>{};ctx.global=ctx;ctx.self=ctx;vm.createContext(ctx);
  try{vm.runInContext(big,ctx,{filename:'success.html'});}catch(e){console.log('ERR',e.message);}
  return ctx.__T;
}
let pass=0,fail=0;const ok=(n,c,e)=>{if(c){pass++;console.log('  ok  -',n);}else{fail++;console.log('  FAIL-',n,e||'');}};
const T=build();const NOW=new Date(2026,10,17);
T.DB.days={};for(let x=5;x>=0;x--){const k=T.ymd(T.addDays(NOW,-x));T.DB.days[k]={items:['记录'+x,'',''],energy:['calm','full','flow','tired','tense','bright'][x]};}
T.S.flMode='recent';T.S.flArg=7;
let h=T.foldCardHTML();
ok('V1 回看标题',/回看/.test(h));
ok('V2 三档切换',(h.match(/data-act="flarg"/g)||[]).length===3);
ok('V3 模式两按钮',(h.match(/data-act="flmode"/g)||[]).length===2);
ok('V4 真实摘录',h.indexOf('fl-entry')>=0);
ok('V5 常驻输入',h.indexOf('data-f="foldnote"')>=0);
ok('V6 保存按钮',h.indexOf('data-act="flnotesave"')>=0);
T.S.flMode='stage';T.S.flArg=12;h=T.foldCardHTML();
ok('V7 阶段四档',(h.match(/data-act="flarg"/g)||[]).length===4);
ok('V8 阶段独立存储键',h.indexOf('stage-12')>=0);
ok('V9 洞察页含折叠卡',T.viewWall().indexOf('fl-card')>=0);
console.log('\n结果: '+pass+' 通过 / '+fail+' 失败');process.exit(fail?1:0);
