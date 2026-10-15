// The autopilot: flies the title screen's attract mode, and is the headless proof that every mission can
// be finished (tools/sim-check.mjs). It reads the world the way a player reads the HUD (the nav compass
// target, the lock, the gauges) and returns the same input object the controls produce.
import { TUNING as T } from '../tuning.js';
import { CRAFT } from './craft.js';
import { objectiveTarget } from './objectives.js';
import { lzPos, playerPos, blocked } from './world.js';

export function autopilot(w, mem) {
  const P = w.P, inp = { mx: 0, mz: 0, gun: false, msl: false, mine: false, action: false, xform: false, aim: null };
  if (w.phase !== 'play' || P.mode === 'down' || P.landT > 0 || P.xform) return inp;
  const p = playerPos(w), o = w.obj, kind = w.level.objective.kind;
  const steer = (x, z, k = 1) => { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1; inp.mx = (dx / d) * k; inp.mz = (dz / d) * k; return d; };

  if (P.mode === 'foot') { // run for the prototype (or back to the chopper), shooting on the way
    const goal = kind === 'heist' && w.ents.find((e) => e.kind === 'parked' && e.proto && !e.locked) || w.ents.find((e) => e.kind === 'parked' && e.alive);
    if (goal) { const d = steer(goal.x, goal.z, 1); if (d < 3) inp.action = true; }
    inp.gun = P.target != null;
    return inp;
  }

  const C = CRAFT[P.craft], lz = lzPos(w);
  const low = (C.fuelBurn > 0 && P.fuel < 30) || P.armor < C.armor * 0.32 || (P.ammo.msl < 1 && P.ammo.gun < 80 && (P.ammo.mine < 1 || P.form === 'spider'));
  if (low) mem.resupply = true;
  if (mem.resupply && P.armor >= C.armor * 0.95 && P.fuel >= T.FUEL * 0.95 && P.ammo.msl >= C.weapons.msl.max * 0.9) mem.resupply = false;

  let goal = objectiveTarget(w);
  if (mem.resupply && lz) goal = { x: lz.x, z: lz.z, label: 'LZ' };
  if (!goal) return inp;
  const target = goal.id != null ? w.ents.find((e) => e.id === goal.id) : null;
  const d = Math.hypot(goal.x - p.x, goal.z - p.z);

  if (kind === 'defend' && o.stage === 'deploy') { // fly into the compound and stand up on the legs
    steer(goal.x, goal.z, Math.min(1, d / 12));
    if (P.form === 'heli' && d < 30 && P.canXform) inp.xform = true;
  } else if (kind === 'heist' && o.stage === 'land' && !mem.resupply) {
    steer(goal.x, goal.z, Math.min(1, d / 14));
    if (d < 4 && P.canExit) inp.action = true;
  } else if (target && !mem.resupply) {
    // circle-strafe the target at a stand-off distance, nose on it (auto-face while firing)
    const R = target.kind === 'struct' ? 22 : target.air ? 16 : 20;
    const dx = p.x - goal.x, dz = p.z - goal.z, dd = Math.hypot(dx, dz) || 1;
    const tx = -dz / dd, tz = dx / dd, radial = (R - dd) / R;
    inp.mx = tx * 0.75 + (dx / dd) * radial * 1.4; inp.mz = tz * 0.75 + (dz / dd) * radial * 1.4;
    if (dd > R * 1.8) steer(goal.x, goal.z, 1);
    if (dd < 70) inp.aim = Math.atan2(goal.x - p.x, goal.z - p.z); // nose on it, like a twin-stick player
    // over a building: drop a mine on it
    if (target.kind === 'struct' && dd < 6) inp.mine = true;
    if (target.kind === 'struct' && dd > R * 0.6 && dd < R * 1.3 && w.rng() < 0.02) { inp.mx = -dx / dd; inp.mz = -dz / dd; } // dive across it now and then
  } else if (kind === 'escort' && goal.label === 'TANKER' && !mem.resupply) {
    // ride shotgun a little ahead of the tanker's bow
    const t = o.tanker, ax = t.x + Math.sin(t.yaw) * 40, az = t.z + Math.cos(t.yaw) * 40;
    steer(ax, az, Math.min(1, Math.hypot(ax - p.x, az - p.z) / 20));
  } else {
    steer(goal.x, goal.z, Math.min(1, d / 12));
  }
  // on legs: walk round buildings (the chopper just flies over them). Look a few metres down the wished
  // direction and swing off it, to the side last chosen, until the way is clear; if still pinned, sidestep.
  if (P.form === 'spider' && Math.hypot(inp.mx, inp.mz) > 0.2) {
    const S = T.SPIDER, k = Math.min(1, Math.hypot(inp.mx, inp.mz)), base = Math.atan2(inp.mx, inp.mz);
    const clear = (a) => [3, 6, 9].every((r) => { const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r; return w.terrain.height(x, z) > S.wade && !blocked(w, x, z, S.r, w.terrain.surface(x, z)); });
    if (!clear(base)) {
      mem.side = mem.side || 1;
      let found = null;
      for (const off of [0.45, 0.9, 1.35, 1.8, 2.25]) { for (const sd of [mem.side, -mem.side]) if (found == null && clear(base + off * sd)) { found = base + off * sd; mem.side = sd; } if (found != null) break; }
      if (found != null) { inp.mx = Math.sin(found) * k; inp.mz = Math.cos(found) * k; }
    }
    const sp = Math.hypot(P.vx, P.vz);
    mem.stuck = sp < 1.2 ? (mem.stuck || 0) + 1 / 60 : 0;
    if (mem.stuck > 0.8) { mem.unstickUntil = w.t + 1.2; const a = base + (w.rng() < 0.5 ? 1.7 : -1.7); mem.unstick = [Math.sin(a), Math.cos(a)]; mem.stuck = 0; }
    if (w.t < (mem.unstickUntil || 0)) { inp.mx = mem.unstick[0]; inp.mz = mem.unstick[1]; }
  }
  // weapons: the auto-aim does the aiming
  if (P.target != null) {
    const t = w.ents.find((e) => e.id === P.target);
    inp.gun = true;
    inp.msl = !!t && P.lockT >= T.LOCK_TIME && (t.kind === 'struct' || t.maxHp >= 40);
  }
  return inp;
}
