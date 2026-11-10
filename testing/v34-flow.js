/* =========================================================
   morning-three v34 · 聚焦新交互实测
   1) 晨间：无勾选框 + 提交→展示→编辑；18:00 后锁定
   2) 顺延：只有显式「带到明天」才带，没点的只记今天
   跑法：NODE_PATH=<playwright node_modules> node testing/v34-flow.js
   ========================================================= */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = __dirname;
const SHOTS = path.join(OUT, 'shots');
const PORT = 8797;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const server = http.createServer((q, s) => {
  let u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/') u = '/index.html';
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('404'); }
  s.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  s.end(fs.readFileSync(f));
});
function ymd(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
const TODAY = '2026-11-09';
function tmrOf(base, off){ const d = new Date(base+'T12:00:00+08:00'); d.setDate(d.getDate()+off); return ymd(d); }
const TMR = tmrOf(TODAY, 1);

let PASS=0, FAIL=0; const fails=[];
function rec(id, name, ok, extra){ if(ok){PASS++; console.log('  ok   '+id+' '+name);} else {FAIL++; fails.push(id+' '+name); console.log('  FAIL '+id+' '+name+' '+(extra?JSON.stringify(extra):''));} }
function tap(page, sel){ return page.evaluate(s=>{const e=document.querySelector(s); if(!e)return false; e.click(); return true;}, sel); }

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  const BASE = `http://127.0.0.1:${PORT}`;

  // ---------- 场景 1：晨间提交 / 编辑 / 无勾选框（白天 10:00） ----------
  console.log('\n=== S1 晨间提交/编辑（10:00） ===');
  {
    const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, locale:'zh-CN' });
    const page = await ctx.newPage();
    await page.clock.install({ time:new Date(TODAY+'T10:00:00+08:00') });
    await page.goto(BASE+'/index.html',{waitUntil:'load'});
    await page.evaluate((T)=>{
      localStorage.setItem('morning-three.v1', JSON.stringify({ days:{[T]:{tasks:[{text:'A'},{text:'B'},{text:'C'}], checkin:null, writtenAt:new Date().toISOString(), committed:false}}, demoKeys:[], carry:null }));
      localStorage.setItem('mt.brief.v1','off'); localStorage.setItem('mt.inst.ask','off');
    }, TODAY);
    await page.reload({waitUntil:'load'}); await page.waitForTimeout(250);
    await tap(page,'[data-act="closebrief"]'); await page.waitForTimeout(120);

    const s1 = await page.evaluate(()=>({
      hasCheck: !!document.querySelector('.check'),
      submit: !!document.querySelector('[data-act="submitday"]'),
      inputs: document.querySelectorAll('#shell .inp').length
    }));
    rec('S1-1','晨间无勾选圆框', !s1.hasCheck);
    rec('S1-2','草稿态有「提交今日规划」按钮', s1.submit);
    rec('S1-3','草稿态显示 3 个输入框', s1.inputs===3, {inputs:s1.inputs});

    await page.click('[data-act="submitday"]'); await page.waitForTimeout(220);
    const s2 = await page.evaluate(()=>({
      edit: !!document.querySelector('[data-act="editday"]'),
      toast: (document.querySelector('#toast')||{}).innerText||'',
      inputs: document.querySelectorAll('#shell .inp').length
    }));
    rec('S1-4','提交后切展示态（出现编辑键）', s2.edit);
    rec('S1-5','提交给「已记下」反馈', s2.toast.indexOf('已记下')>=0, {toast:s2.toast});
    rec('S1-6','提交后不再显示输入框（展示态）', s2.inputs===0, {inputs:s2.inputs});
    await shot(page,'v34-s1-committed.png');

    await page.click('[data-act="editday"]'); await page.waitForTimeout(150);
    const s3 = await page.evaluate(()=>document.querySelectorAll('#shell .inp').length);
    rec('S1-7','编辑键重新打开输入框', s3===3, {inputs:s3});
    await ctx.close();
  }

  // ---------- 场景 2：18:00 后锁定（今日已提交，19:00 进入） ----------
  console.log('\n=== S2 18:00 后锁定（19:00 已提交日） ===');
  {
    const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, locale:'zh-CN' });
    const page = await ctx.newPage();
    await page.clock.install({ time:new Date(TODAY+'T19:00:00+08:00') });
    await page.goto(BASE+'/index.html',{waitUntil:'load'});
    await page.evaluate((T)=>{
      localStorage.setItem('morning-three.v1', JSON.stringify({ days:{[T]:{tasks:[{text:'A'},{text:'B'}], checkin:null, writtenAt:new Date().toISOString(), committed:true}}, demoKeys:[], carry:null }));
      localStorage.setItem('mt.brief.v1','off'); localStorage.setItem('mt.inst.ask','off');
    }, TODAY);
    await page.reload({waitUntil:'load'}); await page.waitForTimeout(250);
    await tap(page,'[data-act="closebrief"]'); await page.waitForTimeout(120);
    const s = await page.evaluate(()=>({
      edit: !!document.querySelector('[data-act="editday"]'),
      submit: !!document.querySelector('[data-act="submitday"]'),
      inputs: document.querySelectorAll('#shell .inp').length,
      overlay: document.querySelectorAll('#ovRoot button').length
    }));
    rec('S2-1','18:00 后无「编辑」按钮（已锁定）', !s.edit);
    rec('S2-2','18:00 后无「提交」按钮', !s.submit);
    rec('S2-3','18:00 后为只读（无输入框）', s.inputs===0, {inputs:s.inputs});
    // 确认晚间收尾浮层仍在（只是晨间规划锁了）
    rec('S2-4','晚间收尾入口仍在', s.overlay>0, {overlay:s.overlay});
    await ctx.close();
  }

  // ---------- 场景 3：显式顺延（19:00 收尾，只点「带到明天」的才带） ----------
  console.log('\n=== S3 显式顺延（晚间收尾） ===');
  let carryAfterSeal = null;
  {
    const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, locale:'zh-CN' });
    const page = await ctx.newPage();
    await page.clock.install({ time:new Date(TODAY+'T19:30:00+08:00') });
    await page.goto(BASE+'/index.html',{waitUntil:'load'});
    await page.evaluate((T)=>{
      localStorage.setItem('morning-three.v1', JSON.stringify({ days:{[T]:{tasks:[{text:'A'},{text:'B'},{text:'C'}], checkin:null, writtenAt:new Date().toISOString(), committed:true}}, demoKeys:[], carry:null }));
      localStorage.setItem('mt.brief.v1','off'); localStorage.setItem('mt.inst.ask','off');
    }, TODAY);
    await page.reload({waitUntil:'load'}); await page.waitForTimeout(250);
    await tap(page,'[data-act="closebrief"]'); await page.waitForTimeout(120);
    const overlayShown = await page.evaluate(()=>document.querySelectorAll('#ovRoot .ov-item').length);
    rec('S3-1','19:00 收尾浮层显示 3 件要事', overlayShown===3, {overlayShown});
    // 第 0 件=推进了(1)，第 2 件=带到明天(2)，第 1 件不点。
    // 注意：每点一次浮层会重渲染，必须逐次重新查询实时节点（否则点到被移除的旧节点）
    await page.evaluate(()=>document.querySelectorAll('#ovRoot .ov-item')[0].querySelector('button[data-v="1"]').click());
    await page.waitForTimeout(90);
    await page.evaluate(()=>document.querySelectorAll('#ovRoot .ov-item')[2].querySelector('button[data-v="2"]').click());
    await page.waitForTimeout(90);
    const pickState = await page.evaluate(()=>{
      const items = document.querySelectorAll('#ovRoot .ov-item');
      return { b0: items[0].querySelector('button[data-v="1"]').className, b2: items[2].querySelector('button[data-v="2"]').className };
    });
    console.log('     picks 视觉状态:', JSON.stringify(pickState));
    await page.waitForTimeout(80);
    const sealed = await tap(page,'#ovRoot [data-act="seal"]');
    await page.waitForTimeout(250);
    console.log('     seal 点击返回:', sealed);
    carryAfterSeal = await page.evaluate(()=>{
      const d = JSON.parse(localStorage.getItem('morning-three.v1')||'{}');
      return d.carry ? d.carry.items : null;
    });
    rec('S3-2','只有显式「带到明天」(C) 进顺延', Array.isArray(carryAfterSeal) && carryAfterSeal.length===1 && carryAfterSeal[0]==='C', {carry:carryAfterSeal});
    rec('S3-3','没点的(B) 不自动带', Array.isArray(carryAfterSeal) && carryAfterSeal.indexOf('B')<0, {carry:carryAfterSeal});
    rec('S3-4','推进了的(A) 不进顺延', Array.isArray(carryAfterSeal) && carryAfterSeal.indexOf('A')<0, {carry:carryAfterSeal});
    await ctx.close();
  }

  // ---------- 场景 4：次日只见到显式顺延的项（其余为空） ----------
  console.log('\n=== S4 次日晨间（带 C，空 A/B） ===');
  {
    const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, locale:'zh-CN' });
    const page = await ctx.newPage();
    await page.clock.install({ time:new Date(TMR+'T10:00:00+08:00') });
    await page.goto(BASE+'/index.html',{waitUntil:'load'});
    await page.evaluate(({T,next,carry})=>{
      localStorage.setItem('morning-three.v1', JSON.stringify({ days:{[next]:{tasks:[], checkin:null, writtenAt:null, committed:false}}, demoKeys:[], carry:{date:next, items:carry, from:T} }));
      localStorage.setItem('mt.brief.v1','off'); localStorage.setItem('mt.inst.ask','off');
    }, {T:TODAY, next:TMR, carry:['C']});
    await page.reload({waitUntil:'load'}); await page.waitForTimeout(250);
    await tap(page,'[data-act="closebrief"]'); await page.waitForTimeout(120);
    const s = await page.evaluate(()=>({
      inputs: Array.from(document.querySelectorAll('#shell .inp')).map(e=>e.value.trim()),
      tags: Array.from(document.querySelectorAll('#shell .tag')).map(e=>e.innerText.trim()),
      hasCheck: !!document.querySelector('.check')
    }));
    const filled = s.inputs.filter(x=>x);
    rec('S4-1','次日只带显式顺延的 C（作可编辑项）', filled.length===1 && filled[0]==='C', {inputs:s.inputs});
    rec('S4-2','顺延项带「顺延」标签', s.tags.indexOf('顺延')>=0, {tags:s.tags});
    rec('S4-3','次日晨间无勾选框', !s.hasCheck);
    rec('S4-4','A/B 不出现在次日', s.inputs.indexOf('A')<0 && s.inputs.indexOf('B')<0, {inputs:s.inputs});
    await shot(page,'v34-s4-nextday.png');
    await ctx.close();
  }

  await browser.close();
  console.log(`\n===== v34 汇总: ${PASS} 通过 / ${FAIL} 失败 =====`);
  if(fails.length) console.log('失败项: '+fails.join(' | '));
  process.exit(FAIL?1:0);
})();

async function shot(page,name){ try{ await page.screenshot({path:path.join(SHOTS,name), fullPage:true}); }catch(e){} }
