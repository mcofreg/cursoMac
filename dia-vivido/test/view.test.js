import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, update } from '../src/state.js';
import { viewScreen, viewTabs } from '../src/view.js';

const run = (...actions) => actions.reduce(update, initialState());
const go = (tab) => ({ type: 'tab', value: tab });
const count = (html, piece) => html.split(piece).length - 1;
// El trozo de HTML del elemento con ese id, hasta que cierra su etiqueta de apertura.
const tag = (html, id) => html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))[0];

const closedNight = () =>
  run(
    { type: 'field', name: '0', value: 'Un buen café' },
    { type: 'field', name: '2', value: 'Reírme <fuerte>' },
    { type: 'mood', value: 'tranquilo' },
    { type: 'close' },
    go('noche'),
  );

test('Hoy lista cada ficha con su nombre y duración', () => {
  const html = viewScreen(initialState());
  assert.match(html, /Caminar con café/);
  assert.match(html, /Trabajo profundo[\s\S]*?2 h/);
  assert.equal(count(html, 'data-action="outcome"'), 7);
});

test('una ficha hecha se ve marcada y al tocarla vuelve a pendiente; una pendiente, al revés', () => {
  const html = viewScreen(initialState());
  const done = tag(html, 'f-1');
  const pending = tag(html, 'f-7');
  assert.match(done, /aria-pressed="true"/);
  assert.match(done, /data-value="pendiente"/);
  assert.match(pending, /aria-pressed="false"/);
  assert.match(pending, /data-value="hecha"/);
});

test('cada ficha lleva la forma de su tipo y un botón para quitarla con su nombre', () => {
  const html = viewScreen(initialState());
  assert.match(html, /ficha--drena[\s\S]*?Redes sociales/);
  assert.match(tag(html, 'x-5'), /aria-label="Quitar Redes sociales"/);
  assert.match(tag(html, 'x-5'), /data-action="remove"/);
});

test('lo que escribe la persona se muestra como texto, nunca como HTML', () => {
  const html = viewScreen(
    run({ type: 'field', name: 'name', value: '<img src=x onerror="alert(1)">' }, { type: 'add' }),
  );
  assert.equal(html.includes('<img'), false);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  const quoted = viewScreen(run({ type: 'field', name: 'name', value: `Tom & 'Jerry'` }));
  assert.match(tag(quoted, 'f-name'), /value="Tom &amp; &#39;Jerry&#39;"/);
});

test('el reparto muestra el total, los minutos por tipo y una barra a escala', () => {
  const html = viewScreen(initialState());
  assert.match(html, /7 h 10<\/strong> en fichas/);
  assert.match(html, /Me nutre <b>1 h 45<\/b>/);
  assert.match(html, /Me sostiene <b>3 h 30<\/b>/);
  assert.match(html, /Me drena <b>1 h 55<\/b>/);
  assert.match(html, /barra__seg--nutre" style="flex-grow:105"/);
  assert.match(html, /barra__seg--drena" style="flex-grow:115"/);
});

test('el formulario refleja el borrador: texto, minutos y tipo elegidos', () => {
  const html = viewScreen(
    run({ type: 'field', name: 'name', value: 'Siesta' }, { type: 'field', name: 'minutes', value: '90' }, { type: 'field', name: 'kind', value: 'drena' }),
  );
  assert.match(tag(html, 'f-name'), /value="Siesta"/);
  assert.match(tag(html, 'f-minutes-90'), / checked/);
  assert.doesNotMatch(tag(html, 'f-minutes-30'), / checked/);
  assert.match(tag(html, 'f-kind-drena'), / checked/);
  assert.doesNotMatch(tag(html, 'f-kind-nutre'), / checked/);
  assert.equal(count(html, ' checked'), 2);
});

test('un error se anuncia en pantalla y sin error no hay aviso', () => {
  assert.equal(viewScreen(initialState()).includes('role="alert"'), false);
  const html = viewScreen(run({ type: 'add' }));
  assert.match(html, /role="alert">Ponle un nombre a la ficha\.</);
});

test('el día de ejemplo se anuncia y ofrece empezar en blanco; en blanco invita a poner la primera ficha', () => {
  const sample = viewScreen(initialState());
  assert.match(sample, /Día de ejemplo/);
  assert.match(sample, /data-action="blank"/);
  const blank = viewScreen(run({ type: 'blank' }));
  assert.equal(blank.includes('Día de ejemplo'), false);
  assert.equal(blank.includes('data-action="blank"'), false);
  assert.match(blank, /Pon tu primera ficha/);
  assert.equal(sample.includes('Pon tu primera ficha'), false);
});

test('Espejo muestra el puntaje con sus tres partes', () => {
  const html = viewScreen(run(go('espejo')));
  assert.match(html, /--lleno:46/);
  assert.match(html, /class="sol__num">46</);
  assert.match(html, /Presencia[\s\S]*?27 de 40/);
  assert.match(html, /Nutrición[\s\S]*?19 de 30/);
  assert.match(html, /Gratitud[\s\S]*?0 de 30/);
  assert.match(html, /style="width:67\.5%"/);
});

test('Espejo hace las preguntas del día', () => {
  const html = viewScreen(run(go('espejo')));
  assert.equal(count(html, 'class="pregunta"'), 3);
  assert.match(html, /Dijiste que «Redes sociales» no valió la pena/);
});

test('Espejo pide veredicto solo de lo hecho y marca el elegido', () => {
  const html = viewScreen(run(go('espejo')));
  assert.equal(count(html, 'class="veredicto"'), 5);
  assert.equal(html.includes('id="v-7-valio"'), false);
  assert.match(tag(html, 'v-5-novalio'), /aria-pressed="true"/);
  assert.match(tag(html, 'v-5-valio'), /aria-pressed="false"/);
  assert.match(tag(html, 'v-5-tibio'), /data-action="outcome" data-id="5" data-value="tibio"/);
  assert.equal(html.includes('Marca una ficha como hecha'), false);
});

test('Espejo sin nada hecho invita a marcar una ficha', () => {
  const html = viewScreen(run({ type: 'blank' }, go('espejo')));
  assert.match(html, /Marca una ficha como hecha/);
  assert.equal(count(html, 'class="veredicto"'), 0);
});

test('Noche muestra los tres agradecimientos escritos y el ánimo elegido', () => {
  const html = viewScreen(run(go('noche'), { type: 'field', name: '1', value: 'El sol' }, { type: 'mood', value: 'feliz' }));
  assert.match(tag(html, 'g-1'), /value="El sol"/);
  assert.match(tag(html, 'g-1'), /data-field="1"/);
  assert.match(tag(html, 'g-0'), /value=""/);
  assert.match(tag(html, 'm-feliz'), /aria-pressed="true"/);
  assert.match(tag(html, 'm-inquieto'), /aria-pressed="false"/);
  assert.match(html, /data-action="close"/);
});

test('Noche explica qué falta si se intenta cerrar antes de tiempo', () => {
  const html = viewScreen(run(go('noche'), { type: 'close' }));
  assert.match(html, /role="alert">Escribe al menos un agradecimiento/);
});

test('un día cerrado celebra: puntaje, ánimo, lo agradecido y la opción de reabrir', () => {
  const html = viewScreen(closedNight());
  assert.match(html, /Día cerrado/);
  assert.match(html, /66<\/strong> de 100/);
  assert.match(html, /Te acuestas en calma/);
  assert.match(html, /<li>Un buen café<\/li>/);
  assert.match(html, /<li>Reírme &lt;fuerte&gt;<\/li>/);
  assert.equal(count(html, '<li>'), 2);
  assert.match(html, /data-action="reopen"/);
  assert.equal(html.includes('data-action="close"'), false);
  assert.equal(html.includes('<input'), false);
});

test('con el día cerrado, Hoy no deja editar y dice dónde reabrir', () => {
  const html = viewScreen(update(closedNight(), go('hoy')));
  assert.match(html, /Día cerrado\. Reábrelo en Noche/);
  assert.equal(html.includes('<form'), false);
  assert.match(tag(html, 'f-1'), / disabled/);
  assert.match(tag(html, 'x-1'), / disabled/);
  const open = viewScreen(initialState());
  assert.equal(open.includes(' disabled'), false);
  assert.equal(open.includes('Reábrelo en Noche'), false);
  assert.match(open, /<form/);
});

test('la barra de pestañas marca dónde estás', () => {
  const html = viewTabs(run(go('espejo')));
  assert.match(tag(html, 't-espejo'), /aria-current="page"/);
  assert.doesNotMatch(tag(html, 't-hoy'), /aria-current/);
  assert.match(tag(html, 't-noche'), /data-action="tab" data-value="noche"/);
  assert.match(html, />Hoy<[\s\S]*>Espejo<[\s\S]*>Noche</);
});

test('cada opción de tipo en el formulario dice su nombre', () => {
  const html = viewScreen(initialState());
  for (const [kind, label] of [['nutre', 'Me nutre'], ['sostiene', 'Me sostiene'], ['drena', 'Me drena']]) {
    assert.match(html, new RegExp(`for="f-kind-${kind}">.*?</span>${label}</label>`));
  }
});

test('cada casilla de agradecimiento tiene su etiqueta numerada desde 1', () => {
  const html = viewScreen(run(go('noche')));
  assert.match(html, /for="g-0">Agradecimiento 1</);
  assert.match(html, /for="g-2">Agradecimiento 3</);
});
