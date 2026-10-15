// Every non-player thing that moves or shoots: soldiers (and alien troopers), tanks, technicals, civilian
// cars, gunboats, drones, saucers, gunships, jets, the mothership, naval mines, crawler bombs and WIDOW
// walkers, and the structures that fight back (flak, SAMs, shore batteries, barracks). Each kind is a small
// state machine. Flak and SAMs are anti-air: they ignore anything on the ground (the pilot, the spider).
//
// Telegraphs before damage (house rule): tanks and RPGs wind up (aimT), SAMs lock on with a beam first
// (lockT), shore batteries flash for a second, the mothership charges its beam.
import { TUNING as T } from '../tuning.js';
import { addEnt, emit, playerPos, playerAlive, aimPoint, blocked, boxDist, damage, explode, center, kill } from './world.js';
import { boatLoop, pathPoint } from './levels/common.js';
import { wrapAngle, clamp } from '../utils.js';

// Hit volumes: r (radius), h (height); air units fly; boom = blast size when they die.
export const KIND = {
  soldier: { r: 0.7, h: 1.9 }, rpg: { r: 0.7, h: 1.9 }, alien: { r: 0.7, h: 2.0 }, heavy: { r: 1.0, h: 2.5 },
  tank: { r: 3.0, h: 2.7, boom: 4.5 }, hovertank: { r: 3.0, h: 2.7, boom: 4.5 }, tech: { r: 2.1, h: 2.2, boom: 3.5 }, civ: { r: 2.0, h: 1.9, boom: 3 },
  boat: { r: 4.6, h: 3.2, boom: 5.5 },
  drone: { r: 1.1, h: 1.0, air: true, boom: 2 }, saucer: { r: 2.6, h: 1.6, air: true, boom: 3.5 },
  gunship: { r: 3.4, h: 2.6, air: true, boom: 5 }, agunship: { r: 3.4, h: 2.6, air: true, boom: 5 },
  jet: { r: 3.4, h: 1.8, air: true, boom: 4.5 }, mothership: { r: 16, h: 7, air: true, boom: 16 },
  crawler: { r: 1.3, h: 1.1, boom: 3 }, walker: { r: 3.6, h: 5.6, boom: 8 },
  navmine: { r: 1.5, h: 1.6, boom: 4 }, tanker: { r: 7, h: 9, boom: 12 }, parked: { r: 2.6, h: 3 }, struct: {},
};
const SPEC = {
  soldier: T.SOLDIER, rpg: { ...T.SOLDIER, ...T.RPG }, alien: T.ALIEN, heavy: T.HEAVY,
  tank: T.TANK, hovertank: T.HOVERTANK, tech: T.TECH, civ: T.CIV, boat: T.BOAT,
  drone: T.DRONE, saucer: T.SAUCER, gunship: T.GUNSHIP, agunship: T.AGUNSHIP, jet: T.JET, mothership: T.MOTHERSHIP, navmine: T.NAVMINE,
  crawler: T.CRAWLER, walker: T.WALKER,
};
const rand = (w, a, b) => a + (b - a) * w.rng();
const INF = new Set(['soldier', 'rpg', 'alien', 'heavy']), VEH = new Set(['tank', 'hovertank', 'tech', 'civ']);
const AIR = new Set(['drone', 'saucer', 'gunship', 'agunship', 'jet', 'mothership']);

export function spawnUnit(w, kind, x, z, extra = {}) {
  const S = SPEC[kind] || {}, K = KIND[kind];
  const gy = w.terrain.surface(x, z);
  const y = K.air ? gy + (S.alt || (kind === 'gunship' || kind === 'agunship' ? T.CRUISE + 1 : 12)) : kind === 'boat' || kind === 'navmine' ? 0 : gy;
  return addEnt(w, { kind, x, z, y, hp: S.hp ?? 10, spec: S, home: { x, z }, cool: rand(w, 0.5, 2.5), team: kind === 'civ' ? 'civ' : 'enemy', yaw: rand(w, -3, 3), tyaw: 0, ...extra });
}

export function spawnLevelUnits(w) {
  const L = w.level, friendTargets = ['escort', 'defend', 'airspace'].includes(L.objective.kind);
  for (const [x, z, n, nRpg, leash, type] of L.squads || []) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, px = x + Math.cos(a) * 2.5, pz = z + Math.sin(a) * 2.5;
      const kind = type === 'alien' ? (i < nRpg ? 'heavy' : 'alien') : i < nRpg ? 'rpg' : 'soldier';
      spawnUnit(w, kind, px, pz, { leash, prefer: friendTargets ? 'mixed' : 'player' });
    }
  }
  for (const t of L.tanks || []) spawnUnit(w, 'tank', t.x, t.z, t.path ? { path: t.path, pi: Math.ceil(t.at || 0) % t.path.length, ...startOnPath(t.path, t.at || 0) } : { guard: true });
  for (const t of L.technicals || []) spawnUnit(w, 'tech', 0, 0, { path: t.path, pi: Math.ceil(t.at || 0) % t.path.length, ...startOnPath(t.path, t.at || 0) });
  for (const c of L.civCars || []) spawnUnit(w, 'civ', 0, 0, { path: c.path, pi: Math.ceil(c.at || 0) % c.path.length, model: c.model, ...startOnPath(c.path, c.at || 0) });
  for (const [x, z, n] of L.drones || []) for (let i = 0; i < n; i++) spawnUnit(w, 'drone', x + Math.cos(i * 2.1) * 10, z + Math.sin(i * 2.1) * 10, { orbitA: i * 2.1 });
  for (const [x, z, n] of L.saucers || []) for (let i = 0; i < n; i++) spawnUnit(w, 'saucer', x + Math.cos(i * 3) * 12, z + Math.sin(i * 3) * 12, { orbitA: i * 3, prefer: 'player' });
  const G = L.gunships;
  if (G) for (let i = 0; i < (G.initial || 0); i++) spawnUnit(w, G.alien ? 'agunship' : 'gunship', G.patrol[0][0], G.patrol[0][1], { patrol: G.patrol, pi: 1 });
  const B = L.boats;
  if (B) {
    if (B.loop) { w.boatLoop = boatLoop(L.island); for (const b of B.list) spawnUnit(w, 'boat', ...w.boatLoop[b.at % w.boatLoop.length], { path: w.boatLoop, pi: (b.at + 1) % w.boatLoop.length }); }
    else for (const b of B.list) spawnUnit(w, 'boat', b.x, b.z, { hunt: true });
  }
  for (const [x, z] of L.navalMines || []) spawnUnit(w, 'navmine', x, z, {});
}
// Start part-way round a loop: `at` = segment index + fraction.
function startOnPath(path, at) {
  const i = Math.floor(at) % path.length, f = at - Math.floor(at), a = path[i], b = path[(i + 1) % path.length];
  return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

// Whom to shoot. prefer: 'player' (default), 'friend' (the tanker / the buildings you defend), 'mixed'.
function pickTarget(w, e, range) {
  let best = null, bd = Infinity;
  const ey = center(e), prefer = e.prefer || 'player';
  if (playerAlive(w)) {
    const p = playerPos(w), d = Math.hypot(p.x - e.x, (p.y - ey) * 0.5, p.z - e.z);
    const bias = prefer === 'friend' ? (d < 24 ? 0.8 : 2.5) : 1;
    if (d <= range && d * bias < bd) { bd = d * bias; best = { x: p.x, y: p.y, z: p.z, vx: p.vx, vz: p.vz, player: true, foot: p.foot }; }
  }
  if (prefer !== 'player') for (const f of w.ents) {
    if (!f.alive || f.team !== 'friend' || f.immune) continue;
    let d = Math.hypot(f.x - e.x, f.z - e.z);
    if (f.boxes) { d = Infinity; for (const b of f.boxes) d = Math.min(d, boxDist(b, e.x, e.z)); }
    const bias = prefer === 'friend' ? 1 : 1.25;
    if (d <= range && d * bias < bd) { bd = d * bias; const a = aimPoint(f); best = { x: a.x, y: f.kind === 'tanker' ? 4 : a.y, z: a.z, vx: f.vx || 0, vz: f.vz || 0, ent: f }; }
  }
  return best;
}
function nearestFriend(w, x, z, kinds) {
  let best = null, bd = Infinity;
  for (const f of w.ents) {
    if (!f.alive || f.team !== 'friend' || f.immune || (kinds && !kinds.includes(f.kind))) continue;
    let d = Math.hypot(f.x - x, f.z - z);
    if (f.boxes) { d = Infinity; for (const b of f.boxes) d = Math.min(d, boxDist(b, x, z)); }
    if (d < bd) { bd = d; best = f; }
  }
  return best ? { f: best, d: bd } : null;
}

// Fire one enemy round at a target with lead and spread.
function shoot(w, x, y, z, tgt, o) {
  const sp = o.shot, d = Math.hypot(tgt.x - x, tgt.y - y, tgt.z - z), tt = d / sp, lead = o.lead ?? 0.8;
  let dx = tgt.x + (tgt.vx || 0) * tt * lead - x, dy = tgt.y - y, dz = tgt.z + (tgt.vz || 0) * tt * lead - z;
  const n = Math.hypot(dx, dy, dz) || 1, s = (o.spread ?? 0.04) + (tgt.player ? Math.hypot(tgt.vx || 0, tgt.vz || 0) * 0.0025 : 0); // a fast chopper is harder to hit
  dx = dx / n + (w.rng() - 0.5) * s * 2; dy = dy / n + (w.rng() - 0.5) * s * 2; dz = dz / n + (w.rng() - 0.5) * s * 2;
  const m = Math.hypot(dx, dy, dz) || 1;
  w.shots.push({ team: 'enemy', kind: o.kind, x, y, z, vx: (dx / m) * sp, vy: (dy / m) * sp, vz: (dz / m) * sp, life: o.life ?? (o.range * 1.4) / sp, dmg: o.dmg, r: o.r ?? 0.3,
    explosive: !!o.blast, radius: o.blast, splash: o.splash ?? o.dmg, prox: o.prox, gravity: o.gravity });
  emit(w, 'eshot', { kind: o.kind, x, y, z });
}

// Move a ground walker/driver toward (tx, tz) at speed, stopping at walls, water and the shield. Wave units
// (and crawlers, walkers) slide round what's in the way instead: they try angles off the straight line, on a
// side each one sticks to, so a column flows round a wall or a building rather than piling up against it.
const DEFLECT = [0, 0.7, 1.3, 1.9, -0.7, -1.3, -1.9];
function walk(w, e, tx, tz, speed, dt, r) {
  const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
  if (d < 0.3) { e.vx = e.vz = 0; return true; }
  const step = Math.min(speed * dt, d), base = Math.atan2(dx, dz);
  const tries = e.march || e.kind === 'crawler' || e.kind === 'walker' ? DEFLECT : DEFLECT.slice(0, 1);
  const side = e.side || (e.side = e.id % 2 ? 1 : -1);
  for (const off of tries) {
    const a = base + off * side, nx = e.x + Math.sin(a) * step, nz = e.z + Math.cos(a) * step, gy = w.terrain.height(nx, nz);
    if (gy < 0.3 || blocked(w, nx, nz, r, gy)) continue;
    e.vx = (nx - e.x) / dt; e.vz = (nz - e.z) / dt; e.x = nx; e.z = nz;
    e.yaw += clamp(wrapAngle(a - e.yaw), -6 * dt, 6 * dt);
    return true;
  }
  e.vx = e.vz = 0;
  return false;
}

export function updateEnt(w, e, dt) {
  e.hitT = Math.max(0, e.hitT - dt);
  if (!e.alive) {
    e.deadT += dt;
    if (e.falling) { // shot-down aircraft spin down and blow up on the ground
      e.vy -= 20 * dt; e.y += e.vy * dt; e.x += e.vx * dt; e.z += e.vz * dt; e.yaw += dt * 6;
      if (e.y <= w.terrain.surface(e.x, e.z) + 0.5) { e.falling = false; e.crashed = true; explode(w, e.x, e.y, e.z, KIND[e.kind].boom, 0, 'none'); emit(w, 'crash', { x: e.x, y: e.y, z: e.z, kind: e.kind }); }
    }
    return;
  }
  const k = e.kind;
  if (INF.has(k)) return infantry(w, e, dt);
  if (VEH.has(k)) return vehicle(w, e, dt);
  if (k === 'boat') return boat(w, e, dt);
  if (k === 'navmine') return navmine(w, e, dt);
  if (k === 'crawler') return crawler(w, e, dt);
  if (k === 'walker') return walker(w, e, dt);
  if (k === 'mothership') return mothership(w, e, dt);
  if (AIR.has(k)) return air(w, e, dt);
  if (k === 'struct') return structure(w, e, dt);
}

// ------------------------------------------------------------------ soldiers and alien troopers
function infantry(w, e, dt) {
  const S = e.spec;
  e.cool -= dt;
  const see = S.see * (e.alert ? 1.8 : 1);
  const tgt = pickTarget(w, e, Math.max(see, S.range));
  const speed = S.speed;
  if (e.march) { // a wave unit: head for the buildings, fight what's in range on the way
    const nf = nearestFriend(w, e.x, e.z);
    if (nf && nf.d > S.range * 0.7 && !(tgt && tgt.player && Math.hypot(tgt.x - e.x, tgt.z - e.z) < 14)) walk(w, e, nf.f.x, nf.f.z, speed, dt, 0.6);
  } else if (tgt && tgt.player) {
    const d = Math.hypot(tgt.x - e.x, tgt.z - e.z), fromHome = Math.hypot(e.x - e.home.x, e.z - e.home.z);
    if (d > S.range * 0.7 && fromHome < (e.leash || 12) * 2.5) walk(w, e, tgt.x, tgt.z, speed, dt, 0.6);
    else if (d < 8) walk(w, e, e.x * 2 - tgt.x, e.z * 2 - tgt.z, speed, dt, 0.6);
    else e.vx = e.vz = 0;
  } else { // wander near home
    if (!e.wp || (e.wpT -= dt) <= 0) { const a = w.rng() * 6.28, r = w.rng() * (e.leash || 10); e.wp = [e.home.x + Math.cos(a) * r, e.home.z + Math.sin(a) * r]; e.wpT = 3 + w.rng() * 4; }
    if (!walk(w, e, e.wp[0], e.wp[1], speed * 0.45, dt, 0.6)) e.wp = null;
  }
  e.y = w.terrain.surface(e.x, e.z);
  if (tgt) e.yaw += clamp(wrapAngle(Math.atan2(tgt.x - e.x, tgt.z - e.z) - e.yaw), -5 * dt, 5 * dt);
  // fire
  if (e.aimT > 0) {
    e.aimT -= dt;
    if (e.aimT <= 0 && tgt) {
      const heavy = e.kind === 'heavy';
      shoot(w, e.x, e.y + 1.4, e.z, tgt, { kind: heavy ? 'bolt' : 'rocket', shot: S.shot, dmg: S.dmg, range: S.range, spread: 0.03, blast: heavy ? 2.2 : 2.6, splash: S.dmg * 0.5, r: 0.5 });
      e.cool = rand(w, S.rate[0], S.rate[1]);
    }
    return;
  }
  if (tgt && e.cool <= 0 && Math.hypot(tgt.x - e.x, tgt.y - e.y, tgt.z - e.z) < S.range) {
    if (S.windup) { e.aimT = S.windup; emit(w, 'aim', { id: e.id }); return; }
    shoot(w, e.x, e.y + 1.4, e.z, tgt, { kind: e.kind === 'alien' ? 'bolt' : 'ebullet', shot: S.shot, dmg: S.dmg, range: S.range, spread: S.spread });
    e.cool = rand(w, S.rate[0], S.rate[1]);
  }
}

// ------------------------------------------------------------------ tanks, technicals, traffic
function followPath(w, e, speed, dt) {
  const P = e.path, n = P.length;
  if (e.pingpong && e.dir == null) e.dir = 1;
  const [tx, tz] = P[e.pi], dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
  if (d < 2.5) {
    if (e.pingpong) { if (e.pi + e.dir >= n || e.pi + e.dir < 0) e.dir = -e.dir; e.pi += e.dir; }
    else e.pi = (e.pi + 1) % n;
    return;
  }
  const want = Math.atan2(dx, dz);
  e.yaw += clamp(wrapAngle(want - e.yaw), -1.6 * dt, 1.6 * dt);
  const ahead = Math.cos(wrapAngle(want - e.yaw)), v = speed * Math.max(0.25, ahead);
  e.vx = Math.sin(e.yaw) * v; e.vz = Math.cos(e.yaw) * v;
  e.x += e.vx * dt; e.z += e.vz * dt;
}
function vehicle(w, e, dt) {
  const S = e.spec;
  e.cool -= dt;
  if (e.path) followPath(w, e, S.speed, dt);
  else if (e.march) {
    const nf = nearestFriend(w, e.x, e.z);
    if (nf && nf.d > S.range * 0.75) walk(w, e, nf.f.x, nf.f.z, S.speed, dt, 2.6); else e.vx = e.vz = 0;
  } else e.vx = e.vz = 0;
  e.y = w.terrain.surface(e.x, e.z);
  if (e.kind === 'civ') return;
  const tgt = pickTarget(w, e, (S.see || S.range) * (e.alert ? 1.5 : 1));
  if (!tgt) { e.tyaw += clamp(wrapAngle(0 - e.tyaw), -dt, dt); return; }
  const want = wrapAngle(Math.atan2(tgt.x - e.x, tgt.z - e.z) - e.yaw);
  e.tyaw += clamp(wrapAngle(want - e.tyaw), -(S.turret || 3) * dt, (S.turret || 3) * dt);
  const d = Math.hypot(tgt.x - e.x, tgt.y - e.y, tgt.z - e.z);
  if (e.kind === 'tech') { // machine-gun bursts from the bed
    if (e.burst > 0) { e.burstT -= dt; if (e.burstT <= 0) { e.burst--; e.burstT = S.gap; shoot(w, e.x, e.y + 2, e.z, tgt, { kind: 'ebullet', shot: S.shot, dmg: S.dmg, range: S.range, spread: 0.05 }); } return; }
    if (e.cool <= 0 && d < S.range) { e.burst = S.burst; e.burstT = 0; e.cool = S.rate; }
    return;
  }
  if (e.aimT > 0) { // the barrel glows: the tell
    e.aimT -= dt;
    if (e.aimT <= 0) {
      const a = e.yaw + e.tyaw, mx = e.x + Math.sin(a) * 3.4, mz = e.z + Math.cos(a) * 3.4;
      shoot(w, mx, e.y + 2.1, mz, tgt, { kind: e.kind === 'hovertank' ? 'bolt' : 'shell', shot: S.shot, dmg: S.dmg, range: S.range, spread: 0.02, blast: 2.4, splash: S.dmg * 0.5, r: 0.5 });
      e.cool = S.rate; e.recoil = 1;
    }
    return;
  }
  if (e.cool <= 0 && d < S.range && Math.abs(wrapAngle(want - e.tyaw)) < 0.15) { e.aimT = S.aim; emit(w, 'aim', { id: e.id }); }
}

// ------------------------------------------------------------------ gunboats
function boat(w, e, dt) {
  const S = e.spec;
  e.cool -= dt;
  if (e.path) followPath(w, e, S.speed, dt);
  else { // hunt: shadow the tanker (or you) from ~30 m, steering round the land
    const tgt0 = nearestFriend(w, e.x, e.z, ['tanker'])?.f || (playerAlive(w) ? playerPos(w) : null);
    if (tgt0) {
      const dx = tgt0.x - e.x, dz = tgt0.z - e.z, d = Math.hypot(dx, dz);
      let want = Math.atan2(dx, dz) + (d < 30 ? Math.PI / 2 : 0);
      for (let i = 0; i < 6; i++) {
        const a = want + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.55;
        if (w.terrain.height(e.x + Math.sin(a) * 16, e.z + Math.cos(a) * 16) < -2.5) { want = a; break; }
      }
      e.yaw += clamp(wrapAngle(want - e.yaw), -1.2 * dt, 1.2 * dt);
      const v = d < 22 ? S.speed * 0.4 : S.speed * 1.3;
      const nx = e.x + Math.sin(e.yaw) * v * dt, nz = e.z + Math.cos(e.yaw) * v * dt;
      if (w.terrain.height(nx, nz) < -1.5) { e.vx = (nx - e.x) / dt; e.vz = (nz - e.z) / dt; e.x = nx; e.z = nz; } else e.vx = e.vz = 0;
    }
  }
  e.y = 0;
  if (e.hunt) e.prefer = 'friend';
  const tgt = pickTarget(w, e, S.range);
  if (!tgt) return;
  e.tyaw = wrapAngle(Math.atan2(tgt.x - e.x, tgt.z - e.z) - e.yaw);
  if (e.cool <= 0) { shoot(w, e.x + Math.sin(e.yaw) * 2.5, 2.6, e.z + Math.cos(e.yaw) * 2.5, tgt, { kind: 'shell', shot: S.shot, dmg: S.dmg, range: S.range, spread: 0.03, blast: 2.2, splash: S.dmg * 0.5, r: 0.5 }); e.cool = S.rate; }
}

// ------------------------------------------------------------------ naval mines (the strait)
function navmine(w, e, dt) {
  e.y = Math.sin(w.t * 1.6 + e.id) * 0.15;
  const t = nearestFriend(w, e.x, e.z, ['tanker']);
  if (t && t.d < 3) {
    e.alive = false; e.hp = 0; e.deadT = 0;
    explode(w, e.x, 1, e.z, T.NAVMINE.blast, T.NAVMINE.dmg, 'enemy', 'navmine');
    emit(w, 'toast', { text: 'MINE HIT THE TANKER', cls: 'bad' });
    emit(w, 'kill', { id: e.id, kind: e.kind, team: e.team, x: e.x, y: 0, z: e.z });
  }
}

// ------------------------------------------------------------------ crawlers and walkers (mission 6)
// Crawlers: scuttle for the nearest thing we defend (or for you, if you get close) and blow up on it.
function crawler(w, e, dt) {
  const S = e.spec;
  const nf = nearestFriend(w, e.x, e.z), p = playerAlive(w) ? playerPos(w) : null;
  const dP = p ? Math.hypot(p.x - e.x, p.z - e.z) : Infinity;
  const chase = p && dP < S.see && (!nf || dP < nf.d);
  const tx = chase ? p.x : nf ? nf.f.x : e.x, tz = chase ? p.z : nf ? nf.f.z : e.z;
  walk(w, e, tx, tz, S.speed, dt, 0.9);
  e.y = w.terrain.surface(e.x, e.z);
  const reached = chase ? dP < p.r + 1.4 : nf && nf.d < 1.6;
  if (reached) {
    e.alive = false; e.hp = 0; e.deadT = 0;
    explode(w, e.x, e.y + 1, e.z, S.blast, S.dmg, 'enemy', 'crawler');
    emit(w, 'bigBoom', { x: e.x, y: e.y, z: e.z, size: S.blast * 0.6, kind: 'crawler' });
    emit(w, 'kill', { id: e.id, kind: e.kind, team: e.team, x: e.x, y: e.y + 0.5, z: e.z });
  }
}
// WIDOW walkers: march on the buildings, a telegraphed cannon on the turret and rocket pods for you.
function walker(w, e, dt) {
  const S = e.spec;
  e.cool -= dt; e.salvoCool = (e.salvoCool ?? 3) - dt;
  const nf = nearestFriend(w, e.x, e.z);
  if (nf && nf.d > S.range * 0.55) walk(w, e, nf.f.x, nf.f.z, S.speed, dt, 3.2);
  else e.vx = e.vz = 0;
  e.y = w.terrain.surface(e.x, e.z);
  const tgt = pickTarget(w, e, S.see);
  if (!tgt) return;
  const want = wrapAngle(Math.atan2(tgt.x - e.x, tgt.z - e.z) - e.yaw);
  e.tyaw += clamp(wrapAngle(want - e.tyaw), -S.turret * dt, S.turret * dt);
  const d = Math.hypot(tgt.x - e.x, tgt.z - e.z);
  // rocket pods: a ripple at you whenever you're in reach
  if (e.salvo > 0) { e.salvoT -= dt; if (e.salvoT <= 0) { e.salvo--; e.salvoT = S.gap; const side = e.salvo % 2 ? 1 : -1, a = e.yaw + e.tyaw; shoot(w, e.x - Math.cos(a) * side * 2, e.y + 5.2, e.z + Math.sin(a) * side * 2, tgt, { kind: 'rocket', shot: 34, dmg: S.rdmg, range: S.range, spread: 0.05, blast: 2.2, splash: S.rdmg * 0.6, r: 0.5 }); } }
  else if (e.salvoCool <= 0 && tgt.player && d < S.range) { e.salvo = S.salvo; e.salvoT = 0; e.salvoCool = S.salvoRate; emit(w, 'aim', { id: e.id }); }
  // the main gun: the muzzle glows, then a heavy shell
  if (e.aimT > 0) {
    e.aimT -= dt;
    if (e.aimT <= 0) { const a = e.yaw + e.tyaw; shoot(w, e.x + Math.sin(a) * 4, e.y + 5.6, e.z + Math.cos(a) * 4, tgt, { kind: 'shell', shot: S.shot, dmg: S.dmg, range: S.range, spread: 0.02, blast: 3.2, splash: S.dmg * 0.5, r: 0.6 }); e.cool = S.rate; e.recoil = 1; }
    return;
  }
  if (e.cool <= 0 && d < S.range && Math.abs(wrapAngle(want - e.tyaw)) < 0.15) { e.aimT = S.aim; emit(w, 'aim', { id: e.id }); }
}

// ------------------------------------------------------------------ aircraft
function air(w, e, dt) {
  const S = e.spec, k = e.kind;
  e.cool -= dt;
  const gy = w.terrain.surface(e.x, e.z);
  const p = playerAlive(w) ? playerPos(w) : null;
  let gx = e.x, gz = e.z, alt = S.alt || 12, speed = S.speed;
  const dP = p ? Math.hypot(p.x - e.x, p.z - e.z) : Infinity;
  if (k === 'jet') return jet(w, e, dt, p, gy);
  if (k === 'drone') {
    if (p && dP < S.see * (e.alert ? 1.6 : 1)) { const a = (e.orbitA = (e.orbitA || 0) + dt * 0.7); gx = p.x + Math.cos(a) * 14; gz = p.z + Math.sin(a) * 14; alt = S.alt; }
    else { const a = (e.orbitA = (e.orbitA || 0) + dt * 0.4); gx = e.home.x + Math.cos(a) * 10; gz = e.home.z + Math.sin(a) * 10; }
  } else if (k === 'saucer') {
    const nf = e.prefer !== 'player' ? nearestFriend(w, e.x, e.z, ['struct', 'tanker']) : null;
    if (nf && !(p && dP < 22)) { // drain a building with the tractor beam
      const a = (e.orbitA = (e.orbitA || 0) + dt * 0.5); gx = nf.f.x + Math.cos(a) * 5; gz = nf.f.z + Math.sin(a) * 5;
      e.beam = nf.d < S.beam + 2;
      if (e.beam) damage(w, nf.f, S.beamDps * dt, 'beam');
    } else if (p && dP < S.see * (e.alert ? 1.6 : 1)) { e.beam = false; const a = (e.orbitA = (e.orbitA || 0) + dt * 0.8); gx = p.x + Math.cos(a) * 16; gz = p.z + Math.sin(a) * 16; }
    else { e.beam = false; const a = (e.orbitA = (e.orbitA || 0) + dt * 0.3); gx = e.home.x + Math.cos(a) * 14; gz = e.home.z + Math.sin(a) * 14; }
  } else { // gunships: patrol, then circle you and fire rocket salvos
    if (p && dP < S.see * (e.alert ? 1.5 : 1)) { const a = (e.orbitA = (e.orbitA ?? Math.atan2(e.z - p.z, e.x - p.x)) + dt * 0.35); gx = p.x + Math.cos(a) * S.orbit; gz = p.z + Math.sin(a) * S.orbit; alt = Math.max(0, p.y - gy) + 2; }
    else if (e.patrol) { const [tx, tz] = e.patrol[e.pi]; gx = tx; gz = tz; alt = T.CRUISE + 3; if (Math.hypot(tx - e.x, tz - e.z) < 8) e.pi = (e.pi + 1) % e.patrol.length; }
    else if (p) { gx = p.x; gz = p.z; }
    else { const nf = nearestFriend(w, e.x, e.z); if (nf) { gx = nf.f.x + 30; gz = nf.f.z; } }
  }
  // fly toward the goal point
  const dx = gx - e.x, dz = gz - e.z, d = Math.hypot(dx, dz);
  const v = Math.min(speed, d * 1.5);
  if (d > 0.1) { e.vx += ((dx / d) * v - e.vx) * Math.min(1, dt * 2); e.vz += ((dz / d) * v - e.vz) * Math.min(1, dt * 2); }
  e.x += e.vx * dt; e.z += e.vz * dt;
  const want = w.terrain.surface(e.x, e.z) + alt;
  e.y += (want - e.y) * Math.min(1, dt * 1.5);
  const face = p && dP < (S.see || 60) ? Math.atan2(p.x - e.x, p.z - e.z) : Math.atan2(e.vx, e.vz);
  e.yaw += clamp(wrapAngle(face - e.yaw), -2.5 * dt, 2.5 * dt);
  // fire
  const tgt = pickTarget(w, e, S.range || 50);
  if (!tgt) return;
  if (k === 'gunship' || k === 'agunship') {
    if (e.salvo > 0) { e.salvoT -= dt; if (e.salvoT <= 0) { e.salvo--; e.salvoT = S.gap; const side = e.salvo % 2 ? 1 : -1; shoot(w, e.x - Math.cos(e.yaw) * side * 1.6, e.y - 0.4, e.z + Math.sin(e.yaw) * side * 1.6, tgt, { kind: k === 'agunship' ? 'bolt' : 'rocket', shot: S.shot, dmg: S.dmg, range: 70, spread: 0.035, blast: 2.2, splash: S.dmg * 0.5, r: 0.5 }); } return; }
    if (e.cool <= 0 && Math.hypot(tgt.x - e.x, tgt.z - e.z) < (S.orbit || 30) * 1.8) { e.salvo = S.salvo; e.salvoT = 0; e.cool = S.rate; emit(w, 'aim', { id: e.id }); }
  } else if (e.cool <= 0 && Math.hypot(tgt.x - e.x, tgt.y - e.y, tgt.z - e.z) < S.range) {
    shoot(w, e.x, e.y - 0.5, e.z, tgt, { kind: k === 'saucer' ? 'bolt' : 'ebullet', shot: S.shot, dmg: S.dmg, range: S.range, spread: 0.04 });
    e.cool = S.rate * (0.8 + w.rng() * 0.4);
  }
}
// Jets: bombing runs on a building (or strafing you), then a long climbing U-turn.
function jet(w, e, dt, p, gy) {
  const S = e.spec;
  if (!e.run) {
    const nf = e.prefer !== 'player' && w.rng() < 0.6 ? nearestFriend(w, e.x, e.z, ['struct']) : null; // bombing run, or a strafing run at you
    e.run = nf ? { x: nf.f.x, z: nf.f.z, bomb: true } : p ? { x: p.x, z: p.z, bomb: false } : { x: 0, z: 0, bomb: false };
    e.dropped = 0;
  }
  const dx = e.run.x - e.x, dz = e.run.z - e.z, d = Math.hypot(dx, dz);
  if (!e.passing) e.yaw += clamp(wrapAngle(Math.atan2(dx, dz) - e.yaw), -S.turn * dt, S.turn * dt);
  e.vx = Math.sin(e.yaw) * S.speed; e.vz = Math.cos(e.yaw) * S.speed;
  e.x += e.vx * dt; e.z += e.vz * dt;
  e.y += (gy + S.alt - e.y) * Math.min(1, dt);
  if (e.run.bomb && d < 14 && e.dropped < S.bombs) {
    e.cool -= dt;
    if (e.cool <= 0) { e.cool = 0.18; e.dropped++; w.shots.push({ team: 'enemy', kind: 'bomb', x: e.x, y: e.y - 1, z: e.z, vx: e.vx * 0.8, vy: -2, vz: e.vz * 0.8, gravity: 24, life: 6, dmg: S.bomb, r: 0.6, explosive: true, radius: 6, splash: S.bomb }); emit(w, 'eshot', { kind: 'bomb', x: e.x, y: e.y, z: e.z }); }
  }
  if (!e.passing && d < 10) { e.passing = true; e.passT = S.away; } // fly on out before turning back
  if (e.passing && (e.passT -= dt) <= 0) { e.passing = false; e.run = null; }
  // nose cannon when you're in front
  if (p) {
    const ang = Math.abs(wrapAngle(Math.atan2(p.x - e.x, p.z - e.z) - e.yaw)), dP = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
    e.gunT = (e.gunT || 0) - dt;
    if (ang < 0.3 && dP < S.range && e.gunT <= 0) { e.gunT = 0.12; shoot(w, e.x, e.y, e.z, p, { kind: 'ebullet', shot: S.shot, dmg: S.dmg, range: S.range, spread: 0.05 }); }
  }
  const lim = w.level.island.half - 20;
  if (Math.abs(e.x) > lim || Math.abs(e.z) > lim) { e.run = { x: 0, z: 0, bomb: false }; e.passing = false; }
}
// The mothership: crawls over the vault, charges, then burns it with a beam; launches saucers.
function mothership(w, e, dt) {
  const S = e.spec;
  const nf = nearestFriend(w, e.x, e.z, ['struct']);
  if (nf) {
    const tx = nf.f.x, tz = nf.f.z, dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    if (d > 4) { e.vx = (dx / d) * S.speed; e.vz = (dz / d) * S.speed; e.x += e.vx * dt; e.z += e.vz * dt; } else e.vx = e.vz = 0;
    e.cycle = (e.cycle ?? 2) + dt;
    const c = e.cycle % S.cycle;
    const charging = d < 30 && c > S.cycle - S.charge - S.beam && c <= S.cycle - S.beam, firing = d < 30 && c > S.cycle - S.beam;
    if (charging && !e.charging) emit(w, 'charge', { id: e.id });
    e.charging = charging; e.beam = firing;
    if (firing && nf.d < 20) damage(w, nf.f, S.beamDps * dt, 'beam');
  }
  e.yaw += dt * 0.2;
  e.y += (w.terrain.surface(e.x, e.z) + S.alt - e.y) * Math.min(1, dt);
  e.spawnT = (e.spawnT ?? 6) - dt;
  if (e.spawnT <= 0) { e.spawnT = S.spawn; for (let i = 0; i < 2; i++) { const s = spawnUnit(w, 'saucer', e.x + (i ? 8 : -8), e.z, { prefer: 'friend', wave: true }); s.y = e.y - 3; } emit(w, 'toast', { text: 'MOTHERSHIP LAUNCHING SAUCERS', cls: 'bad' }); }
}

// ------------------------------------------------------------------ structures that fight
function structure(w, e, dt) {
  e.cool -= dt;
  const t = e.type;
  if (t === 'flak') {
    const S = T.FLAK;
    if (e.burst > 0) { e.burstT -= dt; if (e.burstT <= 0) { e.burst--; e.burstT = S.gap; const p = playerPos(w), d = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z); shoot(w, e.x, e.y + 2.8, e.z, { ...p, player: true }, { kind: 'flak', shot: S.shot, dmg: S.dmg, range: S.range, spread: S.spread, blast: S.blast, splash: S.dmg, prox: S.prox, life: d / S.shot + 0.05, r: 0.4 }); } return; }
    if (playerAlive(w) && e.cool <= 0) {
      const p = playerPos(w);
      if (!p.ground && Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z) < S.range) { e.burst = S.burst; e.burstT = 0; e.cool = S.rate; e.tyaw = Math.atan2(p.x - e.x, p.z - e.z); }
    }
    if (playerAlive(w)) { const p = playerPos(w); e.tyaw = Math.atan2(p.x - e.x, p.z - e.z); }
  } else if (t === 'sam') {
    const S = T.SAM, blind = w.radars <= 0 && w.ents.some((x) => x.type === 'radar');
    const range = blind ? S.rangeBlind : S.range, lockT = blind ? S.lockBlind : S.lock;
    const p = playerAlive(w) ? playerPos(w) : null, d = p ? Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z) : Infinity;
    if (p) e.tyaw = Math.atan2(p.x - e.x, p.z - e.z);
    if (e.lockT > 0) {
      if (!p || p.ground || d > range * 1.15) { e.lockT = 0; e.locking = false; emit(w, 'lockLost', { id: e.id }); return; }
      e.lockT -= dt;
      if (e.lockT <= 0) {
        e.locking = false; e.cool = S.cool;
        const sp = S.speed * 0.6;
        w.shots.push({ team: 'enemy', kind: 'sam', x: e.x, y: e.y + 3, z: e.z, vx: 0, vy: sp, vz: 0, speed: sp, max: S.speed, accel: 30, turn: S.turn, target: 'player', life: S.life, dmg: S.dmg, r: 0.6, explosive: true, radius: 3, splash: S.dmg * 0.4, shootable: true });
        emit(w, 'samLaunch', { id: e.id, x: e.x, y: e.y + 3, z: e.z });
      }
    } else if (p && !p.ground && e.cool <= 0 && d < range) { e.lockT = lockT; e.lockMax = lockT; e.locking = true; emit(w, 'samLock', { id: e.id }); }
  } else if (t === 'battery') { // shore guns: the tanker first, you if it's out of reach
    const S = T.BATTERY;
    const nf = nearestFriend(w, e.x, e.z, ['tanker']);
    let tgt = nf && nf.d < S.range ? { x: nf.f.x, y: 4, z: nf.f.z, vx: nf.f.vx, vz: nf.f.vz } : null;
    if (!tgt && playerAlive(w)) { const p = playerPos(w); if (Math.hypot(p.x - e.x, p.z - e.z) < 60) tgt = p; }
    if (!tgt) return;
    e.tyaw = Math.atan2(tgt.x - e.x, tgt.z - e.z);
    if (e.aimT > 0) { e.aimT -= dt; if (e.aimT <= 0) { shoot(w, e.x, e.y + 3, e.z, tgt, { kind: 'shell', shot: S.shot, dmg: S.dmg, range: S.range, spread: 0.012, blast: S.blast, splash: S.dmg * 0.6, r: 0.7, lead: 1 }); e.cool = S.rate; e.recoil = 1; } }
    else if (e.cool <= 0) { e.aimT = S.aim; emit(w, 'aim', { id: e.id, big: true }); }
  } else if (t === 'barracks' && e.team === 'enemy') {
    if (!playerAlive(w)) return;
    const p = playerPos(w);
    if (Math.hypot(p.x - e.x, p.z - e.z) > T.ALERT_R) return;
    e.spawned = (e.spawned || []).filter((s) => s.alive);
    if (e.cool <= 0 && e.spawned.length < T.BARRACKS_CAP) {
      e.cool = T.BARRACKS_SPAWN;
      const dx = Math.sin(e.yaw) * 5.5, dz = Math.cos(e.yaw) * 5.5;
      e.spawned.push(spawnUnit(w, w.rng() < 0.3 ? 'rpg' : 'soldier', e.x + dx, e.z + dz, { leash: 16, alert: true }));
    }
  }
}

export { spawnUnit as spawn, kill };
