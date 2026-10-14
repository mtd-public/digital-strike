// The PlayStation look, from dr-mow's js/retro.js (trimmed to two styles). Soviet Strike and Nuclear Strike
// were PS1 games, so Retro is the default:
//   * low internal resolution (RETRO_LINES on the short side), upscaled with hard pixels
//   * vertices snapped to that pixel grid (the PS1 wobble)
//   * 15-bit colour with a 4×4 ordered dither
//   * flat shading, point-sampled textures, hard shadows, distance fog
// It patches three.js's shared shader chunks, so it must be imported before any material compiles
// (main.js imports it first). Settings › Graphics, or ?art=retro|smooth, picks it; switching reloads.
import * as THREE from 'three';

export const SETTINGS_KEY = 'digital-strike.settings';
function readSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (_) { return {}; } }
function readArt() {
  const q = /[?&]art=([a-z]+)\b/.exec(location.search);
  if (q && ['retro', 'smooth'].includes(q[1])) return q[1];
  return readSettings().art === 'smooth' ? 'smooth' : 'retro';
}
export const ART = readArt();
export const RETRO = ART === 'retro';
// Old-tablet mode: no shadows, 1× pixels. ?lite=1 forces it, low-memory devices get it automatically.
const lq = /[?&]lite=([01])/.exec(location.search);
export const LITE = lq ? lq[1] === '1' : readSettings().lite === true || ((navigator.deviceMemory || 8) <= 2 && (navigator.hardwareConcurrency || 8) <= 4);
export const RETRO_LINES = 300; // internal vertical resolution (landscape); the short side in portrait

export const seg = (smooth, retro) => (RETRO ? retro : smooth);

// Snap clip-space xy to a grid of ~RETRO_LINES pixels (square on screen).
export const SNAP_GLSL = `
  #ifdef RETRO_SNAP
  {
    float snapAsp = abs(projectionMatrix[1][1] / projectionMatrix[0][0]);
    vec2 snapGrid = vec2(${(RETRO_LINES / 2).toFixed(1)} * max(snapAsp, 1.0), ${(RETRO_LINES / 2).toFixed(1)} * max(1.0 / snapAsp, 1.0));
    gl_Position.xy = floor(gl_Position.xy / gl_Position.w * snapGrid + 0.5) / snapGrid * gl_Position.w;
  }
  #endif`;
// The 4×4 Bayer matrix as arithmetic (GLSL ES 1.0 has no array initialisers): 15-bit colour + dither.
const DITHER15 = `
  {
    vec2 bq = mod(floor(gl_FragCoord.xy), 4.0), lo = mod(bq, 2.0), hi = floor(bq / 2.0);
    float bayer = 4.0 * mod(2.0 * lo.x + 3.0 * lo.y, 4.0) + mod(2.0 * hi.x + 3.0 * hi.y, 4.0);
    float d = (bayer / 16.0 - 0.5) / 31.0;
    gl_FragColor.rgb = floor(clamp(gl_FragColor.rgb + d, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
  }`;
if (RETRO) {
  const C = THREE.ShaderChunk;
  C.project_vertex = `${C.project_vertex}\n#define RETRO_SNAP\n${SNAP_GLSL}`;
  C.colorspace_fragment = `${C.colorspace_fragment}${DITHER15}`;
}

export function retroTex(t) {
  if (!RETRO) return t;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.anisotropy = 1;
  return t;
}
export function saveSetting(k, v) {
  const s = readSettings(); s[k] = v;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (_) { /* private mode */ }
}
export const settings = readSettings;
