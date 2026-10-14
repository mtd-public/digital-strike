// Ground dressing that the sim never sees: grass tufts that sway in the wind, boulders, and dirt tracks
// worn along the routes the tanks and technicals drive. Each is one instanced or merged mesh.
import * as THREE from 'three';
import { THEMES } from './terrain-view.js';
import { mulberry32 } from '../utils.js';
import { LITE } from '../retro.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

// A tuft: five thin blades fanned out, dark at the root, light at the tip.
function tuftGeometry() {
  const pos = [], col = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + i * 0.4, lean = 0.3 + (i % 2) * 0.2, h = 0.9 + (i % 3) * 0.25;
    const bx = Math.cos(a) * 0.08, bz = Math.sin(a) * 0.08, px = -Math.sin(a) * 0.13, pz = Math.cos(a) * 0.13;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, Math.cos(a) * lean, h, Math.sin(a) * lean);
    col.push(0.72, 0.72, 0.72, 0.72, 0.72, 0.72, 1.25, 1.25, 1.15);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
// A boulder: a jittered icosahedron, shaded darker underneath.
function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 0).toNonIndexed(), p = g.attributes.position, col = [];
  const r = mulberry32(5), jitter = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!jitter.has(key)) jitter.set(key, 0.75 + r() * 0.5);
    const k = jitter.get(key);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
    const sh = 0.7 + Math.max(0, p.getY(i)) * 0.4;
    col.push(sh, sh, sh);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function buildDecor(w) {
  const L = w.level, T = w.terrain, TH = THEMES[L.theme], group = new THREE.Group(), rng = mulberry32(99);
  const pal = L.decor?.palms || 'tropic';
  const busy = [...w.solids.map((b) => [b.x, b.z, Math.max(b.hw, b.hd) + 3]), ...w.ents.filter((e) => e.kind === 'struct').map((e) => [e.x, e.z, 12])];
  const inPad = (x, z, m = 2) => (L.city && isCity(L, x, z)) || L.island.flats.some((f) => (f.paved || f.lake) && x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m);
  const free = (x, z) => !busy.some(([bx, bz, r]) => Math.hypot(bx - x, bz - z) < r);

  // ---- grass tufts, in clumps
  const nT = Math.round(({ tropic: 2600, pine: 2600, desert: 900, vegas: 700 }[pal] ?? 1500) * (LITE ? 0.4 : 1));
  const dry = pal === 'desert' || pal === 'vegas';
  const tufts = new THREE.InstancedMesh(tuftGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), nT);
  tufts.receiveShadow = true; tufts.frustumCulled = false;
  const base = new THREE.Color(dry ? TH.dirt : TH.grass), alt = new THREE.Color(dry ? TH.sand : TH.grass2);
  let k = 0;
  for (let tries = 0; tries < nT * 3 && k < nT;) {
    const cx = (rng() * 2 - 1) * (L.island.half - 30), cz = (rng() * 2 - 1) * (L.island.half - 30); tries++;
    const h0 = T.height(cx, cz);
    if (h0 < 1.6 || h0 > 26 || T.slope(cx, cz) > 0.4 || inPad(cx, cz) || !free(cx, cz)) continue;
    const clump = 5 + Math.floor(rng() * 9);
    for (let j = 0; j < clump && k < nT; j++) {
      const x = cx + (rng() - 0.5) * 7, z = cz + (rng() - 0.5) * 7, h = T.height(x, z);
      if (h < 1.4 || inPad(x, z, 0) || !free(x, z)) continue;
      const s = 0.9 + rng() * 1.0;
      _e.set(0, rng() * 6.28, 0); _q.setFromEuler(_e); _s.set(s, s * (0.8 + rng() * 0.5), s); _p.set(x, h - 0.05, z);
      tufts.setMatrixAt(k, _m.compose(_p, _q, _s));
      tufts.setColorAt(k, _c.copy(base).lerp(alt, rng()).multiplyScalar(0.85 + rng() * 0.3));
      k++;
    }
  }
  tufts.count = k;
  // the wind: blades lean with a travelling gust (tips only; roots stay put)
  const wind = { uTime: { value: 0 } };
  tufts.material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        #else
          vec2 ip = vec2(0.0);
        #endif
        float gust = sin(ip.x * 0.08 + ip.y * 0.05 + uTime * 1.6) * 0.5 + 0.5;
        transformed.x += position.y * (0.12 + gust * 0.22) * sin(uTime * 2.3 + ip.x);
        transformed.z += position.y * (0.08 + gust * 0.16) * cos(uTime * 1.9 + ip.y);`);
  };
  group.add(tufts);

  // ---- boulders: on slopes, the beach, and scattered over the desert
  const nR = { tropic: 160, pine: 260, desert: 280, vegas: 120 }[pal] ?? 160;
  const rocks = new THREE.InstancedMesh(rockGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), nR);
  rocks.castShadow = true; rocks.receiveShadow = true; rocks.frustumCulled = false;
  const rc = new THREE.Color(TH.rock), rc2 = new THREE.Color(TH.sand);
  k = 0;
  for (let tries = 0; tries < nR * 20 && k < nR; tries++) {
    const x = (rng() * 2 - 1) * (L.island.half - 30), z = (rng() * 2 - 1) * (L.island.half - 30), h = T.height(x, z), sl = T.slope(x, z);
    const ok = (sl > 0.3 && h > 1) || (h > 0.2 && h < 1.6 && rng() < 0.35) || (dry && h > 1 && rng() < 0.3);
    if (!ok || inPad(x, z, 3) || !free(x, z)) continue;
    const s = 0.5 + rng() * rng() * 2.6;
    _e.set(rng() * 0.6, rng() * 6.28, rng() * 0.6); _q.setFromEuler(_e); _s.set(s * (0.8 + rng() * 0.6), s, s * (0.8 + rng() * 0.6)); _p.set(x, h - s * 0.25, z);
    rocks.setMatrixAt(k, _m.compose(_p, _q, _s));
    rocks.setColorAt(k, _c.copy(rc).lerp(rc2, rng() * 0.35).multiplyScalar(0.85 + rng() * 0.3));
    k++;
  }
  rocks.count = k;
  group.add(rocks);

  // ---- dirt tracks along the vehicle routes outside the city
  const paths = [...(L.tanks || []).filter((t) => t.path).map((t) => t.path), ...(L.technicals || []).map((t) => t.path)]
    .filter((p) => !(L.city && p.every(([x, z]) => isCity(L, x, z))));
  if (paths.length) {
    const pos = [], col = [], dirt = new THREE.Color(TH.dirt).multiplyScalar(0.82), rut = new THREE.Color(TH.dirt).multiplyScalar(0.62);
    for (const path of paths) {
      const pts = [...path, path[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L2 = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L2 / 3));
        const nx = -(bz - az) / (L2 || 1), nz = (bx - ax) / (L2 || 1);
        for (let j = 0; j < n; j++) {
          const t0 = j / n, t1 = (j + 1) / n;
          const strip = (o0, o1, c) => {
            const p = (t, o) => { const x = ax + (bx - ax) * t + nx * o, z = az + (bz - az) * t + nz * o; return [x, T.surface(x, z) + 0.07, z]; };
            const a = p(t0, o0), b = p(t0, o1), cc = p(t1, o1), d = p(t1, o0);
            pos.push(...a, ...b, ...cc, ...a, ...cc, ...d);
            for (let q = 0; q < 6; q++) col.push(c.r, c.g, c.b);
          };
          strip(-2.6, -1.1, dirt); strip(-1.1, -0.5, rut); strip(-0.5, 0.5, dirt); strip(0.5, 1.1, rut); strip(1.1, 2.6, dirt);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    group.add(m);
  }
  group.userData.wind = wind;
  return group;
}
function isCity(L, x, z) {
  const C = L.city;
  return x > C.x0 - 10 && x < C.x0 + (C.cols - 1) * 16 + 10 && z > C.z0 - 10 && z < C.z0 + (C.rows - 1) * 16 + 10;
}
