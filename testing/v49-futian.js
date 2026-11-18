/* v49 每日福田 · 聚焦测试（vm + DOM 桩，不跑全量）
   验证：功德计算 / 连续日课(断签不罚) / 阶位门槛 / 福田长势 / 法语确定性 / 三视图 / 存储隔离 / 双语 */
const fs=require('fs'),vm=require('vm'),path=require('path');
const file=path.join(__dirname,'..','futian.html');
const html=fs.readFileSync(file,'utf8');

function fakeEl(){return{
  innerHTML:'',textContent:'',value:'',scrollHeight:20,style:{},
  classList:{add(){},remove(){},toggle(){},contains(){return false;}},
  addEventListener(){},setAttribute(){},getAttribute(){return null;},
  querySelector(){return null;},querySelectorAll(){return[];},
  appendChild(){},closest(){return null;},remove(){},focus(){}
};}
function makeDoc(){return{
  getElementById:()=>fakeEl(),querySelector:()=>null,querySelectorAll:()=>[],
  addEventListener(){},createElement:()=>fakeEl(),
  body:{style:{}},documentElement:{classList:{add(){},remove(){},toggle(){},contains(){return false;}}}
};}

const blocks=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
let big=blocks.sort((a,b)=>b.length-a.length)[0];
const store={};
const ctx={
  console,Math,JSON,Date,parseInt,parseFloat,isNaN,String,Number,Array,Object,
  setTimeout:()=>{},setInterval:()=>{},clearTimeout:()=>{},clearInterval:()=>{},
  location:{href:'',search:''},navigator:{language:'zh-CN'},
  localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}},
  document:makeDoc()
};
ctx.window=ctx;ctx.window.addEventListener=()=>{};ctx.global=ctx;ctx.self=ctx;
vm.createContext(ctx);
try{vm.runInContext(big,ctx,{filename:'futian.html'});}catch(e){console.log('SCRIPT ERROR:',e.message);process.exit(1);}
const T=ctx.__T;

let pass=0,fail=0;
const ok=(n,c,e)=>{if(c){pass++;console.log('  ok  -',n);}else{fail++;console.log('  FAIL-',n,e||'');}};

console.log('\n=== A. 功德计算 ===');
T.setDB(T.getDB());
const db=T.getDB();
const k1='2026-11-18';
db.days[k1]={answers:['厚道','','','']};
ok('A1 单问功德=1',T.dayMerit(k1)===1,'got '+T.dayMerit(k1));
db.days[k1]={answers:['a','b','c','d']};
ok('A2 四问圆满=6(4+2)',T.dayMerit(k1)===6,'got '+T.dayMerit(k1));
db.days[k1]={answers:['a','','c','']};
ok('A3 两问=2',T.dayMerit(k1)===2,'got '+T.dayMerit(k1));
db.days[k1]={answers:['a','b','c','   ']};
ok('A4 空白(纯空格)不算',T.answerCount(k1)===3,'got '+T.answerCount(k1));
db.days[k1]={answers:['','','','']};
ok('A5 全空日功德=0',T.dayMerit(k1)===0,'got '+T.dayMerit(k1));

console.log('\n=== B. 累计与次数 ===');
T.setDB({days:{
  '2026-11-15':{answers:['a','b','c','d']},
  '2026-11-16':{answers:['a','','','']},
  '2026-11-18':{answers:['a','b','','']}
},dedications:{}});
ok('B1 累计功德=6+1+2=9',T.totalMerit()===9,'got '+T.totalMerit());
ok('B2 总问次=4+1+2=7',T.totalQ()===7,'got '+T.totalQ());
ok('B3 日课天数=3',T.practiceDays()===3,'got '+T.practiceDays());

console.log('\n=== C. 连续日课（断签不惩罚）===');
// 固定“今天”为 2026-11-18，构造连续与断档
const RealDate=Date;
function mockToday(iso){
  const fixed=new RealDate(iso+'T12:00:00');
  function F(){return new RealDate(fixed.getTime());}
  F.now=()=>fixed.getTime();
  F.parse=RealDate.parse;F.UTC=RealDate.UTC;F.prototype=RealDate.prototype;
  ctx.Date=F;
}
mockToday('2026-11-18');
T.setDB({days:{
  '2026-11-18':{answers:['a','','','']},
  '2026-11-17':{answers:['b','','','']},
  '2026-11-16':{answers:['c','','','']}
},dedications:{}});
ok('C1 连续三天=3',T.streak()===3,'got '+T.streak());
T.getDB().days['2026-11-17']={answers:['','','','']};
ok('C2 中断后从今天重算=1(不惩罚,不清零历史)',T.streak()===1,'got '+T.streak());
T.getDB().days={'2026-11-17':{answers:['a','','','']}};
ok('C3 昨天有今天没写=1(宽限一天)',T.streak()===1,'got '+T.streak());
T.getDB().days={'2026-11-10':{answers:['a','','','']}};
ok('C4 久远断档=0',T.streak()===0,'got '+T.streak());
ctx.Date=RealDate;

console.log('\n=== D. 阶位与福田门槛 ===');
ok('D1 功德0=善根初发阶',T.rankOf(0)===0);
ok('D2 功德30=观音阶',T.rankOf(30)===1);
ok('D3 功德100=文殊阶',T.rankOf(100)===2);
ok('D4 功德250=普贤阶',T.rankOf(250)===3);
ok('D5 功德999仍=普贤阶',T.rankOf(999)===3);
ok('D6 福田0=荒地',T.fieldOf(0)===0);
ok('D7 福田20=发芽',T.fieldOf(20)===1);
ok('D8 福田150=开花',T.fieldOf(150)===3);
ok('D9 福田300=结果',T.fieldOf(300)===4);

console.log('\n=== E. 每日法语确定性 ===');
const i1=T.dharmaIdx('2026-11-18'),i2=T.dharmaIdx('2026-11-18'),i3=T.dharmaIdx('2026-11-19');
ok('E1 同日法语一致',i1===i2);
ok('E2 法语索引在范围内',i1>=0&&i1<10,'got '+i1);
ok('E3 不同日法语不同(大概率)',i1!==i3,i1+' vs '+i3);

console.log('\n=== E2. 四菩萨画像（SVG 线描，非 emoji）===');
for(var bi=0;bi<4;bi++){
  var svg=T.bodhiSVG(bi,38);
  ok('E2-'+bi+' 画像是SVG线描',svg.indexOf('<svg')>=0&&svg.indexOf('viewBox')>=0&&svg.length>150);
}
ok('E2-0 地藏持锡杖',T.bodhiSVG(0).indexOf('33 6')>=0);
ok('E2-1 观音持净瓶柳枝',T.bodhiSVG(1).indexOf('M11 22')>=0);
ok('E2-2 文殊持剑',T.bodhiSVG(2).indexOf('M31 34')>=0);
ok('E2-3 普贤白象',T.bodhiSVG(3).indexOf('M6 40')>=0);

console.log('\n=== F. 三视图渲染 ===');
T.setDB({days:{
  '2026-11-18':{answers:['今天对老人有耐心','帮了同事但没越界','没被焦虑牵走','把复盘发了团队'],}
},dedications:{'2026-11-18':'愿回向给家人'}});
const today=T.viewToday(),field=T.viewField();
T.getS().day='2026-11-18';
const back=T.viewBack();
ok('F1 今日页四问名全在',['地藏','观音','文殊','普贤'].every(x=>today.indexOf(x)>=0));
ok('F1b 首屏有功德值',today.indexOf('merit-num')>=0);
ok('F1c 首屏有四圣像次第',today.indexOf('rank-path')>=0);
ok('F1d 首屏有阶位名',today.indexOf('善根')>=0||today.indexOf('rankName')>=0);
ok('F2 今日页有功德概览',today.indexOf('merit-num')>=0);
ok('F3 今日页有福田可视化',today.indexOf('field-vis')>=0);
ok('F4 今日页有法语',today.indexOf('dharma-q')>=0);
ok('F5 今日页有回向',today.indexOf('ded-text')>=0||today.indexOf('dedInput')>=0);
ok('F6 阶位页有四阶',field.indexOf('qName')>=0||(field.match(/q-badge/g)||[]).length>=4);
ok('F7 回看页有日历',back.indexOf('cal-head')>=0);
ok('F8 回看点开当日有记录',back.indexOf('复盘')>=0||back.indexOf('回向')>=0);

console.log('\n=== G. 存储隔离与双语 ===');
ok('G1 存储键独立=futian.v1',T.KEY==='futian.v1','got '+T.KEY);
ok('G2 不写 success-diary/morning-three 键',!store['success-diary.v1']&&!store['morning-three.v1']);
T.setLang('en');ok('G3 英文词典切换',T.t('qTitle')==='Four questions','got '+T.t('qTitle'));
T.setLang('zh');ok('G4 中文词典切换',T.t('qTitle')==='今日四问','got '+T.t('qTitle'));
ok('G5 三条边界文案存在',T.t('noJudge').indexOf('不排名')>=0);

console.log('\n结果: '+pass+' 通过 / '+fail+' 失败\n');
process.exit(fail?1:0);
