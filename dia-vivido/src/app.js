// Cáscara del navegador: traduce toques a acciones y pinta. Las decisiones viven en state.js.
import { initialState, update } from './state.js';
import { viewScreen, viewTabs } from './view.js';

const screen = document.getElementById('pantalla');
const tabs = document.getElementById('tabs');
let state = initialState();

function paint() {
  const focused = document.activeElement.id;
  screen.innerHTML = viewScreen(state);
  tabs.innerHTML = viewTabs(state);
  const again = document.getElementById(focused);
  if (again) again.focus();
}

function act(action) {
  state = update(state, action);
  paint();
}

function onClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  if (button.dataset.action === 'tab') screen.scrollTop = 0;
  act({ type: button.dataset.action, id: button.dataset.id, value: button.dataset.value });
}

// Escribir no repinta: así no se pierde el cursor ni los acentos a medio teclear.
function onInput(event) {
  const name = event.target.dataset.field;
  if (name !== undefined) state = update(state, { type: 'field', name, value: event.target.value });
}

function onSubmit(event) {
  event.preventDefault();
  act({ type: 'add' });
}

document.addEventListener('click', onClick);
document.addEventListener('input', onInput);
document.addEventListener('submit', onSubmit);
paint();
