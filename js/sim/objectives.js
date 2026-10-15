// Mission scripts. Each objective kind sets up its pieces, runs its stages, says what the HUD shows
// (w.obj.text / goal / bar) and where the nav compass points (objectiveTarget), and ends the game.
//
//   destroy   wreck every data center, then hover on the LZ to extract           (mission 1)
//   escort    keep the tanker afloat to the end of the strait                     (mission 2)
//   heist     generators → land → on foot → steal the prototype → carrier         (mission 3)
//   defend    survive the waves; lose the protected building(s) and it's over     (missions 4 and 6)
//             mission 6 opens with a 'deploy' stage: land in the compound and stand up in spider mode,
//             then the blizzard grounds the rotor (o.noFly) for the rest of the fight
//   airspace  fill the control meter with air kills before the casinos fall      (mission 5)
import { TUNING as T } from '../tuning.js';
import { addEnt, emit, endGame, makeBox, playerPos, lzPos } from './world.js';
import { spawn } from './ai.js';
import { pathPoint } from './levels/common.js';

const alive = (w, f) => w.ents.filter((e) => e.alive && f(e));
const isAir = (e) => e.air && e.team === 'enemy';

export function setupObjective(w) {
  const L = w.level, O = L.objective;
  const o = (w.obj = { kind: O.kind, stage: '', text: '', goal: '', bar: null, barLabel: '', holdT: 0, allowExit: O.kind === 'heist' }); // (getting out is the heist's verb)
  if (O.kind === 'destroy') {
    o.stage = 'strike';
    o.total = w.ents.filter((e) => e.type === 'datacenter').length;
    o.lastDown = 0;
  } else if (O.kind === 'escort') {
    const E = L.escort, p = pathPoint(E.path, E.s0);
    o.tanker = addEnt(w, { kind: 'tanker', team: 'friend', name: 'TANKER', x: p.x, z: p.z, y: 0, yaw: p.yaw, hp: E.hp, s: E.s0, boxes: [] });
    placeTanker(o.tanker, p);
    o.stage = 'escort'; o.waveT = L.boats.waves.first; o.gsI = 0; o.startT = 5;
    w.P.x = p.x - Math.sin(p.yaw) * 14; w.P.z = p.z - Math.cos(p.yaw) * 14; w.P.y = 9 + T.CRUISE; w.P.yaw = p.yaw;
  } else if (O.kind === 'heist') {
    const H = L.heist;
    o.stage = 'sabotage'; w.shield = true;
    o.proto = addEnt(w, { kind: 'parked', team: 'friend', craft: 'alien', proto: true, locked: true, immune: true, x: H.proto.x, z: H.proto.z, y: w.terrain.surface(H.proto.x, H.proto.z), yaw: H.proto.yaw, hp: 1 });
    o.total = o.lastLeft = w.ents.filter((e) => e.type === 'generator').length;
  } else if (O.kind === 'defend') {
    o.stage = O.deploy ? 'deploy' : 'break'; o.wave = 0; o.breakT = 6; o.waveIds = [];
    o.protects = w.ents.filter((e) => e.kind === 'struct' && e.type === O.protect && e.team === 'friend');
    o.protect = o.protects[0]; o.loseAt = O.loseAt || o.protects.length; o.lost = 0;
    if (O.noFly && !O.deploy) { o.noFly = true; o.noFlyWhy = O.noFlyWhy; }
  } else if (O.kind === 'airspace') {
    o.stage = 'raid'; o.control = 10; o.raidT = 3; o.raidI = 0; o.lost = 0;
  }
  const G = L.gunships;
  o.gsSchedule = G?.schedule ? [...G.schedule] : [];
  describe(w);
}

function placeTanker(t, p) {
  const c = Math.sin(p.yaw), s = Math.cos(p.yaw);
  t.boxes = [makeBox(p.x, p.z, p.yaw, 5.6, 28, 0, 6.5), makeBox(p.x - c * 21, p.z - s * 21, p.yaw, 5, 4, 6.5, 14)];
}

function spawnGunship(w, alien) {
  const G = w.level.gunships, pads = G?.pads?.length ? G.pads : [[0, -w.level.island.half + 40]];
  const [x, z] = pads[w.rng() * pads.length | 0];
  const g = spawn(w, alien ? 'agunship' : 'gunship', x, z, { alert: true });
  g.y = w.terrain.surface(x, z) + 2;
  emit(w, 'toast', { text: 'ENEMY GUNSHIP INBOUND', cls: 'bad' });
  return g;
}
// A wave or raid group, from a bearing at the desert's edge.
function spawnGroup(w, kind, n, bearing, tag) {
  const R = w.level.objective.spawnR || Math.min(210, w.level.island.half - 50), ids = [];
  for (let i = 0; i < n; i++) {
    const a = bearing + (i - (n - 1) / 2) * 0.09, r = R + (i % 3) * 8;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const e = spawn(w, kind, x, z, { march: !['saucer', 'drone', 'gunship', 'agunship', 'jet', 'mothership'].includes(kind), prefer: kind === 'gunship' || kind === 'agunship' || kind === 'drone' ? 'mixed' : 'friend', wave: tag, alert: true, leash: 400 });
    if (kind === 'jet') e.yaw = Math.atan2(-x, -z);
    ids.push(e.id);
  }
  return ids;
}

export function updateObjective(w, dt) {
  const L = w.level, O = L.objective, o = w.obj, P = w.P;
  if (w.phase !== 'play') return;
  // scheduled gunships (the strait)
  while (o.gsSchedule.length && w.t >= o.gsSchedule[0]) { o.gsSchedule.shift(); spawnGunship(w, false); }

  if (O.kind === 'destroy') {
    const left = alive(w, (e) => e.type === 'datacenter').length, down = o.total - left;
    if (down > o.lastDown) {
      o.lastDown = down;
      emit(w, 'objective', { text: `DATA CENTER DOWN ${down}/${o.total}` });
      if (L.gunships?.reinforce === 'perTarget' && alive(w, (e) => e.kind === 'gunship').length < T.GUNSHIP.max && left > 0) spawnGunship(w, false);
    }
    if (o.stage === 'strike' && left === 0) { o.stage = 'extract'; emit(w, 'objective', { text: 'ALL DATA CENTERS DOWN · RETURN TO THE LZ', big: true }); }
    if (o.stage === 'extract') extractAt(w, L.lz, dt);
  } else if (O.kind === 'escort') {
    const E = L.escort, t = o.tanker;
    if (!t.alive) { endGame(w, false, 'The tanker was sunk'); return; }
    const boom = alive(w, (e) => e.type === 'boomtower').length;
    o.startT -= dt;
    const hold = boom > 0 && t.s >= E.waitS;
    if (hold && !o.held) { o.held = true; emit(w, 'objective', { text: 'TANKER HOLDING · DESTROY THE BOOM TOWERS', big: true }); }
    if (!hold && o.held) { o.held = false; emit(w, 'objective', { text: 'BOOM DOWN · THE STRAIT IS OPEN' }); }
    const v = o.startT > 0 || hold ? 0 : E.speed;
    t.s += v * dt;
    const p = pathPoint(E.path, t.s), q = pathPoint(E.path, t.s + 12);
    const yaw = Math.atan2(q.x - p.x, q.z - p.z);
    t.vx = (p.x - t.x) / dt; t.vz = (p.z - t.z) / dt;
    t.x = p.x; t.z = p.z; t.yaw += Math.atan2(Math.sin(yaw - t.yaw), Math.cos(yaw - t.yaw)) * Math.min(1, dt * 0.8);
    placeTanker(t, { x: t.x, z: t.z, yaw: t.yaw });
    // gunboat waves from the north mouth
    const W = L.boats.waves;
    o.waveT -= dt;
    if (o.waveT <= 0) {
      o.waveT = W.every;
      if (alive(w, (e) => e.kind === 'boat').length < 6) { for (let i = 0; i < W.n; i++) spawn(w, 'boat', W.from[0] + (i - 0.5) * 18, W.from[1], { hunt: true }); emit(w, 'toast', { text: 'GUNBOATS COMING DOWN THE STRAIT', cls: 'bad' }); }
    }
    if (t.s >= E.end) { endGame(w, true, 'The tanker made it through'); return; }
  } else if (O.kind === 'heist') {
    const H = L.heist;
    if (o.stage === 'sabotage') {
      const left = alive(w, (e) => e.type === 'generator').length;
      if (left < o.lastLeft) emit(w, 'objective', { text: `GENERATOR DOWN ${o.total - left}/${o.total}` });
      o.lastLeft = left;
      if (left === 0) {
        w.shield = false; o.proto.locked = false;
        for (const b of w.solids) if (b.kind === 'roof') b.on = false;
        o.stage = 'land';
        emit(w, 'shieldDown', {});
        emit(w, 'objective', { text: 'SHIELD DOWN · LAND AT THE HANGAR AND GET OUT', big: true });
      }
    } else if (o.stage === 'land') {
      if (P.mode === 'foot') { o.stage = 'foot'; emit(w, 'objective', { text: 'ON FOOT · STEAL THE PROTOTYPE', big: true }); }
    } else if (o.stage === 'foot') {
      if (P.mode === 'fly' && P.craft === 'alien') {
        o.stage = 'escape';
        emit(w, 'objective', { text: 'PROTOTYPE STOLEN · FLY IT TO THE CARRIER', big: true });
        emit(w, 'stolen', {});
        for (let i = 0; i < (H.alarm?.gunships || 2); i++) spawnGunship(w, false);
        for (const e of w.ents) if (e.team === 'enemy') e.alert = true;
      } else if (P.mode === 'fly') o.stage = 'land';
    } else if (o.stage === 'escape') extractAt(w, H.extract, dt, (p) => p.craft === 'alien');
  } else if (O.kind === 'defend') {
    const lost = o.protects.filter((e) => !e.alive).length;
    if (lost > o.lost) { o.lost = lost; if (lost < o.loseAt) emit(w, 'objective', { text: `${o.protects.find((e) => !e.alive && !e.mourned)?.name || 'BUILDING'} LOST · ${lost}/${o.loseAt}` }); for (const e of o.protects) if (!e.alive) e.mourned = true; }
    if (lost >= o.loseAt) { endGame(w, false, o.protects.length > 1 ? (O.loseWhy || 'The data centers fell') : `${o.protect.name} was destroyed`); return; }
    if (o.stage === 'deploy') { // land in the compound and stand up on the legs; then the weather closes in
      const C = O.deploy;
      if (P.mode === 'fly' && P.form === 'spider' && Math.hypot(P.x - C.x, P.z - C.z) < C.r) {
        o.stage = 'break'; o.breakT = O.breakT;
        if (O.noFly) { o.noFly = true; o.noFlyWhy = O.noFlyWhy; }
        emit(w, 'objective', { text: C.done || 'SPIDER MODE · HOLD THE LINE', big: true });
      }
    } else if (o.stage === 'break') {
      o.breakT -= dt;
      if (o.breakT <= 0) {
        const groups = L.waves[o.wave];
        o.waveIds = groups.flatMap((g) => spawnGroup(w, g.kind, g.n, g.bearing, o.wave + 1));
        o.stage = 'wave';
        emit(w, 'objective', { text: o.wave === L.waves.length - 1 ? (O.finalText || 'FINAL WAVE · THE MOTHERSHIP') : `WAVE ${o.wave + 1} INCOMING`, big: true });
      }
    } else {
      const live = w.ents.filter((e) => e.wave === o.wave + 1 && (e.alive || e.falling)).length;
      const waveSaucers = w.ents.filter((e) => e.wave === true && e.alive).length; // the mothership's escorts
      if (live === 0 && waveSaucers === 0) {
        o.wave++;
        if (o.wave >= L.waves.length) { endGame(w, true, O.winWhy || 'The base held'); return; }
        o.stage = 'break'; o.breakT = O.breakT;
        emit(w, 'objective', { text: `WAVE ${o.wave} CLEARED` });
      }
    }
  } else if (O.kind === 'airspace') {
    for (const e of w.ents) if (!e.alive && isAir(e) && !e.counted) { e.counted = true; if (e.lastByPlayer) o.control += O.perKill[e.kind] || 3; }
    const air = alive(w, isAir).length;
    o.control = Math.max(0, Math.min(100, o.control - O.decay * dt * (air / 4)));
    o.raidT -= dt;
    if (o.raidT <= 0 && air < O.cap) {
      o.raidT = O.every;
      for (const [kind, n, bearing] of L.raid[o.raidI++ % L.raid.length]) spawnGroup(w, kind, n, bearing, 'raid');
    }
    const lost = w.ents.filter((e) => e.type === 'casino' && !e.alive).length;
    if (lost > o.lost) { o.lost = lost; emit(w, 'objective', { text: `CASINO DESTROYED · ${lost}/${O.loseAt}` }); }
    if (lost >= O.loseAt) { endGame(w, false, 'The Strip fell'); return; }
    if (o.control >= O.goal) { endGame(w, true, 'Airspace secured'); return; }
  }
  describe(w);
}

function extractAt(w, Z, dt, ok = () => true) {
  const P = w.P, o = w.obj;
  const inside = P.mode === 'fly' && ok(P) && Math.hypot(P.x - Z.x, P.z - Z.z) < Z.r && Math.hypot(P.vx, P.vz) < 7;
  o.holdT = inside ? o.holdT + dt : 0;
  if (o.holdT >= T.EXTRACT_T) endGame(w, true, 'Extracted');
}

// HUD strings and the progress bar.
function describe(w) {
  const L = w.level, O = L.objective, o = w.obj, P = w.P;
  o.bar = null;
  if (O.kind === 'destroy') {
    const left = alive(w, (e) => e.type === 'datacenter').length;
    o.text = o.stage === 'extract' ? 'EXTRACT' : `DATA CENTERS ${o.total - left}/${o.total}`;
    o.goal = o.stage === 'extract' ? 'Return to the LZ' : 'Destroy the data centers';
  } else if (O.kind === 'escort') {
    const t = o.tanker, E = L.escort;
    o.text = `TANKER ${Math.round(((t.s - E.s0) / (E.end - E.s0)) * 100)}%`;
    o.goal = o.held ? 'Destroy the boom towers' : o.startT > 0 ? 'Tanker getting under way' : 'Escort the tanker';
    o.bar = t.hp / t.maxHp; o.barLabel = 'TANKER';
  } else if (O.kind === 'heist') {
    const left = alive(w, (e) => e.type === 'generator').length;
    o.text = { sabotage: `GENERATORS ${o.total - left}/${o.total}`, land: 'LAND AT THE HANGAR', foot: 'STEAL THE PROTOTYPE', escape: 'TO THE CARRIER' }[o.stage];
    o.goal = { sabotage: 'Destroy the shield generators', land: P.canExit ? 'Press EXIT to get out' : 'Hover on the hangar pad', foot: 'Run into the hangar and board it', escape: 'Fly the prototype to the carrier' }[o.stage];
  } else if (O.kind === 'defend') {
    o.text = o.stage === 'deploy' ? 'SPIDER MODE' : o.stage === 'break' ? `NEXT WAVE ${Math.ceil(o.breakT)}` : `WAVE ${o.wave + 1}/${L.waves.length}`;
    o.goal = o.stage === 'deploy' ? (P.form === 'spider' ? 'Walk into the compound' : 'Land in the compound and press WALK (T)') : O.goal || 'Defend the base';
    if (o.protects.length > 1) { let hp = 0, max = 0; for (const e of o.protects) { hp += Math.max(0, e.hp); max += e.maxHp; } o.bar = hp / max; o.barLabel = O.barLabel || 'BASE'; }
    else if (o.protect) { o.bar = o.protect.hp / o.protect.maxHp; o.barLabel = o.protect.name; }
  } else if (O.kind === 'airspace') {
    o.text = `AIRSPACE ${Math.floor(o.control)}%`;
    o.goal = `Shoot down raiders · casinos lost ${o.lost}/${O.loseAt}`;
    o.bar = o.control / O.goal; o.barLabel = 'CONTROL';
  }
}

// Where the nav compass points: { x, z, label } or null.
export function objectiveTarget(w) {
  const L = w.level, O = L.objective, o = w.obj, P = w.P, p = playerPos(w);
  const nearest = (list) => { let b = null, bd = Infinity; for (const e of list) { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; b = e; } } return b; };
  if (O.kind === 'destroy') {
    if (o.stage === 'extract') return { x: L.lz.x, z: L.lz.z, label: 'LZ' };
    const e = nearest(alive(w, (e) => e.type === 'datacenter'));
    return e && { x: e.x, z: e.z, label: e.tag || 'DC', id: e.id };
  }
  if (O.kind === 'escort') {
    const t = o.tanker;
    if (o.held) { const e = nearest(alive(w, (e) => e.type === 'boomtower')); if (e) return { x: e.x, z: e.z, label: 'BOOM', id: e.id }; }
    const mine = alive(w, (e) => e.kind === 'navmine').filter((m) => Math.hypot(m.x - t.x, m.z - t.z) < 110 && Math.cos(Math.atan2(m.x - t.x, m.z - t.z) - t.yaw) > 0.3);
    if (mine.length) { const e = nearest(mine); return { x: e.x, z: e.z, label: 'MINE', id: e.id }; }
    return { x: t.x, z: t.z, label: 'TANKER' };
  }
  if (O.kind === 'heist') {
    const H = L.heist;
    if (o.stage === 'sabotage') { const e = nearest(alive(w, (e) => e.type === 'generator')); return e && { x: e.x, z: e.z, label: 'GEN', id: e.id }; }
    if (o.stage === 'land') return { x: H.pad.x, z: H.pad.z, label: 'PAD' };
    if (o.stage === 'foot') return { x: H.proto.x, z: H.proto.z, label: 'XH-0' };
    return { x: H.extract.x, z: H.extract.z, label: 'CARRIER' };
  }
  if (O.kind === 'defend') {
    if (o.stage === 'deploy') return { x: O.deploy.x, z: O.deploy.z, label: 'LAND' };
    const guard = o.protects.filter((e) => e.alive);
    const foes = alive(w, (e) => e.team === 'enemy' && e.wave);
    if (foes.length && guard.length) { // the hostile closest to anything we defend (crawlers count double: they're bombs)
      let b = null, bd = Infinity;
      for (const e of foes) for (const v of guard) { const d = Math.hypot(e.x - v.x, e.z - v.z) * (e.kind === 'crawler' ? 0.5 : 1); if (d < bd) { bd = d; b = e; } }
      return { x: b.x, z: b.z, label: 'HOSTILE', id: b.id };
    }
    const v = nearest(guard);
    return v && { x: v.x, z: v.z, label: O.navLabel || 'H-18' };
  }
  if (O.kind === 'airspace') { const e = nearest(alive(w, isAir)); return e ? { x: e.x, z: e.z, label: 'BANDIT', id: e.id } : null; }
  return null;
}
export const lzOf = lzPos;
