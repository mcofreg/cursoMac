/** Entrada táctil (joystick virtual, arrastre de cámara, pinza) y teclado/ratón. */
export class Input {
  joy = { x: 0, y: 0 };
  yawDelta = 0;
  pitchDelta = 0;
  zoomFactor = 1;
  private joyPointer: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private camPointers = new Map<number, { x: number; y: number }>();
  private lastPinch = 0;
  private keys = new Set<string>();
  private joyBase: HTMLElement;
  private joyKnob: HTMLElement;

  constructor(private el: HTMLElement, joyBase: HTMLElement, joyKnob: HTMLElement) {
    this.joyBase = joyBase; this.joyKnob = joyKnob;
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    el.addEventListener('pointermove', this.onMove, { passive: false });
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', this.onUp);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomFactor *= Math.exp(e.deltaY * 0.0012); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => { this.keys.add(e.key.toLowerCase()); });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.key.toLowerCase()); });
    window.addEventListener('blur', () => this.keys.clear());
  }

  private onDown = (e: PointerEvent): void => {
    if ((e.target as HTMLElement).closest('.ui')) return;
    e.preventDefault();
    const r = this.el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const isTouch = e.pointerType !== 'mouse';
    if (this.joyPointer === null && ((isTouch && x < r.width * 0.45 && y > r.height * 0.35) || (!isTouch && e.button === 0 && x < r.width * 0.45 && y > r.height * 0.5))) {
      this.joyPointer = e.pointerId;
      this.joyOrigin = { x, y };
      this.joyBase.style.left = `${x}px`; this.joyBase.style.top = `${y}px`;
      this.joyBase.classList.add('active');
      this.joyKnob.style.transform = 'translate(0px,0px)';
      return;
    }
    this.camPointers.set(e.pointerId, { x, y });
    if (this.camPointers.size === 2) {
      const [a, b] = [...this.camPointers.values()];
      this.lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  private onMove = (e: PointerEvent): void => {
    const r = this.el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (e.pointerId === this.joyPointer) {
      e.preventDefault();
      const R = 60;
      let dx = x - this.joyOrigin.x, dy = y - this.joyOrigin.y;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      this.joy.x = dx / R; this.joy.y = dy / R;
      this.joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
      return;
    }
    const p = this.camPointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (this.camPointers.size === 1) {
      this.yawDelta += (x - p.x) * 0.006;
      this.pitchDelta += (y - p.y) * 0.005;
    }
    p.x = x; p.y = y;
    if (this.camPointers.size === 2) {
      const [a, b] = [...this.camPointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.lastPinch > 0 && d > 0) this.zoomFactor *= this.lastPinch / d;
      this.lastPinch = d;
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId === this.joyPointer) {
      this.joyPointer = null;
      this.joy.x = 0; this.joy.y = 0;
      this.joyBase.classList.remove('active');
    }
    this.camPointers.delete(e.pointerId);
    if (this.camPointers.size < 2) this.lastPinch = 0;
  };

  /** Lee y limpia deltas acumulados. Teclado se mezcla aquí. */
  poll(dt: number): { joyX: number; joyY: number; yaw: number; pitch: number; zoom: number } {
    let jx = this.joy.x, jy = this.joy.y;
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) jy -= 1;
    if (k.has('s') || k.has('arrowdown')) jy += 1;
    if (k.has('a') || k.has('arrowleft')) jx -= 1;
    if (k.has('d') || k.has('arrowright')) jx += 1;
    const l = Math.hypot(jx, jy);
    if (l > 1) { jx /= l; jy /= l; }
    let yaw = this.yawDelta, pitch = this.pitchDelta, zoom = this.zoomFactor;
    if (k.has('q')) yaw -= dt * 1.8;
    if (k.has('e')) yaw += dt * 1.8;
    if (k.has('r')) pitch -= dt;
    if (k.has('f')) pitch += dt;
    if (k.has('+') || k.has('=')) zoom *= Math.exp(-dt * 2);
    if (k.has('-')) zoom *= Math.exp(dt * 2);
    this.yawDelta = 0; this.pitchDelta = 0; this.zoomFactor = 1;
    return { joyX: jx, joyY: jy, yaw, pitch, zoom };
  }

  consumeKey(key: string): boolean {
    if (this.keys.has(key)) { this.keys.delete(key); return true; }
    return false;
  }
}
