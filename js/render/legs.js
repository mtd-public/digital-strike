// Six-legged walking rig: the player's spider mode and the enemy's WIDOW walkers. Each leg is two bones
// (femur up and out to a high knee, tibia down to the foot: a spider's stance) solved with two-bone IK
// every frame. Feet are planted in the world and step, in alternating tripods, when they drift too far from
// where they would rest under the moving body. legK folds the whole rig: 0 tucks the feet up under the
// hub (the chopper), 1 stands on them.
import * as THREE from 'three';
import { mat, inked, plain, G, OUTLINE } from './kit.js';

const Z = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _u = new THREE.Vector3(), _n = new THREE.Vector3(), _k = new THREE.Vector3(), _r = new THREE.Vector3();
const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const ANG = [0.7, -0.7, 1.57, -1.57, 2.4, -2.4]; // front, middle, rear pairs (rad from the nose)
const TRIPOD = [0, 1, 1, 0, 0, 1]; // legs step in two alternating sets of three

export const LEG_STYLE = {
  apache: { metal: 0x30332b, plate: 0x66703f, joint: 0x9a9470, glow: null },
  alien: { metal: 0x1d2230, plate: 0x6c7a92, joint: 0x3dfff0, glow: 0x3dfff0 },
  widow: { metal: 0x2a2624, plate: 0x6a5a48, joint: 0x8a3a30, glow: 0xff3a2a },
};

export class LegRig {
  // hipY: hips below the body centre; hipR / footR: hip ring and resting foot ring radii; L1 / L2: bone lengths
  constructor({ style = LEG_STYLE.apache, s = 1, hipY = -0.95, hipR = 0.95, footR = 3.4, L1 = 1.9, L2 = 2.6, hub = true } = {}) {
    Object.assign(this, { s, hipY: hipY * s, hipR: hipR * s, footR: footR * s, L1: L1 * s, L2: L2 * s });
    this.group = new THREE.Group();
    this.body = new THREE.Group(); this.group.add(this.body); // hub and hips: turns with the walking direction
    const metal = mat(style.metal, { roughness: 0.5, metalness: 0.4 }), plate = mat(style.plate), joint = style.glow ? mat(style.joint, { emissive: style.joint, emissiveIntensity: 0.8 }) : mat(style.joint);
    if (hub) { // the leg ring under the belly: a squat drum with a hazard band and six hip housings
      const h = new THREE.Group();
      h.add(inked(G.cyl(this.hipR * 1.12, this.hipR * 0.9, 0.42 * s, 12), metal, OUTLINE.thin));
      const band = plain(G.cyl(this.hipR * 1.14, this.hipR * 1.14, 0.1 * s, 12), mat(0xd8a020)); band.position.y = 0.12 * s; h.add(band);
      for (const a of ANG) { const hh = plain(new THREE.BoxGeometry(0.42 * s, 0.38 * s, 0.5 * s), plate); hh.position.set(Math.sin(a) * this.hipR, 0, Math.cos(a) * this.hipR); hh.rotation.y = a; h.add(hh); }
      if (style.glow) { const ring = new THREE.Mesh(G.torus(this.hipR * 1.0, 0.05 * s, 4, 20), new THREE.MeshBasicMaterial({ color: style.glow })); ring.rotation.x = Math.PI / 2; ring.position.y = -0.2 * s; h.add(ring); }
      h.position.y = this.hipY; this.body.add(h); this.hub = h;
    }
    // bones: unit length along +Z from the joint, scaled to length each frame
    const bone = (r0, r1, material) => { const g = G.cyl(r1, r0, 1, 6); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5); const m = inked(g, material, OUTLINE.thin); return m; };
    this.legs = ANG.map((a, i) => {
      const upper = bone(0.27 * s, 0.2 * s, plate), lower = bone(0.19 * s, 0.07 * s, metal);
      const knee = plain(G.sphere(0.27 * s, 8, 6), joint), foot = plain(G.cone(0.16 * s, 0.36 * s, 6), metal);
      foot.rotation.x = Math.PI;
      this.group.add(upper, lower, knee, foot);
      return { a, i, set: TRIPOD[i], upper, lower, knee, foot, pos: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: -1 };
    });
    this.planted = false; this.yaw = 0; this.last = new THREE.Vector3(); this.steps = 0;
    this.onStep = null; // (x, y, z) => void: dust and the thud
  }

  // Pose the rig: body centre (x, y, z), walking yaw, velocity, fold amount, ground height function.
  update(dt, x, y, z, yaw, vx, vz, legK, ground) {
    this.group.visible = legK > 0.01;
    if (!this.group.visible) { this.planted = false; return; }
    this.yaw = yaw;
    this.body.position.set(x, y, z); this.body.rotation.y = yaw;
    if (this.hub) this.hub.scale.setScalar(Math.max(0.01, ease(legK / 0.3)));
    const c = Math.cos(yaw), sn = Math.sin(yaw), sp = Math.hypot(vx, vz), k = ease(legK);
    if (this.last.distanceToSquared(_a.set(x, y, z)) > 64) this.planted = false; // teleported (respawn): plant afresh
    this.last.set(x, y, z);
    const stride = 1.25 * this.s, stepT = Math.max(0.1, 0.24 - sp * 0.012), lift = 0.75 * this.s;
    const stepping = [false, false];
    for (const L of this.legs) if (L.t >= 0) stepping[L.set] = true;
    for (const L of this.legs) {
      const lx = Math.sin(L.a), lz = Math.cos(L.a);
      const hip = _a.set(x + (lx * c + lz * sn) * this.hipR, y + this.hipY, z + (-lx * sn + lz * c) * this.hipR);
      // where the foot rests under the body, led a little by the velocity
      const rx = x + (lx * c + lz * sn) * this.footR + vx * 0.22, rz = z + (-lx * sn + lz * c) * this.footR + vz * 0.22;
      const rest = _r.set(rx, ground(rx, rz), rz);
      if (legK < 1 || !this.planted) {
        // folding: the foot comes up out of the ground toward a tuck beside the hip
        const tuck = _b.set(hip.x + (lx * c + lz * sn) * 0.5 * this.s, hip.y - 0.35 * this.s, hip.z + (-lx * sn + lz * c) * 0.5 * this.s);
        L.pos.copy(tuck).lerp(rest, k); L.t = -1;
      } else if (L.t >= 0) {
        L.t += dt / stepT;
        if (L.t >= 1) { L.t = -1; L.pos.copy(L.to); this.steps++; this.onStep?.(L.pos.x, L.pos.y, L.pos.z); }
        else { L.pos.lerpVectors(L.from, L.to, L.t); L.pos.y += Math.sin(L.t * Math.PI) * lift; }
      } else if (!stepping[L.set ^ 1] && L.pos.distanceTo(rest) > stride) {
        L.t = 0; L.from.copy(L.pos); L.to.copy(rest).addScaledVector(_n.set(vx, 0, vz), 0.12); L.to.y = ground(L.to.x, L.to.z);
        stepping[L.set] = true;
      }
      this.solve(L, hip);
    }
    if (legK >= 1) this.planted = true;
  }

  // Two-bone IK in the vertical plane through hip and foot; the knee bends up and out.
  solve(L, hip) {
    const foot = L.pos, d0 = hip.distanceTo(foot), L1 = this.L1, L2 = this.L2;
    const d = Math.min(L1 + L2 - 1e-3, Math.max(Math.abs(L1 - L2) + 1e-3, d0));
    _u.subVectors(foot, hip).normalize();
    if (d0 < 1e-4) _u.set(0, -1, 0);
    _n.copy(UP).addScaledVector(_u, -UP.dot(_u));
    if (_n.lengthSq() < 1e-6) _n.set(Math.sin(L.a + this.yaw), 0, Math.cos(L.a + this.yaw)); else _n.normalize();
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    _k.copy(hip).addScaledVector(_u, a).addScaledVector(_n, h);
    const end = _b.copy(hip).addScaledVector(_u, d); // the foot, pulled in if out of reach
    L.upper.position.copy(hip); L.upper.quaternion.setFromUnitVectors(Z, _a.subVectors(_k, hip).normalize()); L.upper.scale.set(1, 1, L1);
    L.lower.position.copy(_k); L.lower.quaternion.setFromUnitVectors(Z, _a.subVectors(end, _k).normalize()); L.lower.scale.set(1, 1, Math.max(0.01, _k.distanceTo(end)));
    L.knee.position.copy(_k);
    L.foot.position.copy(end).y += 0.12 * this.s;
  }
}
