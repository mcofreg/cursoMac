import './style.css';
import { Game, Quality, SaveData } from './game/Game';
import { HUD } from './ui/HUD';
import { FACTIONS, FactionId } from './game/Factions';

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
  startEl.querySelector('#btnNew')!.addEventListener('click', () => { Game.clearSave(); launch(faction, quality); });
  startEl.querySelector('#btnContinue')?.addEventListener('click', () => launch(save!.faction, quality, save!));
}

function launch(faction: FactionId, quality: Quality, save?: SaveData): void {
  startEl.innerHTML = '<div class="loading"><h2>Forjando el continente…</h2><p>Generando Andes, Amazonas y miles de batallones.</p></div>';
  // Intentar pantalla completa y bloqueo horizontal en móviles.
  const anyDoc = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try { (anyDoc.requestFullscreen?.() as Promise<void> | undefined)?.catch(() => {}); } catch { /* */ }
  try { (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {}); } catch { /* */ }
  setTimeout(() => {
    const hud = new HUD(hudRoot);
    const game = new Game(app, hud, faction, quality, save);
    startEl.classList.add('hidden');
    hudRoot.classList.remove('hidden');
    game.start();
    (window as unknown as { game: Game }).game = game;
  }, 50);
}

renderStart(Game.load());

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {}); });
}
