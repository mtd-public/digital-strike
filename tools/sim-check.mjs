// Headless sim checks (house rule: every invariant gets a check). Runs in node: the sim imports no
// three.js and no DOM.  Usage:  node tools/sim-check.mjs [levelId]
//
//   1. every mission builds, nothing spawns inside a wall or in the sea that shouldn't
//   2. the autopilot (god mode) finishes every mission inside its time budget: the proof it can be won
//   3. the same run never produces a NaN position, and every weapon actually does damage
//   4. on-foot rules: get out, walk, get back in (mission 3 does it for real)
//   5. the autopilot without god mode, for the record (not asserted: it's a bot, not a player)
import { LEVELS } from '../js/sim/levels/index.js';
import { createWorld, step, blocked, playerPos } from '../js/sim/world.js';
import { autopilot } from '../js/sim/autopilot.js';
import { CRAFT } from '../js/sim/craft.js';

const only = process.argv[2];
const DT = 1 / 60;
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  FAIL', msg); } else console.log('  ok  ', msg); };
const BUDGET = { firewall: 900, strait: 420, heist: 700, area51: 900, vegas: 900 };

function run(level, opts, limit) {
  const w = createWorld(level, opts), mem = {};
  let nan = false, steps = 0, exits = 0, enters = 0;
  const dmgByKind = {};
  for (; steps < limit / DT && w.phase === 'play'; steps++) {
    step(w, autopilot(w, mem), DT);
    const p = playerPos(w);
    if (!Number.isFinite(p.x + p.y + p.z)) nan = true;
    for (const e of w.events) {
      if (e.type === 'exit') exits++;
      if (e.type === 'enter') enters++;
      if (e.type === 'shot') dmgByKind[e.kind] = (dmgByKind[e.kind] || 0) + 1;
    }
    w.events.length = 0;
  }
  return { w, nan, t: w.t, exits, enters, fired: dmgByKind };
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

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
