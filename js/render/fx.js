// Pooled particles (house rule: pools, not churn; no per-projectile lights). The pattern is gig-ambulance's
// and dr-mow's fx.js (a fixed pool, a kind per particle, update(dt), a shake value), drawn as one
// InstancedMesh per look so a big explosion is a handful of draw calls, not hundreds.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const FIRE = [0xfff6b0, 0xffd23a, 0xff8a2a, 0xe84a1a, 0x5a2a1a];

class Pool {
  constructor(scene, geo, material, n) {
    this.mesh = new THREE.InstancedMesh(geo, material, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(0xffffff));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.n = n; this.list = []; this.next = 0;
    for (let i = 0; i < n; i++) this.list.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, grow: 0, spin: 0, rot: 0, g: 0, drag: 0, color: 0xffffff, ramp: null });
  }
  get() { const p = this.list[this.next]; this.next = (this.next + 1) % this.n; p.on = true; p.life = 0; p.rot = Math.random() * 6; p.ramp = null; p.g = 0; p.drag = 0; p.grow = 0; p.spin = 0; p.floor = null; p.sx = p.sy = p.sz = 1; return p; }
  update(dt, look) {
    let k = 0;
    for (const p of this.list) {
      if (!p.on) continue;
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) { p.on = false; continue; }
      p.vy -= p.g * dt; const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.spin * dt;
      if (p.floor != null && p.y < p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; p.spin *= 0.5; }
      const sc = look(p, t);
      _e.set(p.rot, p.rot * 0.7, 0); _q.setFromEuler(_e);
      _s.set(sc * (p.sx || 1), sc * (p.sy || 1), sc * (p.sz || 1)); _p.set(p.x, p.y, p.z);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(k, _m);
      if (p.ramp) { const i = Math.min(p.ramp.length - 1, Math.floor(t * p.ramp.length)); _c.set(p.ramp[i]); } else _c.set(p.color);
      this.mesh.setColorAt(k, _c);
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    const ico = new THREE.IcosahedronGeometry(1, 0), cube = new THREE.BoxGeometry(1, 1, 1);
    this.fire = new Pool(scene, ico, new THREE.MeshBasicMaterial({ color: 0xffffff }), 360);
    this.smokeP = new Pool(scene, ico, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), 420);
    this.spark = new Pool(scene, cube, new THREE.MeshBasicMaterial({ color: 0xffffff }), 300);
    this.debris = new Pool(scene, cube, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), 200);
    this.debris.mesh.castShadow = true;
    const disc = new THREE.CircleGeometry(1, 10); disc.rotateX(-Math.PI / 2);
    this.scorchP = new Pool(scene, disc, new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, depthWrite: false }), 120);
    this.scorchP.mesh.renderOrder = 1;
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.8, 1, 24); ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; m.userData = { life: 0, max: 0.5, r: 6 }; scene.add(m); this.rings.push(m);
    }
    this.shake = 0;
    this.flashK = 0; // whole-screen flash from big explosions (the view adds it to the light)
  }
  clear() { for (const P of [this.fire, this.smokeP, this.spark, this.debris, this.scorchP]) for (const p of P.list) p.on = false; for (const r of this.rings) r.visible = false; this.shake = 0; }

  // ---------------------------------------------------------------- emitters
  explosion(x, y, z, size = 3, ground = null) {
    const n = Math.min(26, 6 + size * 3);
    for (let i = 0; i < n; i++) {
      const p = this.fire.get(), a = Math.random() * 6.28, u = Math.random() * 2 - 1, sp = (2 + Math.random() * 4) * size * 0.55;
      p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * Math.sqrt(1 - u * u) * sp; p.vy = Math.abs(u) * sp * 0.8 + 1; p.vz = Math.sin(a) * Math.sqrt(1 - u * u) * sp;
      p.max = 0.35 + Math.random() * 0.35; p.size = (0.5 + Math.random() * 0.6) * size * 0.45; p.drag = 3; p.ramp = FIRE;
    }
    const big = size >= 4;
    for (let i = 0; i < Math.min(16, (big ? 4 : 1) + size * (big ? 2 : 1)); i++) this.smoke(x + (Math.random() - 0.5) * size, y + Math.random() * size * 0.5, z + (Math.random() - 0.5) * size, size * (big ? 0.45 : 0.3), Math.random() < (big ? 0.5 : 0.25));
    this.sparks(x, y, z, Math.min(30, 6 + size * 3), 0xffe27a, size * 4);
    if (size >= 2.5) for (let i = 0; i < Math.min(14, size * 2); i++) {
      const p = this.debris.get(), a = Math.random() * 6.28, sp = 4 + Math.random() * size * 2;
      p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * sp; p.vy = 6 + Math.random() * size * 2.5; p.vz = Math.sin(a) * sp; p.g = 22; p.spin = (Math.random() - 0.5) * 14;
      p.max = 1.6 + Math.random(); p.size = 0.25 + Math.random() * 0.25 * size * 0.4; p.color = [0x2a2622, 0x4a4440, 0x6a5a40][i % 3]; p.floor = ground ?? -100;
      p.sx = 1 + Math.random(); p.sy = 0.5; p.sz = 1 + Math.random();
    }
    this.ring(x, ground != null && y - ground < 3 ? ground + 0.2 : y, z, size * 2.2);
    if (ground != null && y - ground < size) this.scorch(x, ground, z, size * 0.9);
    this.shake = Math.max(this.shake, Math.min(1.2, size * 0.09));
    this.flashK = Math.max(this.flashK, Math.min(1, size * 0.08));
  }
  smoke(x, y, z, size = 1, dark = false, rise = 2.5, life = 1.8) {
    const p = this.smokeP.get();
    p.x = x; p.y = y; p.z = z; p.vx = (Math.random() - 0.5) * 1.2; p.vy = rise * (0.6 + Math.random() * 0.6); p.vz = (Math.random() - 0.5) * 1.2;
    p.max = life * (0.7 + Math.random() * 0.6); p.size = size * (0.6 + Math.random() * 0.5); p.grow = 1.6; p.drag = 0.6;
    p.color = dark ? 0x2a2624 : 0x8a8480; p.ramp = dark ? [0x3a3230, 0x2a2624, 0x3a3634, 0x5a5654] : [0xb0aaa4, 0x9a948e, 0x8a8480, 0x7a7470];
  }
  puff(x, y, z, vx = 0, vz = 0, size = 0.4) { // exhaust / missile trails: small, quick
    const p = this.smokeP.get();
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = 0.4; p.vz = vz; p.max = 0.6 + Math.random() * 0.4; p.size = size; p.grow = 1.5; p.drag = 2;
    p.ramp = [0xd8d2cc, 0xb8b2ac, 0xa8a29c];
  }
  flame(x, y, z, size = 0.35) {
    const p = this.fire.get();
    p.x = x; p.y = y; p.z = z; p.vx = (Math.random() - 0.5); p.vy = Math.random(); p.vz = (Math.random() - 0.5); p.max = 0.12 + Math.random() * 0.1; p.size = size; p.ramp = FIRE;
  }
  glowPuff(x, y, z, color, size = 0.4) {
    const p = this.fire.get();
    p.x = x; p.y = y; p.z = z; p.vx = p.vy = p.vz = 0; p.max = 0.15; p.size = size; p.color = color;
  }
  sparks(x, y, z, n = 6, color = 0xffe27a, speed = 8) {
    for (let i = 0; i < n; i++) {
      const p = this.spark.get(), a = Math.random() * 6.28, u = Math.random();
      p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * speed * (0.3 + Math.random() * 0.7); p.vy = speed * (0.2 + u * 0.8); p.vz = Math.sin(a) * speed * (0.3 + Math.random() * 0.7);
      p.g = 20; p.max = 0.25 + Math.random() * 0.35; p.size = 0.12; p.color = color; p.sx = 1; p.sy = 1; p.sz = 2.5;
    }
  }
  dust(x, y, z, n = 4, size = 0.8, color = 0xc8b898) {
    for (let i = 0; i < n; i++) {
      const p = this.smokeP.get(), a = Math.random() * 6.28;
      p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * 3; p.vy = 0.8 + Math.random(); p.vz = Math.sin(a) * 3; p.max = 0.8 + Math.random() * 0.5; p.size = size; p.grow = 1.4; p.drag = 2.5; p.color = color;
    }
  }
  splash(x, z, size = 2) {
    for (let i = 0; i < 6 + size * 3; i++) {
      const p = this.spark.get(), a = Math.random() * 6.28, sp = 2 + Math.random() * size * 2;
      p.x = x; p.y = 0.2; p.z = z; p.vx = Math.cos(a) * sp; p.vy = 4 + Math.random() * size * 4; p.vz = Math.sin(a) * sp; p.g = 18; p.max = 0.7 + Math.random() * 0.4; p.size = 0.22 + size * 0.05; p.color = 0xe8f8ff; p.sx = p.sy = p.sz = 1;
    }
    this.ring(x, 0.15, z, size * 2.2, 0xe8f8ff);
  }
  scorch(x, y, z, r) {
    const p = this.scorchP.get();
    p.x = x; p.y = y + 0.06; p.z = z; p.vx = p.vy = p.vz = 0; p.max = 30; p.size = r; p.color = 0x161210; p.rot = 0;
  }
  ring(x, y, z, r, color = 0xfff0c0) {
    const m = this.rings.find((q) => !q.visible) || this.rings[0];
    m.position.set(x, y, z); m.visible = true; m.material.color.set(color);
    m.userData.life = 0; m.userData.max = 0.45; m.userData.r = r;
  }

  update(dt) {
    this.fire.update(dt, (p, t) => p.size * (t < 0.2 ? 0.5 + t * 2.5 : 1 - (t - 0.2) * 0.9));
    this.smokeP.update(dt, (p, t) => p.size * (1 + p.grow * t) * (t > 0.75 ? (1 - t) * 4 : 1));
    this.spark.update(dt, (p, t) => p.size * (1 - t * 0.6));
    this.debris.update(dt, (p, t) => p.size * (t > 0.85 ? (1 - t) / 0.15 : 1));
    this.scorchP.update(dt, (p, t) => p.size * (t > 0.85 ? (1 - t) / 0.15 : 1));
    for (const m of this.rings) {
      if (!m.visible) continue;
      const u = m.userData, t = (u.life += dt) / u.max;
      if (t >= 1) { m.visible = false; continue; }
      m.scale.setScalar(0.3 + t * u.r); m.material.opacity = 0.7 * (1 - t);
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.flashK = Math.max(0, this.flashK - dt * 3);
  }
}
