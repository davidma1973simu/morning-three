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
ok('A2 四问圆满=4(答几问就几个,无加成)',T.dayMerit(k1)===4,'got '+T.dayMerit(k1));
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
ok('B1 累计功德=4+1+2=7',T.totalMerit()===7,'got '+T.totalMerit());
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

console.log('\n=== D. 计量：每问+1、无加成 ===');
T.setDB({days:{'2026-11-18':{answers:['a','b','c','d']}},dedications:{}});
ok('D1 答4问=4功德(不再额外+2)',T.dayMerit('2026-11-18')===4,'got '+T.dayMerit('2026-11-18'));
T.getDB().days['2026-11-18']={answers:['a','b','','']};
ok('D2 答2问=2功德',T.dayMerit('2026-11-18')===2,'got '+T.dayMerit('2026-11-18'));

console.log('\n=== D2. 四维平行（各自累计，不串阶梯）===');
var dd={};
for(var x=0;x<7;x++){dd['2026-11-'+String(10+x)]={answers:['a','','','']};}
dd['2026-11-18']={answers:['','b','','']};
T.setDB({days:dd,dedications:{}});
ok('D3 地藏维度累计=7天',T.dimDays(0)===7,'got '+T.dimDays(0));
ok('D4 观音维度累计=1天',T.dimDays(1)===1,'got '+T.dimDays(1));
ok('D5 地藏7天=第1级(初发)',T.dimLv(0)===1,'got '+T.dimLv(0));
ok('D6 观音1天=第0级(未察)',T.dimLv(1)===0,'got '+T.dimLv(1));
ok('D7 两面等级不同→平行而非串联',T.dimLv(0)!==T.dimLv(1));
ok('D8 未写过的维度=0级',T.dimLv(2)===0&&T.dimLv(3)===0);
ok('D9 总功德=四维之和(7+1)',T.totalMerit()===8,'got '+T.totalMerit());
ok('D10 福田0=荒地',T.fieldOf(0)===0);
ok('D11 福田300=结果',T.fieldOf(300)===4);

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

console.log('\n=== F. 两视图渲染（回看已并入我的福田）===');
T.setDB({days:{
  '2026-11-18':{answers:['今天对老人有耐心','帮了同事但没越界','没被焦虑牵走','把复盘发了团队'],}
},dedications:{'2026-11-18':'愿回向给家人'}});
T.getS().day='';
const today=T.viewToday(),field=T.viewField();
ok('F1 今日页四问名全在',['地藏','观音','文殊','普贤'].every(x=>today.indexOf(x)>=0));
ok('F1b 今日页有功德值',today.indexOf('merit-num')>=0);
ok('F1c 今日页有四维平行卡',today.indexOf('dim-grid')>=0);
ok('F1d 今日页已无旧阶梯rank-path',today.indexOf('rank-path')<0);
ok('F2 今日页有福田可视化',today.indexOf('field-vis')>=0);
ok('F3 今日页有法语',today.indexOf('dharma-q')>=0);
ok('F4 今日页有回向',today.indexOf('ded-text')>=0||today.indexOf('dedInput')>=0);
ok('F5 我的福田含四维详细(带进度条)',field.indexOf('dim-grid full')>=0);
ok('F6 我的福田含日历',field.indexOf('cal-head')>=0);
ok('F7 我的福田无独立回看入口',field.indexOf('data-v=\"back\"')<0);
T.getS().day='2026-11-18';
const cal=T.calHTML();
ok('F8 日历点开显示当日四问',cal.indexOf('day-detail')>=0&&cal.indexOf('今天对老人有耐心')>=0);
ok('F9 选中日有开合态class',cal.indexOf('cal-d has open')>=0);
T.getS().day='';
const cal2=T.calHTML();
ok('F10 同日再点收起(无day-detail)',cal2.indexOf('day-detail')<0);

console.log('\n=== G. 存储隔离与双语 ===');
ok('G1 存储键独立=futian.v1',T.KEY==='futian.v1','got '+T.KEY);
ok('G2 不写 success-diary/morning-three 键',!store['success-diary.v1']&&!store['morning-three.v1']);
T.setLang('en');ok('G3 英文词典切换',T.t('qTitle')==='Four questions','got '+T.t('qTitle'));
T.setLang('zh');ok('G4 中文词典切换',T.t('qTitle')==='今日四问','got '+T.t('qTitle'));
ok('G5 三条边界文案存在',T.t('noJudge').indexOf('不排名')>=0);
ok('G6 法语含金刚经原文',T.T.zh.dharmas.some(x=>x.indexOf('应无所住')>=0));
ok('G7 无假托出处(佛说/虚构人名)',T.T.zh.dharmaFroms.every(x=>x.indexOf('佛说')<0&&x.indexOf('慧云')<0));
ok('G8 法语出处带书名号或有据',T.T.zh.dharmaFroms.filter(x=>x.indexOf('《')>=0).length>=6);

console.log('\n结果: '+pass+' 通过 / '+fail+' 失败\n');
process.exit(fail?1:0);
