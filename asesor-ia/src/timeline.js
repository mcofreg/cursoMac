/*
 * timeline.js — convierte data.json en una línea de tiempo determinista.
 * La MISMA línea de tiempo alimenta el render (scene.js) y el audio (tools/audio.js):
 * cada evento visual que hace ruido está en `events` con su tiempo exacto.
 * Funciona en navegador (window.Timeline) y en Node (module.exports).
 */
(function (root) {
  'use strict';

  const U = 64; // px por unidad de mundo con zoom 1

  // Distribución de la oficina (coordenadas de piso, unidades). Compartida con scene.js.
  const LAYOUT = {
    floor: 14,
    wallH: 6.2,
    altillo: { x0: 10.4, x1: 14, y0: 0, y1: 3.2, z: 3.8 },
    stairs: { x0: 13.0, x1: 14.0, yTop: 3.2, yBot: 7.4, steps: 9 },
    stations: {
      leer:       { stand: [2.0, 2.7], face: -1, focus: [0.9, 2.6, 1.9], zoom: 1.62 },
      responder:  { stand: [2.0, 4.8], face: -1, focus: [1.0, 4.7, 1.9], zoom: 1.6 },
      clasificar: { stand: [2.0, 7.1], face: -1, focus: [0.6, 7.1, 2.3], zoom: 1.62 },
      cuenta:     { stand: [3.4, 2.1], face: 1,  focus: [3.2, 0.7, 1.9], zoom: 1.6 },
      buscar:     { stand: [6.0, 2.4], face: 1,  focus: [6.0, 0.8, 2.1], zoom: 1.6 },
      calcular:   { stand: [9.1, 2.9], face: 1,  focus: [9.1, 0.9, 1.9], zoom: 1.6 },
      ejecutar:   { stand: [12.0, 11.65], face: 1, focus: [12.2, 10.6, 1.5], zoom: 1.6 },
      verificar:  { stand: [6.7, 8.15], face: 1, focus: [6.6, 7.1, 1.5], zoom: 1.7 },
      derivar:    { stand: [10.3, 4.4], face: 1, focus: [11.8, 3.6, 2.6], zoom: 1.3 },
      entrega:    { stand: [10.6, 8.2], face: 1, focus: [11.5, 8.05, 1.3], zoom: 1.8 },
      decide:     { stand: [10.6, 8.2], face: 1, focus: [11.5, 8.05, 1.4], zoom: 1.9 },
    },
    home: [6.2, 9.4],
    personDesk: [12.4, 1.3],
    personHand: [12.4, 7.9],
    seatRobot: [2.15, 11.7],
    seatPerson: [4.15, 10.5],
    coffeeTable: [3.0, 10.8],
  };

  // obstáculos de piso que el robot rodea (mesa de VERIFICAR)
  const OBST = [[5.2, 5.6, 7.8, 7.9]];
  function blocked(a, b) {
    for (let k = 1; k < 20; k++) { const x = a[0] + (b[0] - a[0]) * k / 20, y = a[1] + (b[1] - a[1]) * k / 20;
      for (const o of OBST) if (x > o[0] && x < o[2] && y > o[1] && y < o[3]) return true; }
    return false;
  }
  function route(a, b) {
    if (!blocked(a, b)) return null;
    let best = null, bl = 1e9;
    for (const v of [[8.6, 5.0], [4.6, 8.6], [8.4, 8.8], [4.8, 5.0]]) {
      if (blocked(a, v) || blocked(v, b)) continue;
      const l = Math.hypot(v[0] - a[0], v[1] - a[1]) + Math.hypot(b[0] - v[0], b[1] - v[1]);
      if (l < bl) { bl = l; best = v; }
    }
    return best;
  }

  function iso(x, y, z) {
    return [(x - y) * U * 0.866, (x + y) * U * 0.5 - (z || 0) * U];
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  function build(data) {
    const meta = data.meta;
    const ST = data.estaciones;
    const tl = {
      meta, U, LAYOUT, estaciones: ST,
      steps: [], titles: [], events: [], sheets: [], robotSegs: [], personSegs: [],
      exprs: [], camKeys: [], cases: [], bubbles: [], mochilaOwner: [],
    };
    const ev = (t, type, extra) => tl.events.push(Object.assign({ t, type }, extra || {}));

    let t = meta.intro;
    let pos = LAYOUT.home.slice();
    let cam = { x: 0, y: 290, z: 0.72 };
    tl.camKeys.push({ t: 0, ...cam });
    cam = { x: 0, y: 270, z: 0.76 };
    tl.camKeys.push({ t: meta.intro - 0.2, ...cam });
    tl.robotSegs.push({ t0: 0, t1: t, from: pos, to: pos, walk: false, face: 1 });
    ev(0.4, 'ambiente');

    // la persona trabaja en el altillo hasta que la llaman
    const deskAlt = [LAYOUT.personDesk[0], LAYOUT.personDesk[1], LAYOUT.altillo.z];
    let personState = { pos: deskAlt, state: 'leyendo' };
    let personCalled = null;

    data.casos.forEach((caso, ci) => {
      const caseStart = t;
      const sheetsThisCase = [];
      caso.pasos.forEach((p, si) => {
        const S = LAYOUT.stations[p.estacion];
        const via = route(pos, S.stand);
        const dist = via ? Math.hypot(via[0] - pos[0], via[1] - pos[1]) + Math.hypot(S.stand[0] - via[0], S.stand[1] - via[1]) : Math.hypot(S.stand[0] - pos[0], S.stand[1] - pos[1]);
        const walk = dist < 0.05 ? 0 : clamp(dist / 5.6, 0.4, 1.05);
        const t0 = t, t1 = t + p.dur, ta = t0 + walk; // ta = llega a la estación
        const step = Object.assign({}, p, { caso: ci, casoId: caso.id, idx: si, t0, t1, ta, walk, canal: caso.canal });
        tl.steps.push(step);

        // movimiento del robot
        if (walk > 0) {
          tl.robotSegs.push({ t0, t1: ta, from: pos.slice(), to: S.stand.slice(), via, walk: true,
            face: (iso(S.stand[0], S.stand[1])[0] - iso(pos[0], pos[1])[0]) >= 0 ? 1 : -1 });
          for (let k = t0 + 0.08; k < ta - 0.05; k += 0.19) ev(k, 'paso');
        }
        tl.robotSegs.push({ t0: ta, t1, from: S.stand.slice(), to: S.stand.slice(), walk: false, face: S.face, station: p.estacion });
        pos = S.stand.slice();

        // cámara
        const f = iso(S.focus[0], S.focus[1], S.focus[2]);
        const tc = Math.min(t0 + Math.max(0.75, walk + 0.2), t1 - 0.2);
        tl.camKeys.push({ t: t0 + 0.05, ...cam });
        cam = { x: f[0], y: f[1], z: S.zoom };
        tl.camKeys.push({ t: tc, ...cam });

        // títulos
        if (p.titulo) tl.titles.push({ text: p.titulo, t0: t0 + 0.1 });

        // eventos específicos por estación
        const A = ta; // momento de acción
        switch (p.estacion) {
          case 'leer': {
            const tb0 = t0 + 0.05, tb1 = t0 + 0.95;
            tl.bubbles.push({ kind: 'in', text: p.mensaje, canal: caso.canal, t0: tb0, t1: tb1, tEnd: Math.max(t1 - 0.3, tb1 + 0.5), caso: ci });
            ev(tb0 + 0.05, 'burbuja_entra');
            ev(tb1, 'burbuja_llega');
            ev(A + 0.35, 'leer');
            break;
          }
          case 'clasificar':
            ev(A + 0.15, 'pensar');
            ev(A + 0.9, 'tarjeta');
            tl.exprs.push({ t0: A, t1: t1 - 0.2, e: 'pensando' });
            break;
          case 'cuenta':
            ev(A + 0.05, 'cajon_abre', { cajon: p.cajon });
            if (p.error) {
              ev(A + 0.75, 'alarma', { detalle: p.error.detalle });
              tl.exprs.push({ t0: A + 0.75, t1: t1, e: 'sorpresa' });
            }
            ev(t1 - 0.35, 'cajon_cierra');
            break;
          case 'buscar':
            ev(A + 0.1, 'paginas'); ev(A + 0.6, 'paginas'); ev(A + 1.1, 'paginas');
            if (p.duda) { tl.exprs.push({ t0: A + 0.35, t1: t1, e: 'duda' }); ev(A + 0.5, 'duda'); }
            break;
          case 'calcular':
            ev(A, 'engranajes', { dur: (t1 - A) - 0.15 });
            if (p.error) {
              ev(A + 0.75, 'chispas', { detalle: p.error.detalle });
              tl.exprs.push({ t0: A + 0.75, t1: t1, e: 'sorpresa' });
            } else {
              ev(t1 - 0.75, 'papel');
            }
            break;
          case 'verificar':
            ev(A + 0.1, 'lupa');
            if (p.semaforo === 'rojo') {
              ev(A + 0.55, 'semaforo_rojo');
              tl.exprs.push({ t0: A + 0.55, t1: t1, e: 'preocupado' });
            } else {
              ev(A + 0.45, 'semaforo_verde');
              tl.exprs.push({ t0: A + 0.5, t1: t1, e: 'alivio' });
            }
            break;
          case 'ejecutar':
            ev(A + 0.05, 'palanca');
            ev(A + 0.25, 'tubos', { dur: t1 - A - 0.35 });
            for (let k = A + 0.35; k < t1 - 0.2; k += 0.16) ev(k, 'moneda');
            break;
          case 'derivar':
            ev(A + 0.1, 'cuerda');
            ev(A + 0.25, 'campana');
            ev(A + 0.75, 'campana');
            personCalled = A + 0.3;
            // la persona levanta la vista y baja la escalera
            {
              const L = LAYOUT;
              const top = [L.stairs.x0 + 0.5, L.stairs.yTop - 0.4, L.altillo.z];
              const bot = [L.stairs.x0 + 0.5, L.stairs.yBot + 0.2, 0];
              const hand = [L.personHand[0], L.personHand[1], 0];
              const tStart = A + 0.5;
              const seg = (a, b, ts, sp) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const te = ts + d / sp; tl.personSegs.push({ t0: ts, t1: te, from: a, to: b, walk: true }); for (let k = ts + 0.1; k < te; k += 0.21) ev(k, 'paso_persona', { escalera: b[2] !== a[2] }); return te; };
              tl.personSegs.push({ t0: 0, t1: personCalled, from: deskAlt, to: deskAlt, walk: false, state: 'leyendo' });
              tl.personSegs.push({ t0: personCalled, t1: tStart, from: deskAlt, to: deskAlt, walk: false, state: 'alerta' });
              let te = seg(deskAlt, top, tStart, 3.6);
              te = seg(top, bot, te, 4.6);
              te = seg(bot, hand, te, 3.6);
              personState = { pos: hand, arrive: te };
            }
            break;
          case 'entrega': {
            const tg = Math.max(A + 0.7, personState.arrive + 0.65);
            step.tGive = tg;
            ev(tg, 'mochila');
            tl.mochilaOwner.push({ t: tg, owner: 'persona' });
            tl.personSegs.push({ t0: personState.arrive, t1: tg + 0.3, from: personState.pos, to: personState.pos, walk: false, state: 'espera' });
            tl.personSegs.push({ t0: tg + 0.3, t1: t1, from: personState.pos, to: personState.pos, walk: false, state: 'revisa' });
            ev(tg + 0.6, 'paginas'); ev(tg + 1.1, 'paginas');
            ev(t1 - 0.6, 'asiente');
            tl.exprs.push({ t0: tg, t1: t1, e: 'contento' });
            break;
          }
          case 'decide':
            tl.personSegs.push({ t0: t0, t1: t1, from: personState.pos, to: personState.pos, walk: false, state: 'sella', ts: t0 + 0.35 });
            ev(t0 + 0.45, 'sello');
            ev(t0 + 0.95, 'mochila');
            tl.mochilaOwner.push({ t: t0 + 0.95, owner: 'robot' });
            break;
          case 'responder': {
            ev(A + 0.1, 'telegrafo');
            ev(A + 0.3, 'telegrafo');
            ev(A + 0.5, 'telegrafo');
            const tb0 = A + 0.4, tb1 = tb0 + 0.9;
            tl.bubbles.push({ kind: 'out', text: p.respuesta, t0: tb0, t1: tb1, caso: ci, pregunta: !!p.pregunta });
            ev(tb0, 'envio');
            if (p.replica) {
              const tr0 = tb0 + 0.8, tr1 = tr0 + 0.65;
              tl.bubbles.push({ kind: 'in', text: p.replica, smiley: true, canal: caso.canal, t0: tr0, t1: tr1, tEnd: t1 - 0.15, caso: ci, reply: true });
              ev(tr0, 'burbuja_entra'); ev(tr1, 'burbuja_llega');
            }
            if (p.cierra) {
              tl.exprs.push({ t0: t1 - 0.95, t1: t1 + 0.2, e: 'celebra' });
              ev(t1 - 0.9, 'celebra');
              step.tArchive = t1 - 0.45;
              ev(t1 - 0.45, 'archivar');
            }
            break;
          }
        }

        // hoja de contexto que entra a la mochila al terminar el paso
        if (!['entrega', 'decide'].includes(p.estacion)) {
          const est = ST[p.estacion];
          const ts = Math.max(A + 0.3, t1 - 0.45);
          const sh = { t: ts, color: est.color, tool: est.herramienta, caso: ci, from: p.estacion, err: !!(p.error || p.semaforo === 'rojo') };
          tl.sheets.push(sh); sheetsThisCase.push(sh);
          ev(ts + 0.35, 'hoja');
        } else if (p.estacion === 'decide') {
          const sh = { t: t0 + 0.95, color: '#ffcf4a', tool: 'decision_equipo', caso: ci, from: 'decide', gold: true };
          tl.sheets.push(sh); sheetsThisCase.push(sh);
        }
        t = t1;
      });
      const closeStep = tl.steps[tl.steps.length - 1];
      tl.cases.push({ idx: ci, id: caso.id, tipo: caso.tipo, t0: caseStart, t1: t, tArchive: closeStep.tArchive || t - 0.4 });
    });

    // ---------- OUTRO ----------
    const tOut = t;
    tl.outroStart = tOut;
    const seatR = LAYOUT.seatRobot, seatP = LAYOUT.seatPerson;
    const dR = Math.hypot(seatR[0] - pos[0], seatR[1] - pos[1]);
    const wR = clamp(dR / 4.2, 0.8, 1.8);
    tl.robotSegs.push({ t0: tOut + 0.2, t1: tOut + 0.2 + wR, from: pos.slice(), to: seatR.slice(), walk: true, face: 1 });
    for (let k = tOut + 0.28; k < tOut + 0.2 + wR; k += 0.19) ev(k, 'paso');
    tl.robotSegs.push({ t0: tOut + 0.2 + wR, t1: tOut + meta.outro + 1, from: seatR.slice(), to: seatR.slice(), walk: false, face: 1, sit: true });
    if (personState.arrive) {
      const ps = [seatP[0], seatP[1], 0];
      const dP = Math.hypot(ps[0] - personState.pos[0], ps[1] - personState.pos[1]);
      const ts = tOut + 0.1, te = ts + clamp(dP / 2.6, 0.6, 1.6);
      tl.personSegs.push({ t0: ts, t1: te, from: personState.pos, to: ps, walk: true });
      for (let k = ts + 0.1; k < te; k += 0.21) ev(k, 'paso_persona', {});
      tl.personSegs.push({ t0: te, t1: tOut + meta.outro + 1, from: ps, to: ps, walk: false, state: 'cafe' });
    }
    tl.exprs.push({ t0: tOut + 1.6, t1: tOut + meta.outro + 1, e: 'contento' });
    ev(tOut + 2.2, 'cafe');
    ev(tOut + 2.5, 'cafe');
    tl.camKeys.push({ t: tOut + 0.3, ...cam });
    tl.camKeys.push({ t: tOut + 2.0, x: -470, y: 255, z: 1.4 });
    tl.camKeys.push({ t: tOut + 3.8, x: -465, y: 250, z: 1.48 });
    tl.camKeys.push({ t: tOut + 5.6, x: 0, y: 125, z: 0.62 });
    tl.camKeys.push({ t: tOut + meta.outro, x: 0, y: 125, z: 0.6 });
    tl.finalText = { text: meta.texto_final, t0: tOut + 4.4 };
    ev(tOut + 4.5, 'campanita_final');
    tl.duration = tOut + meta.outro;

    // títulos: mínimo 2 s visibles, máximo 3.4 s, sin solaparse
    tl.titles.sort((a, b) => a.t0 - b.t0);
    for (let i = 0; i < tl.titles.length; i++) {
      const T = tl.titles[i], N = tl.titles[i + 1];
      if (N && N.t0 < T.t0 + 2.0) N.t0 = T.t0 + 2.0;
      T.t1 = Math.min(N ? N.t0 - 0.05 : T.t0 + 3.4, T.t0 + 3.4);
    }
    tl.titles.unshift({ text: meta.titulo, t0: 0.25, t1: meta.intro - 0.1, big: true });

    tl.events.sort((a, b) => a.t - b.t);
    tl.camKeys.sort((a, b) => a.t - b.t);
    return tl;
  }

  // ---------- consultas a la línea de tiempo ----------
  function camAt(tl, t) {
    const K = tl.camKeys;
    if (t <= K[0].t) return { x: K[0].x, y: K[0].y, z: K[0].z };
    for (let i = 0; i < K.length - 1; i++) {
      const a = K[i], b = K[i + 1];
      if (t >= a.t && t <= b.t) {
        const u = b.t > a.t ? easeInOut((t - a.t) / (b.t - a.t)) : 1;
        return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u) };
      }
    }
    const L = K[K.length - 1];
    return { x: L.x, y: L.y, z: L.z };
  }

  function robotAt(tl, t) {
    let seg = tl.robotSegs[0];
    for (const s of tl.robotSegs) if (t >= s.t0) seg = s;
    const u = seg.t1 > seg.t0 ? clamp((t - seg.t0) / (seg.t1 - seg.t0), 0, 1) : 1;
    const e = seg.walk ? easeInOut(u) : 1;
    const walking = seg.walk && u > 0 && u < 1;
    let x = lerp(seg.from[0], seg.to[0], e), y = lerp(seg.from[1], seg.to[1], e), face = seg.face;
    if (seg.via) {
      const a = seg.from, v = seg.via, b = seg.to;
      const l1 = Math.hypot(v[0] - a[0], v[1] - a[1]), l2 = Math.hypot(b[0] - v[0], b[1] - v[1]);
      const d = e * (l1 + l2);
      if (d < l1) { x = lerp(a[0], v[0], d / l1); y = lerp(a[1], v[1], d / l1); face = ((v[0] - v[1]) - (a[0] - a[1])) >= 0 ? 1 : -1; }
      else { x = lerp(v[0], b[0], (d - l1) / l2); y = lerp(v[1], b[1], (d - l1) / l2); face = ((b[0] - b[1]) - (v[0] - v[1])) >= 0 ? 1 : -1; }
    }
    return { x, y, walking, face, station: seg.station, sit: !!seg.sit, segT: t - seg.t0 };
  }

  function personAt(tl, t) {
    const L = tl.LAYOUT;
    if (!tl.personSegs.length) return { x: L.personDesk[0], y: L.personDesk[1], z: L.altillo.z, state: 'leyendo', walking: false };
    let seg = null;
    for (const s of tl.personSegs) if (t >= s.t0) seg = s;
    if (!seg) seg = tl.personSegs[0];
    const u = seg.t1 > seg.t0 ? clamp((t - seg.t0) / (seg.t1 - seg.t0), 0, 1) : 1;
    const e = seg.walk ? u : 1;
    const dx = seg.to[0] - seg.from[0], dy = seg.to[1] - seg.from[1];
    const face = (dx - dy) >= 0 ? 1 : -1;
    return {
      x: lerp(seg.from[0], seg.to[0], e), y: lerp(seg.from[1], seg.to[1], e), z: lerp(seg.from[2], seg.to[2], e),
      walking: seg.walk && u < 1, state: seg.walk ? 'camina' : seg.state, face: seg.walk ? face : -1, segT: t - seg.t0, seg,
    };
  }

  function exprAt(tl, t) {
    let e = 'normal';
    for (const x of tl.exprs) if (t >= x.t0 && t < x.t1) e = x.e;
    return e;
  }

  function stepAt(tl, t) {
    let s = null;
    for (const x of tl.steps) if (t >= x.t0 && t < x.t1) s = x;
    return s;
  }

  function caseAt(tl, t) {
    let c = null;
    for (const x of tl.cases) if (t >= x.t0 - 0.0) c = x;
    return c;
  }

  function lastEvent(tl, t, type, filter) {
    let r = null;
    for (const e of tl.events) { if (e.t > t) break; if (e.type === type && (!filter || filter(e))) r = e; }
    return r;
  }

  const api = { build, iso, camAt, robotAt, personAt, exprAt, stepAt, caseAt, lastEvent, clamp, lerp, smooth, easeInOut, U, LAYOUT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Timeline = api;
})(typeof window !== 'undefined' ? window : globalThis);
