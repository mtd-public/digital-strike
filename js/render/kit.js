// The model kit, merged from two mtd-public games:
//   * dr-mow js/models.js: cached toy materials (mat), inverted-hull ink outlines (inked / OUTLINE / hullOf),
//     plain meshes and canvas textures. Used by the Apache and the other hand-built hero models.
//   * Vertical-Vantage js/render/geo.js: primitives with per-vertex colour (part / box / cyl / ball) collected
//     per material in a Kit and merged, so a whole data center is a handful of draw calls. Used for buildings.
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';
import { RETRO, seg, retroTex } from '../retro.js';

export const PAL = { ink: 0x241c33 };

// ------------------------------------------------------------------ dr-mow toy kit
const mats = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: RETRO, ...opts }); mats.set(key, m); }
  return m;
}
export function glowMat(color, opts = {}) {
  const key = 'glow' + color + JSON.stringify(opts);
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, ...opts }); mats.set(key, m); }
  return m;
}
function outline(thickness) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(PAL.ink) }, thickness: { value: thickness } },
    vertexShader: /* glsl */ `
      uniform float thickness;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        mv.xyz += normalize(normalMatrix * normal) * thickness;
        gl_Position = projectionMatrix * mv;
      }`,
    // #include must sit on its own line (mstr-gme-dsgn-tmpt docs/14).
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
  });
}
export const OUTLINE = { thin: outline(0.035), mid: outline(0.055), thick: outline(0.09) };
// Weld positions before building the hull so hard edges don't split (dr-mow docs/14 #22).
const hulls = new WeakMap();
export function hullOf(geo) {
  let h = hulls.get(geo);
  if (!h) {
    const bare = new THREE.BufferGeometry();
    bare.setAttribute('position', geo.getAttribute('position'));
    if (geo.index) bare.setIndex(geo.index);
    h = mergeVertices(bare, 1e-3);
    h.computeVertexNormals();
    hulls.set(geo, h);
  }
  return h;
}
// A mesh with an ink outline (none in Retro: the PS1 had no outlines).
export function inked(geo, material, line = OUTLINE.mid) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true; m.receiveShadow = true;
  if (RETRO) return m;
  const hull = new THREE.Mesh(hullOf(geo), line);
  hull.userData.hull = true;
  m.add(hull);
  return m;
}
export function plain(geo, material, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = shadow;
  return m;
}
export function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  return retroTex(t);
}
// Low-poly primitives: PS1 budgets in Retro.
const lo = (n, min) => seg(n, Math.max(min, Math.round(n / 2)));
export const G = {
  sphere: (r, w = 16, h = 10, ...rest) => new THREE.SphereGeometry(r, lo(w, 6), lo(h, 4), ...rest),
  cyl: (rt, rb, h, n = 12, ...rest) => new THREE.CylinderGeometry(rt, rb, h, lo(n, 5), 1, ...rest),
  cone: (r, h, n = 12) => new THREE.ConeGeometry(r, h, lo(n, 4)),
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  torus: (r, t, rs = 6, ts = 20) => new THREE.TorusGeometry(r, t, lo(rs, 3), lo(ts, 8)),
};

// ------------------------------------------------------------------ Vertical-Vantage vertex-colour kit
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
// Normalise a geometry for merging: non-indexed, position + normal + color.
export function prep(geo, color = 0xffffff) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  _c.set(color);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
// Place a primitive: o = { x, y, z, rx, ry, rz, sx, sy, sz, color }
export function part(geo, o = {}) {
  const g = prep(geo, o.color ?? 0xffffff);
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0); _q.setFromEuler(_e);
  _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1); _p.set(o.x || 0, o.y || 0, o.z || 0);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  return g;
}
export const box = (w, h, d, o) => part(new THREE.BoxGeometry(w, h, d), o);
export const cyl = (rt, rb, h, n, o) => part(new THREE.CylinderGeometry(rt, rb, h, seg(n, Math.max(5, Math.round(n / 2)))), o);
export const ball = (r, o, detail = 0) => part(new THREE.IcosahedronGeometry(r, detail), o);
export const cone = (r, h, n, o) => part(new THREE.ConeGeometry(r, h, seg(n, Math.max(4, Math.round(n / 2)))), o);
export function merge(list) {
  const ok = list.filter(Boolean);
  if (!ok.length) return null;
  const g = mergeGeometries(ok, false);
  for (const x of ok) x.dispose();
  return g;
}
export class Kit {
  constructor() { this.parts = {}; }
  add(key, ...geos) { (this.parts[key] ||= []).push(...geos.filter(Boolean)); return this; }
  build() { const out = {}; for (const k in this.parts) out[k] = merge(this.parts[k]); return out; }
}
// The four outward faces of a w × d footprint (Vertical-Vantage level-view.js faces()).
export function faces(w, d) {
  return [
    { nx: 0, nz: -1, tx: 1, tz: 0, half: d / 2, width: w },
    { nx: 0, nz: 1, tx: -1, tz: 0, half: d / 2, width: w },
    { nx: 1, nz: 0, tx: 0, tz: -1, half: w / 2, width: d },
    { nx: -1, nz: 0, tx: 0, tz: 1, half: w / 2, width: d },
  ];
}
// Shared vertex-colour materials: 'flat' (lit, faceted), 'glow' (unlit lights and neon), 'glass'.
export const KM = {
  flat: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  glass: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.85 }),
};
// Turn a Kit into meshes under a group.
export function kitMeshes(K, group, shadow = true) {
  const built = K.build();
  for (const k in built) {
    if (!built[k]) continue;
    const m = new THREE.Mesh(built[k], KM[k] || KM.flat);
    m.castShadow = shadow && k !== 'glow'; m.receiveShadow = k === 'flat';
    m.userData.kitKey = k;
    group.add(m);
  }
  return group;
}
export const _color = _c;

// Merge a hand-built model's static meshes into one mesh per material (its animated sub-groups in `keep`
// stay as they are): the Apache drops from ~60 draw calls to ~8.
export function compact(root, keep = []) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), skip = new Set(), buckets = new Map(), victims = [];
  for (const k of keep) if (k) k.traverse((o) => skip.add(o));
  root.traverse((o) => {
    if (!o.isMesh || skip.has(o) || o.material.transparent) return;
    const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'color') g.deleteAttribute(a);
    if (!g.attributes.color && o.material.vertexColors) return;
    const key = o.material.uuid + (g.attributes.color ? 'c' : '');
    if (!buckets.has(key)) buckets.set(key, { material: o.material, geos: [], shadow: o.castShadow });
    buckets.get(key).geos.push(g.index ? g.toNonIndexed() : g);
    victims.push(o);
  });
  for (const o of victims) { o.parent?.remove(o); }
  for (const { material, geos, shadow } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, material);
    m.castShadow = shadow; m.receiveShadow = true;
    root.add(m);
  }
  return root;
}
