/* v42 聚焦测试：云同步（邮箱 OTP + 按天合并 + 拉推 + 弹窗/按钮）
   用 DOM 桩 + mock cloud 跑 index.html 的真实逻辑，不发真实网络请求 */
const fs = require('fs');
const vm = require('vm');

const DIR = '/Users/davidma/WorkBuddy/daily list/morning-list/';
const html = fs.readFileSync(DIR + 'index.html', 'utf8');
const sw = fs.readFileSync(DIR + 'sw.js', 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

ok('T0 sw.js bump 到 v42', /morning-three-v42/.test(sw) && !/morning-three-v41/.test(sw));
ok('T1 引入 cloud SDK CDN', html.indexOf('workbuddy-cloud-sdk@dev/lib/index.global.js') !== -1);
ok('T2 publicConfig 三值齐全', html.indexOf('morning-three.app.workbuddy.host') !== -1 &&
   html.indexOf('wbpk_WN1wgF1azCqiD91AtopsMQ') !== -1 &&
   html.indexOf('https://www.workbuddy.cn/v2/as/genie-baas/oauth') !== -1);

const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let big = blocks.sort((a, b) => b.length - a.length)[0];
const expose = '{initCloud,authGate,buildPayload,mergeDayMaps,applyPayload,sendSyncCode,verifySyncCode,syncPull,syncPush,syncNow,signOutSync,openSync,closeSync,renderSync,bindSync,header,render,SYNC,CLOUD_CFG,T,KEY,SKEY,DB,load,save,setCloud:(c)=>{cloud=c;}}';
const i = big.lastIndexOf('})();');
big = big.slice(0, i) + ';window.__T=' + expose + ';' + big.slice(i);

function makeEl(id) {
  const cls = {}, listeners = {};
  const el = {
    id, innerHTML:'', value:'', style:{}, disabled:false,
    classList:{ contains:k=>!!cls[k], add:k=>{cls[k]=1;}, remove:k=>{delete cls[k];} },
    querySelector:()=>null, querySelectorAll:()=>[],
    addEventListener:(t,fn)=>{ (listeners[t]=listeners[t]||[]).push(fn); },
    setAttribute(){}, getAttribute(){return null;},
    closest:()=>el, appendChild(){}, getContext(){return null;}, focus(){}, click(){},
    _fire:(t,ev)=>{ (listeners[t]||[]).forEach(fn=>fn(ev)); }
  };
  return el;
}
const store = {};
const els = {};
['shell','toast','syncRoot','syMsg','syEmail','syCode'].forEach(id=>els[id]=makeEl(id));
const ctx = {
  console, Date, Math, JSON, RegExp, Promise, parseInt, parseFloat, isNaN, String, Number, Array, Object, Boolean, Error,
  Blob: function(){}, URL:{ createObjectURL:()=> 'blob:x', revokeObjectURL(){} },
  setTimeout:(fn)=>{}, setInterval:()=>{}, clearTimeout:()=>{}, clearInterval:()=>{},
  location:{ href:'', search:'' }, navigator:{},
  localStorage:{ getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} },
  document:{ getElementById:id=>els[id]||(els[id]=makeEl(id)), querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){}, createElement:()=>makeEl('a') },
  window:{}, self:{}
};
ctx.window = ctx; ctx.self = ctx; ctx.global = ctx;
ctx.window.addEventListener = ()=>{};
ctx.window.localStorage = ctx.localStorage; ctx.window.document = ctx.document;
ctx.window.location = ctx.location; ctx.window.navigator = ctx.navigator;
vm.createContext(ctx);
try { vm.runInContext(big, ctx, { filename: 'index.js' }); }
catch (e) { console.log('LOAD ERR', e.message); process.exit(1); }
const T = ctx.__T;

/* ============ 词典 zh/en 对齐 ============ */
const syncKeys = ['sync_btn','sync_title','sync_sub','sync_email','sync_code','sync_send','sync_login','sync_ok','sync_err_code','sync_bad','sync_offline'];
let dictOk = true;
syncKeys.forEach(k=>{ if(!T.T.zh[k] || !T.T.en[k]) dictOk = false; });
ok('T3 同步文案 zh/en 齐全', dictOk);

/* ============ buildPayload 打包两库 ============ */
store[T.KEY] = JSON.stringify({ days:{ '2026-01-01':{tasks:[{text:'A',done:true}], writtenAt:'2026-01-01T07:00:00'} }, demoKeys:['2026-01-01'], carry:{date:'2026-01-02', items:[{text:'carry'}]} });
store[T.SKEY] = JSON.stringify({ days:{ '2026-01-01':{items:[{q:'做对',a:'x'}]} }, unlock:{ '2026-01-01':true } });
const payload = T.buildPayload();
ok('T4 payload 含 app/version/syncedAt', payload.app==='morning-three' && payload.version===1 && !!payload.syncedAt);
ok('T5 payload 打包晨间 days + demoKeys + carry', !!payload.morning.days['2026-01-01'] && payload.morning.demoKeys.length===1 && !!payload.morning.carry);
ok('T6 payload 打包晚间 days + unlock', !!payload.evening.days['2026-01-01'] && payload.evening.unlock['2026-01-01']===true);

/* ============ mergeDayMaps 合并 ============ */
const older = { '2026-02-01':{tasks:[{text:'旧'}], writtenAt:'2026-02-01T07:00:00'} };
const newer = { '2026-02-01':{tasks:[{text:'新'}], writtenAt:'2026-02-01T09:00:00'}, '2026-02-02':{tasks:[{text:'二'}], writtenAt:'2026-02-02T08:00:00'} };
let merged = T.mergeDayMaps(older, newer);
ok('T7 合并保留两边所有日期', Object.keys(merged).length===2);
ok('T8 同一天取较新（remote 新 → 用 remote）', merged['2026-02-01'].tasks[0].text==='新');
merged = T.mergeDayMaps(newer, older);
ok('T9 同一天取较新（local 新 → 用 local）', merged['2026-02-01'].tasks[0].text==='新');
const noTimeA = { '2026-03-01':{tasks:[{text:'本地无时间'}]} };
const noTimeB = { '2026-03-01':{tasks:[{text:'云端无时间'}]} };
ok('T10 都无时间 → 本地优先', T.mergeDayMaps(noTimeA, noTimeB)['2026-03-01'].tasks[0].text==='本地无时间');

/* ============ applyPayload 合并写回 ============ */
store[T.KEY] = JSON.stringify({ days:{ '2026-04-01':{tasks:[{text:'本地'}]} } });
store[T.SKEY] = JSON.stringify({ days:{} });
const cloudP = { syncedAt:'2026-04-02T10:00:00', morning:{ days:{ '2026-04-01':{tasks:[{text:'云端同天'}], writtenAt:'2026-04-01T08:00:00'}, '2026-04-02':{tasks:[{text:'云端新天'}]} } }, evening:{ days:{} } };
const added = T.applyPayload(cloudP);
ok('T11 applyPayload 返回云端带来的新天数', added===1);
const after = JSON.parse(store[T.KEY]);
ok('T12 applyPayload 把云端新日期写入本地', !!after.days['2026-04-02']);
ok('T13 applyPayload 记下 syncedAt', !!store['mt.syncAt']);

/* ============ mock cloud：OTP + 数据库 ============ */
let sentEmail = null, verifiedToken = null, upsertCalled = false, sessionOn = false;
const testUser = { email:'me@example.com' };
function mockCloud(){
  return {
    auth:{
      getSession: async ()=> sessionOn ? { data:{ session:{ user:testUser } }, error:null } : { data:{ session:null }, error:null },
      sendOtp: async ({email})=>{ sentEmail=email; return { data:{ verificationId:'vid123', isExistingUser:false }, error:null }; },
      verifyOtp: async (p)=>{ verifiedToken=p.token; sessionOn=true; return { data:{ user:testUser }, error:null }; },
      signOut: async ()=>{ sessionOn=false; return { error:null }; }
    },
    database:{
      from: ()=>({
        select: ()=>({ maybeSingle: async ()=>{ const p=JSON.parse(store['__cloudPayload']||'null'); return { data:p?{ id:1, payload:p }:null, error:null }; } }),
        insert: (row)=>({ select: async ()=>{ store['__cloudPayload']=JSON.stringify(row.payload); upsertCalled=true; return { data:[{id:1}], error:null }; } }),
        update: (row)=>({ eq:()=>({ select: async ()=>{ store['__cloudPayload']=JSON.stringify(row.payload); upsertCalled=true; return { data:[{id:1}], error:null }; } }) })
      })
    }
  };
}
T.setCloud(mockCloud());

(async ()=>{
  /* initCloud 已有 cloud 时不重复创建 */
  ok('T14 initCloud 幂等（已有实例返回 true）', T.initCloud()===true);

  /* 发验证码 */
  els['syEmail'].value = 'me@example.com';
  await T.sendSyncCode('me@example.com');
  ok('T15 sendOtp 收到邮箱', sentEmail==='me@example.com');
  ok('T16 进入验证码步骤', T.SYNC.step==='code' && T.SYNC.pending.email==='me@example.com');

  /* 邮箱格式校验 */
  let before = sentEmail;
  await T.sendSyncCode('bad-email');
  ok('T17 非法邮箱不发 OTP', sentEmail===before);

  /* 验证码登录 */
  await T.verifySyncCode('654321');
  ok('T18 verifyOtp 收到验证码', verifiedToken==='654321');
  ok('T19 登录后 SYNC.user 建立', !!T.SYNC.user && T.SYNC.user.email==='me@example.com');
  ok('T20 登录后 step 复位', T.SYNC.step==='email' && T.SYNC.pending===null);

  /* 端到端同步：pull + push */
  delete store['__cloudPayload'];
  store[T.KEY] = JSON.stringify({ days:{ '2026-05-01':{tasks:[{text:'同步日'}], writtenAt:'2026-05-01T07:00:00'} } });
  T.load();
  await T.syncNow(true);
  ok('T21 syncNow 推数据到云端（upsert）', upsertCalled===true);
  const cloudSaved = JSON.parse(store['__cloudPayload']);
  ok('T22 云端保存了完整 payload', !!cloudSaved.morning.days['2026-05-01'] && cloudSaved.app==='morning-three');

  /* 换设备场景：本地清空，云端有数据 → pull 恢复 */
  store['__cloudPayload'] = JSON.stringify({ syncedAt:'2026-05-03T10:00:00', app:'morning-three', version:1,
    morning:{ days:{ '2026-06-01':{tasks:[{text:'旧设备写的'}], writtenAt:'2026-06-01T07:00:00'} } }, evening:{ days:{} } });
  store[T.KEY] = JSON.stringify({ days:{} });
  T.load();
  const pull = await T.syncPull();
  ok('T23 syncPull 成功', pull.ok===true && pull.hasCloud===true);
  ok('T24 syncPull 识别云端新天数', pull.added===1);
  ok('T25 换设备后本地恢复到云端数据', !!JSON.parse(store[T.KEY]).days['2026-06-01']);

  /* 退出登录 */
  await T.signOutSync();
  ok('T26 signOut 清空用户', T.SYNC.user===null && sessionOn===false);

  /* 顶栏同步按钮：未登录/登录态 */
  T.SYNC.user = null;
  let h = T.header();
  ok('T27 顶栏有同步按钮', h.indexOf('data-act="sync"')!==-1 && h.indexOf('>同步<')!==-1);
  T.SYNC.user = testUser;
  h = T.header();
  ok('T28 登录态同步按钮点亮', h.indexOf('lang sync online')!==-1);

  /* 弹窗三态渲染 */
  T.SYNC.user = null; T.SYNC.step='email'; T.SYNC.pending=null; T.openSync();
  ok('T29 邮箱态弹窗渲染', els['syncRoot'].innerHTML.indexOf('syEmail')!==-1);
  ok('T30 弹窗有 on 类', els['syncRoot'].classList.contains('on'));
  T.SYNC.step='code'; T.SYNC.pending={email:'me@example.com',verificationId:'v',isExistingUser:false}; T.renderSync();
  ok('T31 验证码态弹窗渲染', els['syncRoot'].innerHTML.indexOf('syCode')!==-1);
  T.SYNC.user=testUser; T.renderSync();
  ok('T32 已登录态弹窗渲染', els['syncRoot'].innerHTML.indexOf('data-act="synow"')!==-1 && els['syncRoot'].innerHTML.indexOf('data-act="syout"')!==-1);

  /* bindSync 只绑一次 */
  T.bindSync(); T.bindSync();
  ok('T33 bindSync 幂等', !!els['syncRoot'].__bound);

  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e=>{ console.log('ASYNC ERR', e.message); process.exit(1); });
