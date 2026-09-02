import type { Game } from '../game/Game';
import { FACTIONS, TIER_SIZES, TIER_COST } from '../game/Factions';
import { COUNTRIES, Country, MAP_W, MAP_H, WorldMap } from '../world/SouthAmerica';

const fmt = (n: number) => Math.round(n).toLocaleString('es');

/** Interfaz DOM sobre el canvas: marcadores, botones, tienda, minimapa. */
export class HUD {
  readonly root: HTMLElement;
  readonly joyBase: HTMLElement;
  readonly joyKnob: HTMLElement;
  private game!: Game;
  private minimap: HTMLCanvasElement;
  private minimapBase: HTMLCanvasElement | null = null;
  private toasts: HTMLElement;
  private shopOpen = false;
  private minimapTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div class="ui top">
        <div class="stat" id="stGold">💰 0</div>
        <div class="stat" id="stArmy">⚔️ 0</div>
        <div class="stat" id="stBat">🚩 0</div>
        <div class="stat small" id="stWorld">🌎 0</div>
        <div class="stat small" id="stFps"></div>
      </div>
      <div class="ui country" id="country"></div>
      <div class="ui challenges" id="challenges"></div>
      <div class="ui buttons">
        <button id="btnShop" title="Tienda">🛒<span>Tienda</span></button>
        <button id="btnSpecial" title="Habilidad"><b id="specialIcon">✨</b><span id="specialName">Especial</span><i id="specialCd"></i></button>
        <button id="btnAttack" title="Modo ataque">🛡️<span>Defensa</span></button>
        <button id="btnMap" title="Vista estratégica">🗺️<span>Mapa</span></button>
        <button id="btnMenu" title="Menú">☰<span>Menú</span></button>
      </div>
      <div class="joy" id="joyBase"><div class="knob" id="joyKnob"></div></div>
      <canvas class="ui minimap" id="minimap" width="150" height="216"></canvas>
      <div class="toasts" id="toasts"></div>
      <div class="damage" id="damage"></div>
      <div class="ui modal hidden" id="shop"></div>
      <div class="ui modal hidden" id="menu"></div>
    `;
    this.joyBase = root.querySelector('#joyBase')!;
    this.joyKnob = root.querySelector('#joyKnob')!;
    this.minimap = root.querySelector('#minimap')!;
    this.toasts = root.querySelector('#toasts')!;
  }

  bind(game: Game): void {
    this.game = game;
    const f = FACTIONS[game.armies.playerFaction];
    (this.root.querySelector('#specialIcon') as HTMLElement).textContent = f.emoji;
    (this.root.querySelector('#specialName') as HTMLElement).textContent = f.special.name;
    this.root.querySelector('#btnShop')!.addEventListener('click', () => this.toggleShop());
    this.root.querySelector('#btnSpecial')!.addEventListener('click', () => game.useSpecial());
    this.root.querySelector('#btnAttack')!.addEventListener('click', () => { game.toggleAggressive(); this.update(game); });
    this.root.querySelector('#btnMap')!.addEventListener('click', () => game.toggleStrategic());
    this.root.querySelector('#btnMenu')!.addEventListener('click', () => this.toggleMenu());
    this.minimap.addEventListener('click', () => game.toggleStrategic());
    this.buildMinimapBase(game.map);
  }

  update(game: Game): void {
    const a = game.armies;
    (this.root.querySelector('#stGold') as HTMLElement).textContent = `💰 ${fmt(game.gold)}`;
    (this.root.querySelector('#stArmy') as HTMLElement).textContent = `⚔️ ${fmt(a.playerStrength())}`;
    (this.root.querySelector('#stBat') as HTMLElement).textContent = `🚩 ${a.player.members.length}`;
    (this.root.querySelector('#stWorld') as HTMLElement).textContent = `🌎 ${fmt(a.totalSoldiers)} soldados en el continente`;
    (this.root.querySelector('#stFps') as HTMLElement).textContent = `${game.fps} fps`;
    const btnAtk = this.root.querySelector('#btnAttack') as HTMLElement;
    btnAtk.innerHTML = game.aggressive ? '⚔️<span>Ataque</span>' : '🛡️<span>Defensa</span>';
    btnAtk.classList.toggle('on', game.aggressive);
    const cd = this.root.querySelector('#specialCd') as HTMLElement;
    const f = FACTIONS[a.playerFaction];
    cd.style.height = `${(Math.max(0, a.specialCooldown) / f.special.cooldown) * 100}%`;
    (this.root.querySelector('#btnSpecial') as HTMLElement).classList.toggle('active', a.specialT > 0);
    (this.root.querySelector('#btnMap') as HTMLElement).classList.toggle('on', game.isStrategic());

    // Desafíos
    const ch = this.root.querySelector('#challenges') as HTMLElement;
    ch.innerHTML = game.challenges.slice(0, 3).map((c) => {
      const g = a.groups.get(c.groupId);
      const left = g ? a.groupStrength(g) : 0;
      const pct = Math.max(0, Math.min(100, 100 - (left / c.initial) * 100));
      const t = c.timeLeft > 0 ? ` · ${Math.ceil(c.timeLeft)}s` : '';
      return `<div class="ch ${c.kind}"><b>${c.title}</b><span>${fmt(left)} enemigos${t} · 💰${c.reward}</span><div class="bar"><i style="width:${pct}%"></i></div></div>`;
    }).join('');

    if (this.shopOpen) this.renderShop();
    this.minimapTimer -= 0.25;
    if (this.minimapTimer <= 0) { this.minimapTimer = 0.5; this.drawMinimap(); }
  }

  countryBanner(c: Country, first: boolean, biome: string, conquered: boolean): void {
    const el = this.root.querySelector('#country') as HTMLElement;
    el.innerHTML = `<div class="flag" style="background:${c.color}"></div><div><b>${c.name}</b><span>${conquered ? 'Territorio conquistado' : first ? '¡Nuevo territorio!' : 'Capital: ' + c.capital} · ${biome}</span></div>`;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }

  toast(msg: string, ms = 3000): void {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild?.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 500); }, ms);
  }

  flashDamage(): void {
    const d = this.root.querySelector('#damage') as HTMLElement;
    d.classList.remove('hit'); void d.offsetWidth; d.classList.add('hit');
  }

  // ---------------------------------------------------------------- tienda
  toggleShop(): void {
    this.shopOpen = !this.shopOpen;
    const el = this.root.querySelector('#shop') as HTMLElement;
    el.classList.toggle('hidden', !this.shopOpen);
    if (this.shopOpen) this.renderShop();
  }
  private renderShop(): void {
    const g = this.game, a = g.armies, f = FACTIONS[a.playerFaction];
    const el = this.root.querySelector('#shop') as HTMLElement;
    const up = (k: 'attack' | 'defense' | 'morale', label: string, icon: string) => {
      const lvl = a.upgrades[k];
      const cost = 900 * (lvl + 1) * (lvl + 1);
      return `<button class="item" data-up="${k}" ${lvl >= 5 || g.gold < cost ? 'disabled' : ''}>${icon} <b>${label}</b> nivel ${lvl}/5<span>${lvl >= 5 ? 'Máximo' : '💰 ' + fmt(cost)}</span></button>`;
    };
    const refill = g.refillCost();
    el.innerHTML = `
      <div class="panel">
        <header><h2>🛒 Tienda de guerra · ${f.emoji} ${f.name}</h2><button class="close" data-close>✕</button></header>
        <p class="gold">Tesoro: 💰 ${fmt(g.gold)} · Ejército: ⚔️ ${fmt(a.playerStrength())} en ${a.player.members.length} batallones</p>
        <h3>Reclutar batallones</h3>
        <div class="grid">
          ${TIER_SIZES.map((s, i) => `<button class="item" data-tier="${i}" ${g.gold < TIER_COST[i] ? 'disabled' : ''}>${f.emoji} <b>${f.unitNames[i]}</b>${fmt(s)} soldados<span>💰 ${fmt(TIER_COST[i])}</span></button>`).join('')}
        </div>
        <h3>Mejoras</h3>
        <div class="grid">
          ${up('attack', 'Armas', '🗡️')}${up('defense', 'Armaduras', '🛡️')}${up('morale', 'Moral', '🔥')}
        </div>
        <h3>Logística</h3>
        <div class="grid">
          <button class="item" data-refill ${refill <= 0 || g.gold < refill ? 'disabled' : ''}>🏥 <b>Reponer bajas</b>Rellena todos los batallones<span>${refill <= 0 ? 'Sin bajas' : '💰 ' + fmt(refill)}</span></button>
          <button class="item" data-merge ${a.player.members.length < 4 ? 'disabled' : ''}>🔗 <b>Fusionar</b>Une batallones pequeños<span>Gratis</span></button>
        </div>
        <p class="hint">${f.weapons}. ${f.style}</p>
      </div>`;
    el.querySelector('[data-close]')!.addEventListener('click', () => this.toggleShop());
    el.querySelectorAll<HTMLButtonElement>('[data-tier]').forEach((b) => b.addEventListener('click', () => { g.buyBattalion(Number(b.dataset.tier)); this.renderShop(); }));
    el.querySelectorAll<HTMLButtonElement>('[data-up]').forEach((b) => b.addEventListener('click', () => { g.buyUpgrade(b.dataset.up as 'attack'); this.renderShop(); }));
    el.querySelector('[data-refill]')!.addEventListener('click', () => { g.refill(); this.renderShop(); });
    el.querySelector('[data-merge]')!.addEventListener('click', () => { g.mergeBattalions(); this.renderShop(); });
  }

  // ---------------------------------------------------------------- menú
  toggleMenu(): void {
    const el = this.root.querySelector('#menu') as HTMLElement;
    const open = el.classList.contains('hidden');
    el.classList.toggle('hidden', !open);
    if (!open) return;
    const g = this.game;
    const conquered = COUNTRIES.filter((c) => g.conquered.has(c.id)).map((c) => c.name).join(', ') || 'ninguno todavía';
    el.innerHTML = `
      <div class="panel">
        <header><h2>☰ Campaña</h2><button class="close" data-close>✕</button></header>
        <p>Tiempo de juego: ${Math.floor(g.playTime / 60)} min · Bajas enemigas: ${fmt(g.kills)}</p>
        <p>Países conquistados (${g.conquered.size}/${COUNTRIES.length}): ${conquered}</p>
        <h3>Controles</h3>
        <ul>
          <li>Joystick (zona inferior izquierda) o WASD: mover el ejército.</li>
          <li>Arrastrar con un dedo o ratón: girar cámara. Pinza o rueda: acercar / alejar hasta ver todo el continente.</li>
          <li>Modo Ataque: tus batallones persiguen enemigos cercanos. Defensa: sólo responden.</li>
          <li>Habilidad especial (barra espaciadora): ${FACTIONS[g.armies.playerFaction].special.desc}</li>
        </ul>
        <div class="grid">
          <button class="item" data-save>💾 <b>Guardar</b>Se guarda solo cada 20 s</button>
          <button class="item danger" data-new>🔄 <b>Nueva partida</b>Borra el progreso</button>
        </div>
      </div>`;
    el.querySelector('[data-close]')!.addEventListener('click', () => this.toggleMenu());
    el.querySelector('[data-save]')!.addEventListener('click', () => { g.save(); this.toast('Partida guardada.'); this.toggleMenu(); });
    el.querySelector('[data-new]')!.addEventListener('click', () => { if (confirm('¿Borrar la partida y empezar de nuevo?')) { (g.constructor as typeof Game).clearSave(); location.reload(); } });
  }

  // ---------------------------------------------------------------- minimapa
  private buildMinimapBase(map: WorldMap): void {
    const c = document.createElement('canvas');
    c.width = 150; c.height = 216;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(c.width, c.height);
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const mx = Math.floor((x / c.width) * MAP_W), mz = Math.floor((y / c.height) * MAP_H);
      const cid = map.country[mz * MAP_W + mx];
      const h = map.height[mz * MAP_W + mx];
      const o = (y * c.width + x) * 4;
      if (cid === 255 || h < 0) { img.data[o] = 20; img.data[o + 1] = 60; img.data[o + 2] = 110; img.data[o + 3] = 230; continue; }
      const col = COUNTRIES[cid].color;
      const r = parseInt(col.slice(1, 3), 16), g = parseInt(col.slice(3, 5), 16), b = parseInt(col.slice(5, 7), 16);
      const shade = 0.55 + Math.min(1, h / 40) * 0.45;
      img.data[o] = r * shade; img.data[o + 1] = g * shade; img.data[o + 2] = b * shade; img.data[o + 3] = 235;
    }
    ctx.putImageData(img, 0, 0);
    this.minimapBase = c;
  }
  private drawMinimap(): void {
    if (!this.minimapBase) return;
    const ctx = this.minimap.getContext('2d')!;
    const W = this.minimap.width, H = this.minimap.height;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.minimapBase, 0, 0);
    const a = this.game.armies;
    const sx = W / MAP_W, sz = H / MAP_H;
    // Países conquistados: contorno dorado
    for (const c of this.game.conquered) {
      const cc = COUNTRIES[c];
      ctx.fillStyle = 'rgba(255,215,0,0.9)';
      ctx.font = '10px sans-serif';
      ctx.fillText('★', cc.cap[0] * sx - 4, cc.cap[1] * sz + 4);
    }
    for (let i = 0; i < a.high; i++) {
      if (!a.alive[i]) continue;
      const r = Math.max(1, Math.log10(a.count[i] + 1) * 0.7);
      ctx.fillStyle = a.owner[i] === 0 ? '#ffe066' : ['#ff4d4d', '#ffb347', '#40e0d0'][a.faction[i]];
      ctx.beginPath(); ctx.arc(a.x[i] * sx, a.z[i] * sz, r, 0, 6.283); ctx.fill();
    }
    const p = a.player;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x * sx, p.z * sz, 5, 0, 6.283); ctx.stroke();
  }
}
