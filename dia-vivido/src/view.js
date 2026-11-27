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

const attr = (name, on) => (on ? ` ${name}` : '');
const each = (list, render) => list.map(render).join('');
const forma = (kind) => `<span class="forma forma--${kind}" aria-hidden="true"></span>`;
const alert = (error) => (error ? `<p class="aviso" role="alert">${esc(error)}</p>` : '');
const isDone = (activity) => activity.outcome !== 'pendiente';

const head = (eyebrow, title) =>
  `<header class="cabecera"><p class="sobre">${eyebrow}</p><h1>${title}</h1></header>`;

const example = (state) =>
  state.example
    ? `<p class="ejemplo">Día de ejemplo <button id="b-blank" class="enlace" data-action="blank">Empezar en blanco</button></p>`
    : '';

// ---- Hoy

function reparto(day) {
  const minutes = L.minutesByKind(day);
  return `<section class="reparto" aria-label="Reparto del día">
    <p class="reparto__total"><strong>${L.formatMinutes(minutes.total)}</strong> en fichas</p>
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
      ${forma(activity.kind)}<span class="ficha__name">${name}</span><span class="ficha__time">${L.formatMinutes(activity.minutes)}</span>
    </button>
    <button id="x-${activity.id}" class="ficha__remove" data-action="remove" data-id="${activity.id}" aria-label="Quitar ${name}"${attr('disabled', closed)}>×</button>
  </li>`;
}

const chips = (legend, field, choices, chosen, label) =>
  `<fieldset class="chips"><legend>${legend}</legend>${each(
    choices,
    (choice) =>
      `<input class="chip__input" type="radio" name="${field}" id="f-${field === 'minutes' ? 'min' : field}-${choice}" data-field="${field}" value="${choice}"${attr('checked', choice === chosen)}><label class="chip chip--${choice}" for="f-${field === 'minutes' ? 'min' : field}-${choice}">${label(choice)}</label>`,
  )}</fieldset>`;

const form = (state) =>
  `<form class="nueva" novalidate>
    <label class="nueva__label" for="f-name">Nueva ficha</label>
    <input id="f-name" class="campo" data-field="name" value="${esc(state.draft.name)}" placeholder="¿A qué le darás tiempo?" autocomplete="off" maxlength="40">
    ${chips('¿Cuánto?', 'minutes', MINUTE_CHOICES, state.draft.minutes, (choice) => L.formatMinutes(Number(choice)))}
    ${chips('¿Qué te hace?', 'kind', L.KINDS, state.draft.kind, (kind) => forma(kind) + KIND_LABEL[kind])}
    ${alert(state.error)}
    <button id="b-add" class="boton" type="submit">Poner en mi día</button>
  </form>`;

const hoy = (state) =>
  `${head('Tu día en fichas', 'Hoy')}
  ${reparto(state.day)}
  ${state.day.activities.length === 0 ? `<p class="vacio">Pon tu primera ficha: ¿qué merece tu tiempo hoy?</p>` : ''}
  <ul class="fichas">${each(state.day.activities, (activity) => ficha(activity, state.day.closed))}</ul>
  ${state.day.closed ? `<p class="vacio">Día cerrado. Reábrelo en Noche para cambiar algo.</p>` : form(state)}`;

// ---- Espejo

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
  return `${head('Espejo', '¿Cómo va tu día?')}
  <section class="puntaje">
    <div class="sol" style="--lleno:${points.total}"><span class="sol__num">${points.total}</span><span class="sol__de">de 100</span></div>
    <ul class="partes">${each(PARTS, (row) => part(points, row))}</ul>
  </section>
  <section class="bloque"><h2>Preguntas para ti</h2>
    <ul class="preguntas">${each(L.questions(state.day), (text) => `<li class="pregunta">${esc(text)}</li>`)}</ul>
  </section>
  <section class="bloque"><h2>¿Valió la pena?</h2>
    ${done.length === 0 ? `<p class="vacio">Marca una ficha como hecha en Hoy y vuelve aquí.</p>` : `<ul class="veredictos">${each(done, verdict)}</ul>`}
  </section>`;
}

// ---- Noche

const thanks = (text, index) =>
  `<label class="oculto" for="g-${index}">Agradecimiento ${index + 1}</label>
   <input id="g-${index}" class="campo" data-field="${index}" value="${esc(text)}" placeholder="${THANKS_HINTS[index]}" autocomplete="off" maxlength="80">`;

const nocheAbierta = (state) =>
  `${head('Noche', 'Cierra tu día')}
  <section class="bloque"><h2>Hoy agradezco</h2><div class="gracias">${each(state.day.gratitudes, thanks)}</div></section>
  <section class="bloque"><h2>¿Cómo te acuestas?</h2>
    <div class="animos">${each(
      L.MOODS,
      (mood) =>
        `<button id="m-${mood}" class="opcion opcion--animo" data-action="mood" data-value="${mood}" aria-pressed="${state.day.mood === mood}">${MOOD_LABEL[mood]}</button>`,
    )}</div>
  </section>
  ${alert(state.error)}
  <button id="b-close" class="boton boton--noche" data-action="close">Cerrar el día</button>`;

const nocheCerrada = (state) =>
  `<section class="cierre">
    <div class="confeti" aria-hidden="true">${each([...L.KINDS, ...L.KINDS], forma)}</div>
    <p class="sobre">Día cerrado</p>
    <h1 class="cierre__num"><strong>${L.score(state.day).total}</strong> de 100</h1>
    <p class="cierre__animo">Te acuestas ${MOOD_LABEL[state.day.mood].toLowerCase()}. Mañana se juega de nuevo.</p>
    <h2>Hoy agradeciste</h2>
    <ul class="agradecido">${each(
      state.day.gratitudes.filter((text) => text.trim() !== ''),
      (text) => `<li>${esc(text)}</li>`,
    )}</ul>
    <button id="b-reopen" class="boton boton--noche" data-action="reopen">Reabrir el día</button>
  </section>`;

const noche = (state) => (state.day.closed ? nocheCerrada(state) : nocheAbierta(state));

// ---- App

const SCREENS = { hoy, espejo, noche };

export const viewScreen = (state) => example(state) + SCREENS[state.tab](state);

export const viewTabs = (state) =>
  each(
    TABS,
    (tab) =>
      `<button id="t-${tab}" class="tab tab--${tab}" data-action="tab" data-value="${tab}"${attr('aria-current="page"', state.tab === tab)}><span class="tab__icon" aria-hidden="true"></span>${TAB_LABEL[tab]}</button>`,
  );
