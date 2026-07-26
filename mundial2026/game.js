/* =========================================================
   MUNDIAL 2026 · CAPTAIN FIGHTERS
   Juego de lucha 2D estilo Super Nintendo, hecho en un
   canvas de 480x270 sin librerías ni imágenes externas.
   ========================================================= */
(function () {
'use strict';

/* ---------------------------------------------------------
   0. CONSTANTES
--------------------------------------------------------- */
const W = 480, H = 270;          // resolución interna (se escala con CSS)
const GROUND = 232;              // suelo
const STAGE_W = 900;             // ancho del escenario
const WALL = 40;                 // margen jugable
const FPS = 60, DT = 1000 / FPS;

const MAX_HP = 180;
const MAX_METER = 100;
const ROUND_TIME = 75;
const ROUNDS_TO_WIN = 2;

const GRAV = 0.55;
const JUMP_V = 8.6;

const D = d => d * Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/* ---------------------------------------------------------
   1. BANDERAS (dibujadas a mano, sin imágenes)
--------------------------------------------------------- */
function bands(g, x, y, w, h, cols, vertical) {
  const n = cols.length;
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[i];
    if (vertical) g.fillRect(x + Math.round(w / n * i), y, Math.ceil(w / n), h);
    else g.fillRect(x, y + Math.round(h / n * i), w, Math.ceil(h / n));
  }
}
function disc(g, cx, cy, r, col) { g.fillStyle = col; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); }
function star(g, cx, cy, r, col) {
  g.fillStyle = col; g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r;
    g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}

const FLAG = {
  arg: (g, x, y, w, h) => { bands(g, x, y, w, h, ['#75aadb', '#fff', '#75aadb']); disc(g, x + w / 2, y + h / 2, h * .16, '#f6b40e'); },
  bra: (g, x, y, w, h) => {
    g.fillStyle = '#009c3b'; g.fillRect(x, y, w, h);
    g.fillStyle = '#ffdf00'; g.beginPath();
    g.moveTo(x + w / 2, y + 2); g.lineTo(x + w - 3, y + h / 2); g.lineTo(x + w / 2, y + h - 2); g.lineTo(x + 3, y + h / 2);
    g.closePath(); g.fill(); disc(g, x + w / 2, y + h / 2, h * .2, '#002776');
  },
  mex: (g, x, y, w, h) => { bands(g, x, y, w, h, ['#006847', '#fff', '#ce1126'], 1); disc(g, x + w / 2, y + h / 2, h * .17, '#7a4b24'); },
  usa: (g, x, y, w, h) => {
    for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#fff' : '#b22234'; g.fillRect(x, y + h / 7 * i, w, h / 7 + .6); }
    g.fillStyle = '#3c3b6e'; g.fillRect(x, y, w * .42, h * .54);
    g.fillStyle = '#fff'; for (let i = 0; i < 6; i++) g.fillRect(x + 2 + (i % 3) * 4, y + 2 + Math.floor(i / 3) * 5, 1.6, 1.6);
  },
  can: (g, x, y, w, h) => {
    bands(g, x, y, w, h, ['#d52b1e', '#fff', '#d52b1e'], 1);
    g.fillStyle = '#d52b1e'; g.beginPath();
    g.moveTo(x + w / 2, y + h * .18); g.lineTo(x + w / 2 + h * .2, y + h * .62); g.lineTo(x + w / 2, y + h * .5);
    g.lineTo(x + w / 2 - h * .2, y + h * .62); g.closePath(); g.fill();
    g.fillRect(x + w / 2 - .8, y + h * .5, 1.6, h * .3);
  },
  esp: (g, x, y, w, h) => { g.fillStyle = '#c60b1e'; g.fillRect(x, y, w, h); g.fillStyle = '#ffc400'; g.fillRect(x, y + h * .25, w, h * .5); g.fillStyle = '#c60b1e'; g.fillRect(x + w * .25, y + h * .38, 3, 5); },
  fra: (g, x, y, w, h) => bands(g, x, y, w, h, ['#002395', '#fff', '#ed2939'], 1),
  eng: (g, x, y, w, h) => { g.fillStyle = '#fff'; g.fillRect(x, y, w, h); g.fillStyle = '#ce1124'; g.fillRect(x + w / 2 - 2, y, 4, h); g.fillRect(x, y + h / 2 - 2, w, 4); },
  por: (g, x, y, w, h) => { g.fillStyle = '#f00'; g.fillRect(x, y, w, h); g.fillStyle = '#046a38'; g.fillRect(x, y, w * .4, h); disc(g, x + w * .4, y + h / 2, h * .22, '#ffe900'); },
  ale: (g, x, y, w, h) => bands(g, x, y, w, h, ['#000', '#dd0000', '#ffce00']),
  ned: (g, x, y, w, h) => bands(g, x, y, w, h, ['#ae1c28', '#fff', '#21468b']),
  cro: (g, x, y, w, h) => {
    bands(g, x, y, w, h, ['#ff0000', '#fff', '#171796']);
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#fff' : '#ff0000'; g.fillRect(x + w / 2 - 4 + (i % 3) * 3, y + h / 2 - 3 + Math.floor(i / 3) * 3, 3, 3); }
  },
  uru: (g, x, y, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(x, y, w, h);
    for (let i = 0; i < 4; i++) { g.fillStyle = '#0038a8'; g.fillRect(x + w * .45, y + h * (.18 + i * .21), w * .55, h * .1); }
    disc(g, x + w * .22, y + h * .28, h * .15, '#fcd116');
  },
  col: (g, x, y, w, h) => { g.fillStyle = '#fcd116'; g.fillRect(x, y, w, h / 2); g.fillStyle = '#003893'; g.fillRect(x, y + h / 2, w, h / 4); g.fillStyle = '#ce1126'; g.fillRect(x, y + h * .75, w, h / 4); },
  jpn: (g, x, y, w, h) => { g.fillStyle = '#fff'; g.fillRect(x, y, w, h); disc(g, x + w / 2, y + h / 2, h * .27, '#bc002d'); },
  mar: (g, x, y, w, h) => { g.fillStyle = '#c1272d'; g.fillRect(x, y, w, h); star(g, x + w / 2, y + h / 2, h * .26, '#006233'); }
};

/* ---------------------------------------------------------
   2. PLANTILLA DE CAPITANES
--------------------------------------------------------- */
const ROSTER = [
  { id: 'arg', pais: 'ARGENTINA', cap: 'MESSI', sp: 'ZURDAZO', su: 'LA PULGA', pow: 4, spd: 5, def: 3,
    kit: { shirt: '#7fbde6', shirt2: '#ffffff', shorts: '#12225e', socks: '#ffffff', skin: '#e3b18a', hair: '#3a2a1c', boots: '#f0a8d0' }, flag: 'arg' },
  { id: 'bra', pais: 'BRASIL', cap: 'MARQUINHOS', sp: 'CAÑONAZO', su: 'JOGA BONITO', pow: 4, spd: 4, def: 5,
    kit: { shirt: '#f7d716', shirt2: '#0f9d58', shorts: '#1a3a8f', socks: '#ffffff', skin: '#8b5a3c', hair: '#1b1108', boots: '#f7d716' }, flag: 'bra' },
  { id: 'mex', pais: 'MÉXICO', cap: 'E. ÁLVAREZ', sp: 'MACHETAZO', su: 'GRITO AZTECA', pow: 4, spd: 3, def: 5,
    kit: { shirt: '#0b6b3a', shirt2: '#ffffff', shorts: '#0b1a2e', socks: '#c8102e', skin: '#b47a4e', hair: '#151007', boots: '#ffffff' }, flag: 'mex' },
  { id: 'usa', pais: 'ESTADOS UNIDOS', cap: 'PULISIC', sp: 'CAPTAIN SHOT', su: 'STARS & STRIPES', pow: 3, spd: 5, def: 3,
    kit: { shirt: '#ffffff', shirt2: '#b22234', shorts: '#1b2b6b', socks: '#ffffff', skin: '#e8bd97', hair: '#5a4324', boots: '#4fd1ff' }, flag: 'usa' },
  { id: 'can', pais: 'CANADÁ', cap: 'A. DAVIES', sp: 'CONTRAGOLPE', su: 'ROADRUNNER', pow: 3, spd: 5, def: 3,
    kit: { shirt: '#d52b1e', shirt2: '#ffffff', shorts: '#ffffff', socks: '#d52b1e', skin: '#6e4630', hair: '#171008', boots: '#ffe600' }, flag: 'can' },
  { id: 'esp', pais: 'ESPAÑA', cap: 'MORATA', sp: 'TIKI-TAKA', su: 'FURIA ROJA', pow: 4, spd: 4, def: 4,
    kit: { shirt: '#c60b1e', shirt2: '#ffc400', shorts: '#12275e', socks: '#c60b1e', skin: '#e8bd97', hair: '#c9a86a', boots: '#ff4d6d' }, flag: 'esp' },
  { id: 'fra', pais: 'FRANCIA', cap: 'MBAPPÉ', sp: 'TGV', su: 'VITESSE', pow: 4, spd: 5, def: 3,
    kit: { shirt: '#1d2c6b', shirt2: '#ffffff', shorts: '#ffffff', socks: '#c8102e', skin: '#7a4a2e', hair: '#120c06', boots: '#e1e1e1' }, flag: 'fra' },
  { id: 'eng', pais: 'INGLATERRA', cap: 'KANE', sp: 'BOMBAZO', su: 'IT\'S COMING HOME', pow: 5, spd: 3, def: 4,
    kit: { shirt: '#ffffff', shirt2: '#ce1124', shorts: '#12275e', socks: '#ffffff', skin: '#eec3a0', hair: '#7c5c33', boots: '#111111' }, flag: 'eng' },
  { id: 'por', pais: 'PORTUGAL', cap: 'RONALDO', sp: 'TIRO LIBRE', su: 'SIUUU!', pow: 5, spd: 4, def: 4,
    kit: { shirt: '#a4030f', shirt2: '#046a38', shorts: '#046a38', socks: '#a4030f', skin: '#d9a172', hair: '#241608', boots: '#00e0c0' }, flag: 'por' },
  { id: 'ale', pais: 'ALEMANIA', cap: 'KIMMICH', sp: 'PANZER', su: 'BLITZKRIEG', pow: 4, spd: 4, def: 5,
    kit: { shirt: '#ffffff', shirt2: '#000000', shorts: '#000000', socks: '#ffffff', skin: '#eec3a0', hair: '#a98545', boots: '#ff8a00' }, flag: 'ale' },
  { id: 'ned', pais: 'PAÍSES BAJOS', cap: 'VAN DIJK', sp: 'MURALLA', su: 'TOTAAL VOETBAL', pow: 5, spd: 2, def: 5,
    kit: { shirt: '#f36c21', shirt2: '#ffffff', shorts: '#12275e', socks: '#f36c21', skin: '#6b4128', hair: '#0e0a05', boots: '#ffffff' }, flag: 'ned' },
  { id: 'cro', pais: 'CROACIA', cap: 'MODRIĆ', sp: 'PASE FILTRADO', su: 'VATRENI', pow: 3, spd: 5, def: 3,
    kit: { shirt: '#ff2b2b', shirt2: '#ffffff', shorts: '#0d2b6b', socks: '#ffffff', skin: '#e8bd97', hair: '#d8c58b', boots: '#c9ff2b' }, flag: 'cro' },
  { id: 'uru', pais: 'URUGUAY', cap: 'GIMÉNEZ', sp: 'GARRA', su: 'CELESTE', pow: 5, spd: 3, def: 5,
    kit: { shirt: '#7cb0dd', shirt2: '#ffffff', shorts: '#0d2b6b', socks: '#0d2b6b', skin: '#dba57a', hair: '#2b1a0c', boots: '#111111' }, flag: 'uru' },
  { id: 'col', pais: 'COLOMBIA', cap: 'JAMES', sp: 'VOLEA', su: 'CAFETERO', pow: 4, spd: 4, def: 3,
    kit: { shirt: '#fcd116', shirt2: '#003893', shorts: '#003893', socks: '#c8102e', skin: '#d8a375', hair: '#3a2410', boots: '#ff2bd0' }, flag: 'col' },
  { id: 'jpn', pais: 'JAPÓN', cap: 'ENDŌ', sp: 'KAMIKAZE', su: 'SAMURAI BLUE', pow: 3, spd: 4, def: 5,
    kit: { shirt: '#1b2f8a', shirt2: '#ffffff', shorts: '#1b2f8a', socks: '#1b2f8a', skin: '#e6c39a', hair: '#0b0805', boots: '#e8322d' }, flag: 'jpn' },
  { id: 'mar', pais: 'MARRUECOS', cap: 'HAKIMI', sp: 'DESBORDE', su: 'LEONES DEL ATLAS', pow: 4, spd: 5, def: 4,
    kit: { shirt: '#c1272d', shirt2: '#006233', shorts: '#006233', socks: '#c1272d', skin: '#c08a5a', hair: '#150d05', boots: '#00b0ff' }, flag: 'mar' }
];
const byId = id => ROSTER.find(r => r.id === id);

/* ---------------------------------------------------------
   3. ESCENARIOS
--------------------------------------------------------- */
const STAGES = [
  { name: 'ESTADIO AZTECA · CIUDAD DE MÉXICO', sky: ['#2a1b4d', '#b0466b', '#f0a35e'], grass: '#2f7d3a', grass2: '#276a31', stands: '#1b1436', light: '#ffd28a' },
  { name: 'METLIFE STADIUM · NUEVA JERSEY', sky: ['#0b1a3a', '#1d3f7a', '#4f86c6'], grass: '#2b7a46', grass2: '#23663a', stands: '#12203f', light: '#cfe6ff' },
  { name: 'BMO FIELD · TORONTO', sky: ['#122b3d', '#2b6b7d', '#9fd6c6'], grass: '#35854a', grass2: '#2b6f3e', stands: '#0f2431', light: '#eafff6' },
  { name: 'ESTADIO AKRON · GUADALAJARA', sky: ['#3b1d3d', '#8b3b5e', '#e0855e'], grass: '#317f3d', grass2: '#286b33', stands: '#241640', light: '#ffcf9a' }
];

/* ---------------------------------------------------------
   4. AUDIO (sintetizado con WebAudio)
--------------------------------------------------------- */
const Audio_ = {
  ctx: null, master: null, musicGain: null, sfxGain: null,
  on: true, musicOn: true, seqId: null, step: 0, tune: null,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = .5; this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = .9; this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = .32; this.musicGain.connect(this.master);
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  beep(freq, dur, type, vol, slide) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol == null ? .25 : vol, t + .008);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + dur + .02);
  },
  noise(dur, vol, freq, q) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime, len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 900; f.Q.value = q || 1.2;
    const g = this.ctx.createGain(); g.gain.value = vol == null ? .35 : vol;
    src.connect(f); f.connect(g); g.connect(this.sfxGain); src.start(t);
  },
  hit() { this.noise(.16, .5, 420, .8); this.beep(160, .12, 'square', .3, 60); },
  heavy() { this.noise(.26, .6, 260, .7); this.beep(110, .2, 'sawtooth', .3, 45); },
  block() { this.noise(.09, .35, 2600, 3); },
  whoosh() { this.noise(.13, .16, 1500, .9); },
  ball() { this.beep(680, .1, 'square', .18, 300); },
  jump() { this.beep(300, .1, 'square', .15, 620); },
  ko() { this.beep(420, .8, 'sawtooth', .35, 55); this.noise(.7, .35, 200, .6); },
  bell() { this.beep(1180, .5, 'sine', .3); setTimeout(() => this.beep(1560, .6, 'sine', .28), 160); },
  cursor() { this.beep(880, .05, 'square', .15); },
  ok() { this.beep(660, .07, 'square', .2); setTimeout(() => this.beep(990, .12, 'square', .2), 70); },
  crowd(v) {
    if (!this.on || !this.ctx) return;
    this.noise(.9, .09 * (v || 1), 700, .5);
  },
  /* --- pequeño secuenciador chiptune --- */
  TUNES: {
    menu: { bpm: 132, lead: [0, 4, 7, 12, 11, 7, 4, 7, 5, 9, 12, 16, 14, 12, 9, 7], bass: [0, 0, 5, 5, 3, 3, 7, 7], root: 220 },
    fight: { bpm: 152, lead: [0, 3, 7, 10, 12, 10, 7, 3, 5, 8, 12, 15, 14, 12, 8, 5], bass: [0, 0, 0, 3, 5, 5, 3, 0], root: 196 }
  },
  playMusic(name) {
    this.init(); if (!this.ctx) return;
    if (this.tune === name && this.seqId) return;
    this.stopMusic(); this.tune = name; this.step = 0;
    if (!this.musicOn) return;
    const t = this.TUNES[name]; if (!t) return;
    const interval = 60000 / t.bpm / 2;
    this.seqId = setInterval(() => {
      if (!this.ctx || !this.musicOn) return;
      const s = this.step++;
      const n = t.lead[s % t.lead.length];
      const f = t.root * Math.pow(2, n / 12);
      this._m(f, .11, 'square', .14);
      if (s % 2 === 0) this._m(t.root / 2 * Math.pow(2, t.bass[(s / 2) % t.bass.length] / 12), .18, 'triangle', .2);
      if (s % 4 === 2) this._mnoise();
    }, interval);
  },
  _m(f, d, type, v) {
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .01);
    g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + d + .02);
  },
  _mnoise() {
    const t = this.ctx.currentTime, len = Math.floor(this.ctx.sampleRate * .06);
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource(); s.buffer = b;
    const g = this.ctx.createGain(); g.gain.value = .12;
    s.connect(g); g.connect(this.musicGain); s.start(t);
  },
  stopMusic() { if (this.seqId) { clearInterval(this.seqId); this.seqId = null; } this.tune = null; }
};

/* ---------------------------------------------------------
   5. GUARDADO
--------------------------------------------------------- */
const Save = {
  data: { sound: true, music: true, diff: 1, last: 'arg', cups: {} },
  load() { try { const s = JSON.parse(localStorage.getItem('m26_save')); if (s) Object.assign(this.data, s); } catch (e) { } },
  save() { try { localStorage.setItem('m26_save', JSON.stringify(this.data)); } catch (e) { } }
};
Save.load();
Audio_.on = Save.data.sound; Audio_.musicOn = Save.data.music;

/* ---------------------------------------------------------
   6. ENTRADA (teclado + táctil)
--------------------------------------------------------- */
const KEYS = ['left', 'right', 'up', 'down', 'p', 'k', 's', 'u'];
const Input = {
  cur: {}, prev: {}, held: {}, latch: {},
  init() {
    KEYS.forEach(k => { this.cur[k] = false; this.prev[k] = false; this.held[k] = false; this.latch[k] = false; });
    const map = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down',
      j: 'p', k: 'k', l: 's', i: 'u', J: 'p', K: 'k', L: 's', I: 'u',
      z: 'p', x: 'k', c: 's', v: 'u', Z: 'p', X: 'k', C: 's', V: 'u',
      ' ': 'p', Enter: 'p', Escape: 'k'
    };
    addEventListener('keydown', e => {
      const k = map[e.key]; if (k) { this.held[k] = true; this.latch[k] = true; e.preventDefault(); Audio_.resume(); }
    });
    addEventListener('keyup', e => { const k = map[e.key]; if (k) { this.held[k] = false; e.preventDefault(); } });

    document.querySelectorAll('.key').forEach(btn => {
      const k = btn.dataset.k;
      const on = e => { e.preventDefault(); this.held[k] = true; this.latch[k] = true; btn.classList.add('down-active'); Audio_.init(); Audio_.resume(); };
      const off = e => { e.preventDefault(); this.held[k] = false; btn.classList.remove('down-active'); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });
    addEventListener('blur', () => KEYS.forEach(k => this.held[k] = false));
  },
  /* el "latch" evita perder pulsaciones muy cortas entre dos fotogramas */
  update() {
    KEYS.forEach(k => {
      this.prev[k] = this.cur[k];
      this.cur[k] = this.held[k] || this.latch[k];
      this.latch[k] = false;
    });
  },
  down(k) { return this.cur[k]; },
  hit(k) { return this.cur[k] && !this.prev[k]; },
  anyHit() { return KEYS.some(k => this.hit(k)); }
};

/* ---------------------------------------------------------
   7. CANVAS + toques sobre el lienzo
--------------------------------------------------------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

let hotspots = [];                 // zonas táctiles del menú actual
let tapped = null;                 // último toque (coords internas)
function hot(id, x, y, w, h) { hotspots.push({ id, x, y, w, h }); }
function tookTap(id) {
  if (!tapped) return false;
  for (const z of hotspots) {
    if (z.id === id && tapped.x >= z.x && tapped.x <= z.x + z.w && tapped.y >= z.y && tapped.y <= z.y + z.h) return true;
  }
  return false;
}
canvas.addEventListener('pointerdown', e => {
  Audio_.init(); Audio_.resume();
  const r = canvas.getBoundingClientRect();
  tapped = { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
});

/* ---------------------------------------------------------
   8. DIBUJO: helpers
--------------------------------------------------------- */
function text(str, x, y, o) {
  o = o || {};
  const size = o.size || 12;
  ctx.font = (o.weight || 'bold') + ' ' + size + 'px "Trebuchet MS",Verdana,sans-serif';
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.base || 'alphabetic';
  if (o.shadow !== false) { ctx.fillStyle = o.shadowCol || 'rgba(0,0,0,.75)'; ctx.fillText(str, x + (o.sx || 1), y + (o.sy || 1)); }
  if (o.stroke) { ctx.lineWidth = o.stroke; ctx.strokeStyle = o.strokeCol || '#000'; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = o.color || '#fff';
  ctx.fillText(str, x, y);
}
function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function panel(x, y, w, h, col, border) {
  ctx.fillStyle = col || 'rgba(8,12,26,.86)';
  rrect(ctx, x, y, w, h, 5); ctx.fill();
  ctx.strokeStyle = border || '#5d6cae'; ctx.lineWidth = 1.5;
  rrect(ctx, x + .5, y + .5, w - 1, h - 1, 5); ctx.stroke();
}
function seg(g, x, y, a, len, w, col, outline) {
  const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
  g.lineCap = 'round';
  if (outline) { g.strokeStyle = outline; g.lineWidth = w + 2.4; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke(); }
  g.strokeStyle = col; g.lineWidth = w;
  g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
  return [nx, ny];
}

/* ---------------------------------------------------------
   9. LUCHADOR
--------------------------------------------------------- */
const ATK = {
  //         inicio activo recup  daño alcance  altoY  altoH  aturde empuje   guardia
  punch: { s: 4, a: 4, r: 9, dmg: 8, reach: 48, hy: -78, hh: 24, stun: 14, push: 2.0, guard: 'mid', snd: 'hit' },
  kick: { s: 8, a: 6, r: 17, dmg: 13, reach: 62, hy: -60, hh: 28, stun: 21, push: 4.0, guard: 'mid', snd: 'heavy' },
  cpunch: { s: 4, a: 4, r: 9, dmg: 6, reach: 46, hy: -44, hh: 22, stun: 13, push: 1.6, guard: 'mid', snd: 'hit', crouch: 1 },
  ckick: { s: 8, a: 6, r: 19, dmg: 12, reach: 66, hy: -16, hh: 18, stun: 0, push: 2.4, guard: 'low', snd: 'heavy', crouch: 1, knock: 1 },
  jpunch: { s: 3, a: 9, r: 4, dmg: 9, reach: 46, hy: -56, hh: 26, stun: 16, push: 1.6, guard: 'high', snd: 'hit', air: 1 },
  jkick: { s: 5, a: 12, r: 58, dmg: 12, reach: 58, hy: -42, hh: 30, stun: 18, push: 2.4, guard: 'high', snd: 'heavy', air: 1 }
};

function makeFighter(def, side, isCPU) {
  return {
    def, side, cpu: !!isCPU,
    x: side === 0 ? STAGE_W / 2 - 90 : STAGE_W / 2 + 90,
    y: 0, vx: 0, vy: 0, face: side === 0 ? 1 : -1,
    hp: MAX_HP, meter: 0, wins: 0,
    state: 'idle', st: 0, atk: null, hitDone: false, hits: 0,
    air: false, crouch: false, guard: false, stun: 0, invuln: 0,
    cool: 0, anim: 0, flash: 0, lastDir: 0,
    aiT: 0, aiAct: null, aiHold: 0, comboCount: 0
  };
}
const spd = f => 1.35 + f.def.spd * 0.13;
const powMul = f => 0.85 + f.def.pow * 0.055;
const defMul = f => 1.12 - f.def.def * 0.042;

function canAct(f) {
  return ['idle', 'walk', 'crouch'].includes(f.state) && f.stun <= 0;
}
function startAtk(f, name) {
  f.state = 'atk'; f.atk = name; f.st = 0; f.hitDone = false; f.hits = 0;
  Audio_.whoosh();
}

/* ---------------------------------------------------------
   10. PROYECTILES Y EFECTOS
--------------------------------------------------------- */
let projs = [], fx = [], shake = 0, hitstop = 0;

function spawnBall(f, big) {
  projs.push({
    x: f.x + f.face * 30, y: -34, vx: f.face * (big ? 5.4 : 4.4), face: f.face,
    owner: f, dmg: (big ? 16 : 11) * powMul(f), r: big ? 11 : 8, spin: 0, big: !!big, life: 200, chip: big ? 3 : 2
  });
  Audio_.ball();
}
function sparks(x, y, n, col, sp) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2), v = rnd(1, sp || 4);
    fx.push({ t: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: rndi(12, 26), col: col || '#ffe58a' });
  }
}
function popText(x, y, s, col) { fx.push({ t: 'txt', x, y, s, col: col || '#fff', life: 40, vy: -1.1 }); }
function dust(x, y) { for (let i = 0; i < 6; i++) fx.push({ t: 'p', x: x + rnd(-8, 8), y, vx: rnd(-1.4, 1.4), vy: rnd(-1.6, -.3), life: rndi(10, 20), col: '#d8cfae' }); }

/* ---------------------------------------------------------
   11. LÓGICA DE COMBATE
--------------------------------------------------------- */
function fighterBox(f) {
  const h = f.crouch ? 56 : 92;
  return { x: f.x - 17, y: GROUND - f.y - h, w: 34, h };
}

function stepFighter(f, o, inp) {
  f.anim++;
  if (f.flash > 0) f.flash--;
  if (f.cool > 0) f.cool--;
  if (f.invuln > 0) f.invuln--;

  if (f.state === 'ko' || f.state === 'win') {
    f.st++; f.vx *= .86; f.x += f.vx;
    f.x = clamp(f.x, WALL, STAGE_W - WALL);
    return;
  }

  if (f.stun > 0) {
    f.stun--;
    f.x += f.vx; f.vx *= .88;
    f.x = clamp(f.x, WALL, STAGE_W - WALL);
    if (f.stun <= 0 && !f.air) { f.state = f.crouch ? 'crouch' : 'idle'; f.st = 0; }
    return;
  }

  const fwd = f.x < o.x ? 1 : -1;
  if (!f.air) f.face = fwd;
  const back = inp[fwd > 0 ? 'left' : 'right'];
  const forward = inp[fwd > 0 ? 'right' : 'left'];

  f.guard = !f.air && back && canAct(f);

  // ---- ataques ----
  if (canAct(f)) {
    if (inp.uHit && f.meter >= MAX_METER) {
      f.meter = 0; f.state = 'super'; f.st = 0; f.hits = 0; f.hitDone = false;
      f.vy = -3.4; f.air = true; Audio_.whoosh(); Audio_.crowd(1.6);
      popText(f.x, GROUND - 110, f.def.su, '#ffdf4a');
    } else if (inp.sHit && f.cool <= 0) {
      f.state = 'spec'; f.st = 0; f.cool = 46;
    } else if (inp.pHit) {
      startAtk(f, inp.down ? 'cpunch' : 'punch');
    } else if (inp.kHit) {
      startAtk(f, inp.down ? 'ckick' : 'kick');
    }
  } else if (f.air && f.state === 'jump') {
    if (inp.pHit) { f.state = 'jatk'; f.atk = 'jpunch'; f.st = 0; f.hitDone = false; Audio_.whoosh(); }
    else if (inp.kHit) { f.state = 'jatk'; f.atk = 'jkick'; f.st = 0; f.hitDone = false; Audio_.whoosh(); }
  }

  // ---- estados ----
  switch (f.state) {
    case 'idle': case 'walk': case 'crouch': {
      f.crouch = !!inp.down && !f.air;
      if (inp.up && !f.air) {
        f.air = true; f.vy = -JUMP_V;
        f.vx = forward ? f.face * 3.1 : back ? -f.face * 2.9 : 0;
        f.state = 'jump'; f.st = 0; Audio_.jump(); dust(f.x, GROUND);
      } else if (f.crouch) {
        f.state = 'crouch'; f.vx = 0;
      } else if (inp.left || inp.right) {
        const dir = inp.right ? 1 : -1;
        f.vx = dir * spd(f) * (dir === f.face ? 1 : .82);
        f.state = 'walk'; f.lastDir = dir * f.face;
      } else { f.state = 'idle'; f.vx = 0; }
      break;
    }
    case 'jump': {
      f.st++;
      break;
    }
    case 'jatk': {
      f.st++;
      const a = ATK[f.atk];
      if (f.st > a.s + a.a + a.r && !f.air) { f.state = 'idle'; f.atk = null; }
      break;
    }
    case 'atk': {
      f.st++; f.vx *= .8;
      const a = ATK[f.atk];
      f.crouch = !!a.crouch;
      if (f.st >= a.s + a.a + a.r) { f.state = f.crouch && inp.down ? 'crouch' : 'idle'; f.atk = null; f.crouch = !!inp.down; }
      break;
    }
    case 'spec': {
      f.st++; f.vx *= .8;
      if (f.st === 16) spawnBall(f, false);
      if (f.st >= 40) { f.state = 'idle'; }
      break;
    }
    case 'super': {
      f.st++;
      if (f.st < 8) { f.invuln = 2; f.vx = 0; }
      else if (f.st < 52) { f.vx = f.face * 3.4; f.invuln = f.st < 24 ? 2 : 0; }
      else f.vx *= .8;
      if (f.st === 8) { f.vy = -6.2; f.air = true; }
      if (f.st % 3 === 0 && f.st > 8 && f.st < 54) {
        fx.push({ t: 'p', x: f.x - f.face * 10, y: GROUND - f.y - 50 + rnd(-20, 20), vx: -f.face * rnd(.4, 1.4), vy: rnd(-.6, .6), life: 16, col: '#ffca3a' });
      }
      if (f.st >= 66) { f.state = 'idle'; f.hits = 0; }
      break;
    }
  }

  f.x += f.vx;
  f.x = clamp(f.x, WALL, STAGE_W - WALL);
}

/* gravedad: y = altura sobre el suelo, vy negativo = subir */
function physics(f) {
  if (f.air) {
    f.y += -f.vy;      // vy negativo = subir
    f.vy += GRAV;
    if (f.y <= 0) {
      f.y = 0; f.air = false; f.vy = 0; f.vx = 0;
      dust(f.x, GROUND);
      if (f.state === 'jump' || f.state === 'jatk') { f.state = 'idle'; f.atk = null; }
      if (f.state === 'super' && f.st > 40) { f.state = 'idle'; }
    }
  }
}

/* ---- golpes ---- */
function activeHitbox(f) {
  if (f.state === 'super') {
    if (f.st > 10 && f.st < 56) return { x: f.x - 26, y: GROUND - f.y - 86, w: 52, h: 86, dmg: 11 * powMul(f), type: 'super' };
    return null;
  }
  if (f.state !== 'atk' && f.state !== 'jatk') return null;
  const a = ATK[f.atk]; if (!a) return null;
  if (f.st < a.s || f.st >= a.s + a.a) return null;
  const bx = f.face > 0 ? f.x + 8 : f.x - 8 - a.reach;
  return { x: bx, y: GROUND - f.y + a.hy, w: a.reach, h: a.hh, dmg: a.dmg * powMul(f), a, type: f.atk };
}
function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

function tryHit(att, dfn) {
  const hb = activeHitbox(att); if (!hb) return;
  if (hb.type === 'super') { if (att.hits >= 3 || (att.hitCd || 0) > 0) return; }
  else if (att.hitDone) return;
  if (dfn.invuln > 0 || dfn.state === 'ko') return;
  const db = fighterBox(dfn);
  if (!overlap(hb, db)) return;

  const a = hb.a;
  const guardType = hb.type === 'super' ? 'mid' : a.guard;
  let blocked = false;
  if (!dfn.air && dfn.guard) {
    if (guardType === 'high') blocked = !dfn.crouch;      // salto = overhead
    else if (guardType === 'low') blocked = dfn.crouch;
    else blocked = true;
  }

  if (hb.type === 'super') { att.hits++; att.hitCd = 10; } else att.hitDone = true;

  const px = (att.x + dfn.x) / 2, py = GROUND - dfn.y - (dfn.crouch ? 32 : 56);

  if (blocked) {
    const chip = hb.type === 'super' ? hb.dmg * .18 : 0;
    dfn.hp = Math.max(0, dfn.hp - chip);
    dfn.stun = 10; dfn.state = 'blk'; dfn.st = 0;
    dfn.vx = att.face * 1.4;
    att.meter = Math.min(MAX_METER, att.meter + 3);
    dfn.meter = Math.min(MAX_METER, dfn.meter + 4);
    Audio_.block(); hitstop = 3; shake = 1.5;
    sparks(px, py, 5, '#bfe3ff', 2.6);
    popText(px, py - 14, 'BLOQUEO', '#9fd8ff');
    return;
  }

  const dmg = Math.round(hb.dmg * defMul(dfn));
  dfn.hp = Math.max(0, dfn.hp - dmg);
  dfn.flash = 6;
  att.meter = Math.min(MAX_METER, att.meter + (hb.type === 'super' ? 0 : 7));
  dfn.meter = Math.min(MAX_METER, dfn.meter + 4);
  att.comboCount = (dfn.stun > 0 ? att.comboCount + 1 : 1);

  const heavy = hb.type === 'super' || (a && a.snd === 'heavy');
  hitstop = heavy ? 7 : 5;
  shake = heavy ? 5 : 2.6;
  heavy ? Audio_.heavy() : Audio_.hit();
  sparks(px, py, heavy ? 12 : 7, heavy ? '#ffd24a' : '#fff3b0', heavy ? 5 : 3.4);

  const knock = (a && a.knock) || hb.type === 'super';
  dfn.stun = hb.type === 'super' ? 16 : (a.stun + (knock ? 16 : 0));
  dfn.vx = att.face * ((a ? a.push : 3) * (knock ? 1.6 : 1));
  dfn.state = 'hurt'; dfn.st = 0;
  if (knock) { dfn.air = true; dfn.vy = -6.4; }
  if (att.comboCount > 1) popText(px, py - 20, att.comboCount + ' HITS', '#ffd24a');

  if (dfn.hp <= 0) {
    dfn.state = 'ko'; dfn.st = 0; dfn.air = true; dfn.vy = -7.2; dfn.vx = att.face * 3.2;
    hitstop = 16; shake = 8; Audio_.ko(); Audio_.crowd(2);
  }
}

function pushApart(a, b) {
  const d = b.x - a.x, min = 42;
  if (Math.abs(d) < min && !a.air && !b.air) {
    const push = (min - Math.abs(d)) / 2 * (d >= 0 ? 1 : -1);
    a.x -= push; b.x += push;
    a.x = clamp(a.x, WALL, STAGE_W - WALL); b.x = clamp(b.x, WALL, STAGE_W - WALL);
  }
}

/* ---------------------------------------------------------
   12. IA
--------------------------------------------------------- */
const DIFFS = [
  { name: 'FÁCIL', react: 26, agr: .32, blk: .28, sp: .10, su: .25 },
  { name: 'NORMAL', react: 16, agr: .52, blk: .52, sp: .22, su: .55 },
  { name: 'DIFÍCIL', react: 8, agr: .74, blk: .78, sp: .36, su: .85 }
];

function aiInput(f, o, diff) {
  const inp = { left: 0, right: 0, up: 0, down: 0, p: 0, k: 0, s: 0, u: 0 };
  const dist = Math.abs(o.x - f.x);
  const fwd = o.x > f.x ? 'right' : 'left';
  const bwd = fwd === 'right' ? 'left' : 'right';

  // reacción a proyectiles
  const inc = projs.find(p => p.owner !== f && Math.sign(p.vx) === (f.x > p.x ? 1 : -1) && Math.abs(p.x - f.x) < 150);
  if (inc) {
    if (Math.abs(inc.x - f.x) < 96 && Math.random() < diff.blk) {
      if (Math.random() < .35 && !f.air) { inp.up = 1; inp[fwd] = 1; }
      else inp[bwd] = 1;
      f.aiHold = 8;
      return finish(f, inp);
    }
  }

  if (f.aiHold > 0) { f.aiHold--; Object.assign(inp, f.aiLast || {}); return finish(f, inp); }
  if (f.aiT > 0) { f.aiT--; Object.assign(inp, f.aiLast || {}); return finish(f, inp); }

  // bloquear cuando el rival ataca de cerca
  const oAtk = o.state === 'atk' || o.state === 'jatk' || o.state === 'super';
  if (oAtk && dist < 92 && Math.random() < diff.blk) {
    inp[bwd] = 1;
    if (o.state === 'atk' && o.atk === 'ckick') inp.down = 1;
    f.aiLast = inp; f.aiT = 12; return finish(f, inp);
  }

  const r = Math.random();
  if (f.meter >= MAX_METER && dist < 110 && r < diff.su) {
    inp.u = 1; f.aiLast = {}; f.aiT = 20; return finish(f, inp);
  }
  if (dist > 190) {
    if (r < diff.sp) { inp.s = 1; f.aiLast = {}; f.aiT = 34; }
    else if (r < diff.sp + .12) { inp.up = 1; inp[fwd] = 1; f.aiLast = { [fwd]: 1 }; f.aiT = 22; }
    else { inp[fwd] = 1; f.aiLast = inp; f.aiT = rndi(14, 30); }
  } else if (dist > 82) {
    if (r < diff.agr * .5) { inp[fwd] = 1; f.aiLast = inp; f.aiT = rndi(8, 18); }
    else if (r < diff.agr * .5 + .16) { inp.up = 1; inp[fwd] = 1; f.aiLast = { [fwd]: 1 }; f.aiT = 20; }
    else if (r < diff.agr * .5 + .3) { inp.s = 1; f.aiLast = {}; f.aiT = 32; }
    else { inp[bwd] = 1; f.aiLast = inp; f.aiT = rndi(8, 16); }
  } else {
    if (r < diff.agr * .45) { inp.p = 1; f.aiLast = {}; f.aiT = rndi(10, 18); }
    else if (r < diff.agr * .75) { inp.k = 1; f.aiLast = {}; f.aiT = rndi(16, 26); }
    else if (r < diff.agr * .9) { inp.down = 1; inp.k = 1; f.aiLast = { down: 1 }; f.aiT = rndi(14, 22); }
    else if (r < diff.agr * .9 + .16) { inp[bwd] = 1; f.aiLast = inp; f.aiT = rndi(10, 20); }
    else { inp[fwd] = 1; f.aiLast = inp; f.aiT = 10; }
  }
  return finish(f, inp);

  function finish(f, i) {
    const out = { left: !!i.left, right: !!i.right, up: !!i.up, down: !!i.down };
    out.pHit = !!i.p; out.kHit = !!i.k; out.sHit = !!i.s; out.uHit = !!i.u;
    out.p = out.pHit; out.k = out.kHit; out.s = out.sHit; out.u = out.uHit;
    return out;
  }
}

/* ---------------------------------------------------------
   13. DIBUJO DEL LUCHADOR
--------------------------------------------------------- */
const TORSO = 30, UARM = 13, FARM = 13, THIGH = 19, SHIN = 19, HEADR = 8.5;

function getPose(f) {
  const t = f.anim, s = f.st;
  const P = {
    hip: [0, -38], torso: D(-92), head: 0,
    armB: [D(30), D(-58)], armF: [D(24), D(-66)],
    legB: [D(104), D(80)], legF: [D(72), D(96)],
    rot: 0, lift: 0
  };
  switch (f.state) {
    case 'idle': {
      const b = Math.sin(t * .11) * 1.6;
      P.hip[1] = -38 + b;
      P.armF = [D(16 + b * 2), D(-74 - b * 2)];   // guante alto junto a la cara
      P.armB = [D(52), D(-18 + b * 3)];           // brazo trasero cruzando el pecho
      break;
    }
    case 'walk': {
      const ph = Math.sin(t * .22), fwd = f.lastDir > 0 ? 1 : -1;
      P.hip[1] = -37 + Math.abs(Math.sin(t * .22)) * -2;
      P.legB = [D(104 + ph * 26), D(84 - ph * 12)];
      P.legF = [D(72 - ph * 26), D(96 + ph * 12)];
      P.armF = [D(18 - ph * 10 * fwd), D(-72)];
      P.armB = [D(50 + ph * 12 * fwd), D(-20)];
      break;
    }
    case 'crouch': {
      P.hip = [-2, -22];
      P.torso = D(-80);
      P.legB = [D(140), D(30)]; P.legF = [D(40), D(140)];
      P.armF = [D(30), D(-80)]; P.armB = [D(40), D(-70)];
      break;
    }
    case 'jump': case 'jatk': {
      P.hip = [0, -40];
      P.torso = D(-86);
      P.legB = [D(126), D(58)]; P.legF = [D(56), D(120)];
      P.armF = [D(-30), D(-80)]; P.armB = [D(-50), D(-96)];
      if (f.state === 'jatk') {
        if (f.atk === 'jpunch') { P.armF = [D(6), D(0)]; P.torso = D(-80); }
        else { P.legF = [D(24), D(18)]; P.legB = [D(120), D(70)]; }
      }
      break;
    }
    case 'atk': {
      const a = ATK[f.atk];
      const p = clamp((s - a.s) / Math.max(1, a.a), 0, 1);
      const ext = s < a.s ? s / a.s : (s < a.s + a.a ? 1 : 1 - (s - a.s - a.a) / a.r);
      if (f.atk === 'punch') {
        P.torso = D(-88);
        P.armF = [D(2 * ext), D(-2 * ext)];
        P.armB = [D(50), D(-40)];
        P.hip[0] = 3 * ext;
        P.legF = [D(66), D(100)]; P.legB = [D(112), D(76)];
      } else if (f.atk === 'kick') {
        P.torso = D(-104);
        P.hip = [-4 + 4 * ext, -40];
        P.legF = [D(-8 + 10 * (1 - ext)), D(6)];
        P.legB = [D(96), D(86)];
        P.armF = [D(80), D(40)]; P.armB = [D(-120), D(-150)];
      } else if (f.atk === 'cpunch') {
        P.hip = [-2, -22]; P.torso = D(-78);
        P.armF = [D(-4), D(0)]; P.armB = [D(40), D(-60)];
        P.legB = [D(140), D(30)]; P.legF = [D(40), D(140)];
      } else if (f.atk === 'ckick') {
        P.hip = [-6, -16]; P.torso = D(-64);
        P.legF = [D(4), D(2)]; P.legB = [D(150), D(24)];
        P.armF = [D(70), D(60)]; P.armB = [D(120), D(70)];
      }
      break;
    }
    case 'spec': {
      // disparo: la pierna de delante golpea el balón
      const e = clamp((s - 6) / 10, 0, 1);
      P.torso = D(-96 + 6 * e);
      P.hip = [1 + 3 * e, -38];
      P.legF = [D(46 - 54 * e), D(56 - 42 * e)];
      P.legB = [D(104), D(84)];
      P.armF = [D(150 + 30 * e), D(170 + 20 * e)];
      P.armB = [D(-40 - 30 * e), D(-86)];
      break;
    }
    case 'super': {
      // chilena: dos giros completos con las piernas haciendo tijera
      const prog = clamp((f.st - 6) / 46, 0, 1);
      P.rot = -prog * Math.PI * 4;
      const sc = Math.sin(f.st * .42);
      P.hip = [0, -38];
      P.legF = [D(-46 + sc * 46), D(-14 + sc * 30)];
      P.legB = [D(146 - sc * 46), D(116 - sc * 30)];
      P.armF = [D(126), D(158)]; P.armB = [D(-136), D(-168)];
      P.torso = D(-92);
      break;
    }
    case 'hurt': {
      // retroceso: cuerpo arqueado hacia atrás y brazos sueltos
      const e = clamp(f.stun / 18, 0, 1);
      P.torso = D(-92 - 26 * e);
      P.hip = [-7 * e, -36 + 2 * e];
      P.armF = [D(140 + 20 * e), D(112)];
      P.armB = [D(158 + 16 * e), D(126)];
      P.legF = [D(52 - 10 * e), D(104)]; P.legB = [D(124 + 8 * e), D(68)];
      P.head = D(-16 * e);
      break;
    }
    case 'blk': {
      P.torso = D(-98);
      P.hip = [-3, -37];
      P.armF = [D(40), D(-118)]; P.armB = [D(56), D(-128)];
      P.legF = [D(66), D(100)]; P.legB = [D(114), D(74)];
      if (f.crouch) { P.hip = [-3, -22]; P.legB = [D(140), D(30)]; P.legF = [D(40), D(140)]; }
      break;
    }
    case 'ko': {
      P.rot = -1.35; P.lift = 4;
      P.torso = D(-92);
      P.armF = [D(-60), D(-30)]; P.armB = [D(-80), D(-40)];
      P.legF = [D(74), D(70)]; P.legB = [D(100), D(90)];
      break;
    }
    case 'win': {
      const b = Math.sin(f.st * .16) * 5;
      P.hip[1] = -38 - Math.abs(Math.sin(f.st * .16)) * 4;
      P.armF = [D(-100 + b), D(-100)]; P.armB = [D(-80 - b), D(-96)];
      P.legF = [D(74), D(94)]; P.legB = [D(106), D(80)];
      break;
    }
  }
  return P;
}

function drawFighter(g, f) {
  const k = f.def.kit;
  const P = getPose(f);
  const OL = 'rgba(10,8,20,.85)';
  g.save();
  g.translate(Math.round(f.x), Math.round(GROUND - f.y) + (P.lift || 0));

  // sombra sobre el césped (siempre sin rotar)
  g.fillStyle = 'rgba(0,0,0,.32)';
  g.beginPath();
  g.ellipse(0, f.y + 1, Math.max(6, 16 - f.y * .07), 4.2, 0, 0, Math.PI * 2);
  g.fill();

  g.scale(f.face, 1);
  if (P.rot) g.rotate(P.rot);

  if (f.flash > 0 && f.flash % 2 === 0) g.globalAlpha = .75;

  const hx = P.hip[0], hy = P.hip[1];
  const nx = hx + Math.cos(P.torso) * TORSO, ny = hy + Math.sin(P.torso) * TORSO;
  const sx = nx + Math.cos(P.torso + D(90)) * 3, sy = ny + Math.sin(P.torso + D(90)) * 3;

  // pierna trasera
  let p = seg(g, hx - 2, hy, P.legB[0], THIGH, 11, shade(k.shorts, -.22), OL);
  p = seg(g, p[0], p[1], P.legB[1], SHIN, 9, shade(k.socks, -.22), OL);
  seg(g, p[0], p[1], P.legB[1] - D(70), 7, 7, shade(k.boots, -.25), OL);

  // brazo trasero
  let a = seg(g, sx - 2, sy, P.armB[0], UARM, 9, shade(k.shirt, -.2), OL);
  a = seg(g, a[0], a[1], P.armB[1], FARM, 7.5, shade(k.skin, -.15), OL);
  g.fillStyle = shade(k.skin, -.15); g.beginPath(); g.arc(a[0], a[1], 3.6, 0, Math.PI * 2); g.fill();

  // torso
  seg(g, hx, hy, P.torso, TORSO, 19, k.shirt, OL);
  // franja secundaria
  g.save(); g.globalAlpha = .95;
  seg(g, hx + (nx - hx) * .35, hy + (ny - hy) * .35, P.torso, TORSO * .3, 19, k.shirt2, null);
  g.restore();
  // pantalón
  seg(g, hx - 4, hy - 1, P.torso + D(180), 7, 17, k.shorts, OL);

  // pierna delantera
  let q = seg(g, hx + 2, hy, P.legF[0], THIGH, 11.5, k.shorts, OL);
  q = seg(g, q[0], q[1], P.legF[1], SHIN, 9.5, k.socks, OL);
  seg(g, q[0], q[1], P.legF[1] - D(70), 7.5, 7.5, k.boots, OL);

  // cabeza
  const hcx = nx + Math.cos(P.torso + P.head) * 9, hcy = ny + Math.sin(P.torso + P.head) * 9;
  g.strokeStyle = OL; g.lineWidth = 2.2;
  g.fillStyle = k.skin;
  g.beginPath(); g.arc(hcx, hcy, HEADR, 0, Math.PI * 2); g.fill(); g.stroke();
  // pelo
  g.fillStyle = k.hair;
  g.beginPath(); g.arc(hcx, hcy - 1.4, HEADR, Math.PI * 1.05, Math.PI * 2.05); g.fill();
  g.beginPath(); g.arc(hcx - 4.5, hcy - 2, 4.4, 0, Math.PI * 2); g.fill();
  // ojo
  g.fillStyle = '#1a1a22';
  g.fillRect(hcx + 2.4, hcy - 1.6, 2.1, 2.4);

  // brazo delantero
  let b = seg(g, sx + 2, sy, P.armF[0], UARM, 9.5, k.shirt, OL);
  // brazalete de capitán
  const bx = sx + 2 + Math.cos(P.armF[0]) * UARM * .72, by = sy + Math.sin(P.armF[0]) * UARM * .72;
  seg(g, bx, by, P.armF[0], 3.5, 10, '#f2c14e', null);
  b = seg(g, b[0], b[1], P.armF[1], FARM, 8, k.skin, OL);
  g.fillStyle = k.skin; g.strokeStyle = OL; g.lineWidth = 1.6;
  g.beginPath(); g.arc(b[0], b[1], 4, 0, Math.PI * 2); g.fill(); g.stroke();

  g.globalAlpha = 1;
  g.restore();
}

/* retrato: dibuja a un capitán en cualquier punto de la pantalla */
function drawPortrait(def, cx, feetY, sc, state, t, face) {
  const d = makeFighter(def, 0);
  d.anim = t; d.st = t; d.x = 0; d.y = 0;
  d.state = state || 'idle';
  d.face = face || 1;
  if (d.state === 'crouch' || d.state === 'blk') d.crouch = true;
  ctx.save();
  ctx.translate(cx, feetY);
  ctx.scale(sc, sc);
  ctx.translate(0, -GROUND);
  drawFighter(ctx, d);
  ctx.restore();
}

function shade(hex, amt) {
  const c = hex.replace('#', '');
  const n = c.length === 3 ? c.split('').map(x => x + x).join('') : c;
  let r = parseInt(n.slice(0, 2), 16), gg = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  const f = v => clamp(Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt), 0, 255);
  return 'rgb(' + f(r) + ',' + f(gg) + ',' + f(b) + ')';
}

/* ---------------------------------------------------------
   14. ESCENARIO
--------------------------------------------------------- */
let crowdSeed = [];
function buildCrowd() {
  crowdSeed = [];
  for (let i = 0; i < 260; i++) {
    crowdSeed.push({ x: Math.random() * (STAGE_W + 200) - 100, y: rnd(0, 1), c: pick(['#ff5f6d', '#ffd24a', '#5ecbff', '#8affa1', '#ffffff', '#ff9a3c', '#c48aff']), o: Math.random() * 6 });
  }
}
buildCrowd();

const mod = (a, n) => ((a % n) + n) % n;
const SKY_H = 66, STAND_Y = 66, STAND_H = 74, ADS_Y = 140, ADS_H = 16, WALL_Y = 156, WALL_H = 14, FIELD_Y = 170;

function drawStage(g, st, camX, timeT, f1, f2) {
  // ---- cielo ----
  const grd = g.createLinearGradient(0, 0, 0, FIELD_Y);
  grd.addColorStop(0, st.sky[0]); grd.addColorStop(.6, st.sky[1]); grd.addColorStop(1, st.sky[2]);
  g.fillStyle = grd; g.fillRect(0, 0, W, FIELD_Y);

  // ---- torres de luz ----
  for (let i = 0; i < 5; i++) {
    const x = mod(i * 130 - camX * .25, W + 260) - 130;
    g.fillStyle = 'rgba(255,255,255,.07)';
    g.beginPath(); g.moveTo(x, 14); g.lineTo(x - 52, FIELD_Y); g.lineTo(x + 52, FIELD_Y); g.closePath(); g.fill();
    g.fillStyle = '#0d1224'; g.fillRect(x - 12, 6, 24, 10);
    for (let j = 0; j < 4; j++) { g.fillStyle = st.light; g.fillRect(x - 10 + j * 5, 8, 3, 6); }
    g.fillStyle = '#0d1224'; g.fillRect(x - 1.5, 16, 3, STAND_Y - 16);
  }

  // ---- gradas ----
  g.fillStyle = st.stands; g.fillRect(0, STAND_Y, W, STAND_H);
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, STAND_Y, W, 4);
  const gx = -camX * .35;
  crowdSeed.forEach(p => {
    const x = mod(p.x * .35 + gx, W + 40) - 20;
    const y = STAND_Y + 8 + p.y * (STAND_H - 14) + Math.sin(timeT * .07 + p.o) * 1.5;
    g.fillStyle = p.c; g.fillRect(x, y, 2, 2);
  });
  // marcador gigante con las dos banderas
  const sbx = mod(STAGE_W / 2 - 60 - camX * .35, W + 400) - 200;
  g.fillStyle = '#080c1c'; g.fillRect(sbx, STAND_Y + 6, 120, 40);
  g.strokeStyle = '#3d4a80'; g.lineWidth = 1.5; g.strokeRect(sbx + .5, STAND_Y + 6.5, 119, 39);
  if (f1 && f2) {
    FLAG[f1.def.flag](g, sbx + 8, STAND_Y + 14, 26, 17);
    FLAG[f2.def.flag](g, sbx + 86, STAND_Y + 14, 26, 17);
    text('2026', sbx + 60, STAND_Y + 30, { size: 11, align: 'center', color: '#ffd24a' });
  }

  // ---- vallas publicitarias ----
  g.fillStyle = '#0d1330'; g.fillRect(0, ADS_Y, W, ADS_H);
  g.fillStyle = '#1a2350'; g.fillRect(0, ADS_Y, W, 3);
  g.save(); g.beginPath(); g.rect(0, ADS_Y, W, ADS_H); g.clip();
  const bt = 'MUNDIAL 2026 · CANADÁ · MÉXICO · USA · ';
  g.font = 'bold 9px "Trebuchet MS",sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  const bw = g.measureText(bt).width;
  const off = mod(-camX * .5, bw) - bw;
  g.fillStyle = 'rgba(255,255,255,.55)';
  for (let i = 0; i < Math.ceil(W / bw) + 2; i++) g.fillText(bt, off + i * bw, ADS_Y + 12);
  g.restore();

  // ---- muro perimetral ----
  g.fillStyle = '#12203a'; g.fillRect(0, WALL_Y, W, WALL_H);
  for (let i = 0; i < 22; i++) {
    g.fillStyle = 'rgba(255,255,255,.06)';
    g.fillRect(mod(i * 24 - camX * .6, W + 24) - 12, WALL_Y, 2, WALL_H);
  }

  // ---- césped ----
  const gg = g.createLinearGradient(0, FIELD_Y, 0, H);
  gg.addColorStop(0, st.grass2); gg.addColorStop(1, st.grass);
  g.fillStyle = gg; g.fillRect(0, FIELD_Y, W, H - FIELD_Y);
  for (let i = 0; i < 16; i++) {
    g.fillStyle = 'rgba(255,255,255,.05)';
    g.fillRect(mod(i * 76 - camX * .95, W + 76) - 38, FIELD_Y, 38, H - FIELD_Y);
  }

  // ---- portería (sobre el césped, al fondo) ----
  const goalX = STAGE_W * .18 - camX * .82, goalW = 132, goalTop = FIELD_Y - 16, goalBase = FIELD_Y + 16;
  g.save();
  g.fillStyle = 'rgba(6,20,14,.5)'; g.fillRect(goalX, goalTop, goalW, goalBase - goalTop);
  g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(goalX, goalTop, goalW, goalBase - goalTop);
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = .7;
  for (let i = 0; i <= 11; i++) {
    g.beginPath(); g.moveTo(goalX + i * goalW / 11, goalTop); g.lineTo(goalX + i * goalW / 11, goalBase); g.stroke();
  }
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(goalX, goalTop + i * (goalBase - goalTop) / 4); g.lineTo(goalX + goalW, goalTop + i * (goalBase - goalTop) / 4); g.stroke();
  }
  g.strokeStyle = '#ffffff'; g.lineWidth = 2.4;
  g.beginPath(); g.moveTo(goalX, goalBase); g.lineTo(goalX, goalTop); g.lineTo(goalX + goalW, goalTop); g.lineTo(goalX + goalW, goalBase); g.stroke();
  g.restore();

  // ---- líneas del campo ----
  g.strokeStyle = 'rgba(255,255,255,.34)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, FIELD_Y + 16); g.lineTo(W, FIELD_Y + 16); g.stroke();
  const cx = STAGE_W / 2 - camX;
  g.beginPath(); g.ellipse(cx, 246, 96, 40, 0, Math.PI, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(cx, FIELD_Y + 16); g.lineTo(cx, H); g.stroke();
  // banderines de córner
  [STAGE_W * .06, STAGE_W * .94].forEach(bx => {
    const x = bx - camX;
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, GROUND - 6); g.lineTo(x, GROUND - 34); g.stroke();
    g.fillStyle = '#ffd24a';
    g.beginPath(); g.moveTo(x, GROUND - 34); g.lineTo(x + 12, GROUND - 30); g.lineTo(x, GROUND - 26); g.closePath(); g.fill();
  });
}

/* ---------------------------------------------------------
   15. HUD
--------------------------------------------------------- */
function drawBar(x, y, w, h, pct, col1, col2, flip) {
  ctx.fillStyle = '#0a0e1e'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#31384f'; ctx.fillRect(x, y, w, h);
  const bw = Math.max(0, Math.round(w * pct));
  const gx = flip ? x + w - bw : x;
  const gr = ctx.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, col1); gr.addColorStop(1, col2);
  ctx.fillStyle = gr; ctx.fillRect(gx, y, bw, h);
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(gx, y, bw, 2);
  ctx.strokeStyle = '#c9d4ff'; ctx.lineWidth = 1;
  ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
}

function drawHUD(m) {
  const p1 = m.f1, p2 = m.f2;
  // vida
  drawBar(28, 14, 190, 12, p1.hp / MAX_HP, '#ffe86b', '#e8452c', true);
  drawBar(W - 218, 14, 190, 12, p2.hp / MAX_HP, '#ffe86b', '#e8452c', false);
  // súper
  drawBar(28, 32, 120, 6, p1.meter / MAX_METER, '#9df1ff', '#2a7fe0', true);
  drawBar(W - 148, 32, 120, 6, p2.meter / MAX_METER, '#9df1ff', '#2a7fe0', false);
  if (p1.meter >= MAX_METER) text('SUPER!', 152, 39, { size: 8, color: '#ffe86b' });
  if (p2.meter >= MAX_METER) text('SUPER!', W - 152, 39, { size: 8, color: '#ffe86b', align: 'right' });

  // banderas + nombres
  FLAG[p1.def.flag](ctx, 4, 12, 20, 14); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(4.5, 12.5, 19, 13);
  FLAG[p2.def.flag](ctx, W - 24, 12, 20, 14); ctx.strokeRect(W - 23.5, 12.5, 19, 13);
  text(p1.def.cap, 28, 50, { size: 9, color: '#e8eeff' });
  text(p2.def.cap, W - 28, 50, { size: 9, color: '#e8eeff', align: 'right' });

  // rondas ganadas
  for (let i = 0; i < ROUNDS_TO_WIN; i++) {
    star(ctx, 34 + i * 12, 44, 4.5, p1.wins > i ? '#ffd24a' : 'rgba(255,255,255,.22)');
    star(ctx, W - 34 - i * 12, 44, 4.5, p2.wins > i ? '#ffd24a' : 'rgba(255,255,255,.22)');
  }

  // reloj
  const t = Math.ceil(m.timer);
  panel(W / 2 - 26, 8, 52, 30, 'rgba(6,10,24,.9)', '#8f9ee0');
  text(t < 10 ? '0' + t : '' + t, W / 2, 31, { size: 21, align: 'center', color: t <= 10 ? '#ff6b6b' : '#fff', stroke: 2 });
}

/* ---------------------------------------------------------
   16. ESCENAS
--------------------------------------------------------- */
let scene = 'title', sceneT = 0;
let menuIdx = 0, selIdx = 0, selP2 = 0, selPhase = 0;
let match = null, cup = null, results = null;

function setScene(s) { scene = s; sceneT = 0; }

/* ---------- copa ---------- */
const ROUND_NAMES = ['OCTAVOS DE FINAL', 'CUARTOS DE FINAL', 'SEMIFINAL', 'LA GRAN FINAL'];
function newCup(playerId) {
  const rivals = ROSTER.filter(r => r.id !== playerId);
  const shuffled = rivals.sort(() => Math.random() - .5).slice(0, 4);
  return { playerId, rivals: shuffled.map(r => r.id), round: 0 };
}

/* ---------- combate ---------- */
function newMatch(id1, id2, isCup) {
  projs = []; fx = []; shake = 0; hitstop = 0;
  const m = {
    f1: makeFighter(byId(id1), 0, false),
    f2: makeFighter(byId(id2), 1, true),
    stage: STAGES[rndi(0, STAGES.length - 1)],
    timer: ROUND_TIME, round: 1, phase: 'intro', pt: 0, camX: 0, isCup: !!isCup,
    winner: null, slow: 0
  };
  return m;
}
function resetRound(m) {
  [m.f1, m.f2].forEach((f, i) => {
    f.x = i === 0 ? STAGE_W / 2 - 90 : STAGE_W / 2 + 90;
    f.y = 0; f.vx = 0; f.vy = 0; f.hp = MAX_HP; f.state = 'idle'; f.st = 0;
    f.air = false; f.stun = 0; f.crouch = false; f.atk = null; f.face = i === 0 ? 1 : -1;
    f.comboCount = 0; f.hits = 0; f.invuln = 0;
  });
  projs = []; fx = [];
  m.timer = ROUND_TIME; m.phase = 'intro'; m.pt = 0; m.winner = null;
}

function playerInput() {
  return {
    left: Input.down('left'), right: Input.down('right'), up: Input.down('up'), down: Input.down('down'),
    pHit: Input.hit('p'), kHit: Input.hit('k'), sHit: Input.hit('s'), uHit: Input.hit('u')
  };
}

function updateMatch(m) {
  m.pt++;
  const diff = DIFFS[Save.data.diff];

  if (hitstop > 0) { hitstop--; }
  else {
    if (m.phase === 'fight') {
      const i1 = playerInput();
      const i2 = aiInput(m.f2, m.f1, diff);
      stepFighter(m.f1, m.f2, i1);
      stepFighter(m.f2, m.f1, i2);
      physics(m.f1); physics(m.f2);
      pushApart(m.f1, m.f2);
      if (m.f1.hitCd > 0) m.f1.hitCd--;
      if (m.f2.hitCd > 0) m.f2.hitCd--;
      tryHit(m.f1, m.f2); tryHit(m.f2, m.f1);
      updateProjs(m);
      m.timer -= 1 / FPS;
      if (m.f1.state !== 'hurt' && m.f1.stun <= 0) m.f1.comboCount = 0;
      if (m.f2.state !== 'hurt' && m.f2.stun <= 0) m.f2.comboCount = 0;
      if (m.f1.hp <= 0 || m.f2.hp <= 0 || m.timer <= 0) endRound(m);
    } else {
      // intro / ko / roundend: los cuerpos siguen cayendo
      [m.f1, m.f2].forEach(f => {
        if (f.state === 'ko' || f.state === 'win' || f.air) { f.anim++; f.x += f.vx; f.vx *= .9; physics(f); f.st++; }
        else f.anim++;
      });
      updateProjs(m);
    }
  }

  // cámara
  const mid = (m.f1.x + m.f2.x) / 2;
  m.camX = clamp(lerp(m.camX, mid - W / 2, .12), 0, STAGE_W - W);

  // efectos
  fx = fx.filter(p => {
    p.life--;
    if (p.t === 'p') { p.x += p.vx; p.y += p.vy; p.vy += .16; p.vx *= .98; }
    else p.y += p.vy;
    return p.life > 0;
  });
  if (shake > 0) shake *= .84;

  // fases
  if (m.phase === 'intro') {
    if (m.pt === 1) { Audio_.bell(); Audio_.crowd(1.2); }
    if (m.pt > 130) { m.phase = 'fight'; m.pt = 0; }
  } else if (m.phase === 'ko') {
    if (m.pt > 150) {
      if (m.f1.wins >= ROUNDS_TO_WIN || m.f2.wins >= ROUNDS_TO_WIN || m.round >= 5) finishMatch(m);
      else { m.round++; resetRound(m); }
    }
  }
}

function endRound(m) {
  if (m.phase !== 'fight') return;
  m.phase = 'ko'; m.pt = 0;
  let w = null;
  if (m.f1.hp <= 0 && m.f2.hp <= 0) w = null;
  else if (m.f2.hp <= 0) w = m.f1;
  else if (m.f1.hp <= 0) w = m.f2;
  else w = m.f1.hp === m.f2.hp ? null : (m.f1.hp > m.f2.hp ? m.f1 : m.f2);
  if (w) {
    w.wins++;
    w.state = 'win'; w.st = 0; w.vx = 0;
    const l = w === m.f1 ? m.f2 : m.f1;
    if (l.state !== 'ko') { l.state = 'ko'; l.st = 0; l.air = true; l.vy = -5; }
  }
  m.roundWinner = w;
  Audio_.crowd(2);
}

function finishMatch(m) {
  const playerWon = m.f1.wins > m.f2.wins;
  results = { won: playerWon, m };
  if (m.isCup && cup) {
    if (playerWon) {
      cup.round++;
      if (cup.round >= cup.rivals.length) {
        Save.data.cups[cup.playerId] = (Save.data.cups[cup.playerId] || 0) + 1;
        Save.save();
        setScene('champion'); Audio_.stopMusic(); return;
      }
    }
  }
  setScene('result');
}

function updateProjs(m) {
  const fs = [m.f1, m.f2];
  projs = projs.filter(p => {
    p.x += p.vx; p.spin += .3 * Math.sign(p.vx); p.life--;
    if (p.x < 10 || p.x > STAGE_W - 10 || p.life <= 0) return false;
    for (const f of fs) {
      if (f === p.owner || f.invuln > 0 || f.state === 'ko') continue;
      const b = fighterBox(f);
      if (p.x + p.r > b.x && p.x - p.r < b.x + b.w && GROUND + p.y + p.r > b.y && GROUND + p.y - p.r < b.y + b.h) {
        const blocked = !f.air && f.guard;
        if (blocked) {
          f.hp = Math.max(0, f.hp - p.chip);
          f.stun = 12; f.state = 'blk'; f.st = 0; f.vx = Math.sign(p.vx) * 1.2;
          f.meter = Math.min(MAX_METER, f.meter + 5);
          Audio_.block(); sparks(p.x, GROUND + p.y, 6, '#bfe3ff', 3);
        } else {
          const dmg = Math.round(p.dmg * defMul(f));
          f.hp = Math.max(0, f.hp - dmg);
          f.stun = 20; f.state = 'hurt'; f.st = 0; f.flash = 6;
          f.vx = Math.sign(p.vx) * 3.4;
          p.owner.meter = Math.min(MAX_METER, p.owner.meter + 6);
          f.meter = Math.min(MAX_METER, f.meter + 5);
          hitstop = 5; shake = 3.4; Audio_.hit();
          sparks(p.x, GROUND + p.y, 10, '#ffd24a', 4);
          if (f.hp <= 0) { f.state = 'ko'; f.st = 0; f.air = true; f.vy = -6.6; f.vx = Math.sign(p.vx) * 3; Audio_.ko(); shake = 8; }
        }
        return false;
      }
    }
    return true;
  });
}

function drawBall(g, p) {
  g.save();
  g.translate(p.x, GROUND + p.y);
  // estela
  for (let i = 1; i <= 3; i++) {
    g.globalAlpha = .16 * (4 - i);
    g.fillStyle = p.big ? '#ffb03a' : '#ffffff';
    g.beginPath(); g.arc(-p.vx * i * 1.6, 0, p.r * (1 - i * .18), 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  g.rotate(p.spin);
  if (p.big) {
    g.fillStyle = '#ff8a2a'; g.beginPath(); g.arc(0, 0, p.r + 3, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#ffffff'; g.strokeStyle = '#1a1a22'; g.lineWidth = 1.4;
  g.beginPath(); g.arc(0, 0, p.r, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#1a1a22';
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    g.beginPath(); g.arc(Math.cos(a) * p.r * .55, Math.sin(a) * p.r * .55, p.r * .24, 0, Math.PI * 2); g.fill();
  }
  g.beginPath(); g.arc(0, 0, p.r * .3, 0, Math.PI * 2); g.fill();
  g.restore();
}

function drawMatch(m) {
  const camX = Math.round(m.camX);
  ctx.save();
  if (shake > .3) ctx.translate(rnd(-shake, shake), rnd(-shake, shake));

  drawStage(ctx, m.stage, camX, m.pt, m.f1, m.f2);

  ctx.save();
  ctx.translate(-camX, 0);
  // luchadores por orden de profundidad
  const order = m.f1.y > m.f2.y ? [m.f2, m.f1] : [m.f1, m.f2];
  order.forEach(f => drawFighter(ctx, f));
  projs.forEach(p => drawBall(ctx, p));
  // partículas
  fx.forEach(p => {
    if (p.t === 'p') {
      ctx.globalAlpha = clamp(p.life / 20, 0, 1);
      ctx.fillStyle = p.col; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = clamp(p.life / 30, 0, 1);
      text(p.s, p.x, p.y, { size: 11, align: 'center', color: p.col, stroke: 2.5 });
      ctx.globalAlpha = 1;
    }
  });
  ctx.restore();
  ctx.restore();

  drawHUD(m);

  // mensajes de fase
  if (m.phase === 'intro') {
    const t = m.pt;
    if (t < 60) {
      const s = clamp(t / 12, 0, 1);
      bigMsg('ROUND ' + m.round, W / 2, 118, 26 * s, '#ffd24a');
      text(m.stage.name, W / 2, 148, { size: 8, align: 'center', color: '#cfe0ff' });
    } else if (t < 130) {
      const s = clamp((t - 60) / 8, 0, 1.15);
      bigMsg('¡PELEA!', W / 2, 126, 34 * s, '#ff5f5f');
    }
  }
  if (m.phase === 'ko') {
    const w = m.roundWinner;
    if (m.pt < 90) bigMsg(m.timer <= 0 && w ? 'TIEMPO' : (w ? 'K.O.!' : 'EMPATE'), W / 2, 120, 38, '#fff36b');
    else if (w) {
      const nombre = w === m.f1 ? m.f1.def.pais : m.f2.def.pais;
      bigMsg(nombre, W / 2, 112, 20, '#fff');
      text('GANA LA RONDA', W / 2, 136, { size: 11, align: 'center', color: '#ffd24a', stroke: 2.5 });
    }
  }

  // pausa
  if (m.paused) {
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H);
    bigMsg('PAUSA', W / 2, 120, 28, '#fff');
    text('P = seguir   ·   K = salir', W / 2, 150, { size: 10, align: 'center', color: '#cfe0ff' });
    hot('resume', 0, 0, W, H);
  }
}

function bigMsg(s, x, y, size, col) {
  text(s, x, y, { size: Math.max(1, size), align: 'center', color: col, stroke: Math.max(2, size * .12), strokeCol: '#12030a' });
}

/* ---------------------------------------------------------
   17. PANTALLAS DE MENÚ
--------------------------------------------------------- */
function bgMenu(t) {
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#12103a'); grd.addColorStop(.5, '#2a1b56'); grd.addColorStop(1, '#0a0c1e');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  // balones flotando
  for (let i = 0; i < 12; i++) {
    const x = ((i * 97 + t * (.3 + i % 3 * .12)) % (W + 80)) - 40;
    const y = 30 + ((i * 53) % 200) + Math.sin(t * .02 + i) * 8;
    ctx.globalAlpha = .12;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, 8 + i % 4 * 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // franjas
  ctx.globalAlpha = .10;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = ['#00b4d8', '#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#a06cd5'][i];
    ctx.save(); ctx.translate(-60 + i * 96 + Math.sin(t * .01 + i) * 6, 0); ctx.rotate(D(12));
    ctx.fillRect(0, -40, 26, H + 120); ctx.restore();
  }
  ctx.globalAlpha = 1;
}

const MENU = [
  { id: 'copa', label: 'COPA MUNDIAL', desc: 'Gana 4 rondas y levanta el trofeo' },
  { id: 'amistoso', label: 'PARTIDO AMISTOSO', desc: 'Elige tu capitán y tu rival' },
  { id: 'dific', label: 'DIFICULTAD', desc: 'Ajusta el nivel de la máquina' },
  { id: 'ayuda', label: 'CÓMO SE JUEGA', desc: 'Controles y movimientos' }
];

function drawTitle(t) {
  bgMenu(t);
  // trofeo / título
  const bob = Math.sin(t * .05) * 2;
  text('MUNDIAL', W / 2, 52 + bob, { size: 34, align: 'center', color: '#ffd24a', stroke: 5, strokeCol: '#3a1200' });
  text('2026', W / 2 + 92, 34 + bob, { size: 18, align: 'center', color: '#8ff0ff', stroke: 3.5, strokeCol: '#04202a' });
  text('CAPTAIN  FIGHTERS', W / 2, 74 + bob, { size: 14, align: 'center', color: '#fff', stroke: 3, strokeCol: '#2a0a3a' });

  // banderas decorativas
  ROSTER.forEach((r, i) => {
    const x = 12 + i * 29, y = 88 + Math.sin(t * .04 + i * .6) * 2;
    FLAG[r.flag](ctx, x, y, 22, 14);
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, 21, 13);
  });

  MENU.forEach((it, i) => {
    const y = 122 + i * 27, sel = i === menuIdx;
    panel(120, y, 240, 22, sel ? 'rgba(255,210,74,.92)' : 'rgba(10,14,32,.8)', sel ? '#fff' : '#5d6cae');
    let lbl = it.label;
    if (it.id === 'dific') lbl += ':  ' + DIFFS[Save.data.diff].name;
    text(lbl, 240, y + 15, { size: 12, align: 'center', color: sel ? '#2a1400' : '#dfe7ff', shadow: !sel });
    hot('menu' + i, 120, y, 240, 22);
  });
  text(MENU[menuIdx].desc, W / 2, 240, { size: 9, align: 'center', color: '#a9b7e8' });
  text('Toca una opción · o usa ▲▼ y P', W / 2, 256, { size: 8, align: 'center', color: '#6c7aa8' });

  const cups = Object.values(Save.data.cups).reduce((a, b) => a + b, 0);
  if (cups) text('🏆 x' + cups, 12, 256, { size: 10, color: '#ffd24a' });
}

function drawSelect(t) {
  bgMenu(t * .5);
  const title = selPhase === 0 ? 'ELIGE TU CAPITÁN' : 'ELIGE A TU RIVAL';
  text(title, W / 2, 22, { size: 15, align: 'center', color: '#ffd24a', stroke: 3.5, strokeCol: '#2a1400' });

  const cols = 8, cw = 52, ch = 42, ox = (W - cols * cw) / 2, oy = 34;
  ROSTER.forEach((r, i) => {
    const cx = ox + (i % cols) * cw, cy = oy + Math.floor(i / cols) * ch;
    const cur = selPhase === 0 ? selIdx : selP2;
    const sel = i === cur;
    const otherSel = selPhase === 1 && i === selIdx;
    ctx.fillStyle = sel ? '#ffd24a' : otherSel ? '#4fd1ff' : 'rgba(10,14,32,.85)';
    rrect(ctx, cx + 2, cy + 2, cw - 4, ch - 4, 4); ctx.fill();
    FLAG[r.flag](ctx, cx + 8, cy + 6, 32, 20);
    ctx.strokeStyle = sel ? '#fff' : 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(cx + 8.5, cy + 6.5, 31, 19);
    text(r.cap.slice(0, 9), cx + cw / 2 - 2, cy + 35, { size: 7, align: 'center', color: sel ? '#2a1400' : '#cfd9ff', shadow: !sel });
    hot('char' + i, cx, cy, cw, ch);
  });

  // ficha del personaje
  const cur = selPhase === 0 ? selIdx : selP2;
  const r = ROSTER[cur];
  panel(10, 128, 196, 100);
  FLAG[r.flag](ctx, 18, 136, 40, 26); ctx.strokeStyle = '#fff'; ctx.strokeRect(18.5, 136.5, 39, 25);
  text(r.pais, 66, 148, { size: 11, color: '#ffd24a' });
  text('CAP. ' + r.cap, 66, 161, { size: 10, color: '#fff' });
  const stats = [['FUERZA', r.pow, '#ff6b6b'], ['VELOCIDAD', r.spd, '#4fd1ff'], ['DEFENSA', r.def, '#8affa1']];
  stats.forEach((s, i) => {
    text(s[0], 20, 182 + i * 15, { size: 8, color: '#a9b7e8' });
    for (let j = 0; j < 5; j++) {
      ctx.fillStyle = j < s[1] ? s[2] : 'rgba(255,255,255,.15)';
      ctx.fillRect(90 + j * 20, 175 + i * 15, 17, 7);
    }
  });
  panel(214, 128, 256, 100);
  text('ESPECIAL  (S)', 224, 146, { size: 9, color: '#8affa1' });
  text(r.sp, 330, 146, { size: 11, color: '#fff' });
  text('SUPER  (SUPER)', 224, 164, { size: 9, color: '#ffd24a' });
  text(r.su, 330, 164, { size: 11, color: '#fff' });
  // vista previa del luchador
  drawPortrait(r, 428, 222, .82, 'idle', t, -1);

  text(selPhase === 0 ? 'P = elegir · K = volver' : 'P = ¡a pelear! · K = atrás', W / 2, 244, { size: 9, align: 'center', color: '#a9b7e8' });
  panel(W / 2 - 52, 250, 104, 16, 'rgba(255,210,74,.9)', '#fff');
  text(selPhase === 0 ? 'ELEGIR' : 'PELEAR', W / 2, 262, { size: 10, align: 'center', color: '#2a1400', shadow: false });
  hot('confirm', W / 2 - 52, 248, 104, 20);
}

function drawVS(t) {
  const b = match.f2.def;
  ctx.fillStyle = '#08060f'; ctx.fillRect(0, 0, W, H);
  // mitades
  ctx.save();
  ctx.fillStyle = shade(match.f1.def.kit.shirt, -.55); ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(W * .58, 0); ctx.lineTo(W * .42, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(b.kit.shirt, -.55); ctx.beginPath();
  ctx.moveTo(W * .60, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(W * .44, H); ctx.closePath(); ctx.fill();
  ctx.restore();

  const s = clamp(t / 20, 0, 1);
  const off1 = (1 - s) * -160, off2 = (1 - s) * 160;
  ctx.save(); ctx.translate(off1, 0);
  FLAG[match.f1.def.flag](ctx, 26, 40, 90, 58);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(26, 40, 90, 58);
  text(match.f1.def.pais, 71, 116, { size: 12, align: 'center', color: '#fff', stroke: 3 });
  text(match.f1.def.cap, 71, 132, { size: 14, align: 'center', color: '#ffd24a', stroke: 3 });
  drawPortrait(match.f1.def, 71, 250, .95, 'idle', t, 1);
  ctx.restore();

  ctx.save(); ctx.translate(off2, 0);
  FLAG[b.flag](ctx, W - 116, 40, 90, 58);
  ctx.strokeStyle = '#fff'; ctx.strokeRect(W - 116, 40, 90, 58);
  text(b.pais, W - 71, 116, { size: 12, align: 'center', color: '#fff', stroke: 3 });
  text(b.cap, W - 71, 132, { size: 14, align: 'center', color: '#ffd24a', stroke: 3 });
  drawPortrait(b, W - 71, 250, .95, 'idle', t, -1);
  ctx.restore();

  const p = clamp((t - 18) / 10, 0, 1);
  ctx.save(); ctx.translate(W / 2, H / 2 - 6); ctx.scale(1 + (1 - p) * 3, 1 + (1 - p) * 3);
  text('VS', 0, 12, { size: 44, align: 'center', color: '#ff4d4d', stroke: 6, strokeCol: '#2a0000' });
  ctx.restore();

  if (cup) text(ROUND_NAMES[cup.round], W / 2, 30, { size: 12, align: 'center', color: '#8ff0ff', stroke: 3 });
  if (t > 40) text('TOCA PARA EMPEZAR', W / 2, 252, { size: 10, align: 'center', color: t % 40 < 20 ? '#fff' : '#8892c0' });
  hot('go', 0, 0, W, H);
}

function drawResult(t) {
  bgMenu(t * .4);
  const won = results.won;
  bigMsg(won ? '¡VICTORIA!' : 'DERROTA', W / 2, 70, 30, won ? '#ffd24a' : '#ff6b6b');
  const w = won ? results.m.f1 : results.m.f2;
  const l = won ? results.m.f2 : results.m.f1;
  drawPortrait(w.def, W / 2 - 66, 186, .95, 'win', t, 1);
  drawPortrait(l.def, W / 2 + 74, 186, .95, 'ko', 60, -1);

  text(w.def.pais + '  ' + w.wins + ' - ' + l.wins + '  ' + l.def.pais, W / 2, 210, { size: 12, align: 'center', color: '#fff', stroke: 2.5 });

  if (cup && won) {
    text('SIGUIENTE: ' + ROUND_NAMES[cup.round], W / 2, 218, { size: 10, align: 'center', color: '#8ff0ff' });
    panel(W / 2 - 60, 226, 120, 20, 'rgba(255,210,74,.92)', '#fff');
    text('CONTINUAR', W / 2, 240, { size: 11, align: 'center', color: '#2a1400', shadow: false });
    hot('next', W / 2 - 62, 224, 124, 24);
  } else {
    panel(W / 2 - 130, 226, 120, 20, 'rgba(255,210,74,.92)', '#fff');
    text(cup ? 'REINTENTAR' : 'REVANCHA', W / 2 - 70, 240, { size: 11, align: 'center', color: '#2a1400', shadow: false });
    hot('rematch', W / 2 - 132, 224, 124, 24);
    panel(W / 2 + 10, 226, 120, 20, 'rgba(10,14,32,.86)', '#5d6cae');
    text('MENÚ', W / 2 + 70, 240, { size: 11, align: 'center', color: '#dfe7ff' });
    hot('menuback', W / 2 + 8, 224, 124, 24);
  }
  text('P = aceptar · K = menú', W / 2, 260, { size: 8, align: 'center', color: '#6c7aa8' });
}

function drawTrophy(g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.strokeStyle = '#7a5b0e'; g.lineWidth = 1.6;
  // asas
  g.beginPath(); g.arc(-9, -6, 5.5, Math.PI * .5, Math.PI * 1.5); g.stroke();
  g.beginPath(); g.arc(9, -6, 5.5, Math.PI * 1.5, Math.PI * .5); g.stroke();
  // copa
  const gr = g.createLinearGradient(-9, -14, 9, 6);
  gr.addColorStop(0, '#fff2b0'); gr.addColorStop(.5, '#ffd24a'); gr.addColorStop(1, '#c8890c');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(-9, -14); g.lineTo(9, -14); g.lineTo(6, 2); g.lineTo(-6, 2); g.closePath(); g.fill();
  g.strokeStyle = '#8a6209'; g.lineWidth = 1.2; g.stroke();
  // pie
  g.fillStyle = '#e0ac1c'; g.fillRect(-2.5, 2, 5, 5);
  g.fillStyle = '#ffd24a'; g.fillRect(-8, 7, 16, 4);
  g.fillStyle = '#c8890c'; g.fillRect(-9, 11, 18, 3);
  // brillo
  g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(-6, -12, 2, 10);
  g.restore();
}

function drawChampion(t) {
  ctx.fillStyle = '#0a0820'; ctx.fillRect(0, 0, W, H);
  // confeti
  for (let i = 0; i < 90; i++) {
    const x = (i * 37 % W) + Math.sin(t * .04 + i) * 12;
    const y = ((i * 53 + t * (1.4 + i % 5 * .4)) % (H + 40)) - 20;
    ctx.fillStyle = ['#ffd24a', '#ff5f6d', '#4fd1ff', '#8affa1', '#fff'][i % 5];
    ctx.fillRect(x, y, 3, 5);
  }
  const champ = byId(cup ? cup.playerId : Save.data.last) || ROSTER[0];
  // rayos
  ctx.save(); ctx.translate(W / 2, 132);
  for (let i = 0; i < 14; i++) {
    ctx.rotate(Math.PI * 2 / 14);
    ctx.fillStyle = 'rgba(255,210,74,.10)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(300, -22); ctx.lineTo(300, 22); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  text('¡CAMPEÓN DEL MUNDO!', W / 2, 28, { size: 19, align: 'center', color: '#ffd24a', stroke: 4, strokeCol: '#3a1200' });
  FLAG[champ.flag](ctx, W / 2 - 28, 36, 56, 36);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - 28, 36, 56, 36);
  text(champ.pais, W / 2, 92, { size: 17, align: 'center', color: '#fff', stroke: 3 });
  text('CAPITÁN ' + champ.cap + ' LEVANTA LA COPA 2026', W / 2, 108, { size: 9, align: 'center', color: '#8ff0ff', stroke: 2 });

  drawPortrait(champ, W / 2, 252, 1.05, 'win', t, 1);
  drawTrophy(ctx, W / 2 + 2, 140 + Math.sin(t * .16) * 3, 1.2);
  text('TOCA PARA VOLVER', W / 2, 266, { size: 8, align: 'center', color: t % 50 < 25 ? '#ffffff' : '#7d8ab8' });
  hot('done', 0, 0, W, H);
}

function drawHelp(t) {
  bgMenu(t * .4);
  panel(20, 16, W - 40, H - 46);
  text('CÓMO SE JUEGA', W / 2, 36, { size: 14, align: 'center', color: '#ffd24a' });
  const lines = [
    ['▲', 'Saltar  (+ ◀ ▶ para saltar en diagonal)'],
    ['▼', 'Agacharse  ·  ▼ + P/K = golpes bajos'],
    ['◀ ▶', 'Caminar  ·  hacia atrás = BLOQUEAR'],
    ['P', 'Puñetazo rápido (poco daño, sale antes)'],
    ['K', 'Patada fuerte (más daño y empuje)'],
    ['S', 'Especial: lanza el balón como proyectil'],
    ['SUPER', 'Chilena devastadora (barra azul al 100%)'],
    ['', 'Barrido (▼+K) derriba · el salto no se bloquea agachado'],
    ['⏸', 'Toca el reloj durante el combate para pausar']
  ];
  lines.forEach((l, i) => {
    text(l[0], 40, 56 + i * 18, { size: 11, color: '#8ff0ff' });
    text(l[1], 96, 56 + i * 18, { size: 9.5, color: '#dfe7ff' });
  });
  text('Gana 2 rondas para ganar el partido', W / 2, 222, { size: 10, align: 'center', color: '#ffd24a' });
  panel(W / 2 - 50, 232, 100, 18, 'rgba(255,210,74,.92)', '#fff');
  text('VOLVER', W / 2, 245, { size: 10, align: 'center', color: '#2a1400', shadow: false });
  hot('back', W / 2 - 52, 230, 104, 22);
}

/* ---------------------------------------------------------
   18. NAVEGACIÓN
--------------------------------------------------------- */
function updateTitle() {
  Audio_.playMusic('menu');
  if (Input.hit('down')) { menuIdx = (menuIdx + 1) % MENU.length; Audio_.cursor(); }
  if (Input.hit('up')) { menuIdx = (menuIdx + MENU.length - 1) % MENU.length; Audio_.cursor(); }
  if (MENU[menuIdx].id === 'dific' && (Input.hit('left') || Input.hit('right'))) {
    Save.data.diff = (Save.data.diff + (Input.hit('right') ? 1 : DIFFS.length - 1)) % DIFFS.length;
    Save.save(); Audio_.cursor();
  }
  for (let i = 0; i < MENU.length; i++) if (tookTap('menu' + i)) { menuIdx = i; Audio_.cursor(); chooseMenu(); return; }
  if (Input.hit('p')) chooseMenu();
}
function chooseMenu() {
  const id = MENU[menuIdx].id;
  Audio_.ok();
  if (id === 'copa') { cup = null; selPhase = 0; selIdx = ROSTER.findIndex(r => r.id === Save.data.last); if (selIdx < 0) selIdx = 0; setScene('select'); modeCup = true; }
  else if (id === 'amistoso') { cup = null; selPhase = 0; selIdx = ROSTER.findIndex(r => r.id === Save.data.last); if (selIdx < 0) selIdx = 0; setScene('select'); modeCup = false; }
  else if (id === 'dific') { Save.data.diff = (Save.data.diff + 1) % DIFFS.length; Save.save(); }
  else setScene('help');
}
let modeCup = true;

function updateSelect() {
  Audio_.playMusic('menu');
  const cols = 8;
  let cur = selPhase === 0 ? selIdx : selP2;
  let moved = false;
  if (Input.hit('right')) { cur = (cur + 1) % ROSTER.length; moved = true; }
  if (Input.hit('left')) { cur = (cur + ROSTER.length - 1) % ROSTER.length; moved = true; }
  if (Input.hit('down')) { cur = (cur + cols) % ROSTER.length; moved = true; }
  if (Input.hit('up')) { cur = (cur + ROSTER.length - cols) % ROSTER.length; moved = true; }
  for (let i = 0; i < ROSTER.length; i++) {
    if (tookTap('char' + i)) {
      if (cur === i) { confirmSelect(); return; }
      cur = i; moved = true;
    }
  }
  if (moved) Audio_.cursor();
  if (selPhase === 0) selIdx = cur; else selP2 = cur;

  if (Input.hit('p') || tookTap('confirm')) confirmSelect();
  else if (Input.hit('k')) {
    if (selPhase === 1) { selPhase = 0; Audio_.cursor(); }
    else { setScene('title'); Audio_.cursor(); }
  }
}
function confirmSelect() {
  Audio_.ok();
  Save.data.last = ROSTER[selIdx].id; Save.save();
  if (modeCup) {
    cup = newCup(ROSTER[selIdx].id);
    match = newMatch(cup.playerId, cup.rivals[cup.round], true);
    setScene('vs');
  } else if (selPhase === 0) {
    selPhase = 1; selP2 = (selIdx + 1) % ROSTER.length;
  } else {
    cup = null;
    match = newMatch(ROSTER[selIdx].id, ROSTER[selP2].id, false);
    setScene('vs');
  }
}

/* ---------------------------------------------------------
   19. BUCLE PRINCIPAL
--------------------------------------------------------- */
let last = performance.now(), acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  acc += Math.min(100, now - last); last = now;
  let steps = 0;
  while (acc >= DT && steps < 5) { update(); acc -= DT; steps++; }
  render();
  tapped = null;
}

function update() {
  Input.update();
  sceneT++;

  switch (scene) {
    case 'title': updateTitle(); break;
    case 'select': updateSelect(); break;
    case 'vs':
      Audio_.stopMusic();
      if (sceneT > 40 && (Input.anyHit() || tapped)) { setScene('fight'); match.pt = 0; Audio_.playMusic('fight'); }
      else if (sceneT > 260) { setScene('fight'); match.pt = 0; Audio_.playMusic('fight'); }
      break;
    case 'fight':
      Audio_.playMusic('fight');
      if (match.paused) {
        if (Input.hit('p') || tookTap('resume')) match.paused = false;
        if (Input.hit('k')) { match.paused = false; cup = null; setScene('title'); }
      } else {
        updateMatch(match);
      }
      break;
    case 'result':
      Audio_.playMusic('menu');
      if (tookTap('next') || (cup && results.won && Input.hit('p'))) { nextCupMatch(); }
      else if (tookTap('rematch') || (!(cup && results.won) && Input.hit('p'))) {
        Audio_.ok();
        if (cup) match = newMatch(cup.playerId, cup.rivals[cup.round], true);
        else match = newMatch(match.f1.def.id, match.f2.def.id, false);
        setScene('vs');
      }
      else if (tookTap('menuback') || Input.hit('k')) { cup = null; setScene('title'); }
      break;
    case 'champion':
      Audio_.playMusic('menu');
      if (sceneT > 60 && (Input.anyHit() || tapped)) { cup = null; setScene('title'); }
      break;
    case 'help':
      Audio_.playMusic('menu');
      if (Input.hit('p') || Input.hit('k') || tookTap('back')) setScene('title');
      break;
  }
}

function nextCupMatch() {
  match = newMatch(cup.playerId, cup.rivals[cup.round], true);
  setScene('vs'); Audio_.ok();
}

function render() {
  const inMenu = scene !== 'fight';
  if (inMenu !== document.body.classList.contains('in-menu')) {
    document.body.classList.toggle('in-menu', inMenu);
    fitCanvas();
  }
  hotspots = [];
  ctx.clearRect(0, 0, W, H);
  switch (scene) {
    case 'title': drawTitle(sceneT); break;
    case 'select': drawSelect(sceneT); break;
    case 'vs': drawVS(sceneT); break;
    case 'fight': drawMatch(match); break;
    case 'result': drawResult(sceneT); break;
    case 'champion': drawChampion(sceneT); break;
    case 'help': drawHelp(sceneT); break;
  }
  // marco
  ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);
}

/* ---------------------------------------------------------
   20. BOTONES SUPERIORES
--------------------------------------------------------- */
const btnSound = document.getElementById('btnSound');
const btnFull = document.getElementById('btnFull');
function refreshSoundBtn() {
  btnSound.textContent = Audio_.on ? '🔊' : '🔇';
  btnSound.classList.toggle('off', !Audio_.on);
}
btnSound.addEventListener('click', e => {
  e.stopPropagation();
  Audio_.init(); Audio_.resume();
  Audio_.on = !Audio_.on; Audio_.musicOn = Audio_.on;
  Save.data.sound = Audio_.on; Save.data.music = Audio_.on; Save.save();
  if (!Audio_.on) Audio_.stopMusic();
  refreshSoundBtn();
});
refreshSoundBtn();
btnFull.addEventListener('click', e => {
  e.stopPropagation();
  const el = document.documentElement;
  if (!document.fullscreenElement) { (el.requestFullscreen || el.webkitRequestFullscreen || function () { }).call(el); }
  else document.exitFullscreen && document.exitFullscreen();
  if (screen.orientation && screen.orientation.lock) { screen.orientation.lock('landscape').catch(() => { }); }
});

/* pausa al tocar fuera de los mandos durante el combate */
canvas.addEventListener('pointerdown', () => {
  if (scene === 'fight' && !match.paused && match.phase === 'fight' && tapped && tapped.y < 60 && tapped.x > W / 2 - 30 && tapped.x < W / 2 + 30) {
    match.paused = true;
  }
});

/* ---------------------------------------------------------
   21. AJUSTE DE TAMAÑO (el lienzo ocupa todo lo posible)
--------------------------------------------------------- */
const stageEl = document.getElementById('stage');
const wrapEl = document.getElementById('wrap');
const topEl = document.getElementById('top');
function fitCanvas() {
  const r = stageEl.getBoundingClientRect();
  const aw = Math.max(80, r.width), ah = Math.max(60, r.height);
  const sc = Math.min(aw / W, ah / H);
  canvas.style.width = Math.floor(W * sc) + 'px';
  canvas.style.height = Math.floor(H * sc) + 'px';

  // los botones de sonido/pantalla completa buscan un hueco fuera del lienzo
  const rc = canvas.getBoundingClientRect(), rw = wrapEl.getBoundingClientRect();
  topEl.style.right = 'auto'; topEl.style.bottom = 'auto';
  if (rw.right - rc.right >= 40) {                 // hueco a la derecha (apaisado)
    topEl.style.left = (rc.right - rw.left + 4) + 'px';
    topEl.style.top = (rc.top - rw.top) + 'px';
    topEl.style.flexDirection = 'column';
  } else if (rw.bottom - rc.bottom >= 38) {        // hueco debajo (vertical)
    topEl.style.left = (rc.right - rw.left - 76) + 'px';
    topEl.style.top = (rc.bottom - rw.top + 6) + 'px';
    topEl.style.flexDirection = 'row';
  } else {                                          // sin hueco: encima del lienzo
    topEl.style.left = (rc.right - rw.left - 78) + 'px';
    topEl.style.top = (rc.top - rw.top + 4) + 'px';
    topEl.style.flexDirection = 'row';
  }
}
addEventListener('resize', fitCanvas);
addEventListener('orientationchange', () => setTimeout(fitCanvas, 250));
if (window.visualViewport) visualViewport.addEventListener('resize', fitCanvas);
fitCanvas();
setTimeout(fitCanvas, 200);

/* ---------------------------------------------------------
   22. ARRANQUE
--------------------------------------------------------- */
Input.init();
requestAnimationFrame(frame);

})();
