/* =========================================================
   morning-three v32 · 三画像浏览器实测脚本
   跑法：NODE_PATH=<playwright 所在 node_modules> node testing/audit-run.js
   产出：testing/raw-log.json、testing/shots/*.png

   原则：只记录真实 DOM / 真实点击 / 真实 localStorage，不推断用户感受。
   画像差异体现在：设备尺寸、首次访问时间、历史数据密度、输入内容。
   ========================================================= */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = __dirname;
const SHOTS = path.join(OUT, 'shots');
const PORT = 8796;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((q, s) => {
  let u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/') u = '/index.html';
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    s.writeHead(404); return s.end('404');
  }
  s.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  s.end(fs.readFileSync(f));
});

/* ---------- 测试数据构造：全部以 2026-11-09 为「今天」 ---------- */
const TODAY = '2026-11-09';
function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dOff(n) { const d = new Date(TODAY + 'T12:00:00+08:00'); d.setDate(d.getDate() - n); return ymd(d); }
function tk(text, done) { return { text, done: !!done }; }
function day(tasks, checkin) { return { tasks, checkin: checkin || null, writtenAt: null }; }
function ck(n, results, note) {
  const d = new Date(TODAY + 'T19:30:00+08:00'); d.setDate(d.getDate() - n);
  return { at: d.toISOString(), results, note: note || '' };
}
const EMPTY_DAY = { tasks: [], checkin: null, writtenAt: null };   // 打开过 / 写了又删光留下的空记录

const A_DAYS = {
  [dOff(9)]: day([tk('方案初稿', true), tk('站立会同步', true), tk('下班健身', false)], ck(9, [1, 1, 0], '第一天，有点慌')),
  [dOff(8)]: day([tk('方案初稿', true), tk('需求确认', true), tk('', false)], ck(8, [1, 1], '')),
  [dOff(6)]: day([tk('方案初稿', true), tk('复盘', false), tk('早睡', false)], ck(6, [1, 0, 0], '还是没早睡')),
  [dOff(5)]: day([tk('周报', true), tk('方案初稿', false), tk('', false)], null),
  [dOff(3)]: day([tk('导师 1v1', true), tk('方案初稿', true), tk('', false)], ck(3, [1, 1], '')),
  [dOff(2)]: day([tk('方案初稿', true), tk('提交周报', true), tk('', false)], ck(2, [1, 1], '')),
  [dOff(1)]: day([tk('方案定稿', true), tk('复盘', true), tk('早睡', false)], ck(1, [1, 1, 0], '慢慢顺了'))
};
const B_DAYS = {
  [dOff(6)]: day([tk('买菜', true), tk('给妈妈打电话', true), tk('晒被子', true)], ck(6, [1, 1, 1], '今天太阳好')),
  [dOff(5)]: EMPTY_DAY,                                             // 空记录（用于判据审计）
  [dOff(4)]: day([tk('医院拿药', true), tk('接孙子', true), tk('', false)], ck(4, [1, 1], '')),
  [dOff(3)]: EMPTY_DAY,                                             // 空记录（用于判据审计）
  [dOff(1)]: day([tk('收拾衣柜', false), tk('给女儿寄东西', false), tk('', false)], null)
};
const C_DAYS = {
  [dOff(2)]: day([tk('数学卷子', true), tk('背单词', false), tk('', false)], ck(2, [1, 0], '')),
  [dOff(1)]: day([tk('物理作业', false), tk('', false), tk('', false)], null)
};

/* ---------- 画像定义 ---------- */
const PROFILES = [
  {
    id: 'A', name: '24 岁 · 男性 · 职场初任', device: 'iPhone 14 Pro',
    viewport: { width: 393, height: 852 }, dpr: 3,
    first: TODAY + 'T08:12:00+08:00', evening: TODAY + 'T20:30:00+08:00',
    days: A_DAYS, sd: null,
    firstInput: '把方案发给导师看', secondInput: '整理会议纪要'
  },
  {
    id: 'B', name: '55 岁 · 女性 · 家庭妇女', device: 'iPhone（默认字号）',
    viewport: { width: 390, height: 844 }, dpr: 3,
    first: TODAY + 'T09:40:00+08:00', evening: TODAY + 'T20:30:00+08:00',
    days: B_DAYS, sd: null,
    firstInput: '去菜场买鱼', secondInput: '给女儿打电话'
  },
  {
    id: 'C', name: '13 岁 · 男性 · 初中生', device: 'Android 中端机',
    viewport: { width: 360, height: 800 }, dpr: 2,
    first: TODAY + 'T20:30:00+08:00', evening: TODAY + 'T21:10:00+08:00',
    days: C_DAYS, sd: null,
    firstInput: '写完数学卷子', secondInput: '背 20 个单词'
  }
];

/* ---------- 断言收集 ---------- */
const LOG = { version: 'v33', today: TODAY, generatedAt: new Date().toISOString(), profiles: [] };
function rec(p, id, name, pass, evidence) {
  p.checks.push({ id, name, pass: !!pass, evidence: evidence === undefined ? null : evidence });
  console.log(`  [${p.id}] ${pass ? 'PASS' : 'FAIL'} ${id} ${name}`);
}

/* 统一的页面快照：只读真实 DOM + computed style */
const SNAP = () => {
  const q = s => document.querySelector(s);
  const txt = s => (q(s) || {}).innerText || '';
  const all = Array.from(document.querySelectorAll('#shell *')).filter(e => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (e.innerText || '').trim();
  });
  const sizes = all.map(e => parseFloat(getComputedStyle(e).fontSize));
  return {
    url: location.pathname,
    shellText: txt('#shell').slice(0, 1200),
    cardCount: document.querySelectorAll('#shell .card').length,
    echo: txt('.echo'),
    whisper: txt('.whisper'),
    h1: txt('#shell .h1'),
    h1sub: txt('#shell .h1-sub'),
    footNote: txt('#shell .foot-note'),
    phaseHint: txt('#shell .phint'),
    overlayText: txt('#ovRoot').slice(0, 600),
    overlayButtons: Array.from(document.querySelectorAll('#ovRoot button')).map(b => b.innerText.trim()),
    inputPlaceholders: Array.from(document.querySelectorAll('#shell .inp')).map(i => i.placeholder),
    inputFontPx: (function () { const i = q('#shell .inp'); return i ? parseFloat(getComputedStyle(i).fontSize) : null; })(),
    minFontPx: sizes.length ? Math.min.apply(null, sizes) : null,
    under13Count: sizes.filter(s => s < 13).length,
    textNodeCount: sizes.length,
    sdCard: txt('.sd-wrap'),
    detailsCount: document.querySelectorAll('#shell details').length,
    langBtn: txt('.lang:not(.bell)')
  };
};

/* JS 点击：规避移动端遮挡导致 page.click 超时 */
async function tap(page, selector) {
  return page.evaluate(sel => {
    const e = document.querySelector(sel);
    if (!e) return false;
    e.click(); return true;
  }, selector);
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const BASE = `http://127.0.0.1:${PORT}`;

  for (const cfg of PROFILES) {
    const p = {
      id: cfg.id, name: cfg.name, device: cfg.device,
      viewport: cfg.viewport, firstVisit: cfg.first,
      checks: [], snapshots: {}, shots: []
    };
    LOG.profiles.push(p);
    console.log(`\n=== ${cfg.id} ${cfg.name} ===`);

    const context = await browser.newContext({
      viewport: cfg.viewport, deviceScaleFactor: cfg.dpr,
      isMobile: true, hasTouch: true, locale: 'zh-CN'
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e)));
    await page.clock.install({ time: new Date(cfg.first) });

    // 先落一次空页面，再写预置数据并 reload（避免 addInitScript 在 reload 时覆盖用户输入）
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    await page.evaluate(({ days, sd }) => {
      localStorage.setItem('morning-three.v1', JSON.stringify({ days, demoKeys: [], carry: null }));
      // 三个画像都是「已有历史」的老用户：关掉首次 briefing / 安装询问，避免弹层污染断言
      localStorage.setItem('mt.brief.v1', 'off');
      localStorage.setItem('mt.inst.ask', 'off');
      if (sd) localStorage.setItem('success-diary.v1', JSON.stringify(sd));
      else localStorage.removeItem('success-diary.v1');
    }, { days: cfg.days, sd: cfg.sd });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(250);

    // 关掉首次 briefing（若存在）
    await tap(page, '[data-act="closebrief"]');
    await page.waitForTimeout(120);

    const s1 = await page.evaluate(SNAP);
    p.snapshots.first = s1;
    console.log(`    首屏: cards=${s1.cardCount} h1="${s1.h1}" overlay=${s1.overlayButtons.join('/') || 'none'}`);

    rec(p, 'F-01', '首屏能渲染且无 JS 报错', pageErrors.length === 0 && s1.shellText.length > 20, { errors: pageErrors });
    rec(p, 'F-02', '首页只有一句提示 + 一句回顾（无重复回顾）',
      !!s1.echo && s1.shellText.indexOf('天前，你在意的是') < 0 && s1.shellText.indexOf('今天还惦记') < 0,
      { echo: s1.echo, whisper: s1.whisper });
    rec(p, 'F-03', '首屏未被收尾浮层接管（首次即可写）',
      s1.overlayButtons.length === 0, { overlay: s1.overlayText.slice(0, 160), buttons: s1.overlayButtons });
    rec(p, 'F-04', '今日输入框存在且字号 ≥16px（iOS 不缩放底线）',
      s1.inputPlaceholders.length >= 1 && s1.inputFontPx >= 16,
      { placeholders: s1.inputPlaceholders, inputFontPx: s1.inputFontPx });
    rec(p, 'F-05', '首屏可见文字不小于 13px（可读性底线）',
      s1.minFontPx >= 13 && s1.under13Count === 0,
      { minFontPx: s1.minFontPx, under13Count: s1.under13Count, textNodes: s1.textNodeCount });
    rec(p, 'F-10', '首页不再出现倒计时与「没白过」式施压文案',
      s1.shellText.indexOf('距 18:00 收尾还有') < 0 && s1.shellText.indexOf('没白过') < 0,
      { phaseHint: s1.phaseHint, footNote: s1.footNote });
    rec(p, 'F-11', '首页解锁说明与真实规则一致（至少 4 次 / 不必连续）',
      !s1.footNote || (s1.footNote.indexOf('至少 4 次') >= 0 && s1.footNote.indexOf('不必连续') >= 0),
      { footNote: s1.footNote });
    const isNightFirst = new Date(cfg.first).getHours() >= 18;
    const coldMentions = (s1.shellText.match(/现在写下/g) || []).length;
    rec(p, 'F-12', '晚间冷启动文案自洽且不重复（不劝退、不报过期时间、只说一次）',
      !isNightFirst || (s1.shellText.indexOf('明天来写第一笔') < 0 &&
        s1.phaseHint.indexOf('19:00 前可改') < 0 &&
        s1.phaseHint.indexOf('现在写下') >= 0 && coldMentions === 1),
      { phaseHint: s1.phaseHint, h1sub: s1.h1sub, coldMentions, isNightFirst });
    await shot(page, `${cfg.id}-01-first.png`); p.shots.push(`${cfg.id}-01-first.png`);

    // ---- 输入链路（仅当首屏允许输入）----
    const canType = await page.evaluate(() => !!document.querySelector('#shell .inp[data-i="0"]'));
    if (canType) {
      await page.locator('#shell .inp[data-i="0"]').fill(cfg.firstInput);
      // savedHint() 是 650ms 延时提示，clock 冻结下需手动推进定时器才能观测真实行为
      const instantToast = await page.evaluate(() => (document.querySelector('#toast') || {}).innerText || '');
      await page.clock.runFor(700);
      await page.waitForTimeout(120);
      const afterInput = await page.evaluate(() => ({
        toast: (document.querySelector('#toast') || {}).innerText || '',
        secondGhost: !!(document.querySelector('.item[data-row="1"]') || {}).className &&
          document.querySelector('.item[data-row="1"]').className.indexOf('ghost') >= 0,
        stored: JSON.parse(localStorage.getItem('morning-three.v1') || '{}').days || {}
      }));
      p.snapshots.afterInput = afterInput;
      const today = TODAY;
      const wrote = afterInput.stored[today] && afterInput.stored[today].tasks.some(t => t.text === cfg.firstInput);
      rec(p, 'F-06', '输入即存（停下即保存）', !!wrote, { toast: afterInput.toast });
      rec(p, 'F-07', '写完第一行自动露出第二行', afterInput.secondGhost === false, { secondGhost: afterInput.secondGhost });
      rec(p, 'F-08', '停下 650ms 后出现「已保存」反馈', afterInput.toast.indexOf('已保存') >= 0,
        { instantToast, delayedToast: afterInput.toast, note: '输入瞬间无反馈，属延时轻提示' });

      // 晨间已移除「完成勾选」圆框；改为「提交 → 展示 → 编辑」
      const hasCheck = await page.evaluate(() => !!document.querySelector('.check'));
      const submitBtn = await page.$('[data-act="submitday"]');
      let submitted = false, sawEdit = false, sawToast = '';
      if(submitBtn){
        await page.click('[data-act="submitday"]');
        await page.waitForTimeout(200);
        const st = await page.evaluate(() => ({
          editBtn: !!document.querySelector('[data-act="editday"]'),
          toast: (document.querySelector('#toast') || {}).innerText || '',
          inputs: document.querySelectorAll('.inp').length
        }));
        submitted = st.editBtn;
        sawToast = st.toast;
        if(st.editBtn){
          await page.click('[data-act="editday"]');
          await page.waitForTimeout(150);
          sawEdit = await page.evaluate(() => document.querySelectorAll('.inp').length > 0);
        }
      }
      rec(p, 'F-09', '晨间无勾选圆框', !hasCheck, {});
      rec(p, 'F-09b', '提交后切展示态(出现编辑键)且给反馈', submitted && sawToast.indexOf('已记下') >= 0, { toast: sawToast });
      rec(p, 'F-09c', '编辑键可重新打开输入', sawEdit, {});
    } else {
      rec(p, 'F-06', '输入即存（停下即保存）', false, '首屏无输入框（被浮层/只读态接管）');
      rec(p, 'F-07', '写完第一行自动露出第二行', false, '首屏无输入框');
      rec(p, 'F-08', '录入后给出即时反馈（toast）', false, '首屏无输入框');
      rec(p, 'F-09', '晨间无勾选圆框', false, '首屏无输入框');
      rec(p, 'F-09b', '提交后切展示态且给反馈', false, '首屏无输入框');
      rec(p, 'F-09c', '编辑键可重新打开输入', false, '首屏无输入框');
    }

    // ---- 洞察 / 归档 / 价值 ----
    await tap(page, '[data-act="view"][data-v="stats"]');
    await page.waitForTimeout(200);
    const stats = await page.evaluate(SNAP);
    p.snapshots.stats = stats;
    rec(p, 'S-01', '洞察页可进入且有内容', stats.shellText.length > 20, { head: stats.shellText.slice(0, 120) });
    rec(p, 'S-02', '最近记录为折叠态（默认收起）', stats.detailsCount >= 1, { details: stats.detailsCount });
    const dataLinkOnStats = await page.evaluate(() => !!document.querySelector('a[href="success.html?view=data"]'));
    rec(p, 'G-07', '洞察页提供数据备份入口（未解锁用户第 1 天可达）', dataLinkOnStats, { dataLinkOnStats });
    await shot(page, `${cfg.id}-02-stats.png`); p.shots.push(`${cfg.id}-02-stats.png`);

    const archOk = await tap(page, '.arch-go .linkbtn');
    await page.waitForTimeout(200);
    const arch = await page.evaluate(() => (document.querySelector('#shell') || {}).innerText || '');
    const marker = Object.keys(cfg.days).map(k => (cfg.days[k].tasks || []).map(t => t.text).filter(Boolean)[0]).filter(Boolean)[0] || '';
    rec(p, 'S-03', '归档页可打开且能看到历史记录', archOk && marker && arch.indexOf(marker) >= 0,
      { marker, head: arch.slice(0, 140) });

    await tap(page, '[data-act="view"][data-v="today"]');
    await page.waitForTimeout(150);
    const valOk = await tap(page, '[data-act="value"]');
    await page.waitForTimeout(300);
    const valFrame = await page.evaluate(() => !!document.querySelector('#valFrame'));
    rec(p, 'S-04', '价值主张弹窗可打开（iframe）', valOk && valFrame, { valOk, valFrame });
    await tap(page, '[data-act="valclose"]');

    // ---- 语言切换 ----
    await tap(page, '[data-act="lang"]');
    await page.waitForTimeout(200);
    const en = await page.evaluate(SNAP);
    rec(p, 'I-01', '中英切换生效', en.h1 !== s1.h1 || en.langBtn.indexOf('中文') >= 0 || en.shellText.indexOf('What') >= 0,
      { zhH1: s1.h1, enH1: en.h1, langBtn: en.langBtn });
    await tap(page, '[data-act="lang"]');
    await page.waitForTimeout(150);

    // ---- 晚间：时间推到 20:30，重载看阶段切换 ----
    await page.clock.setFixedTime(new Date(cfg.evening));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(250);
    await tap(page, '[data-act="closebrief"]');
    const eve = await page.evaluate(SNAP);
    p.snapshots.evening = eve;
    rec(p, 'E-01', '19:00 后（今日有内容）进入只读 + 收尾浮层', eve.overlayButtons.length > 0,
      { buttons: eve.overlayButtons, h1sub: eve.h1sub });
    const expectSd = (cfg.id === 'A');   // A 已满 7 天；B/C 未满 7 天应正确隐藏
    rec(p, 'E-02', expectSd ? '满 7 天后首页出现晚间反思入口' : '未满 7 天时晚间反思入口正确隐藏',
      expectSd ? !!eve.sdCard : !eve.sdCard, { sdCard: eve.sdCard.slice(0, 160) });
    await shot(page, `${cfg.id}-03-evening.png`); p.shots.push(`${cfg.id}-03-evening.png`);

    // 收尾浮层按钮结构
    const ovDetail = await page.evaluate(() => ({
      pickBtns: document.querySelectorAll('#ovRoot .pk').length,
      sealBtn: Array.from(document.querySelectorAll('#ovRoot button')).map(b => b.innerText.trim()),
      note: !!document.querySelector('#ovNote')
    }));
    p.snapshots.overlay = ovDetail;
    rec(p, 'E-03', '收尾弹层「没推进」有显式操作入口', ovDetail.pickBtns >= 2,
      { pickBtns: ovDetail.pickBtns, buttons: ovDetail.sealBtn });
    rec(p, 'E-04', '收尾弹层提供一句话输入', ovDetail.note, ovDetail);

    // ---- 成功日记门禁页（同 context 共享 localStorage）----
    const sp = await context.newPage();
    const gateErrors = [];
    sp.on('pageerror', e => gateErrors.push(String(e)));
    await sp.clock.install({ time: new Date(cfg.evening) });
    await sp.goto(BASE + '/success.html', { waitUntil: 'load' });
    await sp.waitForTimeout(250);
    const gate = await sp.evaluate(() => {
      let u = null;
      try { u = (typeof unlock === 'function') ? unlock() : null; } catch (e) { u = { error: String(e) }; }
      let w = null;
      try { w = (typeof mWindow === 'function') ? mWindow(mLoad()) : null; } catch (e) { w = { error: String(e) }; }
      return {
        state: u && u.state, ran: u && u.ran, inputs: u && u.win && u.win.inputs,
        winInputs: w && w.inputs,
        windowDays: w && w.list && w.list.map(x => ({ k: x.k, has: x.has })),
        text: (document.body.innerText || '').slice(0, 500)
      };
    });
    p.snapshots.gate = gate;
    p.snapshots.gateErrors = gateErrors;
    rec(p, 'G-01', '晚间反思门禁状态可判定', !!gate.state, gate);
    rec(p, 'G-06', '解锁瞬间页面无 JS 异常（无晚间记录时）', gateErrors.length === 0,
      { errors: gateErrors, gateState: gate.state });
    // 首页状态 vs 门禁真值：满足条件却仍显示「还差 n/4 次」= 跨页状态不一致
    const stillLockedCopy = eve.sdCard.indexOf('过去 7 天输入了') >= 0 || eve.sdCard.indexOf('还差') >= 0;
    rec(p, 'G-03', '首页解锁提示与门禁判定一致',
      gate.state !== 'open' || (!stillLockedCopy && eve.sdCard.indexOf('已经为你敞开') >= 0),
      { gateState: gate.state, homeSdCard: eve.sdCard.slice(0, 160), stillLockedCopy });
    await shot(sp, `${cfg.id}-04-gate.png`); p.shots.push(`${cfg.id}-04-gate.png`);

    // 数据备份审计：导出 payload 是否含晨间清单（用户最核心的历史）
    const backup = await sp.evaluate(() => {
      let payload = '{}', parsed = null;
      try { payload = JSON.stringify(backupPayload(), null, 2); parsed = JSON.parse(payload); }
      catch (e) { payload = 'ERR:' + e; }
      let morning = {};
      try { morning = JSON.parse(localStorage.getItem('morning-three.v1') || '{}'); } catch (e) {}
      const words = ['方案初稿', '买菜', '数学卷子'];
      return {
        exportBytes: payload.length,
        exportHasMorningWords: words.some(w => payload.indexOf(w) >= 0),
        morningDayCount: Object.keys(morning.days || {}).length,
        exportedDayCount: Object.keys(DB.days).length,
        app: parsed && parsed.app,
        version: parsed && parsed.version,
        packedMorningDays: parsed && parsed.morning && Object.keys(parsed.morning.days || {}).length,
        packedEveningDays: parsed && parsed.evening && Object.keys(parsed.evening.days || {}).length
      };
    });
    p.snapshots.backup = backup;
    rec(p, 'G-04', '导出备份包含晨间清单与晚间反思（真实调用导出函数）',
      backup.exportHasMorningWords && backup.app === 'morning-three' &&
      backup.packedMorningDays === backup.morningDayCount, backup);

    const dataReach = await tap(sp, '[data-act="view"][data-v="data"]');
    await sp.waitForTimeout(150);
    const dataText = await sp.evaluate(() =>
      (document.body.innerText || '').indexOf('导出为 JSON') >= 0);
    rec(p, 'G-05', '数据/导出入口在当前状态下可达', dataReach && dataText, { dataReach, dataText });

    // 导入回环：备份不只是「文件里有」，还要真的能把数据带回来
    const rtBefore = await sp.evaluate(() => {
      const payload = backupPayload();
      const before = Object.keys(JSON.parse(localStorage.getItem('morning-three.v1') || '{}').days || {}).length;
      localStorage.removeItem('morning-three.v1');
      const inp = document.querySelector('#fileIn');
      if (!inp) return { dispatched:false, reason:'no file input', before };
      const f = new File([JSON.stringify(payload)], 'backup.json', { type:'application/json' });
      const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files;
      inp.dispatchEvent(new Event('change', { bubbles:true }));
      return { dispatched:true, before };
    });
    await sp.waitForTimeout(350);
    const rtAfter = await sp.evaluate(() => ({
      after: Object.keys(JSON.parse(localStorage.getItem('morning-three.v1') || '{}').days || {}).length,
      toast: (document.querySelector('#toast') || {}).innerText || ''
    }));
    rec(p, 'G-08', '导出后清空再导入，晨间历史完整回来',
      rtBefore.dispatched && rtBefore.before > 0 && rtAfter.after === rtBefore.before,
      Object.assign({}, rtBefore, rtAfter));

    // 空记录判据审计：windowDays 中 has=true 但当天没有任何文字/收尾 → 判据灌水
    if (cfg.id === 'B') {
      const inflated = gate.windowDays ? gate.windowDays.filter(x => x.has && (function (k) {
        const d = cfg.days[k];
        return d && (!d.tasks || !d.tasks.some(t => t.text && t.text.trim())) && !d.checkin;
      })(x.k)) : [];
      rec(p, 'G-02', '「一周内输入过」判据不把空白日算作输入', inflated.length === 0,
        { inflatedDays: inflated.map(x => x.k), winInputs: gate.winInputs, windowDays: gate.windowDays });
    }
    await sp.close();

    p.pageErrors = pageErrors;
    await context.close();
  }

  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT, 'raw-log.json'), JSON.stringify(LOG, null, 2), 'utf8');
  const total = LOG.profiles.reduce((n, p) => n + p.checks.length, 0);
  const failed = LOG.profiles.reduce((n, p) => n + p.checks.filter(c => !c.pass).length, 0);
  console.log(`\n=== 汇总：${total} 条断言，${failed} 条未通过 ===`);
  console.log('日志: ' + path.join(OUT, 'raw-log.json'));
})().catch(e => { console.error('FATAL', e); server.close(); process.exit(1); });
