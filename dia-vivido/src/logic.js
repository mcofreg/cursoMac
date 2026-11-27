// Dominio de Día Vivido. Funciones puras: reciben un día y devuelven otro.
//
// Glosario
//   ficha       una dedicación del día: nombre, minutos y tipo.
//   tipo        qué te hace la ficha: te nutre, te sostiene o te drena.
//   resultado   cómo va la ficha: pendiente, hecha, o hecha con veredicto
//               (valió, tibio, no valió). Un solo campo: no existe veredicto sin hacerla.
//   reparto     minutos del día sumados por tipo.
//   puntaje     qué tan vivido fue el día, de 0 a 100: presencia + nutrición + gratitud.
//   cierre      agradecer y elegir un ánimo. Un día cerrado no se edita.

export const KINDS = ['nutre', 'sostiene', 'drena'];
export const VERDICTS = ['valio', 'tibio', 'novalio'];
export const MOODS = ['feliz', 'tranquilo', 'inquieto'];

// Cuánto cuenta cada resultado para la presencia. Sus claves son los resultados válidos.
const WEIGHT = { pendiente: 0, hecha: 1, valio: 1, tibio: 0.5, novalio: 0 };

const sum = (list, amount) => list.reduce((total, item) => total + amount(item), 0);
const isDone = (activity) => activity.outcome !== 'pendiente';
const isWritten = (text) => text.trim() !== '';
const fail = (error) => ({ ok: false, error });
const edit = (day, change) => (day.closed ? day : change(day));

export const emptyDay = () => ({ activities: [], gratitudes: ['', '', ''], mood: null, closed: false });

// Frontera: lo que escribe la persona entra por aquí una sola vez.
export function parseActivity(input) {
  const name = String(input.name || '').trim();
  const minutes = Number(input.minutes);
  if (name === '') return fail('Ponle un nombre a la ficha.');
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 720) {
    return fail('La duración va de 5 minutos a 12 horas.');
  }
  if (!KINDS.includes(input.kind)) return fail('Elige si te nutre, te sostiene o te drena.');
  return { ok: true, value: { name, minutes, kind: input.kind } };
}

export const addActivity = (day, value) =>
  edit(day, () => {
    const id = Math.max(0, ...day.activities.map((a) => a.id)) + 1;
    return { ...day, activities: [...day.activities, { id, ...value, outcome: 'pendiente' }] };
  });

export const setOutcome = (day, id, outcome) =>
  edit(day, () =>
    Object.hasOwn(WEIGHT, outcome)
      ? { ...day, activities: day.activities.map((a) => (a.id === id ? { ...a, outcome } : a)) }
      : day,
  );

export const removeActivity = (day, id) =>
  edit(day, () => ({ ...day, activities: day.activities.filter((a) => a.id !== id) }));

export const setGratitude = (day, index, text) =>
  edit(day, () => ({ ...day, gratitudes: day.gratitudes.map((old, i) => (i === index ? text : old)) }));

export const setMood = (day, mood) => edit(day, () => (MOODS.includes(mood) ? { ...day, mood } : day));

export const canClose = (day) => day.mood !== null && day.gratitudes.some(isWritten);
export const closeDay = (day) => (canClose(day) ? { ...day, closed: true } : day);
export const reopenDay = (day) => ({ ...day, closed: false });

export function minutesByKind(day) {
  const of = (kind) => sum(day.activities.filter((a) => a.kind === kind), (a) => a.minutes);
  const [nutre, sostiene, drena] = KINDS.map(of);
  return { nutre, sostiene, drena, total: nutre + sostiene + drena };
}

const share = (part, whole) => (whole === 0 ? 0 : part / whole);

export function score(day) {
  const done = day.activities.filter(isDone);
  const planned = sum(day.activities, (a) => a.minutes);
  const lived = sum(done, (a) => a.minutes * WEIGHT[a.outcome]);
  const nourishing = sum(done.filter((a) => a.kind === 'nutre'), (a) => a.minutes);
  const presencia = Math.round(40 * share(lived, planned));
  const nutricion = Math.round(30 * Math.min(1, 3 * share(nourishing, sum(done, (a) => a.minutes))));
  const gratitud = 10 * day.gratitudes.filter(isWritten).length;
  return { presencia, nutricion, gratitud, total: presencia + nutricion + gratitud };
}

// Cuánto del día planeado ya está hecho, en minutos y como parte de 0 a 1.
export function progress(day) {
  const done = sum(day.activities.filter(isDone), (a) => a.minutes);
  const total = sum(day.activities, (a) => a.minutes);
  return { done, total, part: Math.round(100 * share(done, total)) / 100 };
}

export function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
}

const longest = (list) => list.reduce((top, a) => (top.minutes >= a.minutes ? top : a));
const about = (activity, say) => (activity ? say(activity) : null);

// Cada regla mira el día y, si aplica, devuelve su pregunta. Van de la más urgente a la menos.
const RULES = [
  (day, m) => (m.total > 840 ? `Planeaste ${formatMinutes(m.total)}. ¿Qué puedes soltar sin que nadie lo note?` : null),
  (day, m) => (m.nutre === 0 ? 'Hoy no hay nada que te nutra. ¿Qué 20 minutos te regalas?' : null),
  (day) =>
    about(
      day.activities.find((a) => a.outcome === 'novalio'),
      (a) => `Dijiste que «${a.name}» no valió la pena. ¿Qué pondrías en su lugar?`,
    ),
  (day, m) =>
    about(m.drena * 4 >= m.total && longest(day.activities.filter((a) => a.kind === 'drena')), (a) => {
      const percent = Math.round((100 * m.drena) / m.total);
      return `El ${percent}% de tu día se va en cosas que te drenan; «${a.name}» sola se lleva ${formatMinutes(a.minutes)}. ¿Qué le recortas mañana?`;
    }),
  (day) =>
    about(
      day.activities.find((a) => a.kind === 'nutre' && !isDone(a)),
      (a) => `Todavía no haces «${a.name}». ¿A qué hora, exactamente?`,
    ),
];

export function questions(day) {
  if (day.activities.length === 0) return ['Tu día está en blanco. ¿Qué tres cosas lo harían valer la pena?'];
  const reparto = minutesByKind(day);
  const asked = RULES.map((rule) => rule(day, reparto)).filter(Boolean);
  return asked.length === 0 ? ['Buen equilibrio. ¿Qué repetirías mañana tal cual?'] : asked.slice(0, 3);
}

// Día de ejemplo para que la maqueta abra con algo que mirar.
export const sampleDay = () =>
  [
    ['Caminar con café', 30, 'nutre', 'valio'],
    ['Trabajo profundo', 120, 'sostiene', 'hecha'],
    ['Reuniones', 90, 'sostiene', 'hecha'],
    ['Almuerzo sin pantalla', 45, 'nutre', 'hecha'],
    ['Redes sociales', 75, 'drena', 'novalio'],
    ['Trámites del banco', 40, 'drena', 'pendiente'],
    ['Leer antes de dormir', 30, 'nutre', 'pendiente'],
  ].reduce((day, [name, minutes, kind, outcome]) => {
    const added = addActivity(day, { name, minutes, kind });
    return setOutcome(added, added.activities.at(-1).id, outcome);
  }, emptyDay());
