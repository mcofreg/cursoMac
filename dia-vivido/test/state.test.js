import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, update } from '../src/state.js';

const run = (...actions) => actions.reduce(update, initialState());
const names = (state) => state.day.activities.map((a) => a.name);

test('la app abre en Hoy, con el día de ejemplo y el borrador listo', () => {
  const state = initialState();
  assert.equal(state.tab, 'hoy');
  assert.equal(state.example, true);
  assert.equal(state.error, null);
  assert.deepEqual(state.draft, { name: '', minutes: '30', kind: 'nutre' });
  assert.equal(names(state)[0], 'Caminar con café');
});

test('se cambia de pestaña solo a las que existen', () => {
  assert.equal(run({ type: 'tab', value: 'espejo' }).tab, 'espejo');
  assert.equal(run({ type: 'tab', value: 'ajustes' }).tab, 'hoy');
});

test('escribir en el formulario llena el borrador y agregar lo convierte en ficha', () => {
  const state = run(
    { type: 'field', name: 'name', value: 'Siesta' },
    { type: 'field', name: 'minutes', value: '15' },
    { type: 'field', name: 'kind', value: 'sostiene' },
    { type: 'add' },
  );
  assert.deepEqual(state.day.activities.at(-1), {
    id: state.day.activities.at(-1).id,
    name: 'Siesta',
    minutes: 15,
    kind: 'sostiene',
    outcome: 'pendiente',
  });
  assert.deepEqual(state.draft, { name: '', minutes: '30', kind: 'nutre' });
  assert.equal(state.error, null);
});

test('agregar una ficha inválida muestra el motivo, conserva lo escrito y la siguiente acción lo limpia', () => {
  const before = initialState();
  const failed = run({ type: 'field', name: 'minutes', value: '15' }, { type: 'add' });
  assert.match(failed.error, /nombre/);
  assert.equal(failed.draft.minutes, '15');
  assert.deepEqual(names(failed), names(before));
  assert.equal(update(failed, { type: 'tab', value: 'noche' }).error, null);
});

test('un campo que no existe no cambia nada', () => {
  const state = run({ type: 'field', name: 'toString', value: 'x' });
  assert.deepEqual(state, initialState());
});

test('tocar una ficha cambia su resultado y la cruz la quita', () => {
  const start = initialState();
  const id = String(start.day.activities[0].id);
  assert.equal(update(start, { type: 'outcome', id, value: 'tibio' }).day.activities[0].outcome, 'tibio');
  assert.deepEqual(names(update(start, { type: 'remove', id })), names(start).slice(1));
});

test('la noche: agradecer, elegir ánimo, cerrar y reabrir', () => {
  const thanked = run({ type: 'field', name: '1', value: 'Un buen café' }, { type: 'mood', value: 'feliz' });
  assert.deepEqual(thanked.day.gratitudes, ['', 'Un buen café', '']);
  assert.equal(thanked.day.mood, 'feliz');
  const closed = update(thanked, { type: 'close' });
  assert.equal(closed.day.closed, true);
  assert.equal(closed.error, null);
  assert.equal(update(closed, { type: 'reopen' }).day.closed, false);
});

test('cerrar sin agradecer ni elegir ánimo explica qué falta', () => {
  const state = run({ type: 'close' });
  assert.equal(state.day.closed, false);
  assert.match(state.error, /agradecimiento/);
});

test('empezar en blanco vacía el día, deja de ser ejemplo y se queda en la pestaña', () => {
  const state = run({ type: 'tab', value: 'espejo' }, { type: 'field', name: 'name', value: 'x' }, { type: 'blank' });
  assert.deepEqual(names(state), []);
  assert.equal(state.example, false);
  assert.equal(state.tab, 'espejo');
  assert.equal(state.draft.name, '');
});

test('una acción desconocida deja el estado igual', () => {
  const failed = run({ type: 'add' });
  assert.equal(update(failed, { type: 'bailar' }), failed);
});
