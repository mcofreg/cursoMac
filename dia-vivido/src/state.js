// Estado de la pantalla y la única función que lo cambia. Sin DOM: la cáscara
// (app.js) traduce cada toque a una acción y vuelve a pintar.
import * as L from './logic.js';

export const TABS = ['hoy', 'espejo', 'noche'];

const DRAFT = { name: '', minutes: '30', kind: 'nutre' };

export const initialState = () => ({ day: L.sampleDay(), example: true, tab: 'hoy', draft: DRAFT, error: null });

const withDay = (state, day) => ({ ...state, day });

const HANDLERS = {
  tab: (state, { value }) => (TABS.includes(value) ? { ...state, tab: value } : state),
  // Los campos del borrador se llaman como sus claves; los agradecimientos, 0, 1 y 2.
  field: (state, { name, value }) =>
    Object.hasOwn(state.draft, name)
      ? { ...state, draft: { ...state.draft, [name]: value } }
      : withDay(state, L.setGratitude(state.day, Number(name), value)),
  add: (state) => {
    const parsed = L.parseActivity(state.draft);
    return parsed.ok
      ? { ...withDay(state, L.addActivity(state.day, parsed.value)), draft: DRAFT }
      : { ...state, error: parsed.error };
  },
  outcome: (state, { id, value }) => withDay(state, L.setOutcome(state.day, Number(id), value)),
  remove: (state, { id }) => withDay(state, L.removeActivity(state.day, Number(id))),
  mood: (state, { value }) => withDay(state, L.setMood(state.day, value)),
  close: (state) =>
    L.canClose(state.day)
      ? withDay(state, L.closeDay(state.day))
      : { ...state, error: 'Escribe al menos un agradecimiento y elige cómo te acuestas.' },
  reopen: (state) => withDay(state, L.reopenDay(state.day)),
  blank: (state) => ({ ...initialState(), day: L.emptyDay(), example: false, tab: state.tab }),
};

export function update(state, action) {
  const handler = Object.hasOwn(HANDLERS, action.type) ? HANDLERS[action.type] : null;
  return handler ? handler({ ...state, error: null }, action) : state;
}
