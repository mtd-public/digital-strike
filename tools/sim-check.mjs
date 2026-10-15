// Headless sim checks (house rule: every invariant gets a check). Runs in node: the sim imports no
// three.js and no DOM.  Usage:  node tools/sim-check.mjs [levelId]
//
//   1. every mission builds, nothing spawns inside a wall or in the sea that shouldn't
//   2. the autopilot (god mode) finishes every mission inside its time budget: the proof it can be won
//   3. the same run never produces a NaN position, and every weapon actually does damage
//   4. on-foot rules: get out, walk, get back in (mission 3 does it for real)
//   5. spider mode: transform over land (not over the sea), walk, flak and SAMs ignore it, armor soaks more,
//      every weapon still hurts, transform back; mission 6 is played on legs
//   6. the autopilot without god mode, for the record (not asserted: it's a bot, not a player)
import { LEVELS } from '../js/sim/levels/index.js';
import { createWorld, step, blocked, playerPos, hurtPlayer } from '../js/sim/world.js';
import { autopilot } from '../js/sim/autopilot.js';
import { CRAFT } from '../js/sim/craft.js';

const only = process.argv[2];
const DT = 1 / 60;
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  FAIL', msg); } else console.log('  ok  ', msg); };
const BUDGET = { firewall: 900, strait: 420, heist: 700, area51: 900, vegas: 900, ironweb: 900 };

function run(level, opts, limit) {
  const w = createWorld(level, opts), mem = {};
  let nan = false, steps = 0, exits = 0, enters = 0, xforms = 0;
  const dmgByKind = {};
  for (; steps < limit / DT && w.phase === 'play'; steps++) {
    step(w, autopilot(w, mem), DT);
    const p = playerPos(w);
    if (!Number.isFinite(p.x + p.y + p.z)) nan = true;
    for (const e of w.events) {
      if (e.type === 'exit') exits++;
      if (e.type === 'enter') enters++;
      if (e.type === 'xformDone') xforms++;
      if (e.type === 'shot') dmgByKind[e.kind] = (dmgByKind[e.kind] || 0) + 1;
    }
    w.events.length = 0;
  }
  return { w, nan, t: w.t, exits, enters, xforms, fired: dmgByKind };
}

for (const level of LEVELS) {
  if (only && level.id !== only) continue;
  console.log(`\n${level.code} · ${level.name} (${level.id})`);
  const t0 = Date.now();
  const w0 = createWorld(level, { seed: 1 });
  console.log(`  built in ${Date.now() - t0} ms: ${w0.ents.length} entities, ${w0.solids.length} solids, ${w0.pickups.length} crates`);
  const stuck = w0.ents.filter((e) => ['soldier', 'rpg', 'tank', 'tech', 'alien', 'heavy'].includes(e.kind) && (blocked(w0, e.x, e.z, 0.3, w0.terrain.height(e.x, e.z)) || w0.terrain.height(e.x, e.z) < 0.3));
  ok(stuck.length === 0, `no ground unit spawns in a wall or the sea${stuck.length ? ': ' + stuck.map((e) => `${e.kind}@${e.x.toFixed(0)},${e.z.toFixed(0)}`).join(' ') : ''}`);
  const dry = w0.ents.filter((e) => e.kind === 'struct' && w0.terrain.height(e.x, e.z) < 0.5);
  ok(dry.length === 0, `structures stand on land${dry.length ? ': ' + dry.map((e) => `${e.type}@${e.x.toFixed(0)},${e.z.toFixed(0)}`).join(' ') : ''}`);
  const wet = w0.ents.filter((e) => e.kind === 'boat' && w0.terrain.height(e.x, e.z) > -1.5);
  ok(wet.length === 0, `boats start on water${wet.length ? ': ' + wet.map((e) => `${e.x.toFixed(0)},${e.z.toFixed(0)}`).join(' ') : ''}`);
  const st = level.start;
  ok(w0.terrain.surface(st.x, st.z) < 30, 'the start is not inside a mountain');

  const r = run(level, { seed: 1, god: true }, BUDGET[level.id]);
  ok(!r.nan, 'no NaN positions');
  ok(r.w.phase === 'won', `autopilot (god) wins: ${r.w.phase}${r.w.result ? ' · ' + r.w.result.why : ''} at ${r.t.toFixed(0)} s, score ${r.w.score}, kills ${r.w.kills}, objective "${r.w.obj.text}"`);
  ok(Object.keys(r.fired).length >= 2, `weapons used: ${JSON.stringify(r.fired)}`);
  if (level.id === 'heist') ok(r.exits >= 1 && r.enters >= 1, `got out and stole the prototype (exits ${r.exits}, enters ${r.enters}, craft ${r.w.P.craft})`);
  if (level.id === 'ironweb') ok(r.xforms >= 1 && r.w.P.form === 'spider', `stood up in spider mode and held it on legs (transforms ${r.xforms}, form ${r.w.P.form})`);

  const r2 = run(level, { seed: 2 }, BUDGET[level.id]);
  console.log(`  (no god) ${r2.w.phase} ${r2.w.result?.why || ''} at ${r2.t.toFixed(0)} s, lives ${r2.w.P.lives}, deaths ${r2.w.deaths}, score ${r2.w.score}`);
}

// unit checks on weapons: one shot of each at a tank in front of you
{
  const level = LEVELS[0];
  for (const craft of ['apache', 'alien']) {
    for (const slot of ['gun', 'msl', 'mine']) {
      const w = createWorld(level, { seed: 3, craft });
      const P = w.P;
      P.x = 0; P.z = 100; P.yaw = 0; P.y = w.terrain.surface(0, 100) + 9.5;
      w.ents = w.ents.filter((e) => e.kind === 'struct');
      const tank = (await import('../js/sim/ai.js')).spawn(w, 'tank', 0, slot === 'mine' ? 100 : 118, { guard: true });
      tank.spec = { ...tank.spec, range: 0, see: 0 };
      const hp0 = tank.hp;
      for (let i = 0; i < 240; i++) { step(w, { [slot]: i < 30, mx: 0, mz: 0 }, DT); w.events.length = 0; }
      ok(tank.hp < hp0, `${CRAFT[craft].weapons[slot].name} damages a tank (${hp0} → ${Math.max(0, tank.hp).toFixed(0)})`);
    }
  }
}

// spider mode: the rules
{
  console.log('\nSPIDER MODE');
  const { spawn } = await import('../js/sim/ai.js');
  const { TUNING: T } = await import('../js/tuning.js');
  const level = LEVELS[0], lz = level.lz;
  const fresh = () => { const w = createWorld(level, { seed: 5 }); w.P.invT = 0; w.ents = w.ents.filter((e) => e.kind === 'struct' && e.type !== 'flak' && e.type !== 'sam'); return w; };
  const run = (w, inp, secs) => { for (let i = 0; i < secs / DT; i++) { step(w, inp, DT); w.events.length = 0; } };
  // over the sea: no footing
  let w = fresh(); w.P.x = 0; w.P.z = 300; run(w, {}, 0.1);
  run(w, { xform: true }, DT); run(w, {}, 2);
  ok(w.P.form === 'heli', `no transform over the sea (form ${w.P.form})`);
  // at the LZ: transform, stand on legs
  w = fresh(); w.P.x = lz.x; w.P.z = lz.z; run(w, {}, 0.1);
  run(w, { xform: true }, DT); run(w, {}, T.XFORM_T + 0.2);
  const gy = w.terrain.surface(w.P.x, w.P.z);
  ok(w.P.form === 'spider' && Math.abs(w.P.y - gy - T.SPIDER.H) < 0.3 && playerPos(w).ground, `transforms on land and stands on its legs (form ${w.P.form}, height ${(w.P.y - gy).toFixed(2)})`);
  const x0 = w.P.x; run(w, { mx: -1, mz: 0 }, 2);
  const v = (x0 - w.P.x) / 2;
  ok(v > T.SPIDER.speed * 0.6 && v <= T.SPIDER.speed + 0.01, `walks at spider speed (${v.toFixed(1)} m/s)`);
  // flak and SAMs ignore it; they don't ignore the chopper
  const aa = (form) => {
    const q = fresh(); q.P.x = lz.x; q.P.z = lz.z; run(q, {}, 0.1);
    if (form === 'spider') { run(q, { xform: true }, DT); run(q, {}, T.XFORM_T + 0.2); }
    const f = spawnStruct(q, 'flak', q.P.x + 20, q.P.z), sm = spawnStruct(q, 'sam', q.P.x - 20, q.P.z);
    let shots = 0, locks = 0;
    for (let i = 0; i < 6 / DT; i++) { step(q, { aim: 0 }, DT); for (const e of q.events) { if (e.type === 'eshot' && e.kind === 'flak') shots++; if (e.type === 'samLock') locks++; } q.events.length = 0; }
    return { shots, locks, f, sm };
  };
  function spawnStruct(q, kind, x, z) { const gy = q.terrain.surface(x, z); const e = { kind: 'struct', type: kind, team: 'enemy', x, z, y: gy, yaw: 0, hp: 90, boxes: [{ x, z, c: 1, s: 0, hw: 1.8, hd: 1.8, y0: gy, y1: gy + 3 }], cool: 0 }; q.ents.push({ id: q.nextId++, vx: 0, vy: 0, vz: 0, r: 1, h: 1, air: false, alive: true, deadT: 0, hitT: 0, maxHp: 90, ...e }); return q.ents[q.ents.length - 1]; }
  const heliAA = aa('heli'), spiderAA = aa('spider');
  ok(heliAA.shots > 0 && heliAA.locks > 0, `flak and SAMs engage the chopper (flak rounds ${heliAA.shots}, SAM locks ${heliAA.locks})`);
  ok(spiderAA.shots === 0 && spiderAA.locks === 0, `flak and SAMs ignore the spider (flak rounds ${spiderAA.shots}, SAM locks ${spiderAA.locks})`);
  // armor soaks more on legs
  const a0 = w.P.armor; hurtPlayer(w, 10, w.P.x, w.P.z, 'test');
  ok(Math.abs(a0 - w.P.armor - 10 * T.SPIDER.armorMul) < 1e-6, `spider armor takes ${(a0 - w.P.armor).toFixed(1)} of a 10-point hit`);
  // every weapon still works on legs
  for (const slot of ['gun', 'msl', 'mine']) {
    const q = fresh(); q.P.x = 0; q.P.z = 100; q.P.yaw = 0; run(q, {}, 0.1);
    run(q, { xform: true }, DT); run(q, {}, T.XFORM_T + 0.2);
    const tank = spawn(q, 'tank', q.P.x, q.P.z + (slot === 'mine' ? 0 : 22), { guard: true }); tank.spec = { ...tank.spec, range: 0, see: 0 };
    if (slot === 'mine') { tank.x = q.P.x; tank.z = q.P.z + 3; }
    const hp0 = tank.hp;
    for (let i = 0; i < 240; i++) { step(q, { [slot]: i < 30 }, DT); q.events.length = 0; }
    ok(q.P.form === 'spider' && tank.hp < hp0, `on legs, ${slot} damages a tank (${hp0} → ${Math.max(0, tank.hp).toFixed(0)})`);
  }
  // and back into the air
  run(w, { xform: true }, DT); run(w, {}, T.XFORM_T + 1.5);
  ok(w.P.form === 'heli' && w.P.y - w.terrain.surface(w.P.x, w.P.z) > T.CRUISE - 1.5 && !playerPos(w).ground, `transforms back and climbs to cruise (height ${(w.P.y - w.terrain.surface(w.P.x, w.P.z)).toFixed(1)})`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
