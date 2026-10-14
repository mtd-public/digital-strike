// The island mesh (from the sim's sampled heights, so what you see is what the bullets hit), the sea, and
// each mission's palette and light. Vertex colours by height, slope and pad type, flat-shaded and
// noise-dithered like a PS1 ground texture.
import * as THREE from 'three';
import { fbm } from '../sim/terrain.js';
import { canvasTex } from './kit.js';

// sky, fog, sun, hemisphere, water, ground colours, and how dark it is (night: neon and window glow carry it)
export const THEMES = {
  tropic: { sky: 0x86c8f0, fog: 0x9fd2f0, fogNear: 170, fogFar: 430, sun: 0xfff1dc, sunI: 2.5, sunDir: [-0.45, 0.85, 0.35], hemiSky: 0xe0f0ff, hemiGround: 0x6a8a5a, hemiI: 1.35,
    water: 0x1f86c8, waterOp: 0.78, deep: 0x16507a, shallow: 0x58d0c8, sand: 0xe6d6a0, grass: 0x5aa83a, grass2: 0x46902e, rock: 0x8a8070, paved: 0x9a9890, lake: 0xc8c0b0, dirt: 0xa08a60 },
  strait: { sky: 0x9fb0c2, fog: 0xa8b6c4, fogNear: 160, fogFar: 420, sun: 0xf0f0ff, sunI: 2.0, sunDir: [-0.3, 0.8, -0.5], hemiSky: 0xd8e0ea, hemiGround: 0x4a5a48, hemiI: 1.25,
    water: 0x24546e, waterOp: 0.82, deep: 0x1a3a50, shallow: 0x4a8a90, sand: 0xb8b098, grass: 0x4a7a3a, grass2: 0x3a6a30, rock: 0x6e6c68, paved: 0x8a8a88, lake: 0xb0aaa0, dirt: 0x7a6a50 },
  dusk: { sky: 0xc88a78, fog: 0xc09080, fogNear: 150, fogFar: 400, sun: 0xffb070, sunI: 2.1, sunDir: [0.8, 0.45, 0.3], hemiSky: 0xffd8c0, hemiGround: 0x5a4a44, hemiI: 1.2,
    water: 0x2a4a7a, waterOp: 0.8, deep: 0x1a2a50, shallow: 0x4a7a8a, sand: 0xcfae80, grass: 0xa89a6a, grass2: 0x8e8458, rock: 0x8a5a48, paved: 0x8a827a, lake: 0xc8b8a0, dirt: 0xb08a62 },
  night: { sky: 0x101830, fog: 0x18223e, fogNear: 140, fogFar: 380, sun: 0xb0c4ff, sunI: 1.5, sunDir: [-0.4, 0.8, 0.45], hemiSky: 0x8090c0, hemiGround: 0x3a3a48, hemiI: 1.15, night: true,
    water: 0x1a2a4a, waterOp: 0.85, deep: 0x0a1428, shallow: 0x2a3a5a, sand: 0xa89884, grass: 0x8a8670, grass2: 0x7a7660, rock: 0x6a5a54, paved: 0x5a5a62, lake: 0xc0bab0, dirt: 0x8a7a68 },
  vegas: { sky: 0x1c1038, fog: 0x34204c, fogNear: 150, fogFar: 380, sun: 0xc8b8ff, sunI: 1.4, sunDir: [0.35, 0.8, -0.4], hemiSky: 0xa080c8, hemiGround: 0x3a2a40, hemiI: 1.2, night: true,
    water: 0x1a2a4a, waterOp: 0.85, deep: 0x0a1428, shallow: 0x2a3a5a, sand: 0xb09a7a, grass: 0x8a8a6a, grass2: 0x7a7a5c, rock: 0x7a5a50, paved: 0x4a4a54, lake: 0x9a948c, dirt: 0x907a60 },
};

const _a = new THREE.Color(), _b = new THREE.Color(), _d = new THREE.Color();
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// A grainy, point-sampled ground texture (grass speckle, pebbles, short blade strokes) multiplied over the
// vertex colours, so the island reads as a textured PS1 ground instead of flat-shaded paint.
let groundTex = null;
function groundTexture() {
  if (groundTex) return groundTex;
  groundTex = canvasTex(64, 64, (c, w, h) => {
    const img = c.createImageData(w, h);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < w * h; i++) { const v = 222 + (r() - 0.5) * 34; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    c.putImageData(img, 0, 0);
    for (let i = 0; i < 70; i++) { const x = r() * w, y = r() * h, l = 2 + r() * 3; c.fillStyle = r() < 0.6 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.14)'; c.fillRect(x, y, 1, l); }
    for (let i = 0; i < 26; i++) { c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(r() * w, r() * h, 2, 1); }
  });
  return groundTex;
}
export function buildTerrain(terrain, level, theme) {
  const I = level.island, T = THEMES[theme], half = I.half;
  const step = Math.max(half > 380 ? 6 : 5, terrain.step * 2), n = Math.round((half * 2) / step); // PS1-coarse: ~40k triangles
  const geo = new THREE.PlaneGeometry(half * 2, half * 2, n, n);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  // how much each pad covers a point (1 inside, fading over a few metres), so pads blend into the land
  const flatW = (x, z) => { let best = null, bw = 0; for (const f of I.flats) { const dx = Math.max(f.x0 - x, 0, x - f.x1), dz = Math.max(f.z0 - z, 0, z - f.z1), w = 1 - smooth(0, 5, Math.hypot(dx, dz)); if (w > bw) { bw = w; best = f; } } return [best, bw]; };
  let minH = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = terrain.height(x, z);
    pos.setY(i, h);
    minH = Math.min(minH, h);
    const slope = terrain.slope(x, z), nz = fbm(x / 9, z / 9, 2), patch = fbm(x / 38 + 5, z / 38 - 3, 3);
    const c = _a;
    if (h < -0.2) c.set(T.shallow).lerp(_b.set(T.deep), Math.min(1, -h / 8)).lerp(_d.set(T.sand), Math.max(0, 0.6 + h * 0.5) * 0.8); // the seabed: sand in the shallows
    else {
      // grass with patches of the second green and of dirt, drier up high, rock on the steep bits
      c.set(T.grass).lerp(_b.set(T.grass2), smooth(0.35, 0.75, patch)).lerp(_d.set(T.dirt), Math.max(0, fbm(x / 60, z / 60, 2) - 0.6) * 2.2);
      if (h > 14) c.lerp(_b.set(T.dirt), Math.min(0.35, (h - 14) / 40));
      c.lerp(_b.set(T.rock), smooth(0.38, 0.75, slope));
      // the beach: wet sand at the waterline, dry sand above, blending into the grass
      const beach = 1 - smooth(1.0, 2.4, h + (nz - 0.5) * 0.8);
      if (beach > 0) c.lerp(_b.set(T.sand).multiplyScalar(h < 0.45 ? 0.8 : 1), beach);
      const [f, fw] = flatW(x, z);
      if (f && (f.paved || f.lake)) c.lerp(_b.set(f.paved ? T.paved : T.lake).multiplyScalar(0.94 + patch * 0.12), fw);
    }
    const k = (0.9 + nz * 0.2) * 1.14; // dither, and lift for the texture's darkening
    col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const uv = geo.attributes.uv, rep = (half * 2) / 7; // the texture tiles every 7 m
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rep, uv.getY(i) * rep);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map: groundTexture() }));
  mesh.receiveShadow = true;
  mesh.userData.minH = minH;
  return mesh;
}

// The sea: one wide plane whose colour comes from the depth under it (the sim's height grid, baked to a
// texture): turquoise over the sand, deep blue further out, rolling swell bands, glinting crests, and foam
// that washes in toward every shore. (onBeforeCompile keeps three's lighting, fog and the PS1 patches.)
export function buildWater(theme, terrain) {
  const T = THEMES[theme], n = terrain.n, data = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) data[i] = Math.round(Math.max(0, Math.min(1, -terrain.h[i] / 12)) * 255);
  const depth = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  depth.magFilter = depth.minFilter = THREE.LinearFilter; depth.needsUpdate = true;
  const size = terrain.step * (n - 1);
  const uniforms = {
    uTime: { value: 0 }, uDepth: { value: depth }, uBounds: { value: new THREE.Vector3(terrain.x0, terrain.z0, size) },
    uShallow: { value: new THREE.Color(T.shallow) }, uDeep: { value: new THREE.Color(T.deep) }, uCrest: { value: new THREE.Color(T.night ? 0x5a7aa8 : 0xd8f4ff) }, uOp: { value: T.waterOp },
    uGlint: { value: T.night ? 0.35 : 1 },
  };
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vWXZ; uniform float uTime, uOp, uGlint; uniform sampler2D uDepth; uniform vec3 uBounds, uShallow, uDeep, uCrest;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec2 wp = vWXZ; float t = uTime;
      float d = texture2D(uDepth, (wp - uBounds.xy) / uBounds.z).r * 12.0;
      float w1 = sin(wp.x * 0.55 + t * 1.3 + sin(wp.y * 0.31 + t * 0.5) * 1.6);
      float w2 = sin(wp.y * 0.47 - t * 1.1 + sin(wp.x * 0.27 - t * 0.4) * 1.6);
      float w3 = sin((wp.x - wp.y) * 1.1 + t * 2.2);
      float wv = (w1 + w2) * 0.5;
      float swell = sin(wp.x * 0.05 + wp.y * 0.035 + t * 0.45) * sin(wp.y * 0.04 - t * 0.3);
      vec3 wc = mix(uShallow, uDeep, smoothstep(0.3, 8.0, d));
      wc *= 0.95 + 0.07 * swell + 0.05 * wv;
      float crest = smoothstep(0.9, 0.99, wv * 0.7 + w3 * 0.3) * smoothstep(0.8, 4.0, d) * smoothstep(-0.2, 0.6, swell);
      wc = mix(wc, uCrest, crest * 0.3);
      float band = sin(d * 4.5 - t * 2.0 + w1 * 1.3);
      float foam = clamp(smoothstep(1.9, 0.2, d) * step(0.4, band) + smoothstep(0.32, 0.0, d), 0.0, 1.0);
      wc = mix(wc, vec3(0.93, 0.97, 1.0), foam * 0.85);
      float glint = step(0.9985, fract(sin(dot(floor(wp * 1.2), vec2(12.9898, 78.233)) + floor(t * 2.0)) * 43758.5453)) * smoothstep(0.5, 0.95, wv) * uGlint;
      diffuseColor.rgb = wc;
      diffuseColor.a = clamp(mix(0.4, uOp, smoothstep(0.0, 2.5, d)) + foam * 0.5, 0.0, 1.0);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(foam * 0.22 + glint * 0.6);');
  };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), material);
  m.rotation.x = -Math.PI / 2; m.position.y = 0;
  m.receiveShadow = true;
  m.userData.uniforms = uniforms;
  return m;
}
