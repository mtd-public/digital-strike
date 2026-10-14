// The simulation: one world per mission attempt. No three.js, no DOM, no audio (house rule: sim / render /
// UI split). The renderer and HUD read `w` and drain `w.events`; tools/sim-check.mjs runs it headless.
//
//   createWorld(level, { craft, seed, god })  → w
//   step(w, input, dt)                        advance one fixed step
//
// input: { mx, mz }  world-space move wish (absolute screen steering, already turned into the world)
//        tank, fwd, strafe, turn               Strike-cam tank controls instead (nose turns, stick pushes)
//        aim                                   a yaw the nose should hold (right stick), or null
//        gun, msl, mine                        held fire buttons
//        action                                true on the step EXIT / ENTER was pressed
import { TUNING as T } from '../tuning.js';
import { Terrain } from './terrain.js';
import { CRAFT, FOOT } from './craft.js';
import { FOOTPRINTS, STRUCT_TYPES, DC_PARTS, yawFor, cityX, cityZ } from './levels/common.js';
import { spawnLevelUnits, updateEnt, KIND } from './ai.js';
import { setupObjective, updateObjective, objectiveTarget } from './objectives.js';
import { mulberry32, clamp, wrapAngle } from '../utils.js';

export const emit = (w, type, data = {}) => { w.events.push({ type, ...data }); };

// ------------------------------------------------------------------ boxes (rotated about Y)
export function makeBox(x, z, yaw, hw, hd, y0, y1, extra) { return { x, z, c: Math.cos(yaw), s: Math.sin(yaw), hw, hd, y0, y1, ...extra }; }
// A local [lx, lz, hw, hd, h] piece placed at (x, z, yaw) on ground height gy.
export function placeBox(x, z, yaw, gy, [lx, lz, hw, hd, h], extra) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return makeBox(x + lx * c + lz * s, z - lx * s + lz * c, yaw, hw, hd, gy, gy + h, extra);
}
export function inBox(b, x, y, z, pad = 0) {
  if (y < b.y0 - pad || y > b.y1 + pad) return false;
  const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
  return Math.abs(lx) <= b.hw + pad && Math.abs(lz) <= b.hd + pad;
}
// Horizontal distance from a point to a box (0 inside).
export function boxDist(b, x, z) {
  const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
  return Math.hypot(Math.max(0, Math.abs(lx) - b.hw), Math.max(0, Math.abs(lz) - b.hd));
}

// ------------------------------------------------------------------ world
export function createWorld(level, opts = {}) {
  const craft = opts.craft || 'apache';
  const w = {
    level, opts, t: 0, rng: mulberry32(opts.seed ?? 7), nextId: 1,
    terrain: new Terrain(level.island),
    ents: [], shots: [], mines: [], pickups: [], solids: [], events: [], timers: [],
    phase: 'play', result: null, score: 0, kills: 0, fired: 0, hits: 0, civHits: 0, deaths: 0,
    radars: 0, shield: false, baseCraft: craft,
  };
  const G = (x, z) => w.terrain.surface(x, z);

  // solids: the city lots (gig-ambulance footprints), houses, and the level's own list
  const lot = (x, z, model, facing) => {
    const fp = FOOTPRINTS[model];
    if (!fp) return;
    const yaw = yawFor(facing), gy = G(x, z);
    for (const r of fp.rects) w.solids.push(placeBox(x, z, yaw, gy, [r[0], r[1], r[2], r[3], fp.h], { kind: model, on: true }));
  };
  if (level.city) for (const [c, r, model, facing, span] of level.city.lots) lot(cityX(level.city, c) + (span === 2 ? 8 : 0), cityZ(level.city, r), model, facing);
  for (const [x, z, model, facing] of level.houses || []) lot(x, z, model, facing);
  for (const [x, z, hw, hd, h, kind, bottom] of level.solids || []) {
    const gy = kind === 'ship' || kind === 'carrier' ? 0 : G(x, z);
    w.solids.push(makeBox(x, z, 0, hw, hd, gy + (bottom || 0), gy + h, { kind, on: true }));
  }

  // enemy (and friendly) structures, data centers first
  for (const d of level.datacenters || []) {
    const P = DC_PARTS[d.style], gy = G(d.x, d.z);
    const boxes = [...P.boxes.map((b) => placeBox(d.x, d.z, d.yaw, gy, b)), ...P.towers.map(([lx, lz, r, h]) => placeBox(d.x, d.z, d.yaw, gy, [lx, lz, r * 0.85, r * 0.85, h]))];
    addEnt(w, { kind: 'struct', type: 'datacenter', team: 'enemy', name: d.name, tag: d.id, style: d.style, tint: d.tint, x: d.x, z: d.z, y: gy, yaw: d.yaw, hp: d.hp, boxes, armored: true, objective: true });
  }
  for (const s of level.structures || []) {
    const ty = STRUCT_TYPES[s.kind], gy = G(s.x, s.z), yaw = s.yaw || 0;
    const raw = ty.styles ? ty.styles[s.style] : ty.boxes;
    addEnt(w, { kind: 'struct', type: s.kind, team: s.team || 'enemy', name: s.name, style: s.style, tint: s.tint, boom: s.boom,
      x: s.x, z: s.z, y: gy, yaw, hp: ty.hp, boxes: raw.map((b) => placeBox(s.x, s.z, yaw, gy, b)), armored: ty.hp >= 200, cool: 1 + w.rng() * 2 });
  }
  w.radars = w.ents.filter((e) => e.type === 'radar').length;

  for (const [kind, x, z] of level.pickups || []) addPickup(w, kind, x, z);
  spawnLevelUnits(w);

  // the player
  const C = CRAFT[craft], S = level.start;
  w.P = {
    mode: 'fly', craft, x: S.x, z: S.z, y: G(S.x, S.z) + T.CRUISE, vx: 0, vz: 0, yaw: S.yaw,
    armor: C.armor, fuel: T.FUEL, ammo: {}, cd: { gun: 0, msl: 0, mine: 0 }, pylon: 1,
    target: null, lockT: 0, lives: T.LIVES, invT: 2, downT: 0, hurtT: 0, foot: null, landT: 0, boardT: 0,
    canExit: false, canEnter: null, onLz: false, warnFuel: false, warnArmor: false,
  };
  fillAmmo(w.P, 1);
  setupObjective(w);
  return w;
}

export function addEnt(w, e) {
  const k = KIND[e.kind === 'struct' ? 'struct' : e.kind] || {};
  const ent = { id: w.nextId++, team: 'enemy', y: 0, yaw: 0, vx: 0, vy: 0, vz: 0, r: k.r ?? 1, h: k.h ?? 1, air: !!k.air, alive: true, deadT: 0, hitT: 0, cool: 0, ...e };
  ent.maxHp = ent.hp;
  w.ents.push(ent);
  return ent;
}
export function addPickup(w, kind, x, z) {
  w.pickups.push({ id: w.nextId++, kind, x, z, y: w.terrain.surface(x, z), state: 'idle', t: 0 });
}
function fillAmmo(P, k) {
  const W = CRAFT[P.craft].weapons;
  for (const slot of ['gun', 'msl', 'mine']) P.ammo[slot] = Math.max(P.ammo[slot] || 0, Math.round(W[slot].ammo * k));
}

// ------------------------------------------------------------------ queries
export function solidBoxes(w, fn) {
  for (const b of w.solids) if (b.on && fn(b)) return true;
  for (const e of w.ents) if (e.kind === 'struct' && e.alive) for (const b of e.boxes) if (fn(b, e)) return true;
  return false;
}
// The highest roof within `rad` of (x, z): the chopper keeps ROOF_CLEAR above it.
export function roofAt(w, x, z, rad) {
  let top = -Infinity;
  for (const b of w.solids) if (b.on && b.y1 > top && boxDist(b, x, z) < rad) top = b.y1;
  for (const e of w.ents) if (e.kind === 'struct') for (const b of e.boxes) { const y1 = e.alive ? b.y1 : b.y0 + 2; if (y1 > top && boxDist(b, x, z) < rad) top = y1; }
  for (const e of w.ents) if (e.kind === 'tanker' && e.alive && Math.hypot(e.x - x, e.z - z) < rad + 12) top = Math.max(top, 9);
  return top;
}
// Can a ground walker/driver of radius r stand at (x, z)? (Low solids only: you walk under the hangar roof.)
export function blocked(w, x, z, r, gy) {
  return solidBoxes(w, (b) => b.y0 < gy + 2 && boxDist(b, x, z) < r);
}
export function center(e) { return e.kind === 'struct' ? e.y + 3 : e.kind === 'tanker' ? 4 : e.air ? e.y : e.y + e.h * 0.5; }
// Where to aim at an entity: structures at the middle of their biggest box.
export function aimPoint(e) {
  if (e.boxes) { const b = e.boxes[0]; return { x: b.x, y: (b.y0 + b.y1) / 2, z: b.z }; }
  return { x: e.x, y: center(e), z: e.z };
}
// Does point (x, y, z) with radius pr touch entity e?
export function touches(e, x, y, z, pr) {
  if (e.boxes) { for (const b of e.boxes) if (inBox(b, x, y, z, pr)) return true; return false; }
  if (Math.hypot(e.x - x, e.z - z) > e.r + pr) return false;
  const yc = center(e), hh = e.air ? e.h * 0.5 : e.h * 0.5;
  return Math.abs(y - yc) <= hh + pr;
}
export function playerPos(w) {
  const P = w.P;
  if (P.mode === 'foot') return { x: P.foot.x, y: P.foot.y + 1, z: P.foot.z, vx: P.foot.vx, vz: P.foot.vz, r: FOOT.hitR, foot: true };
  return { x: P.x, y: P.y, z: P.z, vx: P.vx, vz: P.vz, r: CRAFT[P.craft].hitR, foot: false };
}
export const playerAlive = (w) => (w.P.mode === 'fly' || w.P.mode === 'foot') && w.phase === 'play';

// ------------------------------------------------------------------ damage
export function damage(w, e, amount, src) {
  if (!e.alive || amount <= 0) return;
  if (e.immune) return;
  if (e.armored && (src === 'bullet' || src === 'pistol')) amount *= T.STRUCT_GUN_MUL;
  e.hp -= amount; e.hitT = 0.12;
  if (w.dmgLog && e.team === 'friend') w.dmgLog[src] = (w.dmgLog[src] || 0) + amount; // (tools: who hurts what we defend)
  if (src === 'player' || src === 'bullet' || src === 'pistol' || src === 'plasma' || src === 'missile' || src === 'orb' || src === 'mine' || src === 'grav') e.lastByPlayer = true;
  if (e.hp <= 0) kill(w, e);
}
export function kill(w, e) {
  if (!e.alive) return;
  e.alive = false; e.hp = 0; e.deadT = 0;
  const K = KIND[e.kind] || {};
  if (e.lastByPlayer) {
    const key = e.kind === 'struct' ? (e.type === 'datacenter' ? 'datacenter' : STRUCT_TYPES[e.type]?.score) : e.kind;
    const pts = e.team === 'civ' ? T.SCORE.civ : (T.SCORE[key] || 0);
    if (e.team === 'enemy' || e.team === 'civ') {
      w.score += pts;
      if (e.team === 'enemy') w.kills++; else w.civHits++;
      emit(w, 'float', { x: e.x, y: (e.y || 0) + 4, z: e.z, text: (pts > 0 ? '+' : '') + pts, bad: pts < 0 });
    }
  }
  if (e.air) { e.falling = true; e.vy = -2; } // air units fall, then blow up on the ground (ai.js)
  const size = e.kind === 'struct' ? (e.type === 'datacenter' ? 9 : e.type === 'vault' || e.type === 'casino' ? 8 : 5) : K.boom || 2;
  if (!e.air) explode(w, e.x, center(e), e.z, size, 0, 'none');
  emit(w, 'kill', { id: e.id, kind: e.kind, type: e.type, team: e.team, name: e.name, x: e.x, y: center(e), z: e.z });
  if (e.kind === 'struct') {
    if (e.type === 'datacenter' || e.type === 'depot' || e.type === 'generator' || e.type === 'casino' || e.type === 'vault') {
      for (let i = 1; i <= 4; i++) w.timers.push({ t: w.t + i * 0.35 + w.rng() * 0.2, x: e.x + (w.rng() - 0.5) * 14, y: e.y + 3 + w.rng() * 5, z: e.z + (w.rng() - 0.5) * 10, size: 4 + w.rng() * 3 });
    }
    if (e.type === 'radar') { w.radars--; emit(w, 'toast', { text: 'RADAR DOWN · SAMs slower to lock', cls: 'good' }); }
    const drop = STRUCT_TYPES[e.type]?.drop || (e.type === 'datacenter' ? 'ammo' : null);
    if (drop && e.team === 'enemy') addPickup(w, drop, e.x + 6, e.z + 6);
  }
  if ((e.kind === 'tank' || e.kind === 'boat') && w.rng() < 0.35) addPickup(w, w.rng() < 0.5 ? 'ammo' : 'armor', e.x, e.z);
}
// A blast: hurts the other side within radius (falloff to 30 % at the edge).
export function explode(w, x, y, z, radius, dmg, team, src) {
  emit(w, 'explode', { x, y, z, size: radius });
  if (dmg <= 0) return;
  for (const e of w.ents) {
    if (!e.alive || e.immune) continue;
    if (team === 'player' && e.team === 'friend') continue;
    if (team === 'enemy' && e.team !== 'friend') continue;
    let d;
    if (e.boxes) { d = Infinity; for (const b of e.boxes) d = Math.min(d, boxDist(b, x, z) + Math.max(0, b.y0 - y, y - b.y1)); }
    else d = Math.max(0, Math.hypot(e.x - x, center(e) - y, e.z - z) - e.r);
    if (d < radius) damage(w, e, dmg * (1 - 0.7 * (d / radius)), src);
  }
  if (team === 'enemy' && playerAlive(w)) {
    const p = playerPos(w), d = Math.max(0, Math.hypot(p.x - x, p.y - y, p.z - z) - p.r);
    if (d < radius) hurtPlayer(w, dmg * (1 - 0.7 * (d / radius)), x, z, src);
  }
}
export function hurtPlayer(w, amount, x, z, src) {
  const P = w.P;
  if (!playerAlive(w) || P.invT > 0 || w.opts.god) return;
  P.armor -= amount; P.hurtT = 0.25;
  emit(w, 'hurt', { amount, x, z, src, foot: P.mode === 'foot' });
  if (P.armor <= 0) playerDown(w, P.mode === 'foot' ? 'pilot' : 'armor');
}
function playerDown(w, why) {
  const P = w.P, p = playerPos(w);
  P.lives--; w.deaths++;
  emit(w, 'playerDown', { x: p.x, y: p.y, z: p.z, why, foot: P.mode === 'foot', craft: P.craft });
  explode(w, p.x, p.y, p.z, p.foot ? 2 : 6, 0, 'none');
  P.mode = 'down'; P.downT = T.RESPAWN_T; P.target = null; P.vx = P.vz = 0;
  if (P.lives <= 0) endGame(w, false, why === 'fuel' ? 'Out of fuel' : 'Out of lives');
}
export function endGame(w, won, why) {
  if (w.phase !== 'play') return;
  w.phase = won ? 'won' : 'lost'; w.result = { won, why, t: w.t };
  if (won) {
    w.score += Math.max(0, Math.round(4000 - w.t * 6)) + w.P.lives * 1000;
  }
  emit(w, won ? 'won' : 'lost', { why });
}

// ------------------------------------------------------------------ the player
function respawn(w) {
  const P = w.P, L = w.level, o = w.obj;
  let x = L.start.x, z = L.start.z, craft = w.baseCraft;
  const parked = w.ents.find((e) => e.kind === 'parked' && e.alive && !e.locked && e.craft === 'apache');
  if (o.kind === 'heist' && o.stage === 'escape') { craft = 'alien'; x = L.heist.pad.x; z = L.heist.pad.z; }
  else if (o.kind === 'heist' && P.foot && parked) { x = parked.x; z = parked.z; parked.alive = false; craft = parked.craft; }
  else if (L.lz.follow) { const t = w.ents.find((e) => e.kind === 'tanker'); if (t) { x = t.x; z = t.z; } }
  else { x = L.lz.x; z = L.lz.z; }
  Object.assign(P, { mode: 'fly', craft, x, z, y: w.terrain.surface(x, z) + T.CRUISE, vx: 0, vz: 0, armor: CRAFT[craft].armor, fuel: T.FUEL, invT: T.INVULN_T, foot: null, target: null, lockT: 0, ammo: {} });
  fillAmmo(P, 1);
  emit(w, 'respawn', {});
}

function acquireTarget(w, inp, px, py, pz, yaw, foot) {
  const firing = inp.gun || inp.msl; // holding fire with nothing ahead swings the search wide (generous auto-aim for thumbs)
  const P = w.P, cone = foot ? Math.PI : inp.tank ? (firing ? 1.1 : 0.75) : firing ? T.LOCK_CONE_FIRING : T.LOCK_CONE, range = foot ? FOOT.gun.range + 6 : T.LOCK_RANGE;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const angTo = (e) => { const a = aimPoint(e), dx = a.x - px, dz = a.z - pz, d = Math.hypot(dx, dz) || 1; return { d: Math.hypot(dx, a.y - py, dz), ang: Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1)) }; };
  const cur = P.target && w.ents.find((e) => e.id === P.target);
  if (cur && cur.alive && cur.team === 'enemy') { const q = angTo(cur); if (q.d < range * 1.12 && q.ang < (foot ? Math.PI : T.LOCK_KEEP)) return cur; }
  let best = null, bs = Infinity;
  for (const e of w.ents) {
    if (!e.alive || e.team !== 'enemy' || e.falling || e.hidden) continue;
    const q = angTo(e);
    if (q.d > range || q.ang > cone) continue;
    let s = q.d * (1 + 1.4 * q.ang);
    if (e.objective) s *= 0.85;
    if (e.kind === 'navmine') s *= 0.7;
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}

function fire(w, slot, px, py, pz, yaw, vx, vz, target, locked) {
  const P = w.P, Wp = slot === 'pistol' ? FOOT.gun : CRAFT[P.craft].weapons[slot];
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const local = (lx, ly, lz) => ({ x: px + lx * c + lz * s, y: py + ly, z: pz - lx * s + lz * c });
  w.fired++;
  if (slot === 'gun' || slot === 'pistol') {
    const m = slot === 'pistol' ? local(0.3, 0.3, 0.5) : local(0, -1.0, 1.7);
    let ax, ay, az;
    if (target) {
      const a = aimPoint(target), d = Math.hypot(a.x - m.x, a.y - m.y, a.z - m.z), tt = d / Wp.speed;
      ax = a.x + (target.vx || 0) * tt; ay = a.y + (target.vy || 0) * tt; az = a.z + (target.vz || 0) * tt;
    } else if (slot === 'pistol') { ax = m.x + Math.sin(yaw) * 20; ay = m.y; az = m.z + Math.cos(yaw) * 20; }
    else { ax = px + Math.sin(yaw) * T.GROUND_AIM; az = pz + Math.cos(yaw) * T.GROUND_AIM; ay = w.terrain.surface(ax, az) + 0.5; }
    let dx = ax - m.x, dy = ay - m.y, dz = az - m.z;
    const d = Math.hypot(dx, dy, dz) || 1, sp = Wp.spread;
    dx = dx / d + (w.rng() - 0.5) * sp * 2; dy = dy / d + (w.rng() - 0.5) * sp * 2; dz = dz / d + (w.rng() - 0.5) * sp * 2;
    const n = Math.hypot(dx, dy, dz);
    w.shots.push({ team: 'player', kind: Wp.kind, x: m.x, y: m.y, z: m.z, vx: (dx / n) * Wp.speed, vy: (dy / n) * Wp.speed, vz: (dz / n) * Wp.speed, life: Wp.range / Wp.speed, dmg: Wp.dmg, r: 0.4 }); // (no inherited velocity: the auto-aim already leads)
    emit(w, 'shot', { kind: Wp.kind, x: m.x, y: m.y, z: m.z, yaw });
  } else if (slot === 'msl') {
    P.pylon = -P.pylon;
    const m = local(P.pylon * 1.55, -0.45, 0.4);
    const sp = Wp.speed0;
    const g = target ? null : (() => { const ax = px + Math.sin(yaw) * 30, az = pz + Math.cos(yaw) * 30; return { x: ax, y: w.terrain.surface(ax, az), z: az }; })();
    w.shots.push({ team: 'player', kind: Wp.kind, x: m.x, y: m.y, z: m.z, vx: Math.sin(yaw) * sp + vx, vy: -1.5, vz: Math.cos(yaw) * sp + vz, speed: sp, max: Wp.speed, accel: Wp.accel, turn: locked ? Wp.turn : Wp.turn * 0.35,
      target: target ? target.id : null, seek: g, life: Wp.life, dmg: Wp.dmg, splash: Wp.splash, radius: Wp.radius, r: 0.8, explosive: true });
    emit(w, 'shot', { kind: Wp.kind, x: m.x, y: m.y, z: m.z, yaw, side: P.pylon });
  } else if (slot === 'mine') {
    w.mines.push({ id: w.nextId++, kind: Wp.kind, x: px, y: py - 1.3, z: pz, vx: vx * 0.55, vy: -1, vz: vz * 0.55, state: 'fall', t: 0, dmg: Wp.dmg, radius: Wp.radius, onRoof: false });
    emit(w, 'shot', { kind: Wp.kind, x: px, y: py - 1.3, z: pz, yaw });
  }
}

function updatePlayer(w, inp, dt) {
  const P = w.P, L = w.level, o = w.obj;
  P.invT = Math.max(0, P.invT - dt); P.hurtT = Math.max(0, P.hurtT - dt);
  for (const k in P.cd) P.cd[k] = Math.max(0, P.cd[k] - dt);
  if (P.mode === 'down') { P.downT -= dt; if (P.downT <= 0 && P.lives > 0 && w.phase === 'play') respawn(w); return; }
  if (w.phase !== 'play') { P.vx *= 0.95; P.vz *= 0.95; return; }

  // ---------------------------------------------------------------- on foot
  if (P.mode === 'foot') {
    const F = P.foot;
    let mx = inp.mx || 0, mz = inp.mz || 0;
    if (inp.tank) { const fy = inp.fwd || 0, sx = inp.strafe || 0; F.yaw += (inp.turn || 0) * 3 * dt; mx = Math.sin(F.yaw) * fy - Math.cos(F.yaw) * sx; mz = Math.cos(F.yaw) * fy + Math.sin(F.yaw) * sx; }
    const m = Math.min(1, Math.hypot(mx, mz));
    F.vx = mx * FOOT.speed; F.vz = mz * FOOT.speed;
    const nx = F.x + F.vx * dt, nz = F.z + F.vz * dt, gy = w.terrain.height(nx, nz);
    if (gy > 0.2 && !blocked(w, nx, nz, 0.5, gy) && !(w.shield && insideShield(w, nx, nz, 0))) { F.x = nx; F.z = nz; }
    else if (gy > 0.2 && !blocked(w, nx, F.z, 0.5, gy)) F.x = nx;
    else if (gy > 0.2 && !blocked(w, F.x, nz, 0.5, gy)) F.z = nz;
    F.y = w.terrain.surface(F.x, F.z);
    const tgt = acquireTarget(w, inp, F.x, F.y + 1.2, F.z, F.yaw, true);
    if (tgt?.id !== P.target) { P.target = tgt ? tgt.id : null; P.lockT = 0; } else P.lockT += dt;
    let face = null;
    if (inp.gun && tgt) { const a = aimPoint(tgt); face = Math.atan2(a.x - F.x, a.z - F.z); }
    else if (inp.aim != null) face = inp.aim;
    else if (m > 0.1 && !inp.tank) face = Math.atan2(mx, mz);
    if (face != null) F.yaw += clamp(wrapAngle(face - F.yaw), -9 * dt, 9 * dt);
    if (inp.gun && P.cd.gun <= 0) { P.cd.gun = 1 / FOOT.gun.rate; fire(w, 'pistol', F.x, F.y + 1.1, F.z, F.yaw, 0, 0, tgt, true); }
    // walk over crates
    for (const k of w.pickups) if (k.state === 'idle' && Math.hypot(k.x - F.x, k.z - F.z) < 1.8) { k.state = 'gone'; applyPickup(w, k); }
    // get back in: the nearest parked craft you may fly
    P.canEnter = null;
    for (const e of w.ents) if (e.kind === 'parked' && e.alive && Math.hypot(e.x - F.x, e.z - F.z) < 3.6) P.canEnter = e.locked ? null : e;
    if (inp.action && P.canEnter) board(w, P.canEnter);
    return;
  }

  // ---------------------------------------------------------------- landing to get out
  const C = CRAFT[P.craft];
  if (P.landT > 0) {
    P.landT -= dt; P.vx *= 0.9; P.vz *= 0.9;
    const gy = w.terrain.surface(P.x, P.z) + 1.0;
    P.y += (gy - P.y) * (1 - Math.exp(-4 * dt));
    if (P.landT <= 0) disembark(w);
    return;
  }
  if (P.boardT > 0) P.boardT -= dt;

  // ---------------------------------------------------------------- flying
  let vdx, vdz;
  if (inp.tank) {
    P.yaw += clamp(inp.turn || 0, -1, 1) * C.turn * dt;
    const f = clamp(inp.fwd || 0, -1, 1), s = clamp(inp.strafe || 0, -1, 1);
    const fs = f >= 0 ? f * C.speed : f * C.strafe;
    vdx = Math.sin(P.yaw) * fs - Math.cos(P.yaw) * s * C.strafe;
    vdz = Math.cos(P.yaw) * fs + Math.sin(P.yaw) * s * C.strafe;
  } else {
    const m = Math.hypot(inp.mx || 0, inp.mz || 0), k = m > 1 ? 1 / m : 1;
    vdx = (inp.mx || 0) * k * C.speed; vdz = (inp.mz || 0) * k * C.speed;
  }
  const dvx = vdx - P.vx, dvz = vdz - P.vz, dv = Math.hypot(dvx, dvz), maxDv = C.accel * dt;
  if (dv > maxDv) { P.vx += (dvx / dv) * maxDv; P.vz += (dvz / dv) * maxDv; } else { P.vx = vdx; P.vz = vdz; }
  P.x += P.vx * dt; P.z += P.vz * dt;
  const lim = L.island.half - 24;
  if (Math.abs(P.x) > lim) { P.x = Math.sign(P.x) * lim; P.vx = 0; }
  if (Math.abs(P.z) > lim) { P.z = Math.sign(P.z) * lim; P.vz = 0; }
  if (w.shield) { // the energy dome over the alien hangar pushes you back out
    const S = L.heist.shield, dx = P.x - S.x, dz = P.z - S.z, d = Math.hypot(dx, dz);
    if (d < S.r + 2) { P.x = S.x + (dx / (d || 1)) * (S.r + 2); P.z = S.z + (dz / (d || 1)) * (S.r + 2); P.vx *= -0.3; P.vz *= -0.3; if (!P.shieldBump) emit(w, 'shieldHit', { x: P.x, y: P.y, z: P.z }); P.shieldBump = 0.5; }
  }
  P.shieldBump = Math.max(0, (P.shieldBump || 0) - dt);
  // altitude: cruise over the ground, climb over roofs (look a little ahead)
  const gy = w.terrain.surface(P.x, P.z);
  const roof = Math.max(roofAt(w, P.x, P.z, 6), roofAt(w, P.x + P.vx * 0.6, P.z + P.vz * 0.6, 6));
  const want = Math.max(gy + T.CRUISE, roof + T.ROOF_CLEAR, P.boardT > 0 ? gy + 1 : -Infinity);
  P.y += (want - P.y) * (1 - Math.exp(-T.CLIMB_RATE * dt));
  if (P.y < roof + 1.5) P.y = roof + 1.5;
  if (P.y < gy + 2.5 && P.boardT <= 0) P.y = gy + 2.5;

  // targeting and the nose
  const tgt = acquireTarget(w, inp, P.x, P.y, P.z, P.yaw, false);
  if ((tgt ? tgt.id : null) !== P.target) { P.target = tgt ? tgt.id : null; P.lockT = 0; } else if (tgt) P.lockT += dt;
  if (!inp.tank) {
    let face = null;
    const firing = inp.gun || inp.msl;
    if (inp.aim != null) face = inp.aim;
    else if (firing && tgt) { const a = aimPoint(tgt); face = Math.atan2(a.x - P.x, a.z - P.z); }
    else if (Math.hypot(P.vx, P.vz) > 2.5) face = Math.atan2(P.vx, P.vz);
    if (face != null) P.yaw += clamp(wrapAngle(face - P.yaw), -C.turn * dt, C.turn * dt);
  }
  P.yaw = wrapAngle(P.yaw);

  // weapons
  const W = C.weapons, locked = tgt && P.lockT >= T.LOCK_TIME;
  if (inp.gun && P.cd.gun <= 0 && P.ammo.gun >= 1) { P.cd.gun = 1 / W.gun.rate; P.ammo.gun -= 1; fire(w, 'gun', P.x, P.y, P.z, P.yaw, P.vx, P.vz, tgt, locked); }
  if (inp.msl && P.cd.msl <= 0 && P.ammo.msl >= 1) { P.cd.msl = W.msl.rate; P.ammo.msl -= 1; fire(w, 'msl', P.x, P.y, P.z, P.yaw, P.vx, P.vz, tgt, locked); }
  if (inp.mine && P.cd.mine <= 0 && P.ammo.mine >= 1) { P.cd.mine = W.mine.rate; P.ammo.mine -= 1; fire(w, 'mine', P.x, P.y, P.z, P.yaw, P.vx, P.vz, null, false); }
  for (const slot of ['gun', 'msl', 'mine']) if (W[slot].regen) P.ammo[slot] = Math.min(W[slot].max, P.ammo[slot] + W[slot].regen * dt);
  if (C.armorRegen && P.hurtT <= 0) P.armor = Math.min(C.armor, P.armor + C.armorRegen * dt);

  // fuel
  P.fuel -= C.fuelBurn * dt;
  if (P.fuel <= 0) { P.fuel = 0; playerDown(w, 'fuel'); emit(w, 'toast', { text: 'OUT OF FUEL', cls: 'bad' }); return; }
  const lowF = C.fuelBurn > 0 && P.fuel < T.LOW_FUEL, lowA = P.armor < T.LOW_ARMOR;
  if (lowF && !P.warnFuel) emit(w, 'warn', { what: 'fuel' });
  if (lowA && !P.warnArmor) emit(w, 'warn', { what: 'armor' });
  P.warnFuel = lowF; P.warnArmor = lowA;

  // the LZ: rearm, refuel, repair
  const lz = lzPos(w);
  P.onLz = !!lz && Math.hypot(P.x - lz.x, P.z - lz.z) < lz.r;
  if (P.onLz) {
    let any = false;
    const add = (cur, max, rate) => { if (cur < max - 0.01) { any = true; return Math.min(max, cur + rate * dt); } return cur; };
    P.armor = add(P.armor, C.armor, T.LZ_ARMOR);
    P.fuel = add(P.fuel, T.FUEL, T.LZ_FUEL);
    for (const slot of ['gun', 'msl', 'mine']) P.ammo[slot] = add(P.ammo[slot], W[slot].max, W[slot].refill);
    if (any) emit(w, 'resupply', {});
  }

  // the winch: crates within reach float up to you
  for (const k of w.pickups) {
    if (k.state === 'idle' && Math.hypot(k.x - P.x, k.z - P.z) < T.WINCH_R) { k.state = 'winch'; k.t = 0; k.y0 = k.y; emit(w, 'winch', { id: k.id }); }
    if (k.state === 'winch') {
      k.t += dt; k.x += (P.x - k.x) * Math.min(1, dt * 6); k.z += (P.z - k.z) * Math.min(1, dt * 6);
      k.y = k.y0 + (P.y - 1.5 - k.y0) * Math.min(1, k.t / T.WINCH_T);
      if (k.t >= T.WINCH_T) { k.state = 'gone'; applyPickup(w, k); }
    }
  }

  // getting out: hover slowly over dry, flat ground
  const slow = Math.hypot(P.vx, P.vz) < 5;
  P.canExit = slow && w.terrain.height(P.x, P.z) > 0.4 && w.terrain.slope(P.x, P.z) < 0.3 && roofAt(w, P.x, P.z, 3.5) < gy + 1 && o.allowExit && o.stage === 'land';
  if (inp.action && P.canExit) { P.landT = 1.1; emit(w, 'landing', {}); }
}

export function lzPos(w) {
  const L = w.level.lz;
  if (L.follow) { const t = w.ents.find((e) => e.kind === 'tanker' && e.alive); return t ? { x: t.x - Math.sin(t.yaw) * 14, z: t.z - Math.cos(t.yaw) * 14, r: L.r } : null; }
  return L;
}
export function insideShield(w, x, z, pad) { const S = w.level.heist?.shield; return S && Math.hypot(x - S.x, z - S.z) < S.r + pad; }

function applyPickup(w, k) {
  const P = w.P, C = CRAFT[P.craft];
  if (k.kind === 'fuel') P.fuel = Math.min(T.FUEL, P.fuel + T.PICK_FUEL);
  if (k.kind === 'armor') { if (P.mode === 'foot') P.armor = Math.min(FOOT.hp, P.armor + 20); else P.armor = Math.min(C.armor, P.armor + T.PICK_ARMOR); }
  if (k.kind === 'ammo' && P.mode !== 'foot') for (const slot of ['gun', 'msl', 'mine']) P.ammo[slot] = Math.min(C.weapons[slot].max, P.ammo[slot] + C.weapons[slot].pick);
  w.score += 100;
  emit(w, 'pickup', { kind: k.kind, x: k.x, y: k.y, z: k.z });
}

// Out of the chopper: it stays parked where it landed; the pilot steps out beside it.
function disembark(w) {
  const P = w.P;
  addEnt(w, { kind: 'parked', team: 'friend', craft: P.craft, x: P.x, z: P.z, y: w.terrain.surface(P.x, P.z), yaw: P.yaw, hp: 1, immune: true,
    keep: { armor: P.armor, fuel: P.fuel, ammo: { ...P.ammo } } });
  const sx = -Math.cos(P.yaw) * 3.4, sz = Math.sin(P.yaw) * 3.4;
  P.foot = { x: P.x + sx, z: P.z + sz, y: w.terrain.surface(P.x + sx, P.z + sz), yaw: P.yaw, vx: 0, vz: 0, craftArmor: P.armor };
  P.mode = 'foot'; P.armor = FOOT.hp; P.target = null; P.canExit = false;
  emit(w, 'exit', { x: P.foot.x, z: P.foot.z });
}
export function board(w, e) {
  const P = w.P;
  e.alive = false; e.gone = true;
  const stolen = e.craft === 'alien' && e.proto;
  Object.assign(P, { mode: 'fly', craft: e.craft, x: e.x, z: e.z, y: e.y + 1, yaw: e.yaw, vx: 0, vz: 0, foot: null, target: null, boardT: 0.8, invT: 1.5 });
  if (e.keep && !stolen) { P.armor = e.keep.armor; P.fuel = e.keep.fuel; P.ammo = { ...e.keep.ammo }; }
  else { P.armor = CRAFT[e.craft].armor; P.fuel = T.FUEL; P.ammo = {}; fillAmmo(P, 1); }
  emit(w, 'enter', { craft: e.craft, stolen });
}

// ------------------------------------------------------------------ projectiles
function updateShots(w, dt) {
  const keep = [];
  for (const s of w.shots) {
    if (s.target != null || s.seek) { // homing
      const t = s.target != null ? w.ents.find((e) => e.id === s.target) : null;
      let goal = null;
      if (s.target === 'player') goal = playerAlive(w) ? playerPos(w) : null;
      else if (t && t.alive) goal = aimPoint(t);
      else if (s.seek) goal = s.seek;
      s.speed = Math.min(s.max, s.speed + s.accel * dt);
      const sp = Math.hypot(s.vx, s.vy, s.vz) || 1;
      let dx = s.vx / sp, dy = s.vy / sp, dz = s.vz / sp;
      if (goal) {
        const gx = goal.x - s.x, gy = goal.y - s.y, gz = goal.z - s.z, gd = Math.hypot(gx, gy, gz) || 1, k = Math.min(1, s.turn * dt);
        dx += (gx / gd - dx) * k; dy += (gy / gd - dy) * k; dz += (gz / gd - dz) * k;
        const n = Math.hypot(dx, dy, dz) || 1; dx /= n; dy /= n; dz /= n;
        if (gd < (s.team === 'player' ? 1.6 : 1.4) && (t || s.target === 'player')) s.life = 0; // proximity fuse
      }
      s.vx = dx * s.speed; s.vy = dy * s.speed; s.vz = dz * s.speed;
    }
    if (s.gravity) s.vy -= s.gravity * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    s.life -= dt;
    if (s.prox && playerAlive(w)) { const p = playerPos(w); if (Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z) < s.prox) s.life = 0; } // flak's proximity fuse
    let hit = s.life <= 0 ? 'air' : null, victim = null;
    const gy = w.terrain.surface(s.x, s.z);
    if (!hit && s.y <= gy) hit = w.terrain.height(s.x, s.z) < 0 ? 'water' : 'ground';
    if (!hit && solidBoxes(w, (b, e) => !e && inBox(b, s.x, s.y, s.z, 0))) hit = 'solid';
    if (!hit && s.team === 'player') {
      for (const e of w.ents) if (e.alive && e.team !== 'friend' && !e.falling && touches(e, s.x, s.y, s.z, s.r)) { victim = e; hit = 'ent'; break; }
      if (!hit) for (const o of w.shots) if (o.shootable && o.life > 0 && Math.hypot(o.x - s.x, o.y - s.y, o.z - s.z) < 1.4) { o.life = 0; o.shotDown = true; hit = 'air'; w.score += 50; emit(w, 'float', { x: o.x, y: o.y, z: o.z, text: 'SAM +50' }); break; }
      if (!hit && w.shield && insideShield(w, s.x, s.z, 0) && s.y < 34) { hit = 'shield'; emit(w, 'shieldHit', { x: s.x, y: s.y, z: s.z }); }
    } else if (!hit && s.team === 'enemy') {
      if (playerAlive(w)) { const p = playerPos(w); if (Math.hypot(p.x - s.x, p.z - s.z) < p.r + s.r && Math.abs(p.y - s.y) < (p.foot ? 1.2 : 1.6) + s.r) hit = 'player'; }
      if (!hit) for (const e of w.ents) if (e.alive && e.team === 'friend' && !e.immune && touches(e, s.x, s.y, s.z, s.r)) { victim = e; hit = 'ent'; break; }
    }
    if (!hit) { keep.push(s); continue; }
    // impact
    if (s.team === 'player' && victim) w.hits++;
    if (s.explosive && !s.shotDown) {
      if (victim) damage(w, victim, s.dmg, s.kind);
      if (hit === 'player') hurtPlayer(w, s.dmg, s.x, s.z, s.kind);
      explode(w, s.x, s.y, s.z, s.radius || 3, s.splash ?? s.dmg * 0.4, s.team, s.kind);
    } else if (!s.shotDown) {
      if (victim) damage(w, victim, s.dmg, s.kind);
      if (hit === 'player') hurtPlayer(w, s.dmg, s.x, s.z, s.kind);
      emit(w, 'impact', { kind: s.kind, x: s.x, y: s.y, z: s.z, what: hit, team: s.team });
    } else emit(w, 'explode', { x: s.x, y: s.y, z: s.z, size: 2 });
  }
  w.shots = keep;
}

// Dropped mines and gravity bombs: fall, land (on a roof or the ground), arm, and blow on proximity or fuse.
function updateMines(w, dt) {
  const keep = [];
  for (const m of w.mines) {
    m.t += dt;
    if (m.state === 'fall') {
      m.vy -= 22 * dt; m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt; m.vx *= 0.99; m.vz *= 0.99;
      const roof = roofAt(w, m.x, m.z, 0.4), gy = w.terrain.surface(m.x, m.z), floor = Math.max(gy, roof);
      if (m.y <= floor) {
        m.y = floor; m.state = 'armed'; m.t = 0; m.onRoof = roof > gy + 0.5; m.water = w.terrain.height(m.x, m.z) < 0;
        let hitTarget = false;
        for (const e of w.ents) if (e.alive && e.team === 'enemy' && touches(e, m.x, m.y + 0.5, m.z, 1.4)) hitTarget = true;
        if (m.water || hitTarget || m.onRoof) m.t = T.MINE_FUSE - 0.25; // a direct hit (or the sea) goes off at once
        emit(w, 'mineLand', { x: m.x, y: m.y, z: m.z, water: m.water });
      }
      keep.push(m); continue;
    }
    let boom = m.t >= T.MINE_FUSE;
    if (!boom && m.t >= T.MINE_ARM) for (const e of w.ents) if (e.alive && e.team === 'enemy' && !e.air && Math.hypot(e.x - m.x, e.z - m.z) < T.MINE_TRIGGER) { boom = true; break; }
    if (boom) {
      if (m.kind === 'grav') for (const e of w.ents) if (e.alive && e.team === 'enemy' && !e.air && e.kind !== 'struct') { const d = Math.hypot(e.x - m.x, e.z - m.z); if (d < m.radius * 1.6 && d > 0.1) { e.x += ((m.x - e.x) / d) * Math.min(d, 3); e.z += ((m.z - e.z) / d) * Math.min(d, 3); } }
      explode(w, m.x, m.y + 0.6, m.z, m.radius, m.dmg, 'player', m.kind);
      emit(w, 'bigBoom', { x: m.x, y: m.y, z: m.z, size: m.radius, kind: m.kind });
    } else keep.push(m);
  }
  w.mines = keep;
}

// ------------------------------------------------------------------ the step
export function step(w, inp, dt) {
  dt = Math.max(0, Math.min(dt, 1 / 30));
  w.t += dt;
  updatePlayer(w, inp, dt);
  for (const e of w.ents) updateEnt(w, e, dt);
  updateShots(w, dt);
  updateMines(w, dt);
  if (w.timers.length) {
    const left = [];
    for (const q of w.timers) if (q.t <= w.t) emit(w, 'explode', { x: q.x, y: q.y, z: q.z, size: q.size }); else left.push(q);
    w.timers = left;
  }
  updateObjective(w, dt);
  if (w.ents.length > 400 || w.t % 5 < dt) w.ents = w.ents.filter((e) => e.alive || e.kind === 'struct' || e.deadT < 14);
  w.pickups = w.pickups.filter((k) => k.state !== 'gone');
}

export { objectiveTarget };
