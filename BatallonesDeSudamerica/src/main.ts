import './style.css';
import { Game, Quality, SaveData } from './game/Game';
import { HUD } from './ui/HUD';
import { FACTIONS, FactionId } from './game/Factions';
import { WorldMap } from './world/SouthAmerica';

const app = document.getElementById('app')!;
const startEl = document.getElementById('start')!;
const hudRoot = document.getElementById('hud')!;

function detectQuality(): Quality {
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mem >= 6 && cores >= 6) return 2;
  if (mem >= 3) return 1;
  return 0;
}

function renderStart(save: SaveData | null): void {
  let faction: FactionId = save?.faction ?? FactionId.Romanos;
  let quality: Quality = save?.quality ?? detectQuality();
  const cards = FACTIONS.map((f) => `
    <button class="card" data-f="${f.id}" style="--c:${f.color}">
      <div class="emoji">${f.emoji}</div>
      <h3>${f.name}</h3>
      <p class="w">${f.weapons}</p>
      <p>${f.style}</p>
      <div class="stats">
        <span>Ataque ${'●'.repeat(Math.round(f.attack * 3))}</span>
        <span>Defensa ${'●'.repeat(Math.round(f.defense * 3))}</span>
        <span>Velocidad ${'●'.repeat(Math.round(f.speed * 3))}</span>
        <span>Alcance ${'●'.repeat(Math.min(5, Math.round(f.range / 3)))}</span>
      </div>
      <p class="sp">✨ ${f.special.name}: ${f.special.desc}</p>
    </button>`).join('');
  startEl.innerHTML = `
    <div class="hero">
      <h1>Batallones de Sudamérica</h1>
      <p class="sub">Recorre el continente con tu ejército voxel, vence a los batallones autónomos que lo recorren y conquista sus capitales.</p>
    </div>
    <div class="cards">${cards}</div>
    <div class="options">
      <label>Calidad gráfica
        <select id="quality">
          <option value="0">Baja (teléfonos antiguos)</option>
          <option value="1">Media</option>
          <option value="2">Alta (iPhone 13+ / gama alta)</option>
        </select>
      </label>
      <div class="actions">
        ${save ? `<button class="primary" id="btnContinue">▶ Continuar (${FACTIONS[save.faction].name}, 💰${Math.round(save.gold)})</button>` : ''}
        <button class="${save ? '' : 'primary'}" id="btnNew">⚔️ Nueva campaña</button>
      </div>
      <p class="tip">Consejo: en iPhone, abre en Safari → Compartir → “Añadir a pantalla de inicio” para jugar a pantalla completa.</p>
    </div>`;
  const select = startEl.querySelector<HTMLSelectElement>('#quality')!;
  select.value = String(quality);
  select.addEventListener('change', () => { quality = Number(select.value) as Quality; });
  const cardsEl = startEl.querySelectorAll<HTMLButtonElement>('.card');
  const mark = () => cardsEl.forEach((c) => c.classList.toggle('sel', Number(c.dataset.f) === faction));
  cardsEl.forEach((c) => c.addEventListener('click', () => { faction = Number(c.dataset.f) as FactionId; mark(); }));
  mark();
  startEl.querySelector('#btnNew')!.addEventListener('click', () => { Game.clearSave(); void launch(faction, quality); });
  startEl.querySelector('#btnContinue')?.addEventListener('click', () => { void launch(save!.faction, quality, save!); });
}

/** Sonda: ¿entrega el navegador un contexto WebGL utilizable? (En iOS con Modo Aislamiento o en algunos visores
 *  embebidos el contexto se crea pero todas sus llamadas devuelven null.) */
function probeWebGL(): 'ok' | 'none' | 'blocked' {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') as WebGL2RenderingContext | null);
    if (!gl) return 'none';
    const fmt = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT);
    const ok = fmt !== null && typeof gl.getParameter(gl.MAX_TEXTURE_SIZE) === 'number';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return ok ? 'ok' : 'blocked';
  } catch { return 'blocked'; }
}

function showBlocked(kind: 'none' | 'blocked'): void {
  const inFrame = window.self !== window.top;
  startEl.innerHTML = `<div class="loading error">
    <h2>${kind === 'none' ? 'Este navegador no tiene WebGL2' : 'Los gráficos 3D están bloqueados aquí'}</h2>
    <p class="blocked">${kind === 'none'
      ? 'El juego necesita WebGL2 (Safari de iOS 15 o superior, Chrome o Firefox actuales en Android).'
      : inFrame
        ? 'Este visor embebido no deja usar la tarjeta gráfica. Abre el juego en una pestaña completa de Safari o Chrome.'
        : 'El navegador creó un contexto gráfico vacío. En iPhone suele deberse al <b>Modo Aislamiento</b> (Ajustes → Privacidad y seguridad), que bloquea WebGL: desactívalo para este sitio desde el menú “aA” de Safari → Ajustes del sitio web.'}</p>
    <div class="actions">
      ${kind === 'blocked' ? '<button class="primary" id="btnOpen">Abrir a pantalla completa</button>' : ''}
      <button id="btnCopy">Copiar enlace</button>
      <button id="btnAgain">Reintentar</button>
    </div>
    <p class="tip">Otra opción: en la app, toca el icono de compartir (arriba a la derecha) y elige “Abrir en Safari”.</p>
  </div>`;
  startEl.querySelector('#btnOpen')?.addEventListener('click', () => { window.open(location.href, '_blank', 'noopener'); });
  startEl.querySelector('#btnCopy')?.addEventListener('click', () => { navigator.clipboard?.writeText(location.href).then(() => alert('Enlace copiado. Pégalo en Safari.')).catch(() => prompt('Copia este enlace:', location.href)); });
  startEl.querySelector('#btnAgain')?.addEventListener('click', () => renderStart(Game.load()));
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

function showError(title: string, detail: string, quality: Quality): void {
  startEl.innerHTML = `<div class="loading error"><h2>${title}</h2><pre>${detail.replace(/</g, '&lt;')}</pre>
    <div class="actions"><button class="primary" id="btnRetry">Reintentar en calidad baja</button><button id="btnBack">Volver al inicio</button></div></div>`;
  startEl.querySelector('#btnRetry')!.addEventListener('click', () => { void launch(FactionId.Romanos, 0); });
  startEl.querySelector('#btnBack')?.addEventListener('click', () => renderStart(Game.load()));
  void quality;
}

async function launch(faction: FactionId, quality: Quality, save?: SaveData): Promise<void> {
  const steps = ['Trazando costas y fronteras…', 'Levantando los Andes y el Amazonas…', 'Desplegando miles de batallones…', 'Afilando armas (compilando gráficos)…'];
  const setStep = (i: number) => {
    startEl.innerHTML = `<div class="loading"><h2>Forjando el continente…</h2><p>${steps[i]}</p><div class="prog"><i style="width:${((i + 1) / (steps.length + 1)) * 100}%"></i></div></div>`;
  };
  setStep(0);
  const probe = typeof WebGL2RenderingContext === 'undefined' ? 'none' : probeWebGL();
  if (probe !== 'ok') { showBlocked(probe); return; }
  // Intentar pantalla completa y bloqueo horizontal en móviles.
  const anyDoc = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try { (anyDoc.requestFullscreen?.() as Promise<void> | undefined)?.catch(() => {}); } catch { /* */ }
  try { (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {}); } catch { /* */ }
  try {
    await nextFrame();
    const map = new WorldMap();
    setStep(1); await nextFrame();
    const hud = new HUD(hudRoot);
    const game = new Game(app, hud, faction, quality, map, save);
    setStep(2); await nextFrame();
    setStep(3); await nextFrame();
    game.warmup();
    await nextFrame();
    startEl.classList.add('hidden');
    hudRoot.classList.remove('hidden');
    game.start();
    (window as unknown as { game: Game }).game = game;
  } catch (err) {
    const e = err as Error;
    console.error(e);
    if (/getShaderPrecisionFormat|WebGL|contexto/i.test(String(e?.message))) { showBlocked('blocked'); return; }
    showError('No se pudo iniciar el juego', `${e?.name ?? 'Error'}: ${e?.message ?? String(err)}\n${(e?.stack ?? '').split('\n').slice(0, 4).join('\n')}`, quality);
  }
}

window.addEventListener('error', (ev) => {
  if (!startEl.classList.contains('hidden')) showError('Error al cargar', `${ev.message}\n${ev.filename ?? ''}:${ev.lineno ?? ''}`, 1);
});
window.addEventListener('unhandledrejection', (ev) => {
  if (!startEl.classList.contains('hidden')) showError('Error al cargar', String((ev as PromiseRejectionEvent).reason), 1);
});

renderStart(Game.load());

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {}); });
}
