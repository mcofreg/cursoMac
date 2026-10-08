/*
 * audio.js — sintetiza TODO el audio con código (ondas, ruido, envolventes).
 * Lee la MISMA línea de tiempo que mueve la animación (src/timeline.js + data.json):
 * cada evento visual (`tl.events`) dispara su efecto en el instante exacto.
 * Salida: entrega/efectos.wav, entrega/musica.wav, entrega/mezcla.wav (48 kHz, estéreo, 16 bit)
 */
const fs = require('fs');
const path = require('path');
const T = require('../src/timeline.js');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'entrega');
fs.mkdirSync(OUT, { recursive: true });

const SR = 48000;
const tl = T.build(JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8')));
const DUR = tl.duration + 0.4;
const N = Math.ceil(DUR * SR);
const TAU = Math.PI * 2;

// ---------- utilidades ----------
let seed = 12345;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rand() * 2 - 1;
const buf = () => [new Float32Array(N), new Float32Array(N)];
const sfx = buf(), mus = buf();

function add(track, t0, mono, gain, pan) {
  // mono: Float32Array de la voz; pan −1..1 (ley de potencia constante)
  const s0 = Math.floor(t0 * SR);
  const a = (pan + 1) * Math.PI / 4, gl = Math.cos(a) * gain, gr = Math.sin(a) * gain;
  for (let i = 0; i < mono.length; i++) { const k = s0 + i; if (k < 0 || k >= N) continue; track[0][k] += mono[i] * gl; track[1][k] += mono[i] * gr; }
}
function voice(dur, fn) { const n = Math.floor(dur * SR), v = new Float32Array(n); for (let i = 0; i < n; i++) v[i] = fn(i / SR, i); return v; }
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
function lp(v, fc) { const k = 1 - Math.exp(-TAU * fc / SR); let y = 0; for (let i = 0; i < v.length; i++) { y += k * (v[i] - y); v[i] = y; } return v; }
function hp(v, fc) { const k = 1 - Math.exp(-TAU * fc / SR); let y = 0; for (let i = 0; i < v.length; i++) { y += k * (v[i] - y); v[i] = v[i] - y; } return v; }
// barrido senoidal con fase continua
function sweep(dur, f0, f1, a, d, shape) {
  let ph = 0;
  return voice(dur, (t) => { const f = f0 * Math.pow(f1 / f0, Math.min(1, t / dur)); ph += TAU * f / SR; const s = shape === 'tri' ? (2 / Math.PI) * Math.asin(Math.sin(ph)) : Math.sin(ph); return s * env(t, a, d); });
}
function tone(dur, f, a, d, partials) {
  partials = partials || [[1, 1]];
  return voice(dur, (t) => { let s = 0; for (const [m, g] of partials) s += Math.sin(TAU * f * m * t) * g; return s * env(t, a, d); });
}
function noiseBurst(dur, a, d, lo, hi) { let v = voice(dur, (t) => noise() * env(t, a, d)); if (hi) v = lp(v, hi); if (lo) v = hp(v, lo); return v; }

// paneo según la posición en pantalla de quien produce el sonido
function panRobot(t) { const r = T.robotAt(tl, t); return Math.max(-0.7, Math.min(0.7, (r.x - r.y) / 12)); }
function panPerson(t) { const p = T.personAt(tl, t); return Math.max(-0.7, Math.min(0.7, (p.x - p.y) / 12)); }
const STATION_PAN = { leer: -0.25, responder: -0.3, clasificar: -0.45, cuenta: 0.05, buscar: 0.3, calcular: 0.5, ejecutar: 0.05, verificar: -0.05, derivar: 0.45 };

// ---------- biblioteca de efectos ----------
const FX = {
  paso: (e) => { const v = voice(0.09, (t) => (Math.sin(TAU * (150 - 600 * t) * t) * 0.9 + noise() * 0.25) * env(t, 0.002, 0.025)); add(sfx, e.t, lp(v, 1800), 0.22, panRobot(e.t)); },
  paso_persona: (e) => { const f = e.escalera ? 210 : 170; const v = voice(0.12, (t) => (Math.sin(TAU * f * t) * 0.7 + noise() * 0.4) * env(t, 0.002, 0.03)); add(sfx, e.t, lp(v, e.escalera ? 2500 : 1500), e.escalera ? 0.28 : 0.2, panPerson(e.t)); },
  burbuja_entra: (e) => add(sfx, e.t, sweep(0.22, 380, 980, 0.01, 0.08), 0.22, -0.4),
  burbuja_llega: (e) => { add(sfx, e.t, sweep(0.12, 1100, 620, 0.002, 0.04), 0.3, -0.3); add(sfx, e.t, noiseBurst(0.03, 0.001, 0.006, 2000), 0.15, -0.3); },
  leer: (e) => { add(sfx, e.t, tone(0.12, 880, 0.005, 0.04, [[1, 1], [2, 0.2]]), 0.14, -0.3); add(sfx, e.t + 0.1, tone(0.15, 1175, 0.005, 0.05, [[1, 1], [2, 0.2]]), 0.14, -0.3); },
  pensar: (e) => { [660, 784, 988].forEach((f, i) => add(sfx, e.t + i * 0.16, tone(0.2, f, 0.01, 0.06, [[1, 1], [3, 0.1]]), 0.12, -0.45)); },
  tarjeta: (e) => add(sfx, e.t, noiseBurst(0.05, 0.001, 0.01, 800, 5000), 0.3, -0.5),
  cajon_abre: (e) => { const v = voice(0.32, (t) => noise() * (t < 0.28 ? 0.6 : 0) * (0.5 + 0.5 * Math.sin(TAU * 38 * t))); add(sfx, e.t, lp(hp(v, 120), 900), 0.32, 0.05); add(sfx, e.t + 0.3, voice(0.12, (t) => Math.sin(TAU * 140 * t) * env(t, 0.001, 0.03)), 0.35, 0.05); },
  cajon_cierra: (e) => { add(sfx, e.t, lp(noiseBurst(0.18, 0.005, 0.05, 80), 700), 0.3, 0.05); add(sfx, e.t + 0.12, voice(0.15, (t) => Math.sin(TAU * 110 * t) * env(t, 0.001, 0.04)), 0.4, 0.05); },
  paginas: (e) => { const v = voice(0.22, (t) => noise() * Math.sin(Math.PI * Math.min(1, t / 0.22)) * (0.6 + 0.4 * Math.sin(TAU * 60 * t))); add(sfx, e.t, lp(hp(v, 1500), 7000), 0.22, 0.3); },
  engranajes: (e) => {
    const d = e.dur || 1;
    for (let k = 0; k < d * 13; k++) add(sfx, e.t + k / 13, noiseBurst(0.025, 0.001, 0.005, 2500), 0.16, 0.5);
    let ph = 0; const wh = voice(d, (t) => { ph += TAU * (70 + 10 * Math.sin(TAU * 3 * t)) / SR; return ((ph / TAU) % 1 * 2 - 1) * Math.min(1, t / 0.1, (d - t) / 0.15); });
    add(sfx, e.t, lp(wh, 500), 0.12, 0.5);
  },
  papel: (e) => { const v = voice(0.65, (t) => noise() * (Math.sin(TAU * 45 * t) > 0 ? 1 : 0.3) * Math.min(1, (0.65 - t) / 0.1)); add(sfx, e.t, lp(hp(v, 600), 4000), 0.2, 0.5); },
  chispas: (e) => {
    for (let k = 0; k < 26; k++) { const tt = e.t + Math.pow(rand(), 1.6) * 0.7; add(sfx, tt, noiseBurst(0.02 + rand() * 0.03, 0.0005, 0.006, 3000), 0.35 * (1 - (tt - e.t)), 0.5 + (rand() - 0.5) * 0.4); }
    add(sfx, e.t, voice(0.35, (t) => (Math.sin(TAU * 100 * t) > 0 ? 1 : -1) * env(t, 0.005, 0.1)), 0.1, 0.5);
    add(sfx, e.t + 0.05, sweep(0.5, 600, 140, 0.005, 0.2, 'tri'), 0.18, 0.5);
  },
  alarma: (e) => { for (let k = 0; k < 4; k++) add(sfx, e.t + k * 0.2, tone(0.17, k % 2 ? 660 : 880, 0.005, 0.12, [[1, 1], [3, 0.3]]), 0.16, 0.05); },
  lupa: (e) => add(sfx, e.t, sweep(0.4, 1800, 2600, 0.05, 0.15), 0.06, -0.05),
  semaforo_rojo: (e) => { for (let k = 0; k < 2; k++) add(sfx, e.t + k * 0.18, voice(0.15, (t) => (Math.sin(TAU * 220 * t) > 0 ? 1 : -1) * env(t, 0.003, 0.08)), 0.12, -0.05); },
  semaforo_verde: (e) => { add(sfx, e.t, noiseBurst(0.02, 0.0005, 0.004, 3000), 0.4, -0.05); add(sfx, e.t + 0.03, tone(0.6, 1318.5, 0.003, 0.18, [[1, 1], [2.01, 0.3]]), 0.17, -0.05); add(sfx, e.t + 0.13, tone(0.7, 1760, 0.003, 0.22, [[1, 1], [2.01, 0.3]]), 0.15, -0.05); },
  palanca: (e) => { add(sfx, e.t, voice(0.2, (t) => Math.sin(TAU * 90 * t) * env(t, 0.001, 0.05)), 0.45, 0.2); add(sfx, e.t, noiseBurst(0.06, 0.001, 0.015, 500, 3000), 0.3, 0.2); },
  tubos: (e) => { const d = e.dur || 1; let v = voice(d, (t) => noise() * Math.sin(Math.PI * t / d)); v = lp(hp(v, 300), 1600); add(sfx, e.t, v, 0.22, 0.3); },
  moneda: (e) => { add(sfx, e.t, tone(0.25, 2093, 0.001, 0.05, [[1, 1], [1.5, 0.6], [2.76, 0.3]]), 0.07, 0.35 - rand() * 0.3); },
  cuerda: (e) => add(sfx, e.t, lp(voice(0.5, (t) => noise() * Math.sin(Math.PI * t / 0.5) * (0.5 + 0.5 * Math.sin(TAU * 18 * t))), 600), 0.25, 0.45),
  campana: (e) => { const f = 660; add(sfx, e.t, tone(2.6, f, 0.002, 0.7, [[1, 1], [2.0, 0.5], [2.76, 0.35], [5.4, 0.2], [8.9, 0.08]]), 0.1, 0.45); },
  mochila: (e) => { add(sfx, e.t - 0.45, lp(voice(0.45, (t) => noise() * Math.sin(Math.PI * t / 0.45)), 1200), 0.18, 0.4); add(sfx, e.t, voice(0.14, (t) => Math.sin(TAU * 120 * t) * env(t, 0.001, 0.04)), 0.35, 0.4); },
  asiente: (e) => { add(sfx, e.t, tone(0.25, 330, 0.03, 0.08, [[1, 1], [2, 0.3]]), 0.06, 0.45); add(sfx, e.t + 0.2, tone(0.3, 392, 0.03, 0.1, [[1, 1], [2, 0.3]]), 0.06, 0.45); },
  sello: (e) => { add(sfx, e.t, voice(0.2, (t) => Math.sin(TAU * (160 - 300 * t) * t) * env(t, 0.001, 0.05)), 0.55, 0.45); add(sfx, e.t, noiseBurst(0.05, 0.001, 0.012, 300, 3000), 0.35, 0.45); },
  telegrafo: (e) => { add(sfx, e.t, noiseBurst(0.02, 0.0005, 0.004, 2500), 0.35, -0.3); add(sfx, e.t, tone(0.06, 3200, 0.001, 0.012), 0.08, -0.3); },
  envio: (e) => { add(sfx, e.t, lp(voice(0.5, (t) => noise() * Math.sin(Math.PI * t / 0.5)), 3000), 0.12, -0.5); add(sfx, e.t + 0.05, sweep(0.35, 500, 1500, 0.01, 0.12), 0.15, -0.5); },
  celebra: (e) => { [784, 988, 1175, 1568].forEach((f, i) => add(sfx, e.t + i * 0.07, tone(0.45, f, 0.003, 0.15, [[1, 1], [2, 0.25]]), 0.11, panRobot(e.t))); },
  archivar: (e) => { for (let k = 0; k < 5; k++) add(sfx, e.t + k * 0.05, lp(hp(noiseBurst(0.08, 0.002, 0.02), 1000), 6000), 0.15, -0.4); },
  hoja: (e) => add(sfx, e.t, lp(hp(noiseBurst(0.1, 0.01, 0.03), 2000), 8000), 0.1, panRobot(e.t)),
  duda: (e) => { add(sfx, e.t, sweep(0.22, 520, 440, 0.01, 0.08, 'tri'), 0.13, 0.3); add(sfx, e.t + 0.22, sweep(0.3, 440, 620, 0.01, 0.12, 'tri'), 0.13, 0.3); },
  campanita_final: (e) => { [1047, 1319, 1568, 2093].forEach((f, i) => add(sfx, e.t + i * 0.12, tone(2.2, f, 0.002, 0.6, [[1, 1], [2.0, 0.3], [3.0, 0.1]]), 0.12, (i - 1.5) * 0.25)); },
  cafe: (e) => add(sfx, e.t, tone(0.3, 2600, 0.001, 0.06, [[1, 1], [1.7, 0.5]]), 0.08, -0.4),
};

const used = {};
for (const e of tl.events) { const f = FX[e.type]; if (f) { f(e); used[e.type] = (used[e.type] || 0) + 1; } }

// ---------- música (lo-fi suave en bucle, 96 BPM) ----------
const BPM = 96, beat = 60 / BPM, bar = beat * 4;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const prog = [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 55]]; // Cmaj7 Am7 Fmaj7 G
const nBars = Math.ceil(DUR / bar);
for (let b = 0; b < nBars; b++) {
  const ch = prog[b % 4], t0 = b * bar;
  // pad: sierras desafinadas filtradas
  for (const m of ch) {
    const f = mtof(m + 12);
    let p1 = 0, p2 = 0;
    let v = voice(bar + 0.6, (t) => { p1 += f * 1.003 / SR; p2 += f * 0.997 / SR; const s = ((p1 % 1) * 2 - 1) + ((p2 % 1) * 2 - 1); return s * Math.min(1, t / 0.6) * Math.min(1, (bar + 0.6 - t) / 0.6); });
    add(mus, t0, lp(lp(v, 900), 1400), 0.022, 0);
  }
  // bajo
  add(mus, t0, tone(beat * 2, mtof(ch[0] - 12), 0.01, 0.5, [[1, 1], [2, 0.25]]), 0.11, 0);
  add(mus, t0 + beat * 2.5, tone(beat * 1.5, mtof(ch[0] - 12 + (b % 2 ? 7 : 0)), 0.01, 0.35, [[1, 1], [2, 0.25]]), 0.08, 0);
  // piano eléctrico (FM) en arpegio de corcheas
  for (let k = 0; k < 8; k++) {
    if ((b + k) % 5 === 4) continue;
    const m = ch[[0, 2, 1, 3, 2, 1, 3, 2][k]] + 24, f = mtof(m), tk = t0 + k * beat / 2 + (k % 2 ? 0.02 : 0);
    const v = voice(0.9, (t) => Math.sin(TAU * f * t + 1.2 * Math.exp(-t * 6) * Math.sin(TAU * f * 2 * t)) * env(t, 0.004, 0.28));
    add(mus, tk, v, 0.035, k % 2 ? 0.25 : -0.25);
  }
  // batería suave: bombo 1 y 3, shaker en corcheas
  for (const k of [0, 2]) add(mus, t0 + k * beat, voice(0.3, (t) => Math.sin(TAU * (110 * Math.exp(-t * 18) + 45) * t) * env(t, 0.002, 0.09)), 0.16, 0);
  for (let k = 0; k < 8; k++) add(mus, t0 + k * beat / 2, hp(noiseBurst(0.06, 0.004, 0.018), 6000), k % 2 ? 0.035 : 0.02, 0.15);
  if (b % 2 === 1) add(mus, t0 + beat * 3, lp(hp(noiseBurst(0.18, 0.002, 0.06), 900), 5000), 0.05, 0);
}
// fundidos de la música
for (let i = 0; i < N; i++) { const t = i / SR; const g = Math.min(1, t / 1.5) * Math.min(1, Math.max(0, (tl.duration - t) / 1.2)); mus[0][i] *= g; mus[1][i] *= g; }

// ---------- ducking: la música baja cuando suenan efectos ----------
const duck = new Float32Array(N);
{ let e = 0; const at = 1 - Math.exp(-1 / (0.02 * SR)), rl = 1 - Math.exp(-1 / (0.35 * SR));
  for (let i = 0; i < N; i++) { const x = Math.abs(sfx[0][i]) + Math.abs(sfx[1][i]); e += (x > e ? at : rl) * (x - e); duck[i] = 1 - 0.5 * Math.min(1, e / 0.12); } }

function normalize(tr, peak) { let m = 0; for (const c of tr) for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(c[i])); const g = m > 0 ? peak / m : 1; for (const c of tr) for (let i = 0; i < N; i++) c[i] *= g; return g; }
function writeWav(file, tr) {
  const b = Buffer.alloc(44 + N * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + N * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) for (let c = 0; c < 2; c++) { const v = Math.max(-1, Math.min(1, tr[c][i])); b.writeInt16LE(Math.round(v * 32767), 44 + i * 4 + c * 2); }
  fs.writeFileSync(file, b);
}
// mezcla (con niveles relativos fijos, antes de normalizar cada pista por separado)
const mix = buf();
const MUSIC_GAIN = 0.55;
for (let i = 0; i < N; i++) for (let c = 0; c < 2; c++) mix[c][i] = sfx[c][i] + mus[c][i] * MUSIC_GAIN * duck[i];
// limitador suave
for (const c of mix) for (let i = 0; i < N; i++) c[i] = Math.tanh(c[i] * 1.1) / Math.tanh(1.1);
normalize(mix, 0.89);
writeWav(path.join(OUT, 'mezcla.wav'), mix);
normalize(sfx, 0.89); writeWav(path.join(OUT, 'efectos.wav'), sfx);
normalize(mus, 0.8); writeWav(path.join(OUT, 'musica.wav'), mus);
console.log('duración', DUR.toFixed(2), 's · eventos con sonido:', used);
