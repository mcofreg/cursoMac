import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/logic.js';

// Arma un día como lo haría la persona: agrega fichas y marca cómo le fue.
const dayOf = (...rows) =>
  rows.reduce((day, [name, minutes, kind, outcome = 'pendiente']) => {
    const added = L.addActivity(day, { name, minutes, kind });
    return L.setOutcome(added, added.activities.at(-1).id, outcome);
  }, L.emptyDay());

const closable = () => L.setMood(L.setGratitude(dayOf(['Leer', 30, 'nutre']), 0, 'El sol'), 'feliz');

test('una ficha válida entra limpia: nombre sin espacios y minutos numéricos', () => {
  assert.deepEqual(L.parseActivity({ name: '  Caminar ', minutes: '45', kind: 'nutre' }), {
    ok: true,
    value: { name: 'Caminar', minutes: 45, kind: 'nutre' },
  });
});

test('una ficha sin nombre se rechaza pidiendo el nombre', () => {
  for (const name of ['', '   ', undefined]) {
    const result = L.parseActivity({ name, minutes: 30, kind: 'nutre' });
    assert.equal(result.ok, false);
    assert.match(result.error, /nombre/);
  }
});

test('la duración va de 5 minutos a 12 horas, en minutos enteros', () => {
  const tryMinutes = (minutes) => L.parseActivity({ name: 'Leer', minutes, kind: 'nutre' });
  for (const bad of [4, 721, 30.5, 'abc', '', undefined]) {
    assert.equal(tryMinutes(bad).ok, false, `debería rechazar ${bad}`);
    assert.match(tryMinutes(bad).error, /duración/);
  }
  assert.equal(tryMinutes(5).value.minutes, 5);
  assert.equal(tryMinutes(720).value.minutes, 720);
});

test('una ficha debe decir si nutre, sostiene o drena', () => {
  const result = L.parseActivity({ name: 'Leer', minutes: 30, kind: 'otra' });
  assert.equal(result.ok, false);
  assert.match(result.error, /nutre, te sostiene o te drena/);
});

test('una ficha nueva queda pendiente y con un id propio, aunque antes se haya quitado otra', () => {
  const two = dayOf(['A', 10, 'nutre'], ['B', 20, 'drena']);
  const [a, b] = two.activities;
  assert.deepEqual(a, { id: a.id, name: 'A', minutes: 10, kind: 'nutre', outcome: 'pendiente' });
  const again = L.addActivity(L.removeActivity(two, a.id), { name: 'C', minutes: 5, kind: 'sostiene' });
  assert.deepEqual(again.activities.map((x) => x.name), ['B', 'C']);
  assert.notEqual(again.activities[1].id, b.id);
});

test('marcar el resultado de una ficha es repetible y solo toca esa ficha', () => {
  const day = dayOf(['A', 10, 'nutre'], ['B', 20, 'drena']);
  const id = day.activities[0].id;
  const once = L.setOutcome(day, id, 'valio');
  assert.deepEqual(once.activities.map((a) => a.outcome), ['valio', 'pendiente']);
  assert.deepEqual(L.setOutcome(once, id, 'valio'), once);
});

test('un resultado desconocido o una ficha que no existe no cambian el día', () => {
  const day = dayOf(['A', 10, 'nutre']);
  assert.deepEqual(L.setOutcome(day, day.activities[0].id, 'genial'), day);
  assert.deepEqual(L.setOutcome(day, 999, 'hecha'), day);
  assert.deepEqual(L.removeActivity(day, 999), day);
});

test('los agradecimientos son tres casillas; fuera de ellas no se escribe', () => {
  const day = L.setGratitude(L.emptyDay(), 1, 'Mi familia');
  assert.deepEqual(day.gratitudes, ['', 'Mi familia', '']);
  assert.deepEqual(L.setGratitude(day, 3, 'x'), day);
  assert.deepEqual(L.setGratitude(day, NaN, 'x'), day);
});

test('el ánimo solo acepta feliz, tranquilo o inquieto', () => {
  assert.equal(L.setMood(L.emptyDay(), 'tranquilo').mood, 'tranquilo');
  assert.equal(L.setMood(L.emptyDay(), 'eufórico').mood, null);
});

test('el día se cierra con al menos un agradecimiento escrito y un ánimo elegido', () => {
  const base = dayOf(['Leer', 30, 'nutre']);
  const onlyMood = L.setMood(base, 'feliz');
  const blankThanks = L.setGratitude(onlyMood, 0, '   ');
  const onlyThanks = L.setGratitude(base, 2, 'El sol');
  for (const day of [base, onlyMood, blankThanks, onlyThanks]) {
    assert.equal(L.canClose(day), false);
    assert.equal(L.closeDay(day).closed, false);
  }
  assert.equal(L.canClose(closable()), true);
  assert.equal(L.closeDay(closable()).closed, true);
});

test('un día cerrado no se edita hasta reabrirlo', () => {
  const closed = L.closeDay(closable());
  const id = closed.activities[0].id;
  assert.deepEqual(L.addActivity(closed, { name: 'X', minutes: 10, kind: 'drena' }), closed);
  assert.deepEqual(L.setOutcome(closed, id, 'hecha'), closed);
  assert.deepEqual(L.removeActivity(closed, id), closed);
  assert.deepEqual(L.setGratitude(closed, 1, 'x'), closed);
  assert.deepEqual(L.setMood(closed, 'inquieto'), closed);
  const reopened = L.reopenDay(closed);
  assert.equal(reopened.closed, false);
  assert.equal(L.setMood(reopened, 'inquieto').mood, 'inquieto');
});

test('el reparto suma los minutos por tipo y el total', () => {
  const day = dayOf(['A', 60, 'nutre'], ['B', 120, 'sostiene'], ['C', 45, 'drena'], ['D', 15, 'nutre']);
  assert.deepEqual(L.minutesByKind(day), { nutre: 75, sostiene: 120, drena: 45, total: 240 });
  assert.deepEqual(L.minutesByKind(L.emptyDay()), { nutre: 0, sostiene: 0, drena: 0, total: 0 });
});

test('un día vacío puntúa cero', () => {
  assert.deepEqual(L.score(L.emptyDay()), { presencia: 0, nutricion: 0, gratitud: 0, total: 0 });
});

test('presencia: 40 puntos por hacer lo elegido; lo tibio vale la mitad y lo que no valió, nada', () => {
  const withA = (outcome) =>
    L.score(dayOf(['A', 60, 'nutre', outcome], ['B', 120, 'sostiene', 'hecha'], ['C', 60, 'drena'])).presencia;
  assert.equal(withA('valio'), 30);
  assert.equal(withA('hecha'), 30);
  assert.equal(withA('tibio'), 25);
  assert.equal(withA('novalio'), 20);
  assert.equal(withA('pendiente'), 20);
  assert.equal(L.score(dayOf(['A', 60, 'nutre', 'hecha'])).presencia, 40);
});

test('nutrición: 30 puntos cuando un tercio de lo hecho te nutre, proporcional por debajo', () => {
  const nutricion = (...rows) => L.score(dayOf(...rows)).nutricion;
  assert.equal(nutricion(['A', 60, 'nutre', 'hecha'], ['B', 120, 'sostiene', 'hecha']), 30);
  assert.equal(nutricion(['A', 30, 'nutre', 'hecha'], ['B', 150, 'sostiene', 'hecha']), 15);
  assert.equal(nutricion(['A', 120, 'nutre', 'hecha'], ['B', 30, 'drena', 'hecha']), 30);
  assert.equal(nutricion(['A', 120, 'nutre'], ['B', 30, 'drena', 'hecha']), 0);
  assert.equal(nutricion(['A', 120, 'nutre']), 0);
});

test('gratitud: 10 puntos por cada agradecimiento escrito, y el total suma las tres partes', () => {
  const day = dayOf(['A', 60, 'nutre', 'valio'], ['B', 120, 'sostiene', 'hecha'], ['C', 60, 'drena']);
  const thankful = L.setGratitude(L.setGratitude(day, 0, 'El sol'), 2, '  ');
  assert.deepEqual(L.score(thankful), { presencia: 30, nutricion: 30, gratitud: 10, total: 70 });
  assert.equal(L.score(L.setGratitude(L.setGratitude(thankful, 1, 'a'), 2, 'b')).gratitud, 30);
});

test('la duración se lee en horas y minutos', () => {
  assert.equal(L.formatMinutes(45), '45 min');
  assert.equal(L.formatMinutes(60), '1 h');
  assert.equal(L.formatMinutes(90), '1 h 30');
  assert.equal(L.formatMinutes(845), '14 h 05');
});

test('un día en blanco pregunta qué lo haría valer la pena', () => {
  assert.deepEqual(L.questions(L.emptyDay()), ['Tu día está en blanco. ¿Qué tres cosas lo harían valer la pena?']);
});

test('un día equilibrado pregunta qué repetir', () => {
  const day = dayOf(['Leer', 60, 'nutre', 'hecha'], ['Trabajo', 240, 'sostiene', 'hecha'], ['Fila', 30, 'drena']);
  assert.deepEqual(L.questions(day), ['Buen equilibrio. ¿Qué repetirías mañana tal cual?']);
});

test('un día de más de 14 horas pregunta qué soltar', () => {
  const day = dayOf(['Leer', 300, 'nutre', 'hecha'], ['Trabajo', 545, 'sostiene', 'hecha']);
  assert.deepEqual(L.questions(day), ['Planeaste 14 h 05. ¿Qué puedes soltar sin que nadie lo note?']);
  const justFits = dayOf(['Leer', 300, 'nutre', 'hecha'], ['Trabajo', 540, 'sostiene', 'hecha']);
  assert.deepEqual(L.questions(justFits), ['Buen equilibrio. ¿Qué repetirías mañana tal cual?']);
});

test('un día sin nada que nutra pregunta qué te regalas', () => {
  assert.deepEqual(L.questions(dayOf(['Trabajo', 240, 'sostiene', 'hecha'])), [
    'Hoy no hay nada que te nutra. ¿Qué 20 minutos te regalas?',
  ]);
});

test('lo que marcaste como que no valió la pena vuelve como pregunta', () => {
  const day = dayOf(['Leer', 60, 'nutre', 'hecha'], ['Reunión eterna', 60, 'sostiene', 'novalio']);
  assert.deepEqual(L.questions(day), ['Dijiste que «Reunión eterna» no valió la pena. ¿Qué pondrías en su lugar?']);
});

test('cuando un cuarto del día o más drena, nombra el porcentaje y la ficha más larga', () => {
  const day = dayOf(
    ['Leer', 90, 'nutre', 'hecha'],
    ['Trabajo', 135, 'sostiene', 'hecha'],
    ['Fila', 15, 'drena', 'hecha'],
    ['Redes', 60, 'drena', 'hecha'],
  );
  assert.deepEqual(L.questions(day), [
    'El 25% de tu día se va en cosas que te drenan; «Redes» sola se lleva 1 h. ¿Qué le recortas mañana?',
  ]);
  const under = dayOf(['Leer', 90, 'nutre', 'hecha'], ['Trabajo', 136, 'sostiene', 'hecha'], ['Redes', 74, 'drena', 'hecha']);
  assert.deepEqual(L.questions(under), ['Buen equilibrio. ¿Qué repetirías mañana tal cual?']);
});

test('lo que nutre y sigue pendiente pregunta a qué hora', () => {
  const day = dayOf(['Leer', 60, 'nutre', 'hecha'], ['Caminar', 30, 'nutre'], ['Bailar', 30, 'nutre']);
  assert.deepEqual(L.questions(day), ['Todavía no haces «Caminar». ¿A qué hora, exactamente?']);
});

test('nunca hay más de tres preguntas, y van de la más urgente a la menos', () => {
  const day = dayOf(
    ['Trabajo', 600, 'sostiene', 'novalio'],
    ['Redes', 300, 'drena', 'hecha'],
  );
  assert.deepEqual(L.questions(day), [
    'Planeaste 15 h. ¿Qué puedes soltar sin que nadie lo note?',
    'Hoy no hay nada que te nutra. ¿Qué 20 minutos te regalas?',
    'Dijiste que «Trabajo» no valió la pena. ¿Qué pondrías en su lugar?',
  ]);
});

test('el día de ejemplo trae fichas de los tres tipos, sin cerrar, y ya provoca tres preguntas', () => {
  const sample = L.sampleDay();
  const reparto = L.minutesByKind(sample);
  assert.ok(reparto.nutre > 0 && reparto.sostiene > 0 && reparto.drena > 0);
  assert.equal(sample.closed, false);
  assert.equal(L.questions(sample).length, 3);
});
