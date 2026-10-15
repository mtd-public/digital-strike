// The HUD: DOM pills and bars (mstr-gme-dsgn-tmpt docs/05: health readable at a glance with a critical
// pulse, toasts for moments, floating numbers at the spot, a nav compass measured on screen, the primary
// verb on the biggest button) plus an overlay canvas for the radar, the stick, the lock-on target's bar
// and floating text. The chain gun is the right side of the screen, so its ammo is a readout, not a button;
// WALK / FLY folds the rotor into spider mode and back.
import { CRAFT, FOOT } from './sim/craft.js';
import { TUNING as T } from './tuning.js';
import { objectiveTarget, lzPos, playerPos } from './sim/world.js';

const $ = (id) => document.getElementById(id);
const NAMES = { soldier: 'SOLDIER', rpg: 'RPG TEAM', alien: 'ALIEN TROOPER', heavy: 'ALIEN HEAVY', tank: 'TANK', hovertank: 'HOVER TANK', tech: 'TECHNICAL', civ: 'CIVILIAN',
  boat: 'GUNBOAT', drone: 'DRONE', crawler: 'CRAWLER BOMB', walker: 'WIDOW WALKER', saucer: 'SAUCER', gunship: 'GUNSHIP', agunship: 'ALIEN GUNSHIP', jet: 'RAIDER JET', mothership: 'MOTHERSHIP', navmine: 'NAVAL MINE',
  radar: 'RADAR', barracks: 'BARRACKS', depot: 'FUEL DEPOT', flak: 'FLAK GUN', sam: 'SAM SITE', battery: 'SHORE BATTERY', boomtower: 'BOOM TOWER', generator: 'SHIELD GENERATOR', datacenter: 'DATA CENTER' };

export class Hud {
  constructor() {
    this.el = { hud: $('hud'), armor: $('armor-bar'), armorG: $('armor-gauge'), fuel: $('fuel-bar'), fuelG: $('fuel-gauge'), lives: $('lives'), score: $('score'),
      objText: $('obj-text'), objGoal: $('obj-goal'), objBar: $('obj-bar'), objBarFill: $('obj-bar-fill'), objBarLabel: $('obj-bar-label'),
      nav: $('nav'), navArrow: $('nav-arrow'), navLabel: $('nav-label'), navDist: $('nav-dist'), warn: $('warn'), toasts: $('toasts'), vignette: $('vignette'),
      action: $('btn-action'), xform: $('btn-xform'), ammo: { gun: $('ammo-gun'), msl: $('ammo-msl'), mine: $('ammo-mine') }, wname: { gun: $('name-gun'), msl: $('name-msl'), mine: $('name-mine') },
      btn: { gun: $('gun-read'), msl: $('btn-msl'), mine: $('btn-mine') }, craftName: $('craft-name') };
    this.overlay = $('overlay'); this.ctx = this.overlay.getContext('2d');
    this.radar = $('radar'); this.rctx = this.radar.getContext('2d');
    this.floaters = []; this.hurt = 0; this.lastScore = -1; this.warnText = '';
  }
  resize(cw, ch) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.overlay.width = cw * dpr; this.overlay.height = ch * dpr; this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cw = cw; this.ch = ch;
    this.radar.width = this.radar.height = Math.round(this.radar.clientWidth * dpr) || 120;
  }
  show(on) { this.el.hud.classList.toggle('hidden', !on); if (!on) this.ctx.clearRect(0, 0, this.cw, this.ch); }
  toast(text, cls = '', ms = 1800) {
    const d = document.createElement('div'); d.className = `toast ${cls}`; d.textContent = text;
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => d.remove(), ms);
  }
  handle(events, w) {
    for (const ev of events) {
      if (ev.type === 'float') this.floaters.push({ x: ev.x, y: ev.y, z: ev.z, text: ev.text, bad: ev.bad, age: 0 });
      else if (ev.type === 'toast') this.toast(ev.text, ev.cls);
      else if (ev.type === 'objective') this.toast(ev.text, ev.big ? 'big' : 'good', ev.big ? 3200 : 2200);
      else if (ev.type === 'hurt') this.hurt = Math.min(1, this.hurt + 0.25 + ev.amount * 0.03);
      else if (ev.type === 'pickup') this.toast(ev.kind === 'fuel' ? '+FUEL' : ev.kind === 'armor' ? '+ARMOR' : '+AMMO', 'good', 1100);
      else if (ev.type === 'playerDown') this.toast(ev.why === 'fuel' ? 'OUT OF FUEL' : ev.foot ? 'PILOT DOWN' : 'SHOT DOWN', 'bad', 2200);
      else if (ev.type === 'respawn') this.toast(`${w.P.lives} ${w.P.lives === 1 ? 'LIFE' : 'LIVES'} LEFT`, '', 1600);
      else if (ev.type === 'exit') this.toast('ON FOOT', '', 1200);
      else if (ev.type === 'stolen') this.toast('XH-0 PROTOTYPE · YOURS', 'big', 3000);
      else if (ev.type === 'warn') this.toast(ev.what === 'fuel' ? 'LOW FUEL' : 'LOW ARMOR', 'bad', 1600);
    }
  }

  update(w, view, input, dt, t) {
    const P = w.P, E = this.el, foot = P.mode === 'foot';
    const C = CRAFT[P.craft], maxA = foot ? FOOT.hp : C.armor;
    const a = Math.max(0, P.armor / maxA), f = P.fuel / T.FUEL;
    E.armor.style.width = `${a * 100}%`; E.armor.style.background = a < 0.3 ? '#ff4b5c' : a < 0.6 ? '#ffd23a' : '#3ddc84';
    E.armorG.classList.toggle('crit', a < 0.3 && P.mode !== 'down');
    E.armorG.querySelector('.lbl').textContent = foot ? 'PILOT' : 'ARMOR';
    E.fuelG.classList.toggle('hidden', C.fuelBurn === 0 || foot);
    E.fuel.style.width = `${f * 100}%`; E.fuelG.classList.toggle('crit', f < T.LOW_FUEL / T.FUEL);
    const lives = Math.max(0, P.lives);
    if (E.lives.dataset.n !== String(lives)) { E.lives.dataset.n = lives; E.lives.textContent = '▲'.repeat(lives); }
    if (w.score !== this.lastScore) { this.lastScore = w.score; E.score.textContent = w.score.toLocaleString(); }
    const cname = foot ? FOOT.name : P.form === 'spider' ? C.spiderName : C.name;
    if (E.craftName.textContent !== cname) E.craftName.textContent = cname;
    // objective
    const o = w.obj;
    E.objText.textContent = o.text; E.objGoal.textContent = o.goal;
    E.objBar.classList.toggle('hidden', o.bar == null);
    if (o.bar != null) { E.objBarFill.style.width = `${Math.max(0, Math.min(1, o.bar)) * 100}%`; E.objBarLabel.textContent = o.barLabel; E.objBarFill.style.background = o.barLabel === 'CONTROL' ? '#2be8ff' : o.bar < 0.3 ? '#ff4b5c' : '#3ddc84'; }
    // nav compass: the angle measured on screen
    const p = playerPos(w), tg = objectiveTarget(w);
    E.nav.classList.toggle('none', !tg);
    if (!tg && E.navLabel.textContent !== '--') { E.navLabel.textContent = '--'; E.navDist.textContent = ''; }
    if (tg) {
      const dx = tg.x - p.x, dz = tg.z - p.z, d = Math.hypot(dx, dz);
      const sx = dx * view.screenRight.x + dz * view.screenRight.y, sy = (dx * view.screenUp.x + dz * view.screenUp.y);
      E.navArrow.style.transform = `rotate(${Math.atan2(sx, sy)}rad)`;
      E.navLabel.textContent = tg.label; E.navDist.textContent = `${Math.round(d)}m`;
      E.nav.classList.toggle('near', d < 40);
    }
    // weapons
    const W = C.weapons;
    for (const slot of ['gun', 'msl', 'mine']) {
      const left = foot ? (slot === 'gun' ? '∞' : '—') : Math.floor(P.ammo[slot] ?? 0);
      if (E.ammo[slot].textContent !== String(left)) E.ammo[slot].textContent = left;
      const nm = foot ? (slot === 'gun' ? FOOT.gun.name : '') : W[slot].name;
      if (E.wname[slot].textContent !== nm) E.wname[slot].textContent = nm;
      E.btn[slot].classList.toggle('empty', !foot && (P.ammo[slot] ?? 0) < 1 || (foot && slot !== 'gun'));
    }
    E.btn.gun.classList.toggle('firing', !!input.gun);
    // WALK / FLY: dimmed where it can't (no footing, or the blizzard has the rotor iced); pulses when it's the job
    const inCraft = P.mode === 'fly';
    E.xform.classList.toggle('hidden', !inCraft);
    if (inCraft) {
      const lbl = P.xform ? '· · ·' : P.form === 'spider' ? 'FLY' : 'WALK';
      if (E.xform.textContent !== lbl) E.xform.textContent = lbl;
      E.xform.classList.toggle('off', !P.xform && !P.canXform);
      E.xform.classList.toggle('go', !P.xform && P.canXform && w.obj.stage === 'deploy' && P.form === 'heli');
    }
    // the contextual action button
    const act = P.mode === 'fly' && P.canExit && (w.level.objective.kind === 'heist' || w.opts.exitAnywhere) ? 'EXIT' : foot && P.canEnter ? 'ENTER' : null;
    E.action.classList.toggle('hidden', !act);
    if (act && E.action.textContent !== act) E.action.textContent = act;
    // warnings: missile lock beats low fuel beats low armor
    const locking = P.mode === 'fly' && w.ents.some((e) => e.type === 'sam' && e.alive && e.lockT > 0);
    const incoming = w.shots.some((s) => s.kind === 'sam' && s.life > 0);
    const wt = locking ? 'MISSILE LOCK' : incoming ? 'MISSILE INBOUND' : P.mode === 'fly' && C.fuelBurn && P.fuel < T.LOW_FUEL ? 'LOW FUEL' : '';
    if (wt !== this.warnText) { this.warnText = wt; E.warn.textContent = wt; E.warn.classList.toggle('hidden', !wt); }
    this.hurt = Math.max(0, this.hurt - dt * 1.6);
    E.vignette.style.opacity = Math.max(this.hurt, a < 0.3 && P.mode !== 'down' ? 0.35 + Math.sin(t * 6) * 0.15 : 0);
    this.drawOverlay(w, view, input, dt, t);
    this.drawRadar(w, view, t);
  }

  drawOverlay(w, view, input, dt, t) {
    const c = this.ctx, cw = this.cw, ch = this.ch, P = w.P;
    c.clearRect(0, 0, cw, ch);
    c.textAlign = 'center'; c.lineJoin = 'round';
    // the locked target's name and health bar
    const tg = P.target != null ? w.ents.find((e) => e.id === P.target && e.alive) : null;
    if (tg) {
      const top = tg.boxes ? Math.max(...tg.boxes.map((b) => b.y1)) : tg.air ? tg.y + 2 : tg.y + tg.h + 0.6;
      const s = view.project(tg.x, top + 1.5, tg.z, cw, ch);
      if (!s.behind) {
        const locked = P.lockT >= T.LOCK_TIME, bw = 56, k = Math.max(0, tg.hp / tg.maxHp);
        c.fillStyle = 'rgba(16,20,12,.75)'; c.fillRect(s.x - bw / 2 - 2, s.y - 2, bw + 4, 9);
        c.fillStyle = k < 0.3 ? '#ff4b5c' : '#ffd23a'; c.fillRect(s.x - bw / 2, s.y, bw * k, 5);
        c.font = 'bold 11px ui-monospace, Menlo, Consolas, monospace';
        c.fillStyle = locked ? '#ff6a6a' : '#ffe9a0';
        c.fillText((locked ? '◆ ' : '') + (tg.name || NAMES[tg.type] || NAMES[tg.kind] || tg.kind.toUpperCase()), s.x, s.y - 5);
      }
    }
    // floating score text
    c.font = 'bold 15px ui-monospace, Menlo, Consolas, monospace';
    this.floaters = this.floaters.filter((f) => (f.age += dt) < 1.3);
    for (const f of this.floaters) {
      const s = view.project(f.x, f.y + f.age * 4, f.z, cw, ch);
      if (s.behind) continue;
      c.globalAlpha = Math.min(1, 2.2 - f.age * 1.6);
      c.lineWidth = 4; c.strokeStyle = '#141008'; c.strokeText(f.text, s.x, s.y);
      c.fillStyle = f.bad ? '#ff6a6a' : '#ffe27a'; c.fillText(f.text, s.x, s.y);
    }
    c.globalAlpha = 1;
    // the fire zone: a ring under the right thumb while it holds the trigger
    if (input.firing) {
      const r = 26 + Math.sin(t * 30) * 3;
      c.lineWidth = 3; c.strokeStyle = 'rgba(255,214,90,.7)';
      c.beginPath(); c.arc(input.fireX, input.fireY, r, 0, Math.PI * 2); c.stroke();
      c.fillStyle = 'rgba(255,226,122,.18)'; c.beginPath(); c.arc(input.fireX, input.fireY, r - 4, 0, Math.PI * 2); c.fill();
    }
    // the floating stick
    if (input.stickActive) {
      c.lineWidth = 3; c.strokeStyle = 'rgba(255,240,200,.55)'; c.fillStyle = 'rgba(20,24,14,.25)';
      c.beginPath(); c.arc(input.stickBaseX, input.stickBaseY, input.stickRadius, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,226,122,.75)'; c.beginPath(); c.arc(input.stickThumbX, input.stickThumbY, 24, 0, Math.PI * 2); c.fill();
    }
  }

  drawRadar(w, view, t) {
    const c = this.rctx, S = this.radar.width, r = S / 2, P = w.P, p = playerPos(w), range = 170;
    c.clearRect(0, 0, S, S);
    c.save(); c.beginPath(); c.arc(r, r, r - 1, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(12,22,14,.72)'; c.fillRect(0, 0, S, S);
    c.strokeStyle = 'rgba(120,255,140,.25)'; c.lineWidth = 1;
    for (const k of [0.33, 0.66]) { c.beginPath(); c.arc(r, r, r * k, 0, Math.PI * 2); c.stroke(); }
    const sweep = (t * 1.6) % (Math.PI * 2);
    c.fillStyle = 'rgba(120,255,140,.12)'; c.beginPath(); c.moveTo(r, r); c.arc(r, r, r, sweep - 0.5, sweep); c.fill();
    const R = view.screenRight, U = view.screenUp;
    const toS = (x, z) => { const dx = x - p.x, dz = z - p.z; return [r + ((dx * R.x + dz * R.y) / range) * r, r - ((dx * U.x + dz * U.y) / range) * r]; };
    const dot = (x, z, col, size, shape) => {
      let [sx, sy] = toS(x, z); const dd = Math.hypot(sx - r, sy - r);
      if (dd > r - 3) { if (shape !== 'edge') return; sx = r + ((sx - r) / dd) * (r - 4); sy = r + ((sy - r) / dd) * (r - 4); }
      c.fillStyle = col;
      if (shape === 'tri') { c.beginPath(); c.moveTo(sx, sy - size); c.lineTo(sx + size, sy + size); c.lineTo(sx - size, sy + size); c.fill(); }
      else c.fillRect(sx - size / 2, sy - size / 2, size, size);
    };
    // the LZ, pickups, friends, enemies
    const lz = lzPos(w);
    if (lz) dot(lz.x, lz.z, '#3ddc84', 6, 'edge');
    for (const k of w.pickups) dot(k.x, k.z, '#7aff9a', 3);
    for (const e of w.ents) {
      if (!e.alive || e.kind === 'parked' && !e.proto) continue;
      if (e.team === 'friend') { dot(e.x, e.z, '#3ddc84', e.kind === 'tanker' ? 7 : 5, e.kind === 'tanker' ? 'edge' : null); continue; }
      if (e.team === 'civ') { dot(e.x, e.z, '#9ab0c0', 2.5); continue; }
      if (e.objective || e.type === 'generator' || e.type === 'boomtower') { const pulse = 5 + Math.sin(t * 6) * 1.5; dot(e.x, e.z, '#ffd23a', pulse, 'edge'); continue; }
      dot(e.x, e.z, e.air ? '#ff8a6a' : '#ff4b5c', e.kind === 'struct' ? 4.5 : e.air ? 4 : 2.5, e.air ? 'tri' : null);
    }
    const tg = objectiveTarget(w);
    if (tg) { const [sx, sy] = toS(tg.x, tg.z), dd = Math.hypot(sx - r, sy - r); if (dd < r - 3) { c.strokeStyle = '#ffd23a'; c.lineWidth = 1.5; c.beginPath(); c.arc(sx, sy, 6 + Math.sin(t * 5) * 2, 0, Math.PI * 2); c.stroke(); } }
    c.restore();
    // you, nose up the screen
    const yaw = P.mode === 'foot' ? P.foot.yaw : P.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const ang = Math.atan2(fx * R.x + fz * R.y, fx * U.x + fz * U.y);
    c.save(); c.translate(r, r); c.rotate(ang); c.fillStyle = '#fff2b0';
    c.beginPath(); c.moveTo(0, -6); c.lineTo(4.5, 5); c.lineTo(-4.5, 5); c.closePath(); c.fill(); c.restore();
    c.strokeStyle = 'rgba(200,255,200,.6)'; c.lineWidth = 2; c.beginPath(); c.arc(r, r, r - 1, 0, Math.PI * 2); c.stroke();
  }
}
