/*
 * scene.js — dibuja la oficina-diorama isométrica en un <canvas> para un tiempo t.
 * Todo es vectorial y determinista: renderFrame(ctx, tl, t) siempre produce el mismo frame.
 */
(function (root) {
  'use strict';
  const T = root.Timeline;
  const { iso, clamp, lerp, smooth, easeInOut, U } = T;
  const L = T.LAYOUT;
  const W = 1920, H = 1080;
  const SANS = 'Inter, "DejaVu Sans", sans-serif';
  const MONO = '"DejaVu Sans Mono", "Liberation Mono", monospace';

  // ---------- paleta ----------
  const C = {
    bg0: '#241c3b', bg1: '#3d2b52', ink: '#231c3f', navy: '#1b1636',
    floor: '#f2d3a8', floorLine: '#e4bf8f', slabL: '#c96f4a', slabR: '#a9573a',
    wallL: '#fbe9d6', wallR: '#f5dcc4', wallTop: '#e9c6a5', base: '#d9a57d',
    wood: '#c98b57', woodD: '#a86c3f', woodL: '#e0a874',
    indigo: '#5b4bd6', indigoD: '#3f32a8', mint: '#7fe0c4', coral: '#ff8a6b',
    neonC: '#29e6ff', neonM: '#ff4fa3', neonY: '#ffd23f', neonG: '#7dff6b',
    paper: '#fffaf0', white: '#ffffff',
  };

  // ---------- utilidades ----------
  function P(x, y, z) { return iso(x, y, z || 0); }
  function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function rnd(i, seed) { return hash(i * 17.13 + seed * 3.7); }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
  }
  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function fillRR(ctx, x, y, w, h, r, fill, stroke, lw) { rrect(ctx, x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); } }
  function text(ctx, s, x, y, o) {
    o = o || {};
    ctx.font = `${o.weight || 600} ${o.size || 16}px ${o.mono ? MONO : SANS}`;
    ctx.textAlign = o.align || 'center'; ctx.textBaseline = o.base || 'middle';
    if (o.stroke) { ctx.lineJoin = 'round'; ctx.strokeStyle = o.stroke; ctx.lineWidth = o.slw || 4; ctx.strokeText(s, x, y); }
    ctx.fillStyle = o.color || C.ink; ctx.fillText(s, x, y);
  }
  function tw(ctx, s, size, weight, mono) { ctx.font = `${weight || 600} ${size}px ${mono ? MONO : SANS}`; return ctx.measureText(s).width; }
  // Caja isométrica: x0..x0+w, y0..y0+d, z0..z0+h. Caras visibles: arriba, +y (izq.), +x (der.)
  function box(ctx, x, y, z, w, d, h, col, o) {
    o = o || {};
    const top = o.top || shade(col, 0.18), left = o.left || col, right = o.right || shade(col, -0.16);
    const ol = o.outline === undefined ? 'rgba(40,25,50,0.35)' : o.outline;
    poly(ctx, [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], left, ol, 1.2);
    poly(ctx, [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], right, ol, 1.2);
    poly(ctx, [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], top, ol, 1.2);
  }
  // transformaciones a planos: R = plano y=cte (u→+x), L = plano x=cte (u→−y). 1 unidad = U px locales; v hacia abajo = −z
  function planeR(ctx, x, y, z) { const o = P(x, y, z); ctx.save(); ctx.transform(0.866, 0.5, 0, 1, o[0], o[1]); }
  function planeL(ctx, x, y, z) { const o = P(x, y, z); ctx.save(); ctx.transform(0.866, -0.5, 0, 1, o[0], o[1]); }
  function planeFloor(ctx, x, y, z) { const o = P(x, y, z); ctx.save(); ctx.transform(0.866, 0.5, -0.866, 0.5, o[0], o[1]); }
  function glow(ctx, color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
  function noGlow(ctx) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }

  // ---------- estado derivado de la línea de tiempo ----------
  function activeStep(tl, t) { return T.stepAt(tl, t); }
  function since(tl, t, type, filter) { const e = T.lastEvent(tl, t, type, filter); return e ? t - e.t : Infinity; }
  function eventsBetween(tl, a, b, type) { return tl.events.filter((e) => e.type === type && e.t >= a && e.t <= b); }
  function mochilaOwner(tl, t) {
    let o = 'robot';
    for (const m of tl.mochilaOwner) { if (t >= m.t) o = m.owner; else if (t >= m.t - 0.5) return 'vuelo'; }
    return o;
  }
  function currentCase(tl, t) { for (const c of tl.cases) if (t >= c.t0 && t < c.t1) return c; return t >= tl.outroStart ? tl.cases[tl.cases.length - 1] : null; }
  function sheetsInBag(tl, t) {
    const c = currentCase(tl, t); if (!c) return [];
    return tl.sheets.filter((s) => s.caso === c.idx && t >= s.t + 0.45 && t < c.tArchive);
  }

  // ---------- fondo ----------
  function drawBackground(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, C.bg0); g.addColorStop(1, C.bg1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // bokeh suave
    for (let i = 0; i < 26; i++) {
      const x = rnd(i, 1) * W, y = rnd(i, 2) * H, r = 20 + rnd(i, 3) * 70;
      const a = 0.03 + 0.04 * (0.5 + 0.5 * Math.sin(t * 0.6 + i));
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(255,190,140,${a})`); rg.addColorStop(1, 'rgba(255,190,140,0)');
      ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  }

  // ---------- estructura: losa, piso, muros ----------
  function drawShell(ctx, t) {
    const F = L.floor, WH = L.wallH;
    // sombra del diorama
    ctx.save(); ctx.globalAlpha = 0.35;
    const c = P(F / 2, F / 2, -1.2);
    const rg = ctx.createRadialGradient(c[0], c[1] + 60, 50, c[0], c[1] + 60, 900);
    rg.addColorStop(0, 'rgba(0,0,0,0.6)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(c[0] - 1000, c[1] - 600, 2000, 1400); ctx.restore();
    // losa
    poly(ctx, [P(0, F, 0), P(F, F, 0), P(F, F, -0.9), P(0, F, -0.9)], C.slabL);
    poly(ctx, [P(F, 0, 0), P(F, F, 0), P(F, F, -0.9), P(F, 0, -0.9)], C.slabR);
    // franja de pasto/borde
    poly(ctx, [P(0, F, 0), P(F, F, 0), P(F, F, -0.18), P(0, F, -0.18)], '#8fc77a');
    poly(ctx, [P(F, 0, 0), P(F, F, 0), P(F, F, -0.18), P(F, 0, -0.18)], '#78b064');
    // piso
    poly(ctx, [P(0, 0, 0), P(F, 0, 0), P(F, F, 0), P(0, F, 0)], C.floor);
    ctx.save(); ctx.lineWidth = 1.2; ctx.strokeStyle = C.floorLine;
    for (let i = 1; i < F * 2; i++) { const a = P(0, i / 2, 0), b = P(F, i / 2, 0); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    for (let j = 0; j < F * 2; j++) for (let k = 0; k < 3; k++) {
      const x = ((j * 2.3 + k * 4.7) % F), y = j / 2;
      const a = P(x, y, 0), b = P(x, y + 0.5, 0); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    ctx.restore();
    // muro izquierdo (x=0) y derecho (y=0)
    poly(ctx, [P(0, 0, 0), P(0, F, 0), P(0, F, WH), P(0, 0, WH)], C.wallL);
    poly(ctx, [P(0, 0, 0), P(F, 0, 0), P(F, 0, WH), P(0, 0, WH)], C.wallR);
    // papel mural: rayas suaves
    planeL(ctx, 0, F, WH);
    for (let i = 0; i < F * 2; i++) { ctx.fillStyle = i % 2 ? 'rgba(240,200,170,0.25)' : 'rgba(255,255,255,0.0)'; ctx.fillRect(i * U / 2, 0, U / 2, WH * U); }
    ctx.restore();
    planeR(ctx, 0, 0, WH);
    for (let i = 0; i < F * 2; i++) { ctx.fillStyle = i % 2 ? 'rgba(230,185,150,0.22)' : 'rgba(255,255,255,0.0)'; ctx.fillRect(i * U / 2, 0, U / 2, WH * U); }
    ctx.restore();
    // zócalos
    poly(ctx, [P(0.001, 0, 0), P(0.001, F, 0), P(0.001, F, 0.35), P(0.001, 0, 0.35)], C.base);
    poly(ctx, [P(0, 0.001, 0), P(F, 0.001, 0), P(F, 0.001, 0.35), P(0, 0.001, 0.35)], shade(C.base, -0.08));
    // canto superior de muros (grosor)
    poly(ctx, [P(0, 0, WH), P(0, F, WH), P(-0.35, F, WH), P(-0.35, -0.35, WH)], C.wallTop, 'rgba(0,0,0,0.15)');
    poly(ctx, [P(0, 0, WH), P(F, 0, WH), P(F, -0.35, WH), P(-0.35, -0.35, WH)], C.wallTop, 'rgba(0,0,0,0.15)');
    poly(ctx, [P(0, F, 0), P(0, F, WH), P(-0.35, F, WH), P(-0.35, F, -0.9), P(0, F, -0.9)], shade(C.wallL, -0.25));
    poly(ctx, [P(F, 0, 0), P(F, 0, WH), P(F, -0.35, WH), P(F, -0.35, -0.9), P(F, 0, -0.9)], shade(C.wallR, -0.3));
    // alfombra
    planeFloor(ctx, 4.6, 7.6, 0);
    fillRR(ctx, 0, 0, 5.2 * U, 4.6 * U, 30, '#e98c6e');
    fillRR(ctx, 12, 12, 5.2 * U - 24, 4.6 * U - 24, 22, null, 'rgba(255,240,220,0.7)', 4);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#f2a585' : '#d97a5c'; ctx.fillRect(40 + i * 40, 4.6 * U / 2 - 8, 26, 16); }
    ctx.restore();
    // plataforma de carga del robot
    planeFloor(ctx, L.home[0], L.home[1], 0);
    ctx.beginPath(); ctx.arc(0, 0, 0.62 * U, 0, Math.PI * 2); ctx.fillStyle = '#3a2f6b'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 0.5 * U, 0, Math.PI * 2); ctx.strokeStyle = rgba(C.neonC, 0.55 + 0.3 * Math.sin(t * 3)); ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();
  }

  // ---------- decoración de muros ----------
  function drawWindowSky(ctx, t, w, h, seed) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#8fd3ff'); g.addColorStop(1, '#ffe2b8'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#9fd18a'; ctx.beginPath(); ctx.moveTo(0, h); ctx.quadraticCurveTo(w * 0.3, h * 0.6, w * 0.6, h * 0.82); ctx.quadraticCurveTo(w * 0.8, h * 0.7, w, h * 0.78); ctx.lineTo(w, h); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const cx = ((t * 9 + i * 70 + seed * 40) % (w + 80)) - 40, cy = h * (0.2 + 0.15 * i);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(cx, cy, 10, 0, 7); ctx.arc(cx + 12, cy - 4, 12, 0, 7); ctx.arc(cx + 24, cy, 9, 0, 7); ctx.fill();
    }
  }

  function drawLeftWallDecor(ctx, tl, t) {
    // Ventanilla de chat (LEER): y 1.5..3.7, z 1.5..3.6
    planeL(ctx, 0, 3.7, 3.6);
    const ww = 2.2 * U, wh = 2.1 * U;
    ctx.save(); rrect(ctx, 0, 0, ww, wh, 10); ctx.clip(); drawWindowSky(ctx, t, ww, wh, 1); ctx.restore();
    fillRR(ctx, 0, 0, ww, wh, 10, null, C.woodD, 8);
    ctx.strokeStyle = C.woodD; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(ww / 2, 0); ctx.lineTo(ww / 2, wh); ctx.stroke();
    // toldo
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#fff4e6' : '#ff8a6b'; ctx.beginPath(); ctx.moveTo(-8 + i * (ww + 16) / 6, -26); ctx.lineTo(-8 + (i + 1) * (ww + 16) / 6, -26); ctx.lineTo(-8 + (i + 1) * (ww + 16) / 6, -6); ctx.arc(-8 + (i + 0.5) * (ww + 16) / 6, -6, (ww + 16) / 12, 0, Math.PI); ctx.fill(); }
    // íconos de canales sobre la ventanilla
    text(ctx, 'app · web · correo', ww / 2, wh + 18, { size: 15, weight: 700, color: C.woodD });
    ctx.restore();

    // Salida neumática del telégrafo (RESPONDER): y 4.2..5.4, z 2.3..3.1
    planeL(ctx, 0, 5.4, 3.2);
    fillRR(ctx, 0, 0, 1.2 * U, 0.9 * U, 18, '#2c2552', '#8b7ad8', 5);
    ctx.fillStyle = '#100c26'; rrect(ctx, 10, 10, 1.2 * U - 20, 0.9 * U - 20, 12); ctx.fill();
    text(ctx, 'SALIDA', 0.6 * U, 0.9 * U + 14, { size: 13, weight: 800, color: '#6a5bc4' });
    ctx.restore();

    // Pizarra (ENTENDER): y 6.1..8.2, z 1.5..3.5
    planeL(ctx, 0, 8.2, 3.5);
    const bw = 2.1 * U, bh = 2.0 * U;
    fillRR(ctx, 0, 0, bw, bh, 8, '#2f5d50', C.woodD, 7);
    const cols = ['consulta', 'reclamo', 'excepción'];
    cols.forEach((c, i) => {
      text(ctx, c, bw / 6 + i * bw / 3, 18, { size: 14, weight: 700, color: '#e9fff6' });
      if (i) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(i * bw / 3, 8); ctx.lineTo(i * bw / 3, bh - 8); ctx.stroke(); }
    });
    // tarjetas antiguas
    const old = [[1, 0, '#ffd23f'], [1, 1, '#ff9a3c'], [2, 0, '#ff6fb5'], [0, 1, '#9b6bff'], [0, 2, '#4f7cff']];
    old.forEach(([c, r, col]) => { ctx.save(); ctx.translate(bw / 6 + c * bw / 3, 46 + r * 26); ctx.rotate((rnd(c * 3 + r, 9) - 0.5) * 0.2); ctx.fillStyle = col; ctx.fillRect(-18, -9, 36, 18); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-12, -2, 24, 3); ctx.restore(); });
    // tarjeta del caso 1 que se clava en "consulta"
    const ce = tl.events.find((e) => e.type === 'tarjeta');
    if (ce && t > ce.t - 0.6) {
      const u = smooth((t - (ce.t - 0.6)) / 0.6);
      const x = lerp(bw * 0.9, bw / 6, u), y = lerp(bh + 20, 46 + 3 * 26, u);
      ctx.save(); ctx.translate(x, y); ctx.rotate((1 - u) * 0.5);
      ctx.fillStyle = '#fffaf0'; ctx.fillRect(-30, -12, 60, 24); ctx.fillStyle = '#9b6bff'; ctx.fillRect(-30, -12, 6, 24);
      text(ctx, 'ganancia', 4, 0, { size: 11, weight: 700, color: C.ink });
      ctx.fillStyle = '#e8453c'; ctx.beginPath(); ctx.arc(0, -12, 4, 0, 7); ctx.fill();
      ctx.restore();
      if (t > ce.t && t < ce.t + 0.8) { ctx.globalAlpha = 1 - (t - ce.t) / 0.8; ctx.strokeStyle = '#d6c6ff'; ctx.lineWidth = 3; ctx.strokeRect(bw / 6 - 40, 46 + 3 * 26 - 20, 80, 40); ctx.globalAlpha = 1; }
    }
    ctx.restore();

    // TV (miniatura al final): y 9.0..11.7, z 3.0..4.9
    drawTV(ctx, tl, t);

    // Póster "LARGO PLAZO": y 12.1..13.5, z 1.6..4.3
    planeL(ctx, 0, 13.5, 4.3);
    const pw = 1.4 * U, ph = 2.7 * U;
    fillRR(ctx, 0, 0, pw, ph, 6, '#fff6e2', '#e2b48a', 4);
    text(ctx, 'LARGO', pw / 2, 26, { size: 19, weight: 900, color: '#5b4bd6' });
    text(ctx, 'PLAZO', pw / 2, 48, { size: 19, weight: 900, color: '#5b4bd6' });
    ctx.strokeStyle = '#38c98a'; ctx.lineWidth = 4; ctx.beginPath();
    for (let i = 0; i <= 10; i++) { const x = 10 + i * (pw - 20) / 10, y = ph - 30 - i * 9 - Math.sin(i * 1.7) * 7; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    // brote
    ctx.fillStyle = '#38c98a'; ctx.beginPath(); ctx.ellipse(pw - 18, 70, 7, 13, 0.6, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(pw - 32, 76, 6, 11, -0.6, 0, 7); ctx.fill();
    text(ctx, 'paciencia + tiempo', pw / 2, ph - 12, { size: 10, weight: 700, color: '#a07a5a' });
    ctx.restore();
  }

  let miniCanvas = null;
  function drawTV(ctx, tl, t) {
    planeL(ctx, 0, 11.7, 4.9);
    const tvw = 2.7 * U, tvh = 1.9 * U;
    fillRR(ctx, -8, -8, tvw + 16, tvh + 16, 12, '#1a1530');
    ctx.fillStyle = '#0d0a1f'; ctx.fillRect(0, 0, tvw, tvh);
    const out = tl.outroStart;
    if (t > out + 0.8 && root.__renderMini) {
      // miniatura de ESTA animación (recursiva, 1 nivel)
      const tm = 3.2 + ((t - out - 0.8) * 4.5) % (out - 3.2);
      if (!miniCanvas) { miniCanvas = root.document.createElement('canvas'); miniCanvas.width = 480; miniCanvas.height = 270; }
      const m = miniCanvas.getContext('2d');
      m.setTransform(0.25, 0, 0, 0.25, 0, 0);
      root.__renderMini(m, tm);
      m.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(miniCanvas, 0, 0, tvw, tvh);
      // REC / reproducir
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, tvh - 18, tvw, 18);
      ctx.fillStyle = '#ff4fa3'; ctx.fillRect(4, tvh - 13, ((t - out) / (tl.duration - out)) * (tvw - 8), 6);
      const a = 0.4 + 0.4 * Math.sin(t * 6);
      ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.moveTo(tvw - 22, 8); ctx.lineTo(tvw - 10, 15); ctx.lineTo(tvw - 22, 22); ctx.fill();
    } else {
      // reposo: ondas suaves (protector de pantalla)
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, tvw, tvh); ctx.clip();
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = [rgba(C.neonC, 0.6), rgba(C.neonM, 0.5), rgba(C.neonY, 0.45)][k]; ctx.lineWidth = 3; ctx.beginPath();
        for (let x = 0; x <= tvw; x += 6) { const y = tvh / 2 + Math.sin(x / 22 + t * (1.2 + k * 0.4) + k) * (18 + k * 8); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
      }
      ctx.restore();
    }
    // brillo de vidrio
    const g = ctx.createLinearGradient(0, 0, tvw, tvh); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, tvw, tvh);
    ctx.restore();
  }

  function drawRightWallDecor(ctx, tl, t) {
    // Repisa con alcancía: x 0.4..1.7, z 3.2
    planeR(ctx, 0.4, 0, 3.3);
    ctx.fillStyle = C.woodD; ctx.fillRect(0, 0, 1.3 * U, 8);
    // alcancía (chanchito)
    ctx.save(); ctx.translate(0.45 * U, -18);
    ctx.fillStyle = '#ff9fbf'; ctx.beginPath(); ctx.ellipse(0, 0, 24, 18, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(22, -2, 8, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e46f96'; ctx.beginPath(); ctx.arc(24, -2, 2, 0, 7); ctx.arc(20, -2, 2, 0, 7); ctx.fill();
    ctx.fillRect(-14, 12, 6, 7); ctx.fillRect(8, 12, 6, 7);
    ctx.beginPath(); ctx.moveTo(6, -18); ctx.lineTo(14, -24); ctx.lineTo(14, -14); ctx.fill();
    ctx.fillStyle = '#3a2030'; ctx.fillRect(-6, -18, 12, 3); ctx.beginPath(); ctx.arc(12, -6, 2, 0, 7); ctx.fill();
    const sh = (t % 6) / 6; if (sh < 0.15) { ctx.fillStyle = `rgba(255,255,255,${1 - sh / 0.15})`; ctx.beginPath(); ctx.arc(-8, -8, 4, 0, 7); ctx.fill(); }
    ctx.restore();
    // libritos
    ['#4f7cff', '#ffd23f', '#38c98a'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0.85 * U + i * 11, -34 + (i === 1 ? 4 : 0), 9, 34 - (i === 1 ? 4 : 0)); });
    ctx.restore();

    // Reloj: x 1.2, z 5.0
    planeR(ctx, 1.6, 0, 5.4);
    ctx.save(); ctx.translate(0, 0.35 * U);
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = C.indigoD; ctx.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.fillStyle = C.ink; ctx.fillRect(Math.cos(a) * 20 - 1, Math.sin(a) * 20 - 1, 3, 3); }
    const am = t / 20 * Math.PI * 2 - Math.PI / 2, ah = t / 240 * Math.PI * 2 - Math.PI / 2 + 1.2;
    ctx.lineCap = 'round'; ctx.strokeStyle = C.ink; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ah) * 12, Math.sin(ah) * 12); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(am) * 19, Math.sin(am) * 19); ctx.stroke();
    ctx.restore(); ctx.restore();

    // Pantalla "respuestas correctas" (guiño): x 2.4..5.0, z 4.3..5.7
    planeR(ctx, 2.5, 0, 5.75);
    const mw = 2.5 * U, mh = 1.35 * U;
    fillRR(ctx, -6, -6, mw + 12, mh + 12, 10, '#1a1530');
    ctx.fillStyle = '#120e28'; ctx.fillRect(0, 0, mw, mh);
    text(ctx, 'respuestas correctas', 12, 16, { size: 14, weight: 700, color: '#bfb5ff', align: 'left' });
    const p = lerp(0.62, 0.94, smooth(t / (tl.outroStart + 2)));
    fillRR(ctx, 12, 34, mw - 24, 18, 9, '#2a2350');
    glow(ctx, C.neonG, 10); fillRR(ctx, 12, 34, (mw - 24) * p, 18, 9, '#5be37d'); noGlow(ctx);
    // marca de referencia pública (94 %, carta anual 2024)
    const mx = 12 + (mw - 24) * 0.94; ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(mx, 28); ctx.lineTo(mx, 58); ctx.stroke(); ctx.setLineDash([]);
    text(ctx, '94 % reportado (2024)', mw - 12, 70, { size: 11, weight: 600, color: '#ffd23f', align: 'right', mono: true });
    // mini barras
    for (let i = 0; i < 9; i++) { const hh = 6 + 10 * (0.5 + 0.5 * Math.sin(i * 1.3 + t * 0.8)); ctx.fillStyle = rgba(C.neonC, 0.5); ctx.fillRect(14 + i * 9, mh - 6 - hh, 6, hh); }
    ctx.restore();

    // Monitor del gráfico (sobre la calculadora): x 8.1..10.2, z 3.3..4.8
    planeR(ctx, 8.1, 0, 4.85);
    const gw = 2.1 * U, gh = 1.45 * U;
    fillRR(ctx, -6, -6, gw + 12, gh + 12, 10, '#1a1530');
    ctx.fillStyle = '#0f0c24'; ctx.fillRect(0, 0, gw, gh);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(0, i * gh / 5); ctx.lineTo(gw, i * gh / 5); ctx.stroke(); }
    const n = 40, prog = clamp(0.25 + t / 60, 0, 1);
    const pts = [];
    for (let i = 0; i <= n * prog; i++) { const x = 6 + i * (gw - 12) / n; const y = gh - 12 - i * (gh - 34) / n - Math.sin(i * 0.9) * 5 - Math.sin(i * 0.31) * 6; pts.push([x, y]); }
    if (pts.length > 1) {
      ctx.beginPath(); ctx.moveTo(pts[0][0], gh); pts.forEach((q) => ctx.lineTo(q[0], q[1])); ctx.lineTo(pts[pts.length - 1][0], gh); ctx.closePath();
      ctx.fillStyle = rgba(C.neonC, 0.18); ctx.fill();
      glow(ctx, C.neonC, 8); ctx.strokeStyle = C.neonC; ctx.lineWidth = 3; ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); noGlow(ctx);
      const lq = pts[pts.length - 1]; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lq[0], lq[1], 4, 0, 7); ctx.fill();
    }
    text(ctx, 'simulación', 8, 12, { size: 11, weight: 700, color: '#7fe9ff', align: 'left', mono: true });
    ctx.restore();

    // Tubos neumáticos: desde la sala de máquinas hasta el techo y el muro izquierdo
    drawTubes(ctx, tl, t);
  }

  const TUBE = [[12.6, 10.2, 2.1], [12.6, 10.2, 5.95], [12.6, 0.12, 5.95], [0.12, 0.12, 5.95], [0.12, 3.7, 5.95], [0.12, 3.7, 4.05]];
  function tubePoint(u) {
    const seg = []; let tot = 0;
    for (let i = 0; i < TUBE.length - 1; i++) { const a = TUBE[i], b = TUBE[i + 1]; const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); seg.push(d); tot += d; }
    let s = u * tot;
    for (let i = 0; i < seg.length; i++) { if (s <= seg[i]) { const a = TUBE[i], b = TUBE[i + 1], k = s / seg[i]; return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; } s -= seg[i]; }
    return TUBE[TUBE.length - 1];
  }
  function drawTubes(ctx, tl, t) {
    const pts = TUBE.map((q) => P(q[0], q[1], q[2]));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(120,200,230,0.35)'; ctx.lineWidth = 20; ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3; ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1] - 6) : ctx.moveTo(q[0], q[1] - 6)); ctx.stroke();
    // anillos
    for (let i = 0; i < 26; i++) { const q = P(...tubePoint(i / 26)); ctx.fillStyle = 'rgba(90,150,190,0.6)'; ctx.fillRect(q[0] - 3, q[1] - 11, 6, 22); }
    // monedas: ambiente + ráfaga en EJECUTAR
    const coins = [];
    for (let k = 0; k < 4; k++) coins.push((t * 0.07 + k * 0.25) % 1);
    for (const e of tl.events) if (e.type === 'moneda' && t >= e.t && t < e.t + 1.6) coins.push((t - e.t) / 1.6);
    for (const u of coins) {
      const q = P(...tubePoint(u));
      ctx.save(); ctx.translate(q[0], q[1]); ctx.scale(Math.abs(Math.cos(u * 40)) * 0.7 + 0.3, 1);
      glow(ctx, '#ffd23f', 8); ctx.fillStyle = '#ffcc33'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill(); noGlow(ctx);
      ctx.fillStyle = '#e09a12'; ctx.fillRect(-1.5, -4, 3, 8); ctx.restore();
    }
  }

  // ---------- objetos (ordenados por profundidad) ----------
  function station(tl, t, id) { const s = activeStep(tl, t); return s && s.estacion === id && t >= s.ta ? s : null; }

  function drawLeerDesk(ctx, tl, t) {
    box(ctx, 0, 1.5, 0, 1.15, 2.3, 1.05, C.wood, { top: C.woodL });
    // bandeja de entrada
    box(ctx, 0.25, 2.2, 1.05, 0.7, 0.9, 0.12, '#8b7ad8');
    const q = P(0.6, 2.65, 1.25);
    // lámpara chica
    box(ctx, 0.2, 1.65, 1.05, 0.25, 0.25, 0.06, '#3a2f6b');
    const lp = P(0.32, 1.78, 1.9); ctx.strokeStyle = '#3a2f6b'; ctx.lineWidth = 4; const lb = P(0.32, 1.78, 1.1); ctx.beginPath(); ctx.moveTo(lb[0], lb[1]); ctx.lineTo(lp[0], lp[1]); ctx.stroke();
    ctx.fillStyle = '#ff8a6b'; ctx.beginPath(); ctx.moveTo(lp[0] - 14, lp[1] + 10); ctx.lineTo(lp[0] + 14, lp[1] + 10); ctx.lineTo(lp[0] + 6, lp[1] - 6); ctx.lineTo(lp[0] - 6, lp[1] - 6); ctx.fill();
    // planta pequeña
    const pp = P(0.6, 3.5, 1.05); ctx.fillStyle = '#d9774f'; ctx.fillRect(pp[0] - 9, pp[1] - 16, 18, 16);
    ctx.fillStyle = '#4caf6e'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(pp[0] + (i - 1.5) * 6, pp[1] - 24 - (i % 2) * 6, 5, 11, (i - 1.5) * 0.4 + Math.sin(t * 2 + i) * 0.06, 0, 7); ctx.fill(); }
    if (station(tl, t, 'leer')) { glow(ctx, '#4f7cff', 20); ctx.fillStyle = 'rgba(79,124,255,0.35)'; ctx.beginPath(); ctx.ellipse(q[0], q[1], 40, 16, 0, 0, 7); ctx.fill(); noGlow(ctx); }
  }

  function drawTelegrafo(ctx, tl, t) {
    box(ctx, 0, 4.1, 0, 1.1, 1.4, 1.0, '#7d5bd6', { top: '#a58bf0' });
    // base del telégrafo
    box(ctx, 0.25, 4.45, 1.0, 0.6, 0.7, 0.14, '#b8862f', { top: '#e6b85a' });
    const st = station(tl, t, 'responder');
    let press = 0;
    for (const e of tl.events) if (e.type === 'telegrafo' && t >= e.t && t < e.t + 0.14) press = 1 - (t - e.t) / 0.14;
    const a = P(0.45, 4.8, 1.2), b = P(0.85, 4.8, 1.32 - press * 0.1);
    ctx.strokeStyle = '#6b4a14'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.fillStyle = '#2a2350'; ctx.beginPath(); ctx.ellipse(b[0], b[1] - 3, 9, 5, 0, 0, 7); ctx.fill();
    // chispa de envío
    if (press > 0) { glow(ctx, C.neonM, 16); ctx.fillStyle = C.neonM; ctx.beginPath(); ctx.arc(a[0], a[1] - 6, 5 * press + 2, 0, 7); ctx.fill(); noGlow(ctx); }
    // tubo hacia la salida
    const o1 = P(0.2, 4.8, 1.15), o2 = P(0.05, 4.8, 2.4);
    ctx.strokeStyle = 'rgba(160,140,230,0.7)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(o1[0], o1[1]); ctx.lineTo(o2[0], o2[1]); ctx.stroke();
    if (st) { const q = P(0.5, 4.8, 1.2); glow(ctx, C.neonM, 18); ctx.fillStyle = rgba(C.neonM, 0.25); ctx.beginPath(); ctx.ellipse(q[0], q[1], 46, 18, 0, 0, 7); ctx.fill(); noGlow(ctx); }
  }

  function drawCrate(ctx, tl, t) {
    // caja de casos cerrados
    box(ctx, 0.15, 5.75, 0, 0.9, 0.7, 0.6, '#c98b57', { top: '#6b4426' });
    const n = tl.cases.filter((c) => t >= c.tArchive + 0.7).length;
    for (let i = 0; i < n; i++) box(ctx, 0.3, 5.85, 0.6 + i * 0.09, 0.6, 0.5, 0.08, ['#fffaf0', '#ffe9c2', '#e8f7ff'][i]);
    planeR(ctx, 0.15, 6.45, 0.55);
    text(ctx, 'CERRADOS', 0.45 * U, 0.22 * U, { size: 11, weight: 900, color: '#fff3df' });
    ctx.restore();
  }

  function drawArchivo(ctx, tl, t) {
    const x0 = 1.6, w = 2.8, d = 1.1, h = 2.9;
    box(ctx, x0, 0, 0, w, d, h, '#e08a3c', { top: '#f3ac63', right: '#b9692a' });
    const st = station(tl, t, 'cuenta');
    const stepAny = activeStep(tl, t);
    const names = ['APORTES', 'RESCATES', 'CUOTAS'];
    // qué cajón se abre
    let open = -1, ou = 0;
    if (stepAny && stepAny.estacion === 'cuenta') {
      open = names.indexOf((stepAny.cajon || '').toUpperCase());
      const a = smooth((t - stepAny.ta) / 0.35), c = smooth((stepAny.t1 - 0.2 - t) / 0.3);
      ou = Math.min(a, c);
    }
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
      const zx = h - 0.25 - r * 0.88, xx = x0 + 0.15 + c * 1.33;
      const isOpen = (r === open && c === 0) ? ou : 0;
      const dz = 0.7;
      if (isOpen > 0) {
        const dy = isOpen * 0.75;
        box(ctx, xx, d, zx - dz, 1.18, dy, dz, '#f6b26b', { top: '#ffd7a8' });
        // carpetas
        for (let k = 0; k < 4; k++) box(ctx, xx + 0.12 + k * 0.25, d + 0.05, zx - dz + 0.1, 0.18, Math.max(0.05, dy - 0.1), dz - 0.05 + (k % 2) * 0.1, ['#4f7cff', '#ff6fb5', '#38c98a', '#ffd23f'][k]);
        planeR(ctx, xx, d + dy, zx);
      } else planeR(ctx, xx, d, zx);
      fillRR(ctx, 4, 4, 1.18 * U - 8, dz * U - 8, 6, isOpen > 0 ? '#f8c58a' : '#f2a65a', 'rgba(90,40,10,0.35)', 2);
      fillRR(ctx, 1.18 * U / 2 - 16, 10, 32, 8, 4, '#7a3f12');
      if (c === 0) text(ctx, names[r], 1.18 * U / 2, dz * U - 18, { size: 13, weight: 800, color: '#6b3410' });
      else { ctx.fillStyle = 'rgba(107,52,16,0.35)'; ctx.fillRect(20, dz * U - 22, 1.18 * U - 40, 6); }
      ctx.restore();
    }
    // lámpara de alarma
    const al = T.lastEvent(tl, t, 'alarma');
    const alarm = al && t - al.t < 1.6;
    const lp = P(x0 + w - 0.25, 0.3, h + 0.05);
    ctx.fillStyle = '#5a2c10'; ctx.fillRect(lp[0] - 8, lp[1] - 4, 16, 6);
    const on = alarm && Math.floor((t - al.t) * 8) % 2 === 0;
    if (on) glow(ctx, '#ff3b3b', 30);
    ctx.fillStyle = on ? '#ff3b3b' : '#a33'; ctx.beginPath(); ctx.arc(lp[0], lp[1] - 10, 9, Math.PI, 0); ctx.fill(); noGlow(ctx);
    if (st) { /* resplandor activo */ const q = P(x0 + w / 2, d + 0.4, 0); glow(ctx, '#ff9a3c', 22); ctx.fillStyle = 'rgba(255,154,60,0.2)'; ctx.beginPath(); ctx.ellipse(q[0], q[1], 80, 26, 0, 0, 7); ctx.fill(); noGlow(ctx); }
    drawCat(ctx, tl, t, x0 + 2.3, 0.5, h);
  }

  function drawCat(ctx, tl, t, x, y, z) {
    const q = P(x, y, z);
    const br = 1 + Math.sin(t * 2.2) * 0.04;
    const al = T.lastEvent(tl, t, 'alarma');
    const awake = al && t - al.t < 1.8;
    ctx.save(); ctx.translate(q[0], q[1]);
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(0, 2, 34, 9, 0, 0, 7); ctx.fill();
    // cola
    ctx.strokeStyle = '#6d6f86'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(22, -6); ctx.quadraticCurveTo(40, -4 + Math.sin(t * 1.7) * 6, 30, 6 + Math.sin(t * 1.7) * 4); ctx.stroke();
    ctx.scale(1, br);
    ctx.fillStyle = '#8a8ca6'; ctx.beginPath(); ctx.ellipse(4, -12, 28, 15, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a7c96'; for (let i = 0; i < 3; i++) { ctx.fillRect(-4 + i * 10, -26, 4, 10); }
    ctx.restore();
    ctx.save(); ctx.translate(q[0] - 22, q[1] - 14);
    ctx.fillStyle = '#8a8ca6'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.fill();
    const tw2 = awake ? Math.sin(t * 30) * 0.2 : 0;
    ctx.save(); ctx.rotate(tw2); ctx.beginPath(); ctx.moveTo(-11, -6); ctx.lineTo(-8, -20); ctx.lineTo(-2, -11); ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.moveTo(11, -6); ctx.lineTo(8, -20); ctx.lineTo(2, -11); ctx.fill();
    ctx.fillStyle = '#ffb0c0'; ctx.beginPath(); ctx.moveTo(-8, -9); ctx.lineTo(-7, -16); ctx.lineTo(-4, -11); ctx.fill();
    ctx.strokeStyle = '#2b2350'; ctx.lineWidth = 2;
    if (awake) { ctx.fillStyle = '#ffe36b'; ctx.beginPath(); ctx.arc(-5, 0, 3, 0, 7); ctx.fill(); ctx.fillStyle = '#2b2350'; ctx.fillRect(-5.5, -2, 1.5, 4); ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(8, 0); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(-5, -1, 3, 0.2, Math.PI - 0.2); ctx.stroke(); ctx.beginPath(); ctx.arc(5, -1, 3, 0.2, Math.PI - 0.2); ctx.stroke(); }
    ctx.restore();
    // Zzz
    if (!awake) for (let i = 0; i < 3; i++) {
      const ph = ((t * 0.5 + i / 3) % 1);
      ctx.globalAlpha = Math.sin(ph * Math.PI);
      text(ctx, 'z', q[0] - 30 - ph * 10 + i * 2, q[1] - 34 - ph * 40, { size: 12 + ph * 10, weight: 800, color: '#8b7ad8' });
      ctx.globalAlpha = 1;
    }
  }

  function drawBiblioteca(ctx, tl, t) {
    const x0 = 5.0, w = 2.3, d = 0.95, h = 3.3;
    box(ctx, x0, 0, 0, w, d, h, '#8a5a3a', { top: '#a8714a', left: '#7a4c30', right: '#5e3922' });
    const st = station(tl, t, 'buscar');
    planeR(ctx, x0, d, h);
    const pw = w * U, ph = h * U;
    ctx.fillStyle = '#4a2c1a'; ctx.fillRect(10, 10, pw - 20, ph - 20);
    const cols = ['#4f7cff', '#ffd23f', '#38c98a', '#ff6fb5', '#9b6bff', '#ff9a3c', '#21d4c4', '#fffaf0'];
    for (let r = 0; r < 4; r++) {
      const sy = 14 + r * (ph - 24) / 4, shH = (ph - 24) / 4;
      let x = 14, i = 0;
      while (x < pw - 22) {
        const bw = 9 + rnd(r * 40 + i, 4) * 9, bh = shH * (0.62 + rnd(r * 40 + i, 5) * 0.3);
        const lean = rnd(r * 40 + i, 6) > 0.9;
        let lift = 0;
        if (st && r === 1 && i === 5) lift = 1; // libro que sale
        if (!lift) { ctx.save(); ctx.translate(x, sy + shH - 6); if (lean) ctx.rotate(-0.18); ctx.fillStyle = cols[(r * 3 + i) % cols.length]; ctx.fillRect(0, -bh, bw, bh); ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(0, -bh + 6, bw, 3); ctx.restore(); }
        x += bw + 2; i++;
      }
      ctx.fillStyle = '#a8714a'; ctx.fillRect(10, sy + shH - 6, pw - 20, 7);
    }
    text(ctx, 'POLÍTICAS', pw / 2, ph - 4, { size: 11, weight: 800, color: '#ffd9a8' });
    ctx.restore();
    // libro abierto flotando
    if (st) {
      const u = smooth((t - st.ta) / 0.5);
      const q = P(x0 + w / 2, d + 0.6, 2.0 + u * 0.4);
      ctx.save(); ctx.translate(q[0], q[1] - 20 * u); ctx.scale(u, u);
      glow(ctx, '#38c98a', 20);
      fillRR(ctx, -46, -30, 92, 58, 6, '#2e9e6d'); noGlow(ctx);
      ctx.fillStyle = '#fffaf0'; ctx.fillRect(-42, -26, 40, 50); ctx.fillRect(2, -26, 40, 50);
      const flip = ((t - st.ta) * 2.2) % 1;
      ctx.save(); ctx.scale(Math.cos(flip * Math.PI), 1); ctx.fillStyle = '#f3ead4'; ctx.fillRect(0, -26, 40, 50); ctx.restore();
      ctx.fillStyle = 'rgba(40,30,60,0.35)'; for (let i = 0; i < 6; i++) { ctx.fillRect(-38, -20 + i * 7, 30 - (i % 3) * 5, 2.5); ctx.fillRect(6, -20 + i * 7, 30 - (i % 2) * 7, 2.5); }
      if (st.duda && t > st.ta + 0.6) { text(ctx, '?', 22, -2, { size: 30, weight: 900, color: '#e8453c' }); }
      ctx.restore();
    }
  }

  function drawCalculadora(ctx, tl, t) {
    const x0 = 8.0, w = 2.3, d = 1.3, h = 2.4;
    const s = activeStep(tl, t);
    const working = s && s.estacion === 'calcular' && t >= s.ta;
    const spark = T.lastEvent(tl, t, 'chispas');
    const jam = spark && t - spark.t < 2.0 && t >= spark.t;
    let shake = 0; if (jam && t - spark.t < 0.9) shake = Math.sin(t * 80) * 2.5;
    ctx.save(); ctx.translate(shake, 0);
    box(ctx, x0, 0, 0, w, d, h, '#4a3f8c', { top: '#6d5fc0', left: '#5a4ca8', right: '#3d3278' });
    // ranura de neón
    planeR(ctx, x0, d, h);
    const fw = w * U, fh = h * U;
    glow(ctx, C.neonY, 14); ctx.strokeStyle = jam ? '#ff3b3b' : C.neonY; ctx.lineWidth = 3; rrect(ctx, 8, 8, fw - 16, fh - 16, 10); ctx.stroke(); noGlow(ctx);
    // display
    fillRR(ctx, 18, 18, fw - 36, 34, 6, '#0d1a12');
    let disp = '0';
    if (working) {
      const k = Math.floor((t - s.ta) * 14);
      disp = jam ? 'ERR ≠' : (s.correccion ? (t - s.ta > 0.9 ? '= ▲ ok' : '∑ ' + (k % 1000)) : '∑ ' + (k * 37 % 1000));
    } else if (jam) disp = 'ERR ≠';
    text(ctx, disp, fw - 28, 35, { size: 20, weight: 700, color: jam ? '#ff5a5a' : '#7dff6b', align: 'right', mono: true });
    // engranajes
    const spin = working && !jam ? (t - s.ta) * 4 : 0;
    const base = t * 0.3;
    drawGear(ctx, 46, 100, 30, 10, base + spin, jam ? '#c0392b' : '#ffd23f');
    drawGear(ctx, 92, 120, 20, 8, -(base + spin) * 1.5 + 0.2, '#ffb02e');
    drawGear(ctx, 104, 78, 14, 6, (base + spin) * 2.1, '#ffe27a');
    // palanca lateral y botones
    for (let i = 0; i < 6; i++) { ctx.fillStyle = ['#ff6fb5', '#21d4c4', '#ffd23f'][i % 3]; rrect(ctx, 22 + (i % 3) * 22, fh - 40 + Math.floor(i / 3) * 16, 16, 10, 3); ctx.fill(); }
    ctx.restore();
    // rollo de papel arriba
    const rp = P(x0 + 0.5, 0.65, h + 0.15);
    ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.ellipse(rp[0], rp[1], 22, 14, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#d9cbb0'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#d9cbb0'; ctx.beginPath(); ctx.ellipse(rp[0], rp[1], 6, 4, 0, 0, 7); ctx.fill();
    // tira impresa que crece y cae por el frente
    let len = 0.15;
    for (const st2 of tl.steps) if (st2.estacion === 'calcular' && t >= st2.ta) {
      const p = st2.error ? clamp((t - st2.ta) / 0.7, 0, 1) * 0.5 : clamp((t - st2.ta) / (st2.t1 - st2.ta), 0, 1) * 1.2;
      len = Math.max(len, 0.15 + p);
    }
    // se corta al cerrar el caso 1
    const c0 = tl.cases[0]; if (c0 && t > c0.tArchive) len = 0.15;
    const a0 = P(x0 + 0.5, d + 0.02, h), a1 = P(x0 + 0.5, d + 0.02 + Math.min(len, 0.5), h - Math.max(0, len - 0.5) * 1.3);
    ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = '#d9cbb0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(rp[0] - 12, rp[1]); ctx.lineTo(rp[0] + 12, rp[1]); ctx.lineTo(a1[0] + 12, a1[1]); ctx.lineTo(a1[0] - 12, a1[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(40,30,60,0.4)';
    const nn = Math.floor(len * 10); for (let i = 1; i < nn; i++) { const u = i / nn; ctx.fillRect(lerp(rp[0], a1[0], u) - 8, lerp(rp[1], a1[1], u), 14 - (i % 3) * 3, 2); }
    ctx.restore();
    // humo + chispas del atasco
    if (jam) {
      const dt = t - spark.t, c = P(x0 + w * 0.5, d * 0.5, h + 0.1);
      for (let i = 0; i < 34; i++) {
        const life = 0.55 + rnd(i, 7) * 0.5; if (dt > life) continue;
        const ang = -Math.PI / 2 + (rnd(i, 8) - 0.5) * 2.6, sp = 260 + rnd(i, 9) * 340;
        const px = c[0] + Math.cos(ang) * sp * dt, py = c[1] + Math.sin(ang) * sp * dt + 700 * dt * dt;
        glow(ctx, '#ffb000', 10); ctx.strokeStyle = i % 3 ? '#ffd23f' : '#fff6b0'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - Math.cos(ang) * 12, py - Math.sin(ang) * 12 - 6); ctx.stroke(); noGlow(ctx);
      }
      for (let i = 0; i < 6; i++) {
        const u = (dt - i * 0.12); if (u < 0 || u > 1.6) continue;
        ctx.fillStyle = `rgba(90,85,110,${0.5 * (1 - u / 1.6)})`; ctx.beginPath(); ctx.arc(c[0] + Math.sin(i * 2) * 20, c[1] - 20 - u * 90, 14 + u * 22, 0, 7); ctx.fill();
      }
    }
    if (working && !jam) { const q = P(x0 + w / 2, d + 0.5, 0); glow(ctx, C.neonY, 22); ctx.fillStyle = 'rgba(255,210,63,0.22)'; ctx.beginPath(); ctx.ellipse(q[0], q[1], 80, 26, 0, 0, 7); ctx.fill(); noGlow(ctx); }
  }

  function drawGear(ctx, x, y, r, teeth, a, col) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) { const ang = i / (teeth * 2) * Math.PI * 2; const rr = i % 2 ? r : r + 6; ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2b2350'; ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawEjecutar(ctx, tl, t) {
    const x0 = 11.3, y0 = 9.6, w = 2.0, d = 1.3, h = 2.1;
    const st = station(tl, t, 'ejecutar');
    box(ctx, x0, y0, 0, w, d, h, '#8c3a4f', { top: '#b5536b', left: '#a2445c', right: '#702c3e' });
    planeR(ctx, x0, y0 + d, h);
    const fw = w * U, fh = h * U;
    glow(ctx, '#ff5a6e', st ? 18 : 8); ctx.strokeStyle = '#ff5a6e'; ctx.lineWidth = 3; rrect(ctx, 8, 8, fw - 16, fh - 16, 10); ctx.stroke(); noGlow(ctx);
    // manómetros
    for (let i = 0; i < 2; i++) {
      const cx = 36 + i * 50, cy = 40; ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(cx, cy, 16, 0, 7); ctx.fill(); ctx.strokeStyle = '#2b2350'; ctx.lineWidth = 3; ctx.stroke();
      const a = -2.4 + (st ? 1.8 + Math.sin(t * 9 + i) * 0.3 : 0.4 + Math.sin(t + i) * 0.1);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12); ctx.strokeStyle = '#e8453c'; ctx.stroke();
    }
    // ventanita con monedas
    fillRR(ctx, 24, 70, fw - 48, 40, 8, '#2a0f18');
    for (let i = 0; i < 5; i++) { const yy = 92 + Math.sin(t * (st ? 12 : 2) + i) * (st ? 10 : 3); ctx.fillStyle = '#ffcc33'; ctx.beginPath(); ctx.arc(36 + i * 18, yy, 6, 0, 7); ctx.fill(); }
    text(ctx, 'SALA DE MÁQUINAS', fw / 2, fh - 18, { size: 11, weight: 800, color: '#ffd0d8' });
    ctx.restore();
    // palanca
    const pal = T.lastEvent(tl, t, 'palanca');
    const pull = pal && t - pal.t < 2.2 ? smooth((t - pal.t) / 0.25) * (1 - smooth((t - pal.t - 1.8) / 0.4)) : 0;
    const pb = P(x0 + 0.1, y0 + d + 0.05, 1.3);
    const ang = -1.0 + pull * 1.3;
    ctx.strokeStyle = '#555'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(pb[0], pb[1]); ctx.lineTo(pb[0] + Math.cos(ang) * 40, pb[1] + Math.sin(ang) * 40); ctx.stroke();
    ctx.fillStyle = '#e8453c'; ctx.beginPath(); ctx.arc(pb[0] + Math.cos(ang) * 40, pb[1] + Math.sin(ang) * 40, 8, 0, 7); ctx.fill();
    // vapor
    if (st) for (let i = 0; i < 5; i++) { const u = ((t * 1.3 + i * 0.2) % 1); const q = P(x0 + 1.6, y0 + 0.4, h); ctx.fillStyle = `rgba(255,255,255,${0.4 * (1 - u)})`; ctx.beginPath(); ctx.arc(q[0] + Math.sin(i) * 8, q[1] - u * 60, 8 + u * 14, 0, 7); ctx.fill(); }
  }

  function drawStorage(ctx, t) {
    // bodega bajo el altillo: cajas de archivo y un rack con luces
    box(ctx, 10.7, 0.1, 0, 0.9, 0.9, 0.7, '#c98b57', { top: '#e0a874' });
    box(ctx, 10.8, 0.2, 0.7, 0.7, 0.7, 0.55, '#d9a066', { top: '#ecbd86' });
    box(ctx, 11.8, 0.1, 0, 1.0, 0.8, 2.6, '#2b2350', { top: '#4d4380' });
    planeR(ctx, 11.8, 0.9, 2.6);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) { const on = Math.sin(t * (2 + c) + r * 1.7 + c) > 0.2; ctx.fillStyle = on ? ['#7dff6b', '#29e6ff', '#ffd23f', '#ff4fa3'][c] : '#3a3360'; ctx.fillRect(10 + c * 12, 12 + r * 19, 7, 4); }
    ctx.restore();
    box(ctx, 13.0, 0.1, 0, 0.8, 0.9, 0.9, '#c98b57', { top: '#e0a874' });
  }

  function drawAltillo(ctx, tl, t, person) {
    const A = L.altillo, z = A.z;
    // postes
    [[A.x0 + 0.1, A.y1 - 0.15], [12.85, A.y1 - 0.15]].forEach(([x, y]) => box(ctx, x - 0.1, y - 0.1, 0, 0.2, 0.2, z - 0.2, C.woodD));
    // plataforma
    box(ctx, A.x0, A.y0, z - 0.2, A.x1 - A.x0, A.y1 - A.y0, 0.2, C.wood, { top: '#e7b98a' });
    // estantería del altillo
    box(ctx, A.x0 + 0.2, 0, z, 0.9, 0.5, 1.4, '#8a5a3a', { top: '#a8714a' });
    for (let i = 0; i < 6; i++) box(ctx, A.x0 + 0.28 + i * 0.13, 0.35, z + 0.75, 0.1, 0.15, 0.4 + (i % 3) * 0.05, ['#4f7cff', '#ff6fb5', '#ffd23f', '#38c98a'][i % 4], { outline: null });
    // luz cálida de la lámpara
    const lc = P(12.9, 1.0, z + 1.4);
    const rg = ctx.createRadialGradient(lc[0], lc[1], 10, lc[0], lc[1], 260);
    rg.addColorStop(0, 'rgba(255,214,140,0.55)'); rg.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(lc[0], lc[1], 260, 0, 7); ctx.fill();
    // persona si está arriba (detrás del escritorio)
    if (person && person.z > A.z - 0.05 && person.y < 1.6) drawPerson(ctx, tl, t, person);
    // escritorio del altillo
    box(ctx, 11.5, 1.25, z, 1.7, 0.65, 0.75, '#6b4ca8', { top: '#8f73d0' });
    // papeles + lámpara
    box(ctx, 11.7, 1.35, z + 0.75, 0.45, 0.35, 0.04, '#fffaf0', { outline: null });
    const lb = P(12.9, 1.45, z + 0.75), lt = P(12.9, 1.45, z + 1.45);
    ctx.strokeStyle = '#2b2350'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(lb[0], lb[1]); ctx.lineTo(lt[0], lt[1]); ctx.lineTo(lt[0] - 22, lt[1] + 6); ctx.stroke();
    glow(ctx, '#ffd38a', 24); ctx.fillStyle = '#ffcf6b'; ctx.beginPath(); ctx.moveTo(lt[0] - 36, lt[1] + 16); ctx.lineTo(lt[0] - 8, lt[1] + 16); ctx.lineTo(lt[0] - 16, lt[1] - 2); ctx.lineTo(lt[0] - 28, lt[1] - 2); ctx.fill(); noGlow(ctx);
    // taza
    const cu = P(11.9, 1.75, z + 0.75); ctx.fillStyle = '#ff8a6b'; ctx.fillRect(cu[0] - 6, cu[1] - 12, 12, 12);
    // baranda frontal y lateral
    ctx.strokeStyle = C.woodD; ctx.lineWidth = 4;
    const rail = (a, b) => { const p1 = P(...a), p2 = P(...b); ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); };
    rail([A.x0, A.y1, z + 0.9], [12.95, A.y1, z + 0.9]);
    rail([A.x0, 0, z + 0.9], [A.x0, A.y1, z + 0.9]);
    for (let x = A.x0; x <= 12.95; x += 0.4) rail([x, A.y1, z], [x, A.y1, z + 0.9]);
    for (let y = 0; y <= A.y1; y += 0.4) rail([A.x0, y, z], [A.x0, y, z + 0.9]);
    // letrero "EQUIPO"
    planeR(ctx, A.x0 + 0.5, A.y1, z + 0.75);
    fillRR(ctx, 0, 0, 1.6 * U, 0.42 * U, 6, '#fff3df', '#f2b53a', 3);
    text(ctx, 'EQUIPO HUMANO', 0.8 * U, 0.21 * U, { size: 13, weight: 900, color: '#8a5a12' });
    ctx.restore();
  }

  function drawStairs(ctx, items) {
    const S = L.stairs, n = S.steps, dy = (S.yBot - S.yTop) / n;
    for (let i = 0; i < n; i++) {
      const y = S.yTop + i * dy, zt = L.altillo.z * (1 - (i + 1) / (n + 1));
      items.push({ d: S.x0 + 0.5 + y + dy / 2, f: (ctx) => box(ctx, S.x0, y, 0, S.x1 - S.x0, dy, zt, '#c98b57', { top: '#e7b98a', right: '#9f6a3e' }) });
    }
  }

  function drawBell(ctx, tl, t) {
    const A = L.altillo;
    const bx = 11.1, by = A.y1 + 0.05;
    const top = P(bx, by, A.z + 1.25);
    const c = T.lastEvent(tl, t, 'campana');
    const sw = c && t - c.t < 1.4 ? Math.sin((t - c.t) * 22) * 0.45 * (1 - (t - c.t) / 1.4) : 0;
    // soporte
    ctx.strokeStyle = C.woodD; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(top[0], top[1] + 44); ctx.lineTo(top[0], top[1] - 8); ctx.lineTo(top[0] + 26, top[1] - 8); ctx.stroke();
    ctx.save(); ctx.translate(top[0] + 26, top[1] - 6); ctx.rotate(sw);
    glow(ctx, '#ffd23f', c && t - c.t < 1.2 ? 26 : 6);
    ctx.fillStyle = '#f2b53a'; ctx.beginPath(); ctx.moveTo(-16, 30); ctx.quadraticCurveTo(-16, 2, 0, 2); ctx.quadraticCurveTo(16, 2, 16, 30); ctx.lineTo(20, 34); ctx.lineTo(-20, 34); ctx.closePath(); ctx.fill(); noGlow(ctx);
    ctx.fillStyle = '#b77b12'; ctx.beginPath(); ctx.arc(0, 36, 5, 0, 7); ctx.fill();
    ctx.restore();
    // ondas de sonido
    if (c && t - c.t < 1.0) for (let k = 0; k < 3; k++) { const u = ((t - c.t) * 1.6 + k * 0.33) % 1; ctx.strokeStyle = `rgba(255,210,63,${1 - u})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(top[0] + 26, top[1] + 14, 24 + u * 50, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(top[0] + 26, top[1] + 14, 24 + u * 50, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke(); }
    // cuerda hasta abajo
    const cu = T.lastEvent(tl, t, 'cuerda');
    const pull = cu && t - cu.t < 1.2 ? Math.sin(clamp((t - cu.t) / 1.2, 0, 1) * Math.PI * 2) * 0.25 : 0;
    const r0 = P(bx + 0.4, by + 0.08, A.z + 1.0), r1 = P(bx + 0.4, by + 0.15, 1.05 - Math.abs(pull));
    ctx.strokeStyle = '#d6b07a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(top[0] + 26, top[1] + 20); ctx.quadraticCurveTo(r0[0] + 6, r0[1], r1[0], r1[1]); ctx.stroke();
    ctx.fillStyle = '#c23b5a'; ctx.beginPath(); ctx.ellipse(r1[0], r1[1] + 8, 6, 12, 0, 0, 7); ctx.fill();
    return r1;
  }

  function drawVerificar(ctx, tl, t) {
    const x0 = 5.6, y0 = 6.0, w = 1.8, d = 1.5, h = 1.0;
    box(ctx, x0, y0, 0, w, d, h, '#2f9c8f', { top: '#9ff0df', left: '#2a8a7f', right: '#1f6c63' });
    // documento
    box(ctx, x0 + 0.5, y0 + 0.4, h, 0.8, 0.6, 0.03, '#fffaf0', { outline: 'rgba(0,0,0,0.2)' });
    const s = activeStep(tl, t);
    const act = s && s.estacion === 'verificar' && t >= s.ta;
    // lupa
    const k = act ? (t - s.ta) : t * 0.2;
    const lx = x0 + 0.9 + Math.sin(k * 3) * 0.25, ly = y0 + 0.7 + Math.cos(k * 2.3) * 0.15;
    const lp = P(lx, ly, h + (act ? 0.45 : 0.1));
    ctx.strokeStyle = '#3a2f6b'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(lp[0] + 14, lp[1] + 14); ctx.lineTo(lp[0] + 30, lp[1] + 30); ctx.stroke();
    ctx.fillStyle = 'rgba(180,240,255,0.45)'; ctx.beginPath(); ctx.arc(lp[0], lp[1], 18, 0, 7); ctx.fill(); ctx.strokeStyle = '#3a2f6b'; ctx.lineWidth = 4; ctx.stroke();
    // semáforo
    const sp = P(x0 + 0.25, y0 + d - 0.25, h);
    ctx.save(); ctx.translate(sp[0], sp[1]); ctx.scale(1.25, 1.25); ctx.translate(-sp[0], -sp[1]);
    ctx.fillStyle = '#2b2350'; ctx.fillRect(sp[0] - 3, sp[1] - 70, 6, 70);
    fillRR(ctx, sp[0] - 16, sp[1] - 150, 32, 84, 10, '#1d1838', '#4d4380', 2);
    let state = 'idle';
    if (s && s.estacion === 'verificar') {
      const r = T.lastEvent(tl, t, 'semaforo_rojo'), g = T.lastEvent(tl, t, 'semaforo_verde');
      if (g && g.t >= s.t0) state = 'verde'; else if (r && r.t >= s.t0) state = 'rojo'; else if (t >= s.ta) state = 'ambar';
    } else {
      const r = T.lastEvent(tl, t, 'semaforo_rojo'), g = T.lastEvent(tl, t, 'semaforo_verde');
      const last = [r, g].filter(Boolean).sort((a, b) => b.t - a.t)[0];
      if (last && t - last.t < 3.0) state = last.type === 'semaforo_rojo' ? 'rojo' : 'verde';
    }
    const lights = [['rojo', '#ff3b3b'], ['ambar', '#ffb020'], ['verde', '#3bff7a']];
    lights.forEach(([n, col], i) => {
      const on = state === n;
      const blink = n === 'ambar' && on ? (Math.floor(t * 5) % 2 === 0) : true;
      if (on && blink) glow(ctx, col, 26);
      ctx.fillStyle = on && blink ? col : shade(col, -0.7); ctx.beginPath(); ctx.arc(sp[0], sp[1] - 136 + i * 27, 10, 0, 7); ctx.fill(); noGlow(ctx);
    });
    ctx.restore();
    if (act) { const q = P(x0 + w / 2, y0 + d / 2, 0); glow(ctx, '#21d4c4', 22); ctx.fillStyle = 'rgba(33,212,196,0.18)'; ctx.beginPath(); ctx.ellipse(q[0], q[1] + 20, 90, 30, 0, 0, 7); ctx.fill(); noGlow(ctx); }
  }

  function drawCoffee(ctx, tl, t, part) {
    const [cx, cy] = L.coffeeTable;
    if (part === 'table') {
      box(ctx, cx - 0.4, cy - 0.4, 0, 0.8, 0.8, 0.85, '#e98c6e', { top: '#ffb59a' });
      if (t > tl.outroStart + 1.4) {
        const a = clamp((t - tl.outroStart - 1.4) / 0.4, 0, 1);
        ctx.globalAlpha = a;
        [[cx - 0.15, cy + 0.1], [cx + 0.15, cy - 0.15]].forEach(([x, y], i) => {
          const q = P(x, y, 0.85); ctx.fillStyle = i ? '#fffaf0' : '#5b4bd6'; ctx.fillRect(q[0] - 7, q[1] - 14, 14, 14);
          for (let k = 0; k < 3; k++) { const u = ((t * 0.7 + k / 3 + i * 0.5) % 1); ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - u)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q[0] + Math.sin(u * 6 + k) * 4, q[1] - 16 - u * 30); ctx.lineTo(q[0] + Math.sin(u * 6 + k + 1) * 4, q[1] - 22 - u * 30); ctx.stroke(); }
        });
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawSofa(ctx, t) {
    const x0 = 10.6, y0 = 12.3;
    box(ctx, x0, y0, 0, 2.4, 1.0, 0.55, '#5b4bd6', { top: '#7b6cf0' });
    box(ctx, x0, y0 + 0.65, 0.55, 2.4, 0.35, 0.6, '#4b3fc4', { top: '#7b6cf0' });
    box(ctx, x0 + 0.15, y0 + 0.1, 0.55, 0.9, 0.55, 0.12, '#ff8a6b', { top: '#ffb59a' });
    box(ctx, x0 + 1.3, y0 + 0.1, 0.55, 0.9, 0.55, 0.12, '#ffd23f', { top: '#ffe27a' });
  }
  function drawFloorLamp(ctx, t, x, y) {
    const b = P(x, y, 0), tp = P(x, y, 2.6);
    ctx.fillStyle = '#2b2350'; ctx.beginPath(); ctx.ellipse(b[0], b[1], 16, 7, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2b2350'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(tp[0], tp[1]); ctx.stroke();
    const rg = ctx.createRadialGradient(tp[0], tp[1] + 10, 5, tp[0], tp[1] + 10, 150); rg.addColorStop(0, 'rgba(255,214,140,0.45)'); rg.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(tp[0], tp[1] + 10, 150, 0, 7); ctx.fill();
    glow(ctx, '#ffd38a', 18); ctx.fillStyle = '#ffcf6b'; ctx.beginPath(); ctx.moveTo(tp[0] - 26, tp[1] + 18); ctx.lineTo(tp[0] + 26, tp[1] + 18); ctx.lineTo(tp[0] + 14, tp[1] - 10); ctx.lineTo(tp[0] - 14, tp[1] - 10); ctx.fill(); noGlow(ctx);
  }
  function drawCooler(ctx, t) {
    const x = 7.2, y = 13.2;
    box(ctx, x - 0.3, y - 0.3, 0, 0.6, 0.6, 1.2, '#e9f0ff', { top: '#ffffff' });
    const q = P(x, y, 1.2);
    ctx.fillStyle = 'rgba(120,200,255,0.55)'; fillRR(ctx, q[0] - 20, q[1] - 66, 40, 62, 14, 'rgba(120,200,255,0.55)', 'rgba(60,140,210,0.6)', 2);
    for (let i = 0; i < 4; i++) { const u = ((t * 0.6 + i / 4) % 1); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(q[0] - 8 + i * 5, q[1] - 10 - u * 50, 2.5, 0, 7); ctx.fill(); }
    const tap = P(x + 0.32, y + 0.1, 0.8); ctx.fillStyle = '#4f7cff'; ctx.fillRect(tap[0] - 4, tap[1] - 4, 8, 8);
    const cup = P(x + 0.7, y + 0.1, 0); ctx.fillStyle = '#fff'; ctx.fillRect(cup[0] - 4, cup[1] - 10, 8, 10);
  }
  function drawRadio(ctx, t) {
    box(ctx, 0.1, 9.6, 0, 0.8, 1.6, 0.9, '#c98b57', { top: '#e0a874' });
    box(ctx, 0.25, 9.9, 0.9, 0.5, 0.9, 0.45, '#ff8a6b', { top: '#ffb59a' });
    planeR(ctx, 0.25, 10.8, 1.35); ctx.restore();
    const q = P(0.5, 10.35, 1.45);
    ctx.strokeStyle = '#2b2350'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q[0], q[1] - 12); ctx.lineTo(q[0] + 18, q[1] - 46); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const u = ((t * 0.45 + i / 3) % 1);
      ctx.globalAlpha = Math.sin(u * Math.PI);
      text(ctx, i % 2 ? '♪' : '♫', q[0] + 20 + u * 40 + Math.sin(u * 8 + i) * 8, q[1] - 30 - u * 70, { size: 20 + i * 2, weight: 700, color: ['#ff4fa3', '#29e6ff', '#ffd23f'][i] });
    }
    ctx.globalAlpha = 1;
  }

  function drawStool(ctx, x, y, col) { box(ctx, x - 0.25, y - 0.25, 0, 0.5, 0.5, 0.55, col, { top: shade(col, 0.25) }); }

  function drawPlant(ctx, t) { drawPlantAt(ctx, t, 9.9, 13.3, 0); }
  function drawPlantAt(ctx, t, x, y, seed) {
    box(ctx, x - 0.35, y - 0.35, 0, 0.7, 0.7, 0.6, '#d9774f', { top: '#5a3a26' });
    const g = 0.55 + 0.45 * smooth(t / 55);
    const base = P(x, y, 0.6);
    const n = 5 + Math.floor(t / 7);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (rnd(i + seed * 50, 11) - 0.5) * 1.6;
      const len = (50 + rnd(i, 12) * 60) * g * (i >= n - 1 ? clamp((t % 7) / 2, 0.2, 1) : 1);
      const sway = Math.sin(t * 1.3 + i) * 0.04;
      const ex = base[0] + Math.cos(a + sway) * len, ey = base[1] + Math.sin(a + sway) * len;
      ctx.strokeStyle = '#3d8f55'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.quadraticCurveTo(base[0] + Math.cos(a) * len * 0.3, base[1] - len * 0.6, ex, ey); ctx.stroke();
      ctx.fillStyle = i % 2 ? '#4caf6e' : '#5fc983'; ctx.beginPath(); ctx.ellipse(ex, ey, 9 * g + 3, 20 * g + 5, a + Math.PI / 2 + sway, 0, 7); ctx.fill();
    }
  }

  // ---------- personajes ----------
  function drawRobot(ctx, tl, t, rob, rope) {
    const q = P(rob.x, rob.y, 0);
    const expr = T.exprAt(tl, t);
    const s = activeStep(tl, t);
    const acting = s && t >= s.ta && !rob.walking && s.estacion !== 'entrega' && s.estacion !== 'decide';
    const face = rob.face || 1;
    let bob = rob.walking ? Math.abs(Math.sin(t * 14)) * -5 : Math.sin(t * 2.5) * 1.5;
    let jump = 0;
    if (expr === 'celebra') jump = -Math.abs(Math.sin((t) * 9)) * 16;
    if (expr === 'sorpresa') { const e = Math.min(since(tl, t, 'chispas'), since(tl, t, 'alarma')); if (e < 0.35) jump = -Math.sin(e / 0.35 * Math.PI) * 18; }
    const sitDrop = rob.sit ? 14 : 0;
    ctx.save(); ctx.translate(q[0], q[1]);
    ctx.fillStyle = 'rgba(30,20,40,0.22)'; ctx.beginPath(); ctx.ellipse(0, 0, 30, 11, 0, 0, 7); ctx.fill();
    ctx.translate(0, bob + jump + sitDrop);
    // piernas
    const ph = t * 14;
    for (let k = -1; k <= 1; k += 2) {
      const sw = rob.walking ? Math.sin(ph + (k > 0 ? 0 : Math.PI)) * 7 : 0;
      const lift = rob.walking ? Math.max(0, Math.sin(ph + (k > 0 ? 0 : Math.PI))) * 5 : 0;
      ctx.strokeStyle = '#8f86c8'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(k * 10, -22); ctx.lineTo(k * 10 + sw, -6 - lift); ctx.stroke();
      fillRR(ctx, k * 10 + sw - 9 + face * 2, -9 - lift, 18, 9, 4, '#3f32a8');
    }
    // mochila (expediente) a la espalda
    const owner = mochilaOwner(tl, t);
    if (owner === 'robot') drawBackpack(ctx, tl, t, -face * 25, -60, 1, face);
    // brazo trasero
    const sh = [-face * 22, -54];
    drawArm(ctx, sh, [sh[0] - face * 4, sh[1] + 24 + (rob.walking ? Math.sin(ph) * 4 : 0)]);
    // cuerpo
    fillRR(ctx, -27, -66, 54, 48, 15, '#f7f4ff', '#2b2350', 3);
    fillRR(ctx, -16, -55, 32, 20, 6, '#1e1a3a');
    const stc = s ? (tl.estaciones[s.estacion] || {}).color || C.neonC : C.neonC;
    for (let i = 0; i < 4; i++) { const hh = 4 + (acting ? Math.abs(Math.sin(t * 8 + i)) * 10 : 3); ctx.fillStyle = stc; ctx.fillRect(-12 + i * 7, -38 - hh, 5, hh); }
    // brazo delantero
    const fsh = [face * 22, -54];
    let hand;
    if (expr === 'celebra') hand = [fsh[0] + face * 10, fsh[1] - 30 + Math.sin(t * 14) * 5];
    else if (rope) hand = [rope[0] - q[0], rope[1] - q[1] - bob - jump];
    else if (acting) hand = [fsh[0] + face * 26 + Math.sin(t * 9) * 3, fsh[1] + 4 + Math.cos(t * 7) * 3];
    else hand = [fsh[0] + face * 5, fsh[1] + 24 + (rob.walking ? -Math.sin(ph) * 4 : 0)];
    if (expr === 'celebra') { drawArm(ctx, sh, [sh[0] - face * 10, sh[1] - 30 - Math.sin(t * 14) * 5]); }
    // cabeza
    let tilt = 0; if (expr === 'duda') tilt = -0.12 * face; if (expr === 'pensando') tilt = 0.06;
    ctx.save(); ctx.translate(0, -66);
    if (expr === 'sorpresa') ctx.translate(Math.sin(t * 60) * 1.5, 0);
    ctx.rotate(tilt);
    // antena
    ctx.strokeStyle = '#2b2350'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(0, -60); ctx.stroke();
    const ab = Math.floor(t * 2) % 2 === 0;
    glow(ctx, ab ? C.neonC : C.neonM, 12); ctx.fillStyle = ab ? C.neonC : C.neonM; ctx.beginPath(); ctx.arc(0, -62, 5, 0, 7); ctx.fill(); noGlow(ctx);
    fillRR(ctx, -34, -48, 68, 50, 17, '#f7f4ff', '#2b2350', 3);
    fillRR(ctx, -28, -42, 56, 38, 12, '#16123a');
    // orejitas
    fillRR(ctx, -39, -30, 6, 16, 3, '#8f86c8'); fillRR(ctx, 33, -30, 6, 16, 3, '#8f86c8');
    drawFace(ctx, t, expr, face);
    ctx.restore();
    drawArm(ctx, fsh, hand);
    ctx.restore();
    // indicadores sobre la cabeza
    const hx = q[0], hy = q[1] + bob + jump + sitDrop - 150;
    if (expr === 'sorpresa') { glow(ctx, '#ffd23f', 12); text(ctx, '!', hx + face * 30, hy, { size: 44, weight: 900, color: '#ffd23f', stroke: '#2b2350', slw: 6 }); noGlow(ctx); }
    if (expr === 'duda') { text(ctx, '?', hx + face * 30, hy + Math.sin(t * 4) * 4, { size: 44, weight: 900, color: '#ffffff', stroke: '#2b2350', slw: 6 }); }
    if (expr === 'pensando') drawThought(ctx, t, hx - face * 10, hy - 6, s);
    if (expr === 'alivio') { for (let i = 0; i < 3; i++) { const u = ((t * 1.2 + i / 3) % 1); ctx.strokeStyle = `rgba(255,255,255,${1 - u})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hx + face * 40 + u * 20 * face, hy + 60 - u * 10, 6 + u * 6, 0, 7); ctx.stroke(); } text(ctx, '✓', hx - face * 34, hy + 10, { size: 30, weight: 900, color: '#3bff7a', stroke: '#2b2350', slw: 5 }); }
    if (expr === 'celebra') drawConfetti(ctx, t, hx, hy + 40, T.lastEvent(tl, t, 'celebra'));
  }

  function drawArm(ctx, a, b) {
    ctx.strokeStyle = '#8f86c8'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 4, b[0], b[1]); ctx.stroke();
    ctx.fillStyle = '#f7f4ff'; ctx.strokeStyle = '#2b2350'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b[0], b[1], 6, 0, 7); ctx.fill(); ctx.stroke();
  }

  function drawFace(ctx, t, expr, face) {
    const lx = face * 3;
    const blink = (t % 3.3) < 0.12 ? 0.15 : 1;
    ctx.fillStyle = C.neonC; ctx.strokeStyle = C.neonC; ctx.lineCap = 'round';
    glow(ctx, C.neonC, 8);
    const eye = (x) => {
      ctx.lineWidth = 3.5;
      switch (expr) {
        case 'sorpresa': ctx.beginPath(); ctx.arc(x, -24, 8, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(x, -24, 3, 0, 7); ctx.fill(); break;
        case 'alivio': case 'celebra': case 'contento': ctx.beginPath(); ctx.arc(x, -21, 6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); break;
        case 'duda': if (x * face < lx * face) { ctx.beginPath(); ctx.moveTo(x - 6, -23); ctx.lineTo(x + 6, -23); ctx.stroke(); } else fillRR(ctx, x - 4, -31, 8, 14, 4, C.neonC); break;
        case 'preocupado': fillRR(ctx, x - 4, -27, 8, 9, 3, C.neonC); ctx.beginPath(); ctx.moveTo(x - 7, -35 + (x < lx ? 3 : -3)); ctx.lineTo(x + 7, -35 + (x < lx ? -3 : 3)); ctx.stroke(); break;
        case 'pensando': fillRR(ctx, x - 4 - 2, -33, 8, 11, 4, C.neonC); break;
        default: fillRR(ctx, x - 4, -24 - 7 * blink, 8, 14 * blink, 4, C.neonC);
      }
    };
    eye(-11 + lx); eye(11 + lx);
    // boca
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (expr === 'celebra') { ctx.arc(lx, -14, 6, 0, Math.PI); ctx.fill(); }
    else if (expr === 'sorpresa') { ctx.arc(lx, -11, 3.5, 0, 7); ctx.stroke(); }
    else if (expr === 'preocupado') { ctx.moveTo(lx - 5, -9); ctx.quadraticCurveTo(lx, -13, lx + 5, -9); ctx.stroke(); }
    else if (expr === 'duda') { ctx.moveTo(lx - 5, -11); ctx.lineTo(lx + 5, -13); ctx.stroke(); }
    else { ctx.moveTo(lx - 6, -13); ctx.quadraticCurveTo(lx, -8, lx + 6, -13); ctx.stroke(); }
    noGlow(ctx);
  }

  function drawThought(ctx, t, x, y, s) {
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#2b2350'; ctx.lineWidth = 2;
    [[x + 10, y + 24, 5], [x + 20, y + 10, 8]].forEach(([a, b, r]) => { ctx.beginPath(); ctx.arc(a, b, r, 0, 7); ctx.fill(); ctx.stroke(); });
    const bx = x + 30, by = y - 40;
    fillRR(ctx, bx - 70, by - 28, 140, 56, 26, '#ffffff', '#2b2350', 2.5);
    // ícono: pregunta → clasificación
    text(ctx, '¿ganancia', bx - 6, by - 8, { size: 15, weight: 800, color: '#5b4bd6' });
    text(ctx, 'del año?', bx - 6, by + 10, { size: 15, weight: 800, color: '#5b4bd6' });
    ctx.fillStyle = '#38c98a'; ctx.beginPath(); ctx.moveTo(bx + 48, by + 12); ctx.lineTo(bx + 60, by - 8); ctx.lineTo(bx + 54, by - 8); ctx.lineTo(bx + 54, by - 14); ctx.lineTo(bx + 42, by + 12); ctx.fill();
  }

  function drawConfetti(ctx, t, x, y, e) {
    if (!e) return; const dt = t - e.t; if (dt < 0 || dt > 1.4) return;
    for (let i = 0; i < 36; i++) {
      const a = -Math.PI / 2 + (rnd(i, 21) - 0.5) * 2.4, sp = 200 + rnd(i, 22) * 260;
      const px = x + Math.cos(a) * sp * dt, py = y + Math.sin(a) * sp * dt + 420 * dt * dt;
      ctx.save(); ctx.translate(px, py); ctx.rotate(dt * 10 + i);
      ctx.fillStyle = ['#ff4fa3', '#29e6ff', '#ffd23f', '#7dff6b', '#9b6bff'][i % 5]; ctx.globalAlpha = 1 - dt / 1.4;
      ctx.fillRect(-5, -3, 10, 6); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawBackpack(ctx, tl, t, x, y, scale, face) {
    const sheets = sheetsInBag(tl, t);
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    // hojas asomando (una por herramienta usada)
    sheets.slice(-10).forEach((sh, i, arr) => {
      const n = arr.length; const off = (i - (n - 1) / 2) * 4.2;
      ctx.save(); ctx.translate(off, -18); ctx.rotate((i - (n - 1) / 2) * 0.09);
      ctx.fillStyle = sh.color; ctx.fillRect(-6, -14 - (i % 2) * 4, 12, 22);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-4, -10 - (i % 2) * 4, 8, 2);
      if (sh.gold) { glow(ctx, '#ffd23f', 10); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(-6, -14 - (i % 2) * 4, 12, 22); noGlow(ctx); }
      ctx.restore();
    });
    fillRR(ctx, -16, -20, 32, 44, 9, C.indigo, '#2b2350', 2.5);
    fillRR(ctx, -12, 4, 24, 14, 5, C.indigoD);
    fillRR(ctx, -16, -20, 32, 12, 8, '#7b6cf0', '#2b2350', 2);
    // contador de hojas
    if (sheets.length) { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(12, 16, 8, 0, 7); ctx.fill(); text(ctx, String(sheets.length), 12, 16.5, { size: 10, weight: 900, color: C.ink }); }
    ctx.restore();
  }

  function drawPerson(ctx, tl, t, p) {
    const q = P(p.x, p.y, p.z);
    const st = p.state;
    const sit = st === 'leyendo' || st === 'alerta' || st === 'cafe';
    const face = p.face || -1;
    ctx.save(); ctx.translate(q[0], q[1]); ctx.scale(1.18, 1.18);
    if (!sit) { ctx.fillStyle = 'rgba(30,20,40,0.22)'; ctx.beginPath(); ctx.ellipse(0, 0, 24, 9, 0, 0, 7); ctx.fill(); }
    const ph = t * 12;
    const bob = p.walking ? Math.abs(Math.sin(ph)) * -4 : 0;
    ctx.translate(0, bob + (sit ? 16 : 0));
    // piernas
    for (let k = -1; k <= 1; k += 2) {
      const sw = p.walking ? Math.sin(ph + (k > 0 ? 0 : Math.PI)) * 8 : 0;
      ctx.strokeStyle = '#2d2b5a'; ctx.lineWidth = 10; ctx.lineCap = 'round';
      if (sit) { ctx.beginPath(); ctx.moveTo(k * 7, -40); ctx.lineTo(k * 7 + face * 16, -34); ctx.lineTo(k * 7 + face * 16, -16); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(k * 7, -42); ctx.lineTo(k * 7 + sw, -6); ctx.stroke(); fillRR(ctx, k * 7 + sw - 7 + face * 3, -8, 14, 7, 3, '#1b1636'); }
    }
    // torso (suéter)
    fillRR(ctx, -19, -86, 38, 50, 14, '#f2a03d', '#7a4a12', 2.5);
    ctx.fillStyle = '#e08a2a'; ctx.fillRect(-19, -46, 38, 6);
    // cabeza
    let nod = 0;
    const as = T.lastEvent(tl, t, 'asiente'); if (as && t - as.t < 0.8 && t >= as.t) nod = Math.sin((t - as.t) / 0.8 * Math.PI * 3) * 5;
    const look = st === 'leyendo' ? 5 : (st === 'revisa' ? 6 : 0);
    ctx.save(); ctx.translate(0, -100 + nod * 0.6 + look);
    ctx.fillStyle = '#e0a07a'; ctx.fillRect(-5, 6, 10, 10);
    ctx.fillStyle = '#e8ae86'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.fill();
    // pelo con moño
    ctx.fillStyle = '#3a2a25'; ctx.beginPath(); ctx.arc(0, -4, 17, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
    ctx.beginPath(); ctx.arc(-face * 12, -14, 8, 0, 7); ctx.fill();
    ctx.fillRect(-17, -6, 6, 10); ctx.fillRect(11, -6, 6, 10);
    // anteojos y cara
    ctx.strokeStyle = '#2b2350'; ctx.lineWidth = 1.8;
    const ex = face * 3;
    if (st === 'leyendo' || st === 'revisa') { ctx.beginPath(); ctx.moveTo(ex - 9, 3); ctx.lineTo(ex - 3, 3); ctx.moveTo(ex + 3, 3); ctx.lineTo(ex + 9, 3); ctx.stroke(); }
    else { ctx.fillStyle = '#2b2350'; ctx.beginPath(); ctx.arc(ex - 6, 1, 2.2, 0, 7); ctx.arc(ex + 6, 1, 2.2, 0, 7); ctx.fill(); }
    ctx.beginPath(); ctx.arc(ex - 6, 1, 5, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(ex + 6, 1, 5, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(ex, 8, 4, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.restore();
    // brazos y objetos
    const arm = (a, b) => { ctx.strokeStyle = '#f2a03d'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.fillStyle = '#e8ae86'; ctx.beginPath(); ctx.arc(b[0], b[1], 5, 0, 7); ctx.fill(); };
    if (st === 'revisa' || st === 'espera' || st === 'sella') {
      const hold = st !== 'espera' || mochilaOwner(tl, t) === 'persona';
      if (hold && mochilaOwner(tl, t) === 'persona') {
        // mochila abierta en las manos, hojas en abanico
        const sheets = sheetsInBag(tl, t);
        const fan = st === 'revisa' ? smooth((p.segT) / 0.6) : 0.4;
        sheets.forEach((sh, i) => {
          const a = (i - (sheets.length - 1) / 2) * 0.22 * fan;
          ctx.save(); ctx.translate(face * 18, -62); ctx.rotate(a); ctx.fillStyle = sh.color; ctx.fillRect(-7, -38 * (0.5 + fan * 0.5), 14, 26); ctx.restore();
        });
        drawBackpackShape(ctx, face * 18, -50);
        arm([-12, -78], [face * 8, -52]); arm([12, -78], [face * 26, -50]);
      } else { arm([-14, -78], [-16, -46]); arm([14, -78], [16, -46]); }
      if (st === 'sella') {
        const u = clamp((t - (p.seg.ts || 0)) / 0.25, 0, 1);
        const up = u < 1 ? -20 * Math.sin(u * Math.PI) : 0;
        if (t >= (p.seg.ts || 0) + 0.2) {
          // sello estampado
          ctx.save(); ctx.translate(-face * 26, -90); ctx.rotate(-0.15);
          glow(ctx, '#ffd23f', 14); fillRR(ctx, -44, -16, 88, 32, 6, '#fff3df', '#f2b53a', 3); noGlow(ctx);
          text(ctx, 'DECISIÓN ✓', 0, 1, { size: 13, weight: 900, color: '#a0640c' });
          ctx.restore();
        }
        ctx.fillStyle = '#c23b5a'; ctx.fillRect(-face * 26 - 6, -120 + up, 12, 14);
      }
    } else if (st === 'leyendo' || st === 'alerta') {
      arm([-12, -78], [face * 18, -58]); arm([12, -78], [face * 24, -56]);
      if (st === 'leyendo' && Math.floor(t / 2.7) % 2 === 0 && (t % 2.7) < 0.4) { ctx.fillStyle = '#fffaf0'; ctx.fillRect(face * 18, -70, 14, 18); }
    } else if (st === 'cafe') {
      arm([-12, -78], [face * 14, -66]); arm([12, -78], [face * 22, -62]);
      ctx.fillStyle = '#fffaf0'; ctx.fillRect(face * 18 - 7, -82, 14, 16);
    } else {
      const sw = p.walking ? Math.sin(ph) * 10 : 0;
      arm([-14, -78], [-16 + sw, -46]); arm([14, -78], [16 - sw, -46]);
    }
    ctx.restore();
    if (st === 'alerta') { glow(ctx, '#ffd23f', 10); text(ctx, '!', q[0] + 26, q[1] - 120, { size: 34, weight: 900, color: '#ffd23f', stroke: '#2b2350', slw: 5 }); noGlow(ctx); }
  }

  function drawBackpackShape(ctx, x, y) {
    fillRR(ctx, x - 16, y - 20, 32, 40, 9, C.indigo, '#2b2350', 2.5);
    fillRR(ctx, x - 12, y + 2, 24, 13, 5, C.indigoD);
  }

  // ---------- burbujas, hojas voladoras, papeles ----------
  function bubbleBox(ctx, x, y, s, txt, o) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const fs = 22;
    const w = tw(ctx, txt, fs, 700) + (o.smiley ? 34 : 0) + 40, h = 52;
    const bg = o.out ? '#4b3fc4' : '#ffffff', fg = o.out ? '#ffffff' : C.ink;
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    fillRR(ctx, -w / 2, -h / 2, w, h, 24, bg); noGlow(ctx); ctx.shadowOffsetY = 0;
    ctx.fillStyle = bg; ctx.beginPath();
    if (o.out) { ctx.moveTo(w / 2 - 34, h / 2 - 2); ctx.lineTo(w / 2 - 10, h / 2 + 16); ctx.lineTo(w / 2 - 14, h / 2 - 2); }
    else { ctx.moveTo(-w / 2 + 34, h / 2 - 2); ctx.lineTo(-w / 2 + 10, h / 2 + 16); ctx.lineTo(-w / 2 + 14, h / 2 - 2); }
    ctx.fill();
    ctx.strokeStyle = o.out ? '#8f86ff' : '#4f7cff'; ctx.lineWidth = 3; rrect(ctx, -w / 2, -h / 2, w, h, 24); ctx.stroke();
    text(ctx, txt, -w / 2 + 20, 1, { size: fs, weight: 700, color: fg, align: 'left' });
    if (o.smiley) {
      const sx = w / 2 - 30; ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(sx, 0, 12, 0, 7); ctx.fill();
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(sx - 4, -3, 1.8, 0, 7); ctx.arc(sx + 4, -3, 1.8, 0, 7); ctx.fill();
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, 1, 6, 0.3, Math.PI - 0.3); ctx.stroke();
    }
    if (o.canal) {
      const cw = tw(ctx, o.canal, 13, 800) + 34;
      fillRR(ctx, -w / 2 + 8, -h / 2 - 22, cw, 22, 11, '#4f7cff');
      drawChannelIcon(ctx, -w / 2 + 20, -h / 2 - 11, o.canal);
      text(ctx, o.canal, -w / 2 + 30, -h / 2 - 10.5, { size: 13, weight: 800, color: '#fff', align: 'left' });
    }
    if (o.pregunta) { fillRR(ctx, w / 2 - 70, -h / 2 - 22, 66, 22, 11, '#ff6fb5'); text(ctx, 'pide dato', w / 2 - 37, -h / 2 - 10.5, { size: 12, weight: 800, color: '#fff' }); }
    ctx.restore();
  }
  function drawChannelIcon(ctx, x, y, canal) {
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 1.8;
    if (canal === 'app') { rrect(ctx, -4, -7, 8, 14, 2); ctx.stroke(); ctx.fillRect(-1, 4, 2, 1.5); }
    else if (canal === 'correo') { ctx.strokeRect(-6, -4.5, 12, 9); ctx.beginPath(); ctx.moveTo(-6, -4.5); ctx.lineTo(0, 1); ctx.lineTo(6, -4.5); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, 0, 2.5, 6, 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke(); }
    ctx.restore();
  }

  function drawBubbles(ctx, tl, t, rob) {
    for (const b of tl.bubbles) {
      if (b.kind === 'in') {
        if (t < b.t0 || t > b.tEnd + 0.35) continue;
        const ywin = 2.6;
        const a = P(-3.2, ywin, 4.6), m = P(-0.1, ywin, 3.0), e = P(0.9, ywin + 0.2, 2.9);
        let x, y, s = 1, al = 1;
        if (t < b.t1) { const u = easeInOut((t - b.t0) / (b.t1 - b.t0)); const k = u < 0.6 ? u / 0.6 : 1; const k2 = u < 0.6 ? 0 : (u - 0.6) / 0.4; x = lerp(lerp(a[0], m[0], k), e[0], k2); y = lerp(lerp(a[1], m[1], k), e[1], k2) + Math.sin(u * Math.PI) * -20; s = 0.6 + 0.4 * u; }
        else { x = e[0]; y = e[1] + Math.sin(t * 3) * 3; }
        if (t > b.tEnd) { const u = (t - b.tEnd) / 0.35; const rq = P(rob.x, rob.y, 1.6); x = lerp(x, rq[0], u); y = lerp(y, rq[1], u); s *= 1 - u * 0.8; al = 1 - u; }
        ctx.globalAlpha = al;
        bubbleBox(ctx, x + 60, y - 40, s, b.text, { smiley: b.smiley, canal: b.reply ? null : b.canal });
        ctx.globalAlpha = 1;
      } else {
        if (t < b.t0 || t > b.t1 + 1.3) continue;
        const a = P(0.7, 4.8, 1.9), m = P(0.0, 4.8, 2.8), e = P(-3.4, 4.8, 4.8);
        let x, y, s, al = 1;
        const k0 = easeInOut((t - b.t0) / 0.35);
        x = lerp(a[0], m[0], k0); y = lerp(a[1], m[1], k0) - k0 * 60; s = 0.55 + 0.45 * k0;
        if (t > b.t1 + 0.4) { const k = easeInOut((t - b.t1 - 0.4) / 0.9); x = lerp(m[0], e[0], k); y = lerp(m[1] - 60, e[1] - 80, k); s = 1 - 0.4 * k; al = 1 - k; }
        ctx.globalAlpha = al;
        bubbleBox(ctx, x + 10, y - 30, s, b.text, { out: true, pregunta: b.pregunta });
        ctx.globalAlpha = 1;
      }
    }
  }

  function stationFocusPx(id) { const S = L.stations[id]; return P(S.focus[0], S.focus[1], S.focus[2] - 0.4); }

  function drawFlyingSheets(ctx, tl, t, rob, person) {
    const bag = P(rob.x - (rob.face || 1) * 0.3, rob.y, 1.0);
    for (const sh of tl.sheets) {
      if (t < sh.t || t > sh.t + 0.45) continue;
      const u = easeInOut((t - sh.t) / 0.45);
      const a = sh.gold && person ? P(person.x, person.y, 1.6) : stationFocusPx(sh.from);
      const x = lerp(a[0], bag[0], u), y = lerp(a[1], bag[1], u) - Math.sin(u * Math.PI) * 80;
      ctx.save(); ctx.translate(x, y); ctx.rotate(u * 6);
      glow(ctx, sh.color, 12); ctx.fillStyle = sh.color; ctx.fillRect(-11, -14, 22, 28); noGlow(ctx);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; for (let i = 0; i < 3; i++) ctx.fillRect(-7, -8 + i * 6, 14, 2);
      ctx.restore();
    }
    // la mochila vuela entre el robot y la persona
    for (const m of tl.mochilaOwner) {
      const dt = t - (m.t - 0.5); if (dt < 0 || dt > 0.5) continue;
      const u = easeInOut(dt / 0.5);
      const rp = P(rob.x, rob.y, 1.0), pp = P(person.x, person.y, 1.05);
      const [a, b] = m.owner === 'persona' ? [rp, pp] : [pp, rp];
      ctx.save(); ctx.translate(lerp(a[0], b[0], u), lerp(a[1], b[1], u) - Math.sin(u * Math.PI) * 70); ctx.rotate(Math.sin(u * Math.PI) * 0.4);
      drawBackpackShape(ctx, 0, 0); ctx.restore();
    }
    // archivado al cerrar el caso
    for (const c of tl.cases) {
      const dt = t - c.tArchive; if (dt < 0 || dt > 0.9) continue;
      const sheets = tl.sheets.filter((s) => s.caso === c.idx);
      const dest = P(0.6, 6.1, 0.9);
      const rp = P(rob.x, rob.y, 1.0);
      sheets.forEach((sh, i) => {
        const u = easeInOut(clamp((dt - i * 0.04) / 0.5, 0, 1)); if (u <= 0 || u >= 1) return;
        const x = lerp(rp[0], dest[0], u), y = lerp(rp[1], dest[1], u) - Math.sin(u * Math.PI) * 120;
        ctx.save(); ctx.translate(x, y); ctx.rotate(u * 5 + i); ctx.fillStyle = sh.color; ctx.fillRect(-9, -12, 18, 24); ctx.restore();
      });
    }
  }

  function drawFallingPapers(ctx, t) {
    for (let k = 0; k < 7; k++) {
      const t0 = 5 + k * 7.3, dt = t - t0; if (dt < 0 || dt > 3.4) continue;
      const x = 10.8 + rnd(k, 31) * 1.8, y = 3.25;
      const z = Math.max(0.02, L.altillo.z - dt * 1.5);
      const drift = Math.sin(dt * 3 + k) * 0.35;
      const q = P(x + drift, y + dt * 0.25, z);
      ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(z > 0.03 ? Math.sin(dt * 4 + k) * 0.8 : 0.3); ctx.scale(1, z > 0.03 ? Math.abs(Math.cos(dt * 3)) * 0.6 + 0.4 : 0.5);
      ctx.globalAlpha = dt > 2.8 ? 1 - (dt - 2.8) / 0.6 : 1;
      ctx.fillStyle = '#fffaf0'; ctx.fillRect(-10, -13, 20, 26); ctx.fillStyle = 'rgba(40,30,60,0.3)'; ctx.fillRect(-6, -7, 12, 2); ctx.fillRect(-6, -1, 10, 2);
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }

  // ---------- letreros de estación (siempre legibles) ----------
  const SIGNS = {
    leer: [0.5, 2.6, 4.25], responder: [0.5, 4.8, 3.75], clasificar: [0.5, 7.2, 4.15],
    cuenta: [2.4, 0.6, 3.75], buscar: [6.15, 0.6, 3.8], calcular: [9.15, 1.0, 2.95],
    ejecutar: [12.1, 10.0, 3.0], verificar: [7.0, 5.7, 3.5], derivar: [10.0, 3.8, 2.4],
  };
  function drawSigns(ctx, tl, t, cam) {
    const s = activeStep(tl, t);
    const inactiveA = clamp((1.3 - cam.z) / 0.35, 0, 1);
    for (const id in SIGNS) {
      const est = tl.estaciones[id]; const q = P(...SIGNS[id]);
      const on = s && s.estacion === id;
      const al = on ? 1 : inactiveA; if (al <= 0.01) continue;
      ctx.globalAlpha = al;
      const k = on ? 1 + 0.06 * smooth((t - s.t0) / 0.3) : 1;
      const big = est.letrero, small = est.herramienta;
      const w = Math.max(tw(ctx, big, 21, 900), tw(ctx, small, 13, 600, true)) + 30, h = 54;
      ctx.save(); ctx.translate(q[0], q[1]); ctx.scale(k, k);
      // cordeles
      ctx.strokeStyle = 'rgba(60,40,80,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-w / 2 + 12, -h / 2); ctx.lineTo(-w / 2 + 18, -h / 2 - 16); ctx.moveTo(w / 2 - 12, -h / 2); ctx.lineTo(w / 2 - 18, -h / 2 - 16); ctx.stroke();
      if (on) glow(ctx, est.color, 26);
      fillRR(ctx, -w / 2, -h / 2, w, h, 10, '#1d1838', est.color, on ? 4 : 2.5); noGlow(ctx);
      text(ctx, big, 0, -7, { size: 21, weight: 900, color: '#ffffff' });
      text(ctx, small, 0, 15, { size: 13, weight: 600, color: est.color, mono: true });
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // etiquetas de resultado junto a la estación
  function drawResultTags(ctx, tl, t) {
    const s = activeStep(tl, t); if (!s) return;
    if (['leer', 'responder', 'entrega'].includes(s.estacion)) return;
    const t0 = s.ta + 0.45; if (t < t0) return;
    let msg = s.resultado, col = '#2f9c6a', icon = '•';
    if (s.error) { const te = s.ta + 0.75; if (t >= te) { msg = s.error.detalle; col = '#e8453c'; icon = '✗'; } else return; }
    else if (s.semaforo === 'rojo') { if (t < s.ta + 0.55) return; col = '#e8453c'; icon = '✗'; }
    else if (s.semaforo === 'verde') { if (t < s.ta + 0.45) return; icon = '✓'; }
    else if (s.correccion) { msg = s.correccion; col = '#2f9c6a'; icon = '↻'; }
    else if (s.duda) { col = '#c77d12'; icon = '?'; }
    if (!msg) return;
    const tool = s.estacion === 'decide' ? 'decision_equipo' : tl.estaciones[s.estacion].herramienta;
    const a = smooth((t - t0) / 0.25) * (1 - smooth((t - (s.t1 - 0.15)) / 0.15));
    const fs = 26, tws = tw(ctx, tool + '  →', 20, 600, true);
    const w = tw(ctx, msg, fs, 700) + tws + 100;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H - 152 + (1 - a) * 12);
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
    fillRR(ctx, -w / 2, -28, w, 56, 14, '#fffaf0'); noGlow(ctx); ctx.shadowOffsetY = 0;
    fillRR(ctx, -w / 2, -28, 48, 56, 14, col); ctx.fillStyle = col; ctx.fillRect(-w / 2 + 30, -28, 18, 56);
    text(ctx, icon, -w / 2 + 24, 1, { size: 28, weight: 900, color: '#fff' });
    text(ctx, tool + '  →', -w / 2 + 64, 1, { size: 20, weight: 600, color: '#7a70b0', align: 'left', mono: true });
    text(ctx, msg, -w / 2 + 64 + tws + 12, 1, { size: fs, weight: 700, color: C.ink, align: 'left' });
    ctx.restore();
  }

  // etiquetas de presentación de personajes (intro y llamada)
  function drawCharacterLabels(ctx, tl, t, rob, person) {
    const tagsOn = (a, b) => smooth((t - a) / 0.3) * (1 - smooth((t - b) / 0.3));
    const tag = (x, y, s, col, a) => {
      if (a <= 0) return; ctx.save(); ctx.globalAlpha = a;
      const w = tw(ctx, s, 20, 800) + 28;
      fillRR(ctx, x - w / 2, y - 18, w, 36, 18, col, '#ffffff', 3);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - 8, y + 16); ctx.lineTo(x, y + 28); ctx.lineTo(x + 8, y + 16); ctx.fill();
      text(ctx, s, x, y + 1, { size: 20, weight: 800, color: '#fff' }); ctx.restore();
    };
    const rq = P(rob.x, rob.y, 0);
    tag(rq[0], rq[1] - 175, 'asesor IA', C.indigo, tagsOn(0.6, 3.1));
    const pq = P(person.x, person.y, person.z);
    const camp = tl.events.find((e) => e.type === 'campana');
    const pa = Math.max(tagsOn(0.9, 3.1), camp ? tagsOn(camp.t + 0.2, camp.t + 1.9) : 0);
    tag(pq[0], pq[1] - 160, 'persona del equipo', '#d4891a', pa);
  }

  // ---------- HUD (pantalla) ----------
  function drawHUD(ctx, tl, t, mini) {
    // título de escena
    for (const T0 of tl.titles) {
      if (t < T0.t0 || t > T0.t1) continue;
      const a = smooth((t - T0.t0) / 0.35) * (1 - smooth((t - (T0.t1 - 0.35)) / 0.35));
      ctx.save(); ctx.globalAlpha = a;
      if (T0.big) {
        const y = 905 + (1 - a) * 20;
        fillRR(ctx, W / 2 - 520, y - 82, 1040, 180, 34, 'rgba(24,18,46,0.86)');
        text(ctx, T0.text, W / 2, y - 12, { size: 78, weight: 900, color: '#ffffff' });
        text(ctx, 'Cómo atiende los pedidos y reclamos de los clientes', W / 2, y + 56, { size: 28, weight: 600, color: '#cfc6ff' });
      } else {
        const fs = 46; const w = tw(ctx, T0.text, fs, 800) + 80; const y = 78 + (1 - a) * -14;
        fillRR(ctx, W / 2 - w / 2, y - 40, w, 80, 40, 'rgba(24,18,46,0.84)');
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2; rrect(ctx, W / 2 - w / 2, y - 40, w, 80, 40); ctx.stroke();
        text(ctx, T0.text, W / 2, y + 1, { size: fs, weight: 800, color: '#ffffff' });
      }
      ctx.restore();
    }
    if (t < 3.0 || t > tl.outroStart + 1.2) { drawFinal(ctx, tl, t); return; }
    const hudA = smooth((t - 3.0) / 0.4) * (1 - smooth((t - tl.outroStart - 0.6) / 0.6));
    ctx.save(); ctx.globalAlpha = hudA;
    // indicador del ciclo
    const s = activeStep(tl, t);
    const phase = s ? s.fase : null;
    const ph = [['entender', 'ENTENDER', '#9b6bff'], ['actuar', 'ACTUAR', '#ff9a3c'], ['verificar', 'VERIFICAR', '#21d4c4']];
    const cx = W / 2, cy = H - 58;
    fillRR(ctx, cx - 330, cy - 34, 660, 68, 34, 'rgba(24,18,46,0.78)');
    text(ctx, 'ciclo', cx - 286, cy, { size: 14, weight: 700, color: '#8d84c8', mono: true });
    ph.forEach(([id, lab, col], i) => {
      const x = cx - 150 + i * 170; const on = phase === id;
      if (on) glow(ctx, col, 18);
      fillRR(ctx, x - 70, cy - 20, 140, 40, 20, on ? col : 'rgba(255,255,255,0.06)', on ? '#ffffff' : 'rgba(255,255,255,0.18)', 2); noGlow(ctx);
      text(ctx, lab, x, cy + 1, { size: 17, weight: 800, color: on ? '#1b1636' : '#b7afe6' });
      if (i < 2) { ctx.fillStyle = '#6f66a8'; ctx.beginPath(); ctx.moveTo(x + 76, cy - 6); ctx.lineTo(x + 92, cy); ctx.lineTo(x + 76, cy + 6); ctx.fill(); }
    });
    // flecha de retorno ↺
    ctx.strokeStyle = '#6f66a8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx + 290, cy, 14, -Math.PI * 0.9, Math.PI * 0.7); ctx.stroke();
    ctx.fillStyle = '#6f66a8'; ctx.beginPath(); ctx.moveTo(cx + 276, cy - 10); ctx.lineTo(cx + 270, cy + 2); ctx.lineTo(cx + 284, cy - 1); ctx.fill();

    // contador de casos
    const c = currentCase(tl, t) || tl.cases[0];
    const ci = c ? c.idx : 0;
    fillRR(ctx, W - 330, 30, 300, 92, 20, 'rgba(24,18,46,0.78)');
    text(ctx, `CASO ${ci + 1}/3`, W - 310, 60, { size: 26, weight: 900, color: '#ffffff', align: 'left' });
    for (let i = 0; i < 3; i++) { const done = t >= tl.cases[i].tArchive + 0.4; const cur = i === ci; ctx.fillStyle = done ? '#3bff7a' : cur ? '#ffd23f' : 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(W - 120 + i * 30, 60, 9, 0, 7); ctx.fill(); }
    text(ctx, c ? c.tipo : '', W - 310, 96, { size: 17, weight: 600, color: '#cfc6ff', align: 'left' });

    // expediente (contexto acumulado)
    const sheets = c ? tl.sheets.filter((x) => x.caso === c.idx && t >= x.t + 0.45 && t < c.tArchive + 0.6) : [];
    const own = mochilaOwner(tl, t);
    const bx = 30, by = H - 30;
    const rows = sheets.length;
    const bh = 64 + rows * 30 + (own === 'persona' ? 30 : 0);
    fillRR(ctx, bx, by - bh, 330, bh, 18, 'rgba(24,18,46,0.78)');
    drawBackpackShape(ctx, bx + 30, by - bh + 34);
    text(ctx, 'EXPEDIENTE', bx + 58, by - bh + 26, { size: 18, weight: 900, color: '#ffffff', align: 'left' });
    text(ctx, 'contexto del caso', bx + 58, by - bh + 47, { size: 13, weight: 600, color: '#8d84c8', align: 'left', mono: true });
    sheets.forEach((sh, i) => {
      const y = by - bh + 80 + i * 30;
      const a2 = smooth((t - sh.t - 0.45) / 0.25);
      ctx.globalAlpha = hudA * a2;
      ctx.fillStyle = sh.color; ctx.fillRect(bx + 20, y - 10, 14, 20);
      text(ctx, sh.tool, bx + 46, y, { size: 16, weight: 600, color: sh.err ? '#ff8a8a' : '#e9e4ff', align: 'left', mono: true });
      if (sh.err) text(ctx, '✗ → corregido', bx + 314, y, { size: 12, weight: 700, color: '#ff8a8a', align: 'right' });
      ctx.globalAlpha = hudA;
    });
    if (own === 'persona') text(ctx, '→ en manos de la persona', bx + 20, by - 22, { size: 15, weight: 800, color: '#ffd23f', align: 'left' });
    ctx.restore();
  }

  function drawFinal(ctx, tl, t) {
    const F = tl.finalText; if (!F || t < F.t0) return;
    const a = smooth((t - F.t0) / 0.8);
    ctx.save(); ctx.globalAlpha = a;
    const g = ctx.createLinearGradient(0, 0, 0, 260); g.addColorStop(0, 'rgba(24,18,46,0.95)'); g.addColorStop(0.6, 'rgba(24,18,46,0.8)'); g.addColorStop(1, 'rgba(24,18,46,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 260);
    const parts = F.text.split('. ');
    text(ctx, parts[0] + '.', W / 2, 78 - (1 - a) * 20, { size: 64, weight: 900, color: '#ffffff' });
    const a2 = smooth((t - F.t0 - 0.7) / 0.8); ctx.globalAlpha = a2;
    text(ctx, parts[1], W / 2, 152 - (1 - a2) * 20, { size: 52, weight: 800, color: '#ffd23f' });
    ctx.restore();
    // fundido final
    const fo = smooth((t - (tl.duration - 0.6)) / 0.6);
    if (fo > 0) { ctx.fillStyle = `rgba(18,12,34,${fo})`; ctx.fillRect(0, 0, W, H); }
  }

  // ---------- frame completo ----------
  function renderFrame(ctx, tl, t, opts) {
    opts = opts || {};
    ctx.save();
    drawBackground(ctx, t);
    const cam = T.camAt(tl, t);
    const sway = opts.mini ? 0 : Math.sin(t * 0.5) * 4;
    ctx.translate(W / 2, H / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x + sway, -cam.y);
    drawShell(ctx, t);
    drawLeftWallDecor(ctx, tl, t);
    drawRightWallDecor(ctx, tl, t);

    const rob = T.robotAt(tl, t);
    const person = T.personAt(tl, t);
    const items = [];
    const add = (d, f) => items.push({ d, f });
    add(0.6 + 2.6, () => drawLeerDesk(ctx, tl, t));
    add(0.55 + 4.8, () => drawTelegrafo(ctx, tl, t));
    add(0.6 + 6.1, () => drawCrate(ctx, tl, t));
    add(3.0 + 0.55, () => drawArchivo(ctx, tl, t));
    add(6.15 + 0.5, () => drawBiblioteca(ctx, tl, t));
    add(9.15 + 0.65, () => drawCalculadora(ctx, tl, t));
    add(12.3 + 10.25, () => drawEjecutar(ctx, tl, t));
    add(12.0 + 1.0, () => drawStorage(ctx, t));
    add(12.2 + 1.6 + 0.3, () => drawAltillo(ctx, tl, t, person));
    drawStairs(ctx, items);
    add(6.5 + 6.75, () => drawVerificar(ctx, tl, t));
    add(L.coffeeTable[0] + L.coffeeTable[1], () => drawCoffee(ctx, tl, t, 'table'));
    add(L.seatRobot[0] + L.seatRobot[1] - 0.05, () => drawStool(ctx, L.seatRobot[0], L.seatRobot[1], '#7b6cf0'));
    add(L.seatPerson[0] + L.seatPerson[1] - 0.05, () => drawStool(ctx, L.seatPerson[0], L.seatPerson[1], '#f2a03d'));
    add(9.9 + 13.3, () => drawPlant(ctx, t));
    add(11.8 + 12.8, () => drawSofa(ctx, t));
    add(0.5 + 8.9, () => drawFloorLamp(ctx, t, 0.5, 8.9));
    add(7.2 + 13.2, () => drawCooler(ctx, t));
    add(0.5 + 10.4, () => drawRadio(ctx, t));
    add(1.2 + 12.9, () => { ctx.save(); const q = P(1.2, 12.9, 0); ctx.translate(q[0], q[1]); ctx.scale(0.8, 0.8); ctx.translate(-q[0], -q[1]); drawPlantAt(ctx, t + 3, 1.2, 12.9, 1); ctx.restore(); });
    // campana y cuerda
    let ropeEnd = null;
    add(11.1 + 3.4, () => { ropeEnd = drawBell(ctx, tl, t); });
    // robot (agarra la cuerda al derivar)
    const s = activeStep(tl, t);
    const pullingRope = s && s.estacion === 'derivar' && t >= s.ta && t < s.ta + 1.4;
    add(rob.x + rob.y + 0.2, () => drawRobot(ctx, tl, t, rob, pullingRope ? ropeEnd : null));
    if (!(person.z > L.altillo.z - 0.05 && person.y < 1.6)) add(person.x + person.y + 0.6, () => drawPerson(ctx, tl, t, person));
    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.f(ctx);

    drawFallingPapers(ctx, t);
    drawSigns(ctx, tl, t, cam);
    drawBubbles(ctx, tl, t, rob);
    drawFlyingSheets(ctx, tl, t, rob, person);
    if (!opts.mini) drawCharacterLabels(ctx, tl, t, rob, person);
    ctx.restore();

    // viñeta
    if (!opts.mini) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,5,25,0.45)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    drawHUD(ctx, tl, t, opts.mini);
    if (t > 3.0 && t < tl.outroStart) drawResultTags(ctx, tl, t);
  }

  root.Scene = { renderFrame, W, H };
})(typeof window !== 'undefined' ? window : globalThis);
