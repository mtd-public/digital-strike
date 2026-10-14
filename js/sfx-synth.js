// sfx-synth.js — the consolidated WebAudio synth every mtd-public game re-wrote.
// No sample files. Merges the best parts of:
//   gig-ambulance js/audio.js      (tone(), two-tone siren loop)
//   finger-skater js/audio.js      (noise bursts, speed-following roll loop, grind scrape loop, scheduled delays)
//   labyrinth-larry js/audio.js    (master gain + mute, shared noise buffer, drone, formant "scream")
//   sub-sinkers src/audio.js       (named SFX table, 40 ms per-name rate limit, attack/decay envelope)
//
// Rules learned the hard way:
//   * Create/resume the AudioContext inside a user gesture (Start button / first key / first pointerdown).
//     Browsers refuse to start audio otherwise. unlock() is idempotent — call it from every start path.
//   * Route everything through one master GainNode so mute is one ramp, not a hunt for live nodes.
//   * Ramp gains with exponentialRampToValueAtTime to 0.0001 (never to 0 — exponential ramps can't hit 0),
//     or setTargetAtTime for loops. Hard gain jumps click.
//   * Rate-limit identical sounds (a shotgun fires 5 missiles in one frame; 5 stacked tones = distortion).
//   * Loops (engine/roll/siren/drone) are started once and modulated every frame; don't start/stop per frame.
//
// Usage:
//   import { Sfx } from './sfx-synth.js';
//   const sfx = new Sfx();
//   startButton.onclick = () => { sfx.unlock(); ... };
//   sfx.play('coin'); sfx.play('boom');
//   sfx.setRoll(speed, grounded);          // per frame, if you use the roll loop
//   sfx.setMuted(true);
export class Sfx {
  constructor({ volume = 0.8 } = {}) {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.muted = false;
    this.volume = volume;
    this.last = {};
    this.loops = {};
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (_) { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(c.destination);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  // ---------------------------------------------------------------- primitives
  /** Oscillator blip. slide = Hz to glide by over the duration. */
  tone(freq, dur, type = 'square', vol = 0.08, slide = 0, delay = 0) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Filtered noise burst (whoosh, crash, splash, crumble). f1 = filter sweep target. */
  burst(dur, freq, { q = 1, vol = 0.2, type = 'bandpass', f1 = freq, delay = 0 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    s.loop = true;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (f1 !== freq) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  /** Arpeggio — pickups, level clear, power-ups. */
  arp(freqs, step = 0.06, dur = 0.1, type = 'triangle', vol = 0.08) {
    freqs.forEach((f, i) => this.tone(f, dur, type, vol, 0, i * step));
  }

  // ---------------------------------------------------------------- named sfx
  play(name) {
    if (!this.ctx || this.muted) return;
    const fn = SFX[name];
    if (!fn) return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.04) return; // rate limit
    this.last[name] = now;
    fn(this);
  }

  // ---------------------------------------------------------------- loops
  /** Rolling / engine bed: looped low-passed noise; call setRoll every frame. */
  setRoll(speed, grounded = true, { maxSpeed = 14, vol = 0.12 } = {}) {
    const c = this.ctx;
    if (!c) return;
    if (!this.loops.roll) {
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noise; s.loop = true;
      f.type = 'lowpass'; f.frequency.value = 300; g.gain.value = 0;
      s.connect(f).connect(g).connect(this.master); s.start();
      this.loops.roll = { f, g };
    }
    const k = grounded ? Math.min(1, speed / maxSpeed) : 0;
    this.loops.roll.g.gain.setTargetAtTime(k * vol, c.currentTime, 0.05);
    this.loops.roll.f.frequency.setTargetAtTime(200 + k * 700, c.currentTime, 0.08);
  }

  /** Helicopter rotor (new): low-passed noise chopped by a ~16 Hz LFO on its gain. k 0..1 loudness, rate in Hz. */
  setRotor(k, rate = 16, cutoff = 420) {
    const c = this.ctx;
    if (!c) return;
    if (!this.loops.rotor) {
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), chop = c.createGain(), lfo = c.createOscillator(), depth = c.createGain();
      s.buffer = this.noise; s.loop = true; f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.value = 0; chop.gain.value = 0.5;
      lfo.type = 'sine'; lfo.frequency.value = rate; depth.gain.value = 0.5; lfo.connect(depth).connect(chop.gain);
      const hum = c.createOscillator(), hg = c.createGain(); hum.type = 'sawtooth'; hum.frequency.value = 48; hg.gain.value = 0.18;
      const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 160;
      hum.connect(hf).connect(hg).connect(chop);
      s.connect(f).connect(chop).connect(g).connect(this.master); s.start(); lfo.start(); hum.start();
      this.loops.rotor = { g, lfo, f, hum };
    }
    const L = this.loops.rotor;
    L.g.gain.setTargetAtTime(k * 0.22, c.currentTime, 0.1);
    L.lfo.frequency.setTargetAtTime(rate, c.currentTime, 0.2);
    L.f.frequency.setTargetAtTime(cutoff, c.currentTime, 0.2);
  }

  /** Two-tone siren (gig-ambulance): square LFO wobbling a triangle oscillator. */
  setSiren(on) {
    const c = this.ctx;
    if (!c) return;
    if (on && !this.loops.siren) {
      const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = 760;
      lfo.type = 'square'; lfo.frequency.value = 1.6; lg.gain.value = 130;
      lfo.connect(lg).connect(o.frequency);
      g.gain.value = 0.025;
      o.connect(g).connect(this.master);
      o.start(); lfo.start();
      this.loops.siren = { o, lfo, g };
    } else if (!on && this.loops.siren) {
      const { o, lfo, g } = this.loops.siren;
      g.gain.setTargetAtTime(0, c.currentTime, 0.05);
      o.stop(c.currentTime + 0.3); lfo.stop(c.currentTime + 0.3);
      this.loops.siren = null;
    }
  }

  /** Metallic scrape (finger-skater grind): narrow band-passed noise. */
  setScrape(on) {
    const c = this.ctx;
    if (!c) return;
    if (on && !this.loops.scrape) {
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noise; s.loop = true;
      f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 6; g.gain.value = 0.12;
      s.connect(f).connect(g).connect(this.master); s.start();
      this.loops.scrape = { s, g };
    } else if (!on && this.loops.scrape) {
      const { s, g } = this.loops.scrape;
      g.gain.setTargetAtTime(0, c.currentTime, 0.03);
      s.stop(c.currentTime + 0.2);
      this.loops.scrape = null;
    }
  }

  /** Ambient drone (labyrinth-larry): beating saws under a low-pass. Start once. */
  startDrone(freqs = [55, 55.7, 82.4], vol = 0.05) {
    const c = this.ctx;
    if (!c || this.loops.drone) return;
    const g = c.createGain(), lp = c.createBiquadFilter();
    g.gain.value = vol; lp.type = 'lowpass'; lp.frequency.value = 400;
    const oscs = freqs.map((fr) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(lp); o.start(); return o; });
    lp.connect(g).connect(this.master);
    this.loops.drone = { g, oscs };
  }

  /** A human-ish yell (labyrinth-larry): pitch-bent saw through vowel formants + breath noise. */
  scream(intensity = 1) {
    const c = this.ctx;
    if (!c || this.muted) return 0;
    const t = c.currentTime, dur = 0.55 + Math.random() * 0.6;
    const base = 330 + Math.random() * 220;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 0.8, t);
    o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.3), t + 0.12);
    o.frequency.exponentialRampToValueAtTime(base * 0.7, t + dur);
    const vib = c.createOscillator(), vg = c.createGain();
    vib.frequency.value = 6 + Math.random() * 4; vg.gain.value = base * 0.035;
    vib.connect(vg).connect(o.frequency);
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.16 * intensity, t + 0.04);
    out.gain.setValueAtTime(0.16 * intensity, t + dur * 0.7);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const vowel = Math.random() < 0.5 ? [800, 1150, 2900] : [700, 1800, 2600]; // "AH" / "AE"
    vowel.forEach((fr, i) => {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = 6;
      const g = c.createGain(); g.gain.value = [1.4, 0.8, 0.35][i];
      o.connect(bp).connect(g).connect(out);
    });
    const n = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain();
    n.buffer = this.noise; n.loop = true;
    nf.type = 'bandpass'; nf.frequency.value = 1500; ng.gain.value = 0.25;
    n.connect(nf).connect(ng).connect(out);
    out.connect(this.master);
    o.start(t); vib.start(t); n.start(t);
    o.stop(t + dur); vib.stop(t + dur); n.stop(t + dur);
    return dur;
  }
}

// The shared sound vocabulary. Each entry is (sfx) => void. Add your own freely.
export const SFX = {
  // pickups / rewards (gig-ambulance, finger-skater, labyrinth-larry)
  coin: (s) => { s.tone(988, 0.07, 'square', 0.05); s.tone(1319, 0.12, 'square', 0.05, 0, 0.06); },
  power: (s) => s.arp([523, 659, 784, 1047], 0.055, 0.1, 'triangle', 0.08),
  bonus: (s) => s.arp([659, 784, 1047], 0.06, 0.12, 'square', 0.05),
  deliver: (s) => s.arp([523, 659, 784, 1047, 1319], 0.08, 0.16, 'square', 0.06),
  checkpoint: (s) => s.arp([392, 523, 784], 0.09, 0.25, 'sine', 0.1),
  clear: (s) => s.arp([392, 523, 659, 784, 1046], 0.1, 0.14, 'square', 0.05),
  charged: (s) => s.tone(1200, 0.06, 'triangle', 0.05),
  tick: (s) => s.tone(1200, 0.05, 'square', 0.05),
  // weapons (sub-sinkers)
  shoot: (s) => { s.tone(520, 0.09, 'square', 0.06, -340); s.burst(0.12, 2000, { q: 2, vol: 0.05, f1: 400 }); },
  missile: (s) => s.burst(0.3, 400, { q: 3, vol: 0.09, f1: 3000 }),
  enemyShot: (s) => s.tone(900, 0.08, 'triangle', 0.05, -600),
  // impacts
  hit: (s) => { s.burst(0.25, 300, { q: 0.8, vol: 0.3 }); s.tone(160, 0.3, 'sawtooth', 0.1, -90); },
  bonk: (s) => s.tone(520, 0.08, 'triangle', 0.08, -300),
  crash: (s) => { s.tone(110, 0.25, 'sawtooth', 0.12, -60); s.tone(70, 0.3, 'square', 0.08, -30); },
  boom: (s) => { s.burst(0.6, 1200, { type: 'lowpass', vol: 0.35, f1: 60 }); s.tone(90, 0.5, 'sine', 0.25, -60); },
  bigBoom: (s) => { s.burst(1.4, 900, { type: 'lowpass', vol: 0.5, f1: 40 }); s.tone(70, 1.2, 'sine', 0.4, -50); },
  clank: (s) => { s.tone(200, 0.25, 'square', 0.05, -80); s.tone(1600, 0.12, 'triangle', 0.04); s.burst(0.08, 2500, { q: 2, vol: 0.12 }); },
  splash: (s) => s.burst(0.35, 3000, { type: 'highpass', vol: 0.12, f1: 600 }),
  // movement
  jump: (s) => s.tone(300, 0.25, 'triangle', 0.07, 500),
  ollie: (s) => { s.burst(0.08, 2200, { vol: 0.25 }); s.tone(300, 0.18, 'triangle', 0.06, 300); },
  land: (s) => { s.burst(0.12, 500, { vol: 0.3 }); s.tone(90, 0.1, 'square', 0.05, -30); },
  // states
  fail: (s) => s.tone(330, 0.4, 'sawtooth', 0.06, -200),
  hurt: (s) => { s.tone(240, 0.35, 'sawtooth', 0.12, -190); s.burst(0.3, 800, { type: 'lowpass', vol: 0.15, f1: 100 }); },
  gameOver: (s) => { s.burst(0.6, 250, { vol: 0.5 }); [392, 330, 262, 196].forEach((f, i) => s.tone(f, 0.22, 'sawtooth', 0.07, 0, i * 0.14)); },
  warn: (s) => [0, 0.3, 0.6].forEach((d) => { s.tone(880, 0.12, 'square', 0.05, 0, d); s.tone(660, 0.12, 'square', 0.05, 0, d + 0.15); }),
  sonar: (s) => s.tone(1320, 0.9, 'sine', 0.05, -20),
  portal: (s) => { s.tone(80, 1.6, 'sawtooth', 0.12, 400); s.arp([262, 311, 392, 466, 523], 0.12, 0.35, 'square', 0.05); },
  honk: (s) => { s.tone(415, 0.18, 'square', 0.04); s.tone(349, 0.18, 'square', 0.04); },
  // Digital Strike: the arsenal (the chain gun is new; rocket is dr-mow's homing-missile launch)
  chaingun: (s) => { s.burst(0.05, 1400, { q: 1.2, vol: 0.13, f1: 500 }); s.tone(110, 0.05, 'square', 0.05, -40); },
  pistol: (s) => { s.burst(0.06, 2200, { q: 1.5, vol: 0.1, f1: 800 }); s.tone(300, 0.05, 'square', 0.03, -150); },
  plasma: (s) => { s.tone(1400, 0.09, 'sawtooth', 0.04, -1100); s.burst(0.05, 3000, { q: 3, vol: 0.05 }); },
  rocket: (s) => { s.burst(0.9, 280, { q: 1.4, vol: 0.16, f1: 2600 }); s.tone(190, 0.75, 'sawtooth', 0.03, 650); },
  orb: (s) => { s.tone(500, 0.4, 'sine', 0.08, 900); s.tone(760, 0.3, 'triangle', 0.04, 600, 0.05); },
  mineDrop: (s) => { s.tone(260, 0.12, 'square', 0.05, -120); s.tone(900, 0.5, 'sine', 0.03, -600, 0.05); },
  gravBoom: (s) => { s.tone(60, 1.0, 'sine', 0.4, -30); s.tone(220, 0.8, 'sawtooth', 0.08, -200); s.burst(1.0, 700, { type: 'lowpass', vol: 0.4, f1: 40 }); },
  enemyGun: (s) => s.burst(0.05, 900, { q: 1, vol: 0.05, f1: 400 }),
  bolt: (s) => s.tone(700, 0.12, 'square', 0.03, -450),
  shell: (s) => { s.burst(0.25, 500, { type: 'lowpass', vol: 0.12, f1: 120 }); },
  lockBeep: (s) => s.tone(1760, 0.07, 'square', 0.05),
  samLaunch: (s) => { s.burst(1.0, 300, { q: 1.2, vol: 0.18, f1: 2200 }); s.tone(140, 0.9, 'sawtooth', 0.04, 500); },
  winch: (s) => s.tone(300, 0.5, 'triangle', 0.04, 500),
  ammo: (s) => s.arp([392, 523, 659], 0.05, 0.08, 'square', 0.05),
  objective: (s) => s.arp([392, 523, 659, 784, 1046], 0.09, 0.16, 'square', 0.06),
  shieldDown: (s) => { s.tone(900, 1.2, 'sawtooth', 0.06, -820); s.burst(1.0, 1800, { q: 2, vol: 0.12, f1: 200 }); },
  exit: (s) => { s.tone(520, 0.08, 'square', 0.04); s.tone(390, 0.12, 'square', 0.04, 0, 0.08); },
  stolen: (s) => s.arp([262, 330, 392, 523, 659, 784], 0.07, 0.2, 'sawtooth', 0.05),
  alarm: (s) => [0, 0.45, 0.9].forEach((d) => s.tone(620, 0.4, 'sawtooth', 0.05, 280, d)),
  beam: (s) => s.tone(180, 0.6, 'sawtooth', 0.04, 60),
};
