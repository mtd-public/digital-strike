// Headless smoke test (mstr-gme-dsgn-tmpt tools/smoke-vanilla-starter.mjs, extended): loads the game at phone,
// phone-landscape, tablet and desktop sizes, starts every mission, flies, fires and transforms for a few
// seconds, takes screenshots, and reports console errors and page scroll (both must be none). On the phone
// it fires the way a thumb does (a real touch held on the right side of the screen: there's no gun button)
// and taps WALK; both must work.
// Usage: python3 -m http.server 8080 &  then  BASE=http://localhost:8080/ node tools/smoke.mjs [levelId]
// Chromium on the cloud containers is at /opt/pw-browsers/chromium (CHROMIUM env var).
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
const pw = await import('playwright').catch(() => import(join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs')));
const { chromium, devices } = pw;
const OUT = process.env.OUT || 'shots';
mkdirSync(OUT, { recursive: true });
const base = process.env.BASE || 'http://localhost:8080/';
const only = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
let bad = 0;
// The transform takes 1.3 s of game time, which is several real seconds under a software renderer: wait for it to
// finish (or for there to be no footing to do it on) instead of guessing a sleep.
const settled = (page) => page.waitForFunction(() => { const P = window.GAME.w.P; return P.form === 'spider' || (!P.xform && !P.canXform); }, null, { timeout: 60000 }).catch(() => {});

async function run(name, ctxOpts, levels, act, want) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + (process.env.QS || ''));
  await page.waitForFunction(() => window.GAME && window.GAME.state.mode === 'title', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}-title.png` });
  for (const id of levels) {
    await page.evaluate((id) => { const G = window.GAME; G.startMission(G.LEVELS.find((l) => l.id === id)); }, id);
    await page.waitForTimeout(600);
    await act(page, id);
    await page.screenshot({ path: `${OUT}/${name}-${id}.png` });
    const st = await page.evaluate(() => { const w = window.GAME.w; return { mode: window.GAME.state.mode, phase: w.phase, obj: w.obj.text, armor: Math.round(w.P.armor), x: Math.round(w.P.x), z: Math.round(w.P.z), shots: w.fired, score: w.score, form: w.P.form }; });
    console.log(name, id, JSON.stringify(st));
    if (want?.[id]) for (const [k, v] of Object.entries(want[id])) if (!(typeof v === 'function' ? v(st[k]) : st[k] === v)) { bad++; console.log(`  FAIL ${name} ${id}: ${k} = ${st[k]}`); }
  }
  const scroll = await page.evaluate(() => ({ x: document.scrollingElement.scrollWidth - innerWidth, y: document.scrollingElement.scrollHeight - innerHeight }));
  if (errors.length || scroll.x > 0 || scroll.y > 0) bad++;
  console.log(name, 'errors:', errors.length ? errors.slice(0, 6) : 'none', 'scroll:', scroll);
  await ctx.close();
}
const ALL = ['firewall', 'strait', 'heist', 'area51', 'vegas', 'ironweb'].filter((id) => !only || id === only);
await run('desktop', { viewport: { width: 1280, height: 800 } }, ALL, async (page) => {
  await page.keyboard.down('w'); await page.keyboard.down(' ');
  await page.waitForTimeout(1500);
  await page.keyboard.up('w'); await page.keyboard.down('d'); await page.keyboard.press('k');
  await page.waitForTimeout(900);
  await page.keyboard.up('d'); await page.keyboard.up(' '); await page.keyboard.press('l');
  await page.waitForTimeout(400);
  await page.keyboard.press('t'); // spider mode (where there's footing)
  await page.waitForTimeout(300); await settled(page);
}, { ironweb: { form: 'spider' } });
if (!only) {
  await run('phone', { ...devices['iPhone 13'] }, ['firewall'], async (page) => {
    // a thumb held on the right side of the screen fires the chain gun
    const vp = page.viewportSize(), cdp = await page.context().newCDPSession(page), pt = { x: vp.width * 0.82, y: vp.height * 0.45 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await page.waitForTimeout(1200);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.tap('#btn-xform'); await page.waitForTimeout(300); await settled(page);
  }, { firewall: { shots: (n) => n > 0, form: 'spider' } });
  await run('phone-landscape', { ...devices['iPhone 13 landscape'] }, ['heist'], async (page) => { await page.waitForTimeout(1200); });
  await run('tablet', { ...devices['iPad Pro 11 landscape'] }, ['vegas'], async (page) => { await page.waitForTimeout(1200); });
}
await browser.close();
console.log(bad ? `${bad} profile(s) with errors or scroll` : 'SMOKE PASS');
process.exit(bad ? 1 : 0);
