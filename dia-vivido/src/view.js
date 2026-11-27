// Vista: del estado a HTML, sin tocar el DOM. Todo texto de la persona pasa por esc().
import * as L from './logic.js';
import { TABS } from './state.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (text) => String(text).replace(/[&<>"']/g, (char) => ESCAPES[char]);

const KIND_LABEL = { nutre: 'Me nutre', sostiene: 'Me sostiene', drena: 'Me drena' };
const VERDICT_LABEL = { valio: 'Sí', tibio: 'Más o menos', novalio: 'No' };
const MOOD_LABEL = { feliz: 'Feliz', tranquilo: 'En calma', inquieto: 'Inquieto' };
const TAB_LABEL = { hoy: 'Hoy', espejo: 'Espejo', noche: 'Noche' };
const MINUTE_CHOICES = ['15', '30', '60', '90', '120'];
const THANKS_HINTS = ['Algo pequeño', 'Alguien', 'Algo que hiciste tú'];
const PARTS = [
  ['presencia', 'Presencia', 40, 'hiciste lo que elegiste'],
  ['nutricion', 'Nutrición', 30, 'un tercio de lo hecho te nutre'],
  ['gratitud', 'Gratitud', 30, 'tres agradecimientos'],
];

// Trazos de los iconos, en una rejilla de 24.
const FACE = '<circle cx="12" cy="12" r="9"/>';
const ICONS = {
  check: '<path d="M6 12.5l4 4 8-9"/>',
  quitar: '<path d="M7 7l10 10M17 7L7 17"/>',
  hoy: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  espejo: '<ellipse cx="12" cy="9.5" rx="5.5" ry="6.5"/><path d="M12 16v5M9 21h6"/>',
  noche: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  feliz: `${FACE}<path d="M9 10h.01M15 10h.01M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8"/>`,
  tranquilo: `${FACE}<path d="M8 10.5c.5-.6 1.5-.6 2 0M14 10.5c.5-.6 1.5-.6 2 0M9.5 15h5"/>`,
  inquieto: `${FACE}<path d="M9 10h.01M15 10h.01M8.5 15.5l1.75-1 1.75 1 1.75-1 1.75 1"/>`,
};
const icon = (name) => `<svg class="icono" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const attr = (name, on) => (on ? ` ${name}` : '');
const each = (list, render) => list.map(render).join('');
const forma = (kind) => `<span class="forma forma--${kind}" aria-hidden="true"></span>`;
const alert = (error) => (error ? `<p class="aviso" role="alert">${esc(error)}</p>` : '');
const isDone = (activity) => activity.outcome !== 'pendiente';

const example = (state) =>
  state.example
    ? `<p class="ejemplo">Día de ejemplo <button id="b-blank" class="enlace" data-action="blank">Empezar en blanco</button></p>`
    : '';

// Cabecera de cada pantalla: un cielo que cambia con la hora (mañana, tarde, noche).
const sky = (state, tone, eyebrow, title, aside, below) =>
  `<header class="cielo cielo--${tone}">${example(state)}
    <div class="cielo__fila"><div class="cielo__titulo"><p class="sobre">${eyebrow}</p><h1>${title}</h1></div>${aside}</div>${below}
  </header>`;

// ---- Hoy

// El sol recorre el arco M14 62 Q150 -34 286 62 según la parte del día ya hecha.
const round1 = (value) => Math.round(value * 10) / 10;
const sunAt = (part) => ({
  x: round1(14 + 272 * part),
  y: round1(62 * (1 - part) ** 2 - 68 * (1 - part) * part + 62 * part ** 2),
});

function dayArc(day) {
  const { done, total, part } = L.progress(day);
  const sun = sunAt(part);
  const said =
    total === 0
      ? 'Tu día está por escribirse'
      : `<strong>${L.formatMinutes(done)}</strong> hechas de ${L.formatMinutes(total)}`;
  return `<p class="cielo__dato">${said}</p>
    <svg class="arco" viewBox="0 0 300 76" role="img" aria-label="Llevas hecho el ${Math.round(part * 100)}% de tu día">
      <path class="arco__ruta" d="M14 62Q150 -34 286 62"/>
      <circle class="arco__halo" cx="${sun.x}" cy="${sun.y}" r="19"/><circle class="arco__sol" cx="${sun.x}" cy="${sun.y}" r="11"/>
    </svg>`;
}

function reparto(day) {
  const minutes = L.minutesByKind(day);
  return `<section class="reparto tarjeta" aria-label="Reparto del día">
    <div class="barra" aria-hidden="true">${each(
      L.KINDS,
      (kind) => `<span class="barra__seg barra__seg--${kind}" style="flex-grow:${minutes[kind]}"></span>`,
    )}</div>
    <ul class="leyenda">${each(
      L.KINDS,
      (kind) => `<li class="leyenda__item">${forma(kind)}${KIND_LABEL[kind]} <b>${L.formatMinutes(minutes[kind])}</b></li>`,
    )}</ul>
  </section>`;
}

function ficha(activity, closed) {
  const done = isDone(activity);
  const name = esc(activity.name);
  return `<li class="ficha ficha--${activity.kind}${attr('is-done', done)}">
    <button id="f-${activity.id}" class="ficha__main" data-action="outcome" data-id="${activity.id}" data-value="${done ? 'pendiente' : 'hecha'}" aria-pressed="${done}"${attr('disabled', closed)}>
      <span class="check">${icon('check')}</span>
      <span class="ficha__text"><span class="ficha__name">${name}</span><span class="ficha__meta">${KIND_LABEL[activity.kind]} · ${L.formatMinutes(activity.minutes)}</span></span>
    </button>
    <button id="x-${activity.id}" class="ficha__remove" data-action="remove" data-id="${activity.id}" aria-label="Quitar ${name}"${attr('disabled', closed)}>${icon('quitar')}</button>
  </li>`;
}

const chips = (legend, field, choices, chosen, label) =>
  `<fieldset class="chips"><legend>${legend}</legend>${each(
    choices,
    (choice) =>
      `<input class="chip__input" type="radio" name="${field}" id="f-${field}-${choice}" data-field="${field}" value="${choice}"${attr('checked', choice === chosen)}><label class="chip chip--${choice}" for="f-${field}-${choice}">${label(choice)}</label>`,
  )}</fieldset>`;

const form = (state) =>
  `<form class="nueva tarjeta" novalidate>
    <label class="nueva__label" for="f-name">Nueva ficha</label>
    <input id="f-name" class="campo" data-field="name" value="${esc(state.draft.name)}" placeholder="¿A qué le darás tiempo?" autocomplete="off" maxlength="40">
    ${chips('¿Cuánto?', 'minutes', MINUTE_CHOICES, state.draft.minutes, (choice) => L.formatMinutes(Number(choice)))}
    ${chips('¿Qué te hace?', 'kind', L.KINDS, state.draft.kind, (kind) => forma(kind) + KIND_LABEL[kind])}
    ${alert(state.error)}
    <button id="b-add" class="boton" type="submit">Poner en mi día</button>
  </form>`;

const fichas = (day) =>
  day.activities.length === 0
    ? `<p class="vacio">Pon tu primera ficha: ¿qué merece tu tiempo hoy?</p>`
    : `<ul class="fichas tarjeta">${each(day.activities, (activity) => ficha(activity, day.closed))}</ul>`;

const hoy = (state) =>
  `${sky(state, 'hoy', 'Tu día en fichas', 'Hoy', '', dayArc(state.day))}
  <div class="cuerpo">
    ${reparto(state.day)}
    ${fichas(state.day)}
    ${state.day.closed ? `<p class="vacio">Día cerrado. Reábrelo en Noche para cambiar algo.</p>` : form(state)}
  </div>`;

// ---- Espejo

const ring = (total) =>
  `<div class="marcador">
    <svg class="anillo" viewBox="0 0 120 120" aria-hidden="true"><circle class="anillo__fondo" cx="60" cy="60" r="52"/><circle class="anillo__valor" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="${total} 100"/></svg>
    <span class="sol__num">${total}</span><span class="sol__de">de 100</span>
  </div>`;

const part = (points, [key, label, max, hint]) =>
  `<li class="parte"><span class="parte__label">${label}</span><span class="parte__hint">${hint}</span>
    <span class="medidor medidor--${key}"><span class="medidor__lleno" style="width:${(100 * points[key]) / max}%"></span></span>
    <span class="parte__num">${points[key]} de ${max}</span></li>`;

const verdict = (activity) =>
  `<li class="veredicto"><span class="veredicto__name">${forma(activity.kind)}${esc(activity.name)}</span>
    <span class="veredicto__opciones">${each(
      L.VERDICTS,
      (value) =>
        `<button id="v-${activity.id}-${value}" class="opcion" data-action="outcome" data-id="${activity.id}" data-value="${value}" aria-pressed="${activity.outcome === value}">${VERDICT_LABEL[value]}</button>`,
    )}</span></li>`;

function espejo(state) {
  const points = L.score(state.day);
  const done = state.day.activities.filter(isDone);
  return `${sky(state, 'tarde', 'Espejo', '¿Cómo va tu día?', ring(points.total), '')}
  <div class="cuerpo">
    <ul class="partes tarjeta">${each(PARTS, (row) => part(points, row))}</ul>
    <section class="bloque"><h2>Preguntas para ti</h2>
      <ul class="preguntas">${each(L.questions(state.day), (text) => `<li class="pregunta">${esc(text)}</li>`)}</ul>
    </section>
    <section class="bloque"><h2>¿Valió la pena?</h2>
      ${done.length === 0 ? `<p class="vacio">Marca una ficha como hecha en Hoy y vuelve aquí.</p>` : `<ul class="veredictos tarjeta">${each(done, verdict)}</ul>`}
    </section>
  </div>`;
}

// ---- Noche

const MOON = '<span class="luna" aria-hidden="true"></span>';

function thanks(text, index) {
  const number = index + 1;
  return `<div class="gracia"><span class="gracia__n" aria-hidden="true">${number}</span>
    <label class="oculto" for="g-${index}">Agradecimiento ${number}</label>
    <input id="g-${index}" class="campo" data-field="${index}" value="${esc(text)}" placeholder="${THANKS_HINTS[index]}" autocomplete="off" maxlength="80"></div>`;
}

const nocheAbierta = (state) =>
  `${sky(state, 'noche', 'Noche', 'Cierra tu día', MOON, '')}
  <div class="cuerpo">
    <section class="bloque"><h2>Hoy agradezco</h2><div class="gracias tarjeta">${each(state.day.gratitudes, thanks)}</div></section>
    <section class="bloque"><h2>¿Cómo te acuestas?</h2>
      <div class="animos">${each(
        L.MOODS,
        (mood) =>
          `<button id="m-${mood}" class="animo" data-action="mood" data-value="${mood}" aria-pressed="${state.day.mood === mood}">${icon(mood)}${MOOD_LABEL[mood]}</button>`,
      )}</div>
    </section>
    ${alert(state.error)}
    <button id="b-close" class="boton boton--noche" data-action="close">Cerrar el día</button>
  </div>`;

const nocheCerrada = (state) =>
  `<header class="cielo cielo--noche cierre">${example(state)}
    ${MOON}
    <p class="sobre">Día cerrado</p>
    <h1 class="cierre__num"><strong>${L.score(state.day).total}</strong> de 100</h1>
    <p class="cierre__animo">Te acuestas ${MOOD_LABEL[state.day.mood].toLowerCase()}. Mañana se juega de nuevo.</p>
  </header>
  <div class="cuerpo">
    <section class="bloque"><h2>Hoy agradeciste</h2>
      <ul class="agradecido tarjeta">${each(
        state.day.gratitudes.filter((text) => text.trim() !== ''),
        (text) => `<li>${esc(text)}</li>`,
      )}</ul>
    </section>
    <button id="b-reopen" class="boton boton--suave" data-action="reopen">Reabrir el día</button>
  </div>`;

const noche = (state) => (state.day.closed ? nocheCerrada(state) : nocheAbierta(state));

// ---- App

const SCREENS = { hoy, espejo, noche };

export const viewScreen = (state) => SCREENS[state.tab](state);

export const viewTabs = (state) =>
  each(
    TABS,
    (tab) =>
      `<button id="t-${tab}" class="tab" data-action="tab" data-value="${tab}"${attr('aria-current="page"', state.tab === tab)}>${icon(tab)}${TAB_LABEL[tab]}</button>`,
  );
