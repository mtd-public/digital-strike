// Controls. The floating thumbstick and per-pointer hold buttons are gig-ambulance's (via mstr-gme-dsgn-tmpt
// kits/vanilla-js/input/floating-stick-and-hold-buttons.js, verbatim in spirit: a new touch always takes the
// stick; reset on blur / visibilitychange / pagehide / lostpointercapture / pause), plus a keyboard map and a
// standard-mapping gamepad (twin stick: left flies, right points the nose). The chain gun has no button: any
// press on the right side of the screen that isn't on a button fires it for as long as it's held.
export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.hasDirection = false; this.dirX = 0; this.dirY = 0; this.magnitude = 0;
    this.stickActive = false; this.stickBaseX = 0; this.stickBaseY = 0; this.stickThumbX = 0; this.stickThumbY = 0; this.stickRadius = 64;
    this.held = { gun: false, msl: false, mine: false };
    this._stickId = null; this._keys = new Set(); this._buttons = [];
    this._fireIds = new Map(); this.fireX = 0; this.fireY = 0; // pointers holding the fire zone → their position
    this.onPointer = null; // () => void on any press (audio unlock)
    this.onKey = null; // (key) => void, one-shots (camera, pause, mute)
    this.onPad = null; // (button name) => void, gamepad one-shots
    this._padPrev = [];
    this.lastDevice = 'touch';
    this._bind();
  }
  _isStickZone(x) { return x < window.innerWidth * 0.6; }
  _bind() {
    const el = this.canvas;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.lastDevice = e.pointerType === 'mouse' ? 'mouse' : 'touch';
      this.onPointer?.();
      if (!this._isStickZone(e.clientX)) { // the fire zone
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        this._fireIds.set(e.pointerId, true); this.held.gun = true; this.fireX = e.clientX; this.fireY = e.clientY;
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
        return;
      }
      this._stickId = e.pointerId; this.stickActive = true; this.hasDirection = false; this.magnitude = 0;
      this.stickBaseX = this.stickThumbX = e.clientX; this.stickBaseY = this.stickThumbY = e.clientY;
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
    }, { passive: false });
    el.addEventListener('pointermove', (e) => {
      if (this._fireIds.has(e.pointerId)) { this.fireX = e.clientX; this.fireY = e.clientY; return; }
      if (e.pointerId !== this._stickId) return;
      e.preventDefault();
      if (e.pointerType === 'mouse' && e.buttons === 0) { this.releaseStick(); return; }
      this._updateStick(e.clientX, e.clientY);
    }, { passive: false });
    const end = (e) => {
      if (e.pointerId === this._stickId) this.releaseStick();
      if (this._fireIds.delete(e.pointerId)) this.held.gun = this._fireIds.size > 0;
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.lastDevice = 'keys';
      if (!e.repeat && !this._keys.has(k) && this.onKey) this.onKey(k);
      this._keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this._keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
    window.addEventListener('pagehide', () => this.reset());
  }
  releaseStick() { this._stickId = null; this.stickActive = false; this.hasDirection = false; this.magnitude = 0; }
  get firing() { return this._fireIds.size > 0; }
  reset() {
    this.releaseStick(); this._keys.clear(); this._fireIds.clear();
    for (const k in this.held) this.held[k] = false;
    for (const b of this._buttons) b.classList.remove('down');
  }
  // Hold buttons: each tracks its own pointer, so they work alongside the stick. onDown fires once per press.
  bindButton(el, name, onDown) {
    this._buttons.push(el);
    el.style.touchAction = 'none';
    let owner = null;
    const on = (e) => { e.preventDefault(); e.stopPropagation(); owner = e.pointerId; if (name) this.held[name] = true; el.classList.add('down'); onDown?.(); try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } };
    const off = (e) => { if (owner !== null && e.pointerId !== owner) return; owner = null; if (name) this.held[name] = false; el.classList.remove('down'); };
    el.addEventListener('pointerdown', on, { passive: false });
    el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  _updateStick(x, y) {
    let dx = x - this.stickBaseX, dy = y - this.stickBaseY;
    const d = Math.hypot(dx, dy);
    if (d > this.stickRadius) { const over = d - this.stickRadius; this.stickBaseX += (dx / d) * over; this.stickBaseY += (dy / d) * over; dx = x - this.stickBaseX; dy = y - this.stickBaseY; }
    this.stickThumbX = this.stickBaseX + dx; this.stickThumbY = this.stickBaseY + dy;
    const dd = Math.hypot(dx, dy), dead = 8;
    if (dd > dead) {
      this.hasDirection = true; this.dirX = dx / dd; this.dirY = dy / dd;
      const k = Math.min(1, (dd - dead) / (this.stickRadius * 0.75 - dead));
      this.magnitude = k * k * (3 - 2 * k);
    } else { this.hasDirection = false; this.magnitude = 0; }
  }
  key(k) { return this._keys.has(k); }

  // The gamepad, polled once a frame.
  pad() {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null;
    if (!gp) return null;
    const ax = (i) => { const v = gp.axes[i] || 0; return Math.abs(v) < 0.18 ? 0 : v; };
    const bt = (i) => !!gp.buttons[i]?.pressed || (gp.buttons[i]?.value || 0) > 0.4;
    const names = { 0: 'msl', 1: 'mine', 2: 'action', 3: 'cam', 9: 'pause', 8: 'mute', 10: 'xform', 13: 'xform' };
    for (const i in names) { const now = bt(+i); if (now && !this._padPrev[i] && this.onPad) this.onPad(names[i]); this._padPrev[i] = now; }
    const lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3);
    const any = lx || ly || rx || ry || gp.buttons.some((b) => b.pressed);
    if (any) this.lastDevice = 'pad';
    return { lx, ly, rx, ry, gun: bt(7) || bt(6), msl: bt(5) || bt(0), mine: bt(4) || bt(1) };
  }

  // Screen-space move {x, y, mag} (keyboard wins when pressed), or null.
  read(padState) {
    const k = this._keys;
    let x = 0, y = 0;
    if (k.has('arrowleft') || k.has('a')) x -= 1;
    if (k.has('arrowright') || k.has('d')) x += 1;
    if (k.has('arrowup') || k.has('w')) y -= 1;
    if (k.has('arrowdown') || k.has('s')) y += 1;
    if (x || y) { const n = Math.hypot(x, y); return { x: x / n, y: y / n, mag: 1, keys: true }; }
    if (padState && (padState.lx || padState.ly)) { const n = Math.hypot(padState.lx, padState.ly); return { x: padState.lx / n, y: padState.ly / n, mag: Math.min(1, n) }; }
    if (this.hasDirection) return { x: this.dirX, y: this.dirY, mag: this.magnitude };
    return null;
  }
  get gun() { return this.held.gun || this._keys.has(' ') || this._keys.has('j'); }
  get msl() { return this.held.msl || this._keys.has('k'); }
  get mine() { return this.held.mine || this._keys.has('l'); }
}
