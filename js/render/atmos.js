// Atmosphere, all cheap:
//   cloud shadows  invisible cloud blobs that only cast shadows (colorWrite off), through a 50 % checker
//                  alpha so the shadow they throw is a dithered half-shade drifting over the land
//   glow points    one THREE.Points per size for every lamp, beacon, runway light and floodlight: additive
//                  soft sprites, a single draw call each (night missions light up, day ones keep the beacons)
//   gulls          a handful of birds wheeling over the coast (one InstancedMesh, wings flapping)
//   dust           wind-blown dust in the desert missions
//   snow           a blizzard (mission 6): flakes in a box that follows the camera focus, one THREE.Points
import * as THREE from 'three';
import { THEMES } from './terrain-view.js';
import { cityX, cityZ } from '../sim/levels/common.js';
import { mulberry32 } from '../utils.js';
import { LITE } from '../retro.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

function checker() {
  const c = document.createElement('canvas'); c.width = c.height = 4;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 4, 4); g.fillStyle = '#fff';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2 === 0) g.fillRect(x, y, 1, 1);
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); // cells ~0.5 m: coarser than a shadow texel, so the dither survives
  return t;
}
function cloudGeometry(rng) {
  const parts = [];
  const n = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.scale(5 + rng() * 6, 1.5 + rng(), 4 + rng() * 5);
    g.translate((rng() - 0.5) * 16, (rng() - 0.5) * 2, (rng() - 0.5) * 12);
    parts.push(g.toNonIndexed());
  }
  const pos = [], uv = [];
  for (const g of parts) { pos.push(...g.attributes.position.array); uv.push(...g.attributes.uv.array); g.dispose(); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.computeVertexNormals();
  return out;
}
function gullGeometry() {
  const p = [0, 0, 0.5, 0, 0, -0.4, -1.1, 0.35, -0.1, 0, 0, 0.5, 1.1, 0.35, -0.1, 0, 0, -0.4, 0, 0.02, 0.6, -0.12, 0, -0.2, 0.12, 0, -0.2];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals();
  return g;
}

export function buildAtmos(w, glowTex, townLamps = []) {
  const L = w.level, TH = THEMES[L.theme], T = w.terrain, group = new THREE.Group(), rng = mulberry32(31), dark = !!TH.night;
  const st = { group, clouds: [], gulls: null, dust: L.theme === 'dusk' || L.theme === 'night' || L.theme === 'vegas', wind: [3.2, 1.4] };

  // ---- cloud shadows (day and dusk, and only where there are shadows at all; the blizzard is overcast)
  if (!dark && !LITE && !TH.snow) {
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: checker(), alphaTest: 0.5 });
    const hide = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(cloudGeometry(rng), hide);
      m.castShadow = true; m.customDepthMaterial = depth; m.frustumCulled = false;
      m.userData.off = [(rng() - 0.5) * 200, (rng() - 0.5) * 200, 42 + rng() * 14];
      group.add(m); st.clouds.push(m);
    }
  }

  // ---- glow points
  const small = [], big = [];
  const add = (list, x, y, z, color) => list.push({ x, y, z, c: new THREE.Color(color) });
  const gy = (x, z) => T.surface(x, z);
  const rot = (e, lx, lz) => { const c = Math.cos(e.yaw), s = Math.sin(e.yaw); return [e.x + lx * c + lz * s, e.z - lx * s + lz * c]; };
  for (const e of w.ents) {
    if (e.kind !== 'struct') continue;
    const y = e.y;
    if (e.type === 'datacenter') {
      if (e.style === 'core') { const [x, z] = rot(e, 5.5, 5.5); add(small, x, y + 32.4, z, 0xff3030); add(big, e.x, y + 25, e.z, [0x2be8ff, 0xff2bd6, 0x3dff7a, 0xffb02b][e.tint % 4]); }
      else { const [x, z] = rot(e, 8.5, -10.5); add(small, x, y + 17.5, z, 0xff3030); for (const [lx, lz] of [[-14, 9], [14, 9], [-14, -9], [14, -9]]) { const [fx, fz] = rot(e, lx, lz); add(big, fx, y + 6.2, fz, 0xfff2c8); } }
    } else if (e.type === 'generator') add(big, e.x, y + 8.6, e.z, 0xff3df0);
    else if (e.type === 'radar') add(small, e.x + 3, y + 4.2, e.z + 3, 0xff3030);
    else if (e.type === 'ctower') add(small, e.x, y + 20.2, e.z, 0xff3030);
    else if (e.type === 'vault') for (const lx of [-14, -7, 0, 7, 14]) add(small, e.x + lx, y + 10.6, e.z + 12.4, 0xffd23a);
    else if (e.type === 'casino') { add(big, e.x, y + 10, e.z + 10, [0xffd23a, 0xff2bd6, 0x2be8ff, 0x3dff7a][(e.tint || 0) % 4]); add(small, e.x, y + (e.style === 'needle' ? 65.5 : e.style === 'pyramid' ? 25 : 30), e.z, 0xff3030); }
    else if (e.type === 'barracks' || e.type === 'depot') add(big, e.x + 5, y + 4.5, e.z + 4, 0xfff0c0);
    else if (e.type === 'boomtower') add(small, e.x, y + 17.4, e.z, 0xff3030);
  }
  for (const b of w.solids) if (b.kind === 'tower' || b.kind === 'crane') add(small, b.x, b.y1 + 0.6, b.z, 0xff3030);
  if (dark || L.theme === 'dusk') {
    for (const [x, y, z] of townLamps) add(big, x, y, z, 0xffe8a8);
    const R = L.decor?.runway;
    if (R) for (let x = R.x0; x <= R.x1; x += 12) for (const s of [-1, 1]) add(small, x, gy(x, R.z + s * (R.w / 2 + 0.4)) + 0.3, R.z + s * (R.w / 2 + 0.4), 0x7ad8ff);
    if (L.lz && !L.lz.follow) for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, x = L.lz.x + Math.cos(a) * L.lz.r * 0.82, z = L.lz.z + Math.sin(a) * L.lz.r * 0.82; add(small, x, gy(x, z) + 0.4, z, k % 2 ? 0x3ddc84 : 0xffd23a); }
    if (L.city?.night) for (let r = 1; r < L.city.rows; r += 2) for (const s of [-1, 1]) add(big, cityX(L.city, 3) + s * 7.4, L.city.y + 5, cityZ(L.city, r), 0xffd8a0);
  }
  const pts = (list, size, op) => {
    if (!list.length) return null;
    const g = new THREE.BufferGeometry(), p = new Float32Array(list.length * 3), c = new Float32Array(list.length * 3);
    list.forEach((q, i) => { p.set([q.x, q.y, q.z], i * 3); c.set([q.c.r * op, q.c.g * op, q.c.b * op], i * 3); });
    g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ size, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false }));
    m.frustumCulled = false; m.renderOrder = 6;
    group.add(m);
    return m;
  };
  pts(small, dark ? 2.6 : 1.8, dark ? 1 : 0.8);
  pts(big, dark ? 9 : 6, dark ? 0.9 : 0.55);

  // ---- the blizzard: flakes falling and blowing through a box round the focus (positions wrap in the shader)
  if (TH.snow) {
    const n = LITE ? 1400 : 3200, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) p.set([(rng() - 0.5) * 120, rng() * 40, (rng() - 0.5) * 120], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.85, map: glowTex, transparent: true, depthWrite: false, opacity: 0.95, sizeAttenuation: true, fog: false });
    const u = { uOff: { value: new THREE.Vector3() } };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uOff = u.uOff;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uOff;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 q = position + uOff;
          transformed = vec3(mod(q.x + 60.0, 120.0) - 60.0, mod(q.y, 40.0), mod(q.z + 60.0, 120.0) - 60.0);
          transformed.x += sin(position.y * 0.7 + uOff.y * 0.3) * 0.6;`);
    };
    const flakes = new THREE.Points(g, m); flakes.frustumCulled = false; flakes.renderOrder = 7;
    group.add(flakes);
    st.snow = { flakes, u, off: new THREE.Vector3() };
    st.wind = [6, 2.5];
  }

  // ---- gulls over the coast
  if (L.theme === 'tropic' || L.theme === 'strait') {
    const n = 12, gm = new THREE.InstancedMesh(gullGeometry(), new THREE.MeshLambertMaterial({ color: 0xf4f4f0, side: THREE.DoubleSide }), n);
    gm.frustumCulled = false; gm.castShadow = true;
    const birds = [];
    for (let i = 0; i < n; i++) { const a = rng() * 6.28, r = L.island.half * (0.5 + rng() * 0.25); birds.push({ cx: Math.cos(a) * r, cz: Math.sin(a) * r, r: 18 + rng() * 22, sp: (0.25 + rng() * 0.2) * (rng() < 0.5 ? -1 : 1), a: rng() * 6.28, y: 20 + rng() * 10, f: rng() * 6 }); }
    group.add(gm);
    st.gulls = { mesh: gm, birds };
  }
  return st;
}

export function updateAtmos(st, w, fx, focus, dt, t) {
  if (!st) return;
  for (const c of st.clouds) {
    const o = c.userData.off;
    o[0] += st.wind[0] * dt; o[1] += st.wind[1] * dt;
    if (o[0] > 110) o[0] -= 220; if (o[0] < -110) o[0] += 220; if (o[1] > 110) o[1] -= 220; if (o[1] < -110) o[1] += 220;
    c.position.set(focus.x + o[0], focus.y + o[2], focus.z + o[1]);
  }
  if (st.gulls) {
    const { mesh, birds } = st.gulls;
    birds.forEach((b, i) => {
      b.a += b.sp * dt;
      const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r, yaw = Math.atan2(-Math.sin(b.a) * b.sp, Math.cos(b.a) * b.sp);
      const flap = Math.sin(t * 7 + b.f), glide = Math.sin(t * 0.4 + b.f) > 0.3;
      _e.set(0, yaw, Math.sign(b.sp) * 0.25); _q.setFromEuler(_e); _s.set(1.2, glide ? 0.4 : flap * 1.2, 1.2); _p.set(x, w.terrain.surface(x, z) + b.y, z);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  if (st.snow) { // flakes drift down and downwind; the box follows the focus, so the snow never runs out
    const S = st.snow;
    S.off.x += st.wind[0] * dt; S.off.y -= 3.2 * dt; S.off.z += st.wind[1] * dt;
    S.flakes.position.set(focus.x, focus.y - 6, focus.z);
    S.u.uOff.value.set(S.off.x - focus.x, S.off.y - focus.y, S.off.z - focus.z);
  }
  if (st.dust && Math.random() < dt * 2.5) {
    const x = focus.x + (Math.random() - 0.5) * 70, z = focus.z + (Math.random() - 0.5) * 70, y = w.terrain.surface(x, z);
    if (w.terrain.height(x, z) > 0.5) for (let i = 0; i < 3; i++) fx.puff(x + i * 1.5, y + 0.6, z + i * 0.5, st.wind[0] * 1.6, st.wind[1] * 1.6, 0.9);
  }
}
