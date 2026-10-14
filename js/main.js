// Digital Strike: boot, screens, the fixed-step loop, input → sim, events → view / HUD / audio.
// Built from mstr-gme-dsgn-tmpt's starters/vanilla-three-toy (loop, state machine, auto-pause, input reset on
// pause, best scores in try/catch'd localStorage, a title-screen attract mode flown by the autopilot).
// window.GAME exposes the state for the smoke tests and the console.
import { RETRO, ART, saveSetting, settings } from './retro.js'; // first: it patches three's shaders
import { View } from './render/view.js';
import { Hud } from './hud.js';
import { InputManager } from './input.js';
import { Sfx } from './sfx-synth.js';
import { LEVELS } from './sim/levels/index.js';
import { createWorld, step, playerPos } from './sim/world.js';
import { autopilot } from './sim/autopilot.js';
import { TUNING as T } from './tuning.js';

const STEP = 1 / 60;
const PROGRESS_KEY = 'digital-strike.progress';
const $ = (id) => document.getElementById(id);

function loadProgress() { try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; } catch (_) { return {}; } }
function saveProgress() { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (_) { /* private mode */ } }
const progress = loadProgress();
progress.best ||= {};
if (/[?&]unlock=1/.test(location.search)) progress.proto = true;

const canvas = $('game');
const view = new View(canvas), hud = new Hud(), input = new InputManager(canvas), sfx = new Sfx({ volume: 0.7 });
const S = settings();
const state = { mode: 'loading', level: LEVELS[0], craft: progress.proto && S.craft === 'alien' ? 'alien' : 'apache', w: null, attract: false, mem: {}, acc: 0, endT: 0, action: false, muted: !!S.muted };
view.setCamMode(S.cam === 'strike' ? 'strike' : 'iso');
sfx.setMuted(state.muted);

// ---------------------------------------------------------------- input wiring
const queueAction = () => { state.action = true; };
input.bindButton($('btn-gun'), 'gun', () => sfx.unlock());
input.bindButton($('btn-msl'), 'msl');
input.bindButton($('btn-mine'), 'mine');
input.bindButton($('btn-action'), null, queueAction);
input.onKey = (k) => {
  sfx.unlock();
  if (k === 'c') toggleCam();
  else if (k === 'p' || k === 'escape') { if (state.mode === 'playing') setPaused(true); else if (state.mode === 'paused') setPaused(false); }
  else if (k === 'm') toggleMute();
  else if (k === 'e' || k === 'f') queueAction();
  else if (k === 'enter' && state.mode === 'brief') launch();
};
input.onPad = (b) => {
  if (b === 'action') { if (state.mode === 'brief') launch(); else queueAction(); }
  else if (b === 'cam') toggleCam();
  else if (b === 'pause') { if (state.mode === 'playing') setPaused(true); else if (state.mode === 'paused') setPaused(false); else if (state.mode === 'title') openBrief(state.level); }
  else if (b === 'mute') toggleMute();
};
function toggleCam() { const m = view.camMode === 'iso' ? 'strike' : 'iso'; view.setCamMode(m); saveSetting('cam', m); renderSeg('cam-seg', m); hud.toast(m === 'strike' ? 'STRIKE CAM · stick turns the nose' : 'ISO CAM · stick points the way', '', 1500); }
function toggleMute() { state.muted = !state.muted; sfx.setMuted(state.muted); saveSetting('muted', state.muted); $('mute-btn').classList.toggle('off', state.muted); }
$('pause-btn').onclick = () => setPaused(state.mode === 'playing');
$('cam-btn').onclick = toggleCam;
$('mute-btn').onclick = toggleMute;
$('mute-btn').classList.toggle('off', state.muted);
for (const b of [$('pause-btn'), $('cam-btn'), $('mute-btn')]) b.addEventListener('pointerdown', (e) => e.stopPropagation());

// The sim's input from the controls. Iso cam: the stick is an absolute screen direction, turned into the
// world with the camera's screen vectors (screen-up stretched for the pitch). Strike cam: tank controls.
function buildInput() {
  const pad = input.pad(), s = input.read(pad), strike = view.camMode === 'strike';
  const inp = { gun: input.gun || !!pad?.gun, msl: input.msl || !!pad?.msl, mine: input.mine || !!pad?.mine, action: state.action, aim: null, mx: 0, mz: 0 };
  state.action = false;
  const R = view.screenRight, U = view.screenUp, k = view.screenUpK || 1.3;
  const toWorld = (sx, sy) => { const wx = R.x * sx + U.x * -sy * k, wz = R.y * sx + U.y * -sy * k, n = Math.hypot(wx, wz) || 1; return [wx / n, wz / n]; };
  if (strike) {
    inp.tank = true;
    if (s?.keys) { inp.fwd = (input.key('w') || input.key('arrowup') ? 1 : 0) - (input.key('s') || input.key('arrowdown') ? 1 : 0); inp.turn = (input.key('a') || input.key('arrowleft') ? 1 : 0) - (input.key('d') || input.key('arrowright') ? 1 : 0); }
    else if (s) { inp.fwd = -s.y * s.mag; inp.turn = -s.x * s.mag; }
    inp.strafe = (input.key('x') ? 1 : 0) - (input.key('z') ? 1 : 0) + (pad?.rx || 0);
  } else {
    if (s) { const [wx, wz] = toWorld(s.x, s.y); inp.mx = wx * s.mag; inp.mz = wz * s.mag; }
    if (pad && Math.hypot(pad.rx, pad.ry) > 0.35) { const [wx, wz] = toWorld(pad.rx, pad.ry); inp.aim = Math.atan2(wx, wz); }
  }
  return inp;
}

// ---------------------------------------------------------------- screens
const show = (id) => { for (const s of ['title', 'brief', 'pause', 'result']) $(s).classList.toggle('hidden', s !== id); };
function renderSeg(id, v) { for (const b of $(id).querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === v); }
function rankFor(level, score) { const par = level.par || 20000, k = score / par; return k >= 1.1 ? 'S' : k >= 0.9 ? 'A' : k >= 0.7 ? 'B' : k >= 0.5 ? 'C' : 'D'; }
function renderTitle() {
  const box = $('missions'); box.innerHTML = '';
  for (const L of LEVELS) {
    const b = document.createElement('button'), best = progress.best[L.id];
    b.className = 'mcard';
    b.innerHTML = `<div class="mc"><span>${L.code}</span><span class="rank">${best ? best.rank : ''}</span></div><div class="mn">${L.name.replace('OPERATION ', '')}</div><div class="md">${L.brief.split('. ')[0]}.</div>`;
    b.onclick = () => openBrief(L);
    box.appendChild(b);
  }
  renderSeg('craft-seg', state.craft); renderSeg('cam-seg', view.camMode); renderSeg('art-seg', ART);
  $('craft-seg').querySelector('[data-v=alien]').disabled = !progress.proto;
  $('unlock').textContent = progress.proto ? 'XH-0 PROTOTYPE UNLOCKED · pick it under CRAFT' : 'Steal the XH-0 prototype in Mission 3 to fly it anywhere.';
}
$('craft-seg').onclick = (e) => { const v = e.target.dataset?.v; if (!v || e.target.disabled) return; state.craft = v; saveSetting('craft', v); renderSeg('craft-seg', v); };
$('cam-seg').onclick = (e) => { const v = e.target.dataset?.v; if (!v) return; view.setCamMode(v); saveSetting('cam', v); renderSeg('cam-seg', v); };
$('art-seg').onclick = (e) => { const v = e.target.dataset?.v; if (!v || v === ART) return; saveSetting('art', v); location.reload(); };
function showTitle() { state.mode = 'title'; hud.show(false); renderTitle(); show('title'); if (!state.attract) startAttract(); }
function openBrief(L) {
  sfx.unlock();
  state.level = L; state.mode = 'brief';
  $('brief-code').textContent = L.code; $('brief-name').textContent = L.name; $('brief-text').textContent = L.brief;
  $('brief-tips').innerHTML = (L.tips || []).map((t) => `<li>${t}</li>`).join('');
  show('brief');
}
$('brief-back').onclick = () => showTitle();
$('brief-go').onclick = () => launch();
function launch() { sfx.unlock(); startMission(state.level); }

function startAttract() {
  state.attract = true; state.mem = {};
  state.w = createWorld(LEVELS[0], { seed: (Math.random() * 1e9) | 0, god: true, craft: 'apache' });
  view.build(state.w);
}
function startMission(L) {
  state.attract = false; state.mem = {}; state.acc = 0; state.endT = 0;
  state.w = createWorld(L, { seed: (Math.random() * 1e9) | 0, craft: state.craft });
  view.build(state.w);
  state.mode = 'playing'; show(null); hud.show(true);
  input.reset();
  hud.toast(L.name, 'big', 2600);
}
function setPaused(on) {
  if (on && state.mode === 'playing') { state.mode = 'paused'; input.reset(); $('pause-goal').textContent = state.w.obj.goal; show('pause'); sfx.setRotor(0); }
  else if (!on && state.mode === 'paused') { state.mode = 'playing'; show(null); }
}
$('resume-btn').onclick = () => setPaused(false);
$('restart-btn').onclick = () => startMission(state.level);
$('quit-btn').onclick = () => showTitle();
$('retry-btn').onclick = () => startMission(state.level);
$('menu-btn').onclick = () => showTitle();
$('next-btn').onclick = () => { const i = LEVELS.indexOf(state.level); if (i < LEVELS.length - 1) openBrief(LEVELS[i + 1]); else showTitle(); };
function showResult() {
  const w = state.w, L = state.level, won = w.phase === 'won';
  state.mode = 'result'; hud.show(false); sfx.setRotor(0);
  const rank = won ? rankFor(L, w.score) : '—';
  $('result-code').textContent = L.code; $('result-title').textContent = won ? 'MISSION COMPLETE' : 'MISSION FAILED';
  $('result-why').textContent = w.result?.why || '';
  const mm = Math.floor(w.t / 60), ss = String(Math.floor(w.t % 60)).padStart(2, '0'), acc = w.fired ? Math.round((w.hits / w.fired) * 100) : 0;
  $('result-stats').innerHTML = `<div class="rank">${rank}</div>SCORE <b>${w.score.toLocaleString()}</b><br>KILLS <b>${w.kills}</b> · TIME <b>${mm}:${ss}</b><br>ACCURACY <b>${acc}%</b>${w.civHits ? ` · CIVILIANS <b style="color:#ff6a6a">${w.civHits}</b>` : ''}`;
  let unlock = '';
  if (won) {
    const best = progress.best[L.id];
    if (!best || w.score > best.score) progress.best[L.id] = { score: w.score, rank };
    if (L.id === 'heist' && !progress.proto) { progress.proto = true; unlock = 'XH-0 PROTOTYPE UNLOCKED: fly it in any mission (CRAFT on the title screen).'; }
    saveProgress();
  }
  $('result-unlock').textContent = unlock;
  $('next-btn').classList.toggle('hidden', !won);
  show('result');
}

// ---------------------------------------------------------------- audio
let resupplyT = 0, beepT = 0;
function audio(events, w, dt) {
  const p = playerPos(w);
  const near = (e, r = 90) => Math.hypot(e.x - p.x, e.z - p.z) < r;
  for (const ev of events) {
    switch (ev.type) {
      case 'shot': sfx.play({ bullet: 'chaingun', plasma: 'plasma', pistol: 'pistol', missile: 'rocket', orb: 'orb', mine: 'mineDrop', grav: 'mineDrop' }[ev.kind]); break;
      case 'eshot': if (near(ev, 70)) sfx.play(ev.kind === 'bolt' ? 'bolt' : ev.kind === 'shell' || ev.kind === 'rocket' ? 'shell' : 'enemyGun'); break;
      case 'explode': if (near(ev, 130)) sfx.play(ev.size >= 6 ? 'bigBoom' : 'boom'); break;
      case 'bigBoom': sfx.play(ev.kind === 'grav' ? 'gravBoom' : 'bigBoom'); break;
      case 'hurt': sfx.play('hurt'); break;
      case 'playerDown': sfx.play('crash'); sfx.play('gameOver'); break;
      case 'respawn': sfx.play('checkpoint'); break;
      case 'pickup': sfx.play(ev.kind === 'ammo' ? 'ammo' : 'power'); break;
      case 'winch': sfx.play('winch'); break;
      case 'samLaunch': if (near(ev, 110)) sfx.play('samLaunch'); break;
      case 'objective': sfx.play('objective'); break;
      case 'won': sfx.play('deliver'); break;
      case 'lost': sfx.play('gameOver'); break;
      case 'shieldDown': sfx.play('shieldDown'); break;
      case 'stolen': sfx.play('stolen'); sfx.play('alarm'); break;
      case 'exit': case 'enter': sfx.play('exit'); break;
      case 'charge': sfx.play('beam'); break;
      case 'warn': sfx.play('warn'); break;
      case 'resupply': if (resupplyT <= 0) { sfx.play('tick'); resupplyT = 0.3; } break;
    }
  }
  resupplyT -= dt;
  // the SAM lock tone: beeps closer together as the lock closes
  let k = -1;
  for (const e of w.ents) if (e.type === 'sam' && e.alive && e.lockT > 0) k = Math.max(k, 1 - e.lockT / (e.lockMax || 1.6));
  if (k >= 0 && w.P.mode === 'fly') { beepT -= dt; if (beepT <= 0) { sfx.play('lockBeep'); beepT = 0.38 - 0.3 * k; } } else beepT = 0;
  // the rotor bed
  const P = w.P, playing = state.mode === 'playing';
  if (!playing) sfx.setRotor(0);
  else if (P.mode === 'fly') { const sp = Math.hypot(P.vx, P.vz); sfx.setRotor(P.craft === 'alien' ? 0.7 : 1, P.craft === 'alien' ? 34 : 14 + sp * 0.12, P.craft === 'alien' ? 1100 : 360 + sp * 8); }
  else sfx.setRotor(P.mode === 'foot' ? 0.25 : 0, 9, 260);
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.max(0, Math.min((now - last) / 1000, 0.1)); // clamp both ends (negative dt really happens)
  last = now;
  const w = state.w;
  if (!w) return;
  if (state.mode === 'playing' || ((state.mode === 'title' || state.mode === 'brief') && state.attract) || state.mode === 'result') {
    state.acc += dt;
    let n = 0;
    while (state.acc >= STEP && n < 4) {
      const inp = state.attract ? autopilot(w, state.mem) : state.mode === 'playing' ? buildInput() : {};
      step(w, inp, STEP);
      state.acc -= STEP; n++;
    }
    if (n === 4) state.acc = 0;
    if (state.attract && w.phase !== 'play') startAttract();
  }
  const events = w.events.splice(0);
  const frameDt = state.mode === 'paused' ? 0 : dt;
  view.update(w, frameDt, now / 1000, events);
  if (state.mode === 'playing' || state.mode === 'paused') { hud.handle(events, w); hud.update(w, view, input, frameDt, now / 1000); }
  audio(events, w, dt);
  if (state.mode === 'playing' && w.phase !== 'play') { state.endT += dt; if (state.endT > 2.4) showResult(); }
}

// ---------------------------------------------------------------- resize, pause on leaving
function resize() { const cw = window.innerWidth, ch = window.innerHeight; view.resize(cw, ch); hud.resize(cw, ch); }
window.addEventListener('resize', resize);
window.addEventListener('blur', () => setPaused(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
window.TouchZoomGuard?.init({ onZoomChange: (zoomed) => { if (zoomed) setPaused(true); } });
resize();

window.GAME = { state, view, hud, input, LEVELS, startMission, showTitle, openBrief, get w() { return state.w; } };

(async () => {
  try {
    await view.load((done, total) => { $('load-pct').textContent = Math.round((done / total) * 100); });
  } catch (err) { console.warn('assets failed to load, continuing without the town', err); }
  $('loading').classList.add('hidden');
  showTitle();
  requestAnimationFrame(loop);
})();
