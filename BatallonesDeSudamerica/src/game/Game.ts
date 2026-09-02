import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { WorldMap, COUNTRIES, Country, MAP_W, MAP_H, BIOME_NAMES, lonLatToXZ } from '../world/SouthAmerica';
import { Terrain } from '../world/Terrain';
import { Sky } from '../world/Sky';
import { Armies, Owner, GroupState } from '../army/Army';
import { ArmyRenderer } from '../army/ArmyRenderer';
import { FACTIONS, FactionId, TIER_SIZES, TIER_COST } from './Factions';
import { Input } from '../input/Input';
import { HUD } from '../ui/HUD';

export type Quality = 0 | 1 | 2;

export interface SaveData {
  v: number;
  faction: FactionId;
  gold: number;
  upgrades: { attack: number; defense: number; morale: number };
  battalions: number[];
  px: number; pz: number;
  conquered: number[];
  visited: number[];
  kills: number;
  playTime: number;
  quality: Quality;
}

export interface Challenge {
  id: number;
  title: string;
  desc: string;
  kind: 'garrison' | 'ambush' | 'horde';
  groupId: number;
  reward: number;
  country: number;
  timeLeft: number;
  initial: number;
}

const SAVE_KEY = 'batallones-sudamerica-v1';

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  readonly map: WorldMap;
  readonly terrain: Terrain;
  readonly sky: Sky;
  readonly armies: Armies;
  readonly armyRenderer: ArmyRenderer;
  readonly input: Input;
  readonly hud: HUD;
  quality: Quality;

  camYaw = 0.4; camPitch = 0.55; camDist = 42;
  private targetDist = 42;
  private strategic = false;
  private savedView: [number, number, number] | null = null;
  fps = 0;
  private fpsAcc = performance.now(); private fpsN = 0;

  gold = 600;
  kills = 0;
  playTime = 0;
  conquered = new Set<number>();
  visited = new Set<number>();
  currentCountry: Country | null = null;
  aggressive = false;
  challenges: Challenge[] = [];
  private nextChallengeId = 1;
  private ambushTimer = 40;
  private reinforceTimer = 20;
  private saveTimer = 20;
  private hudTimer = 0;
  private lastT = 0;
  private running = false;
  private tmpV = new THREE.Vector3();

  constructor(container: HTMLElement, hud: HUD, faction: FactionId, quality: Quality, map: WorldMap, save?: SaveData) {
    this.quality = quality;
    this.hud = hud;
    this.renderer = Game.createRenderer(container, quality);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 2 ? 2 : quality === 1 ? 1.5 : 1));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      hud.toast('Se perdió el contexto gráfico. Recarga la página para continuar.', 10000);
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = quality >= 1;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.5, 9000);

    this.map = map;
    this.terrain = new Terrain(this.map);
    this.scene.add(this.terrain.group);
    this.sky = new Sky(this.scene);
    this.armies = new Armies(this.map);
    this.armies.playerFaction = faction;
    this.armyRenderer = new ArmyRenderer(this.armies, this.map, quality);
    this.armyRenderer.setShadows(quality >= 1);
    this.scene.add(this.armyRenderer.group);
    this.input = new Input(container, hud.joyBase, hud.joyKnob);

    if (quality >= 1) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.35, 0.5, 0.86);
      this.composer.addPass(bloom);
      this.composer.addPass(new OutputPass());
    }

    // Población inicial del continente
    this.armies.populateWorld(1);

    const p = this.armies.player;
    if (save) {
      this.gold = save.gold; this.kills = save.kills; this.playTime = save.playTime;
      this.armies.upgrades = save.upgrades;
      save.conquered.forEach((c) => this.conquered.add(c));
      save.visited.forEach((c) => this.visited.add(c));
      [p.x, p.z] = this.map.nearestLand(save.px, save.pz);
      for (const c of save.battalions) this.armies.spawn(p.x, p.z, faction, Owner.Player, c, 0);
      // Retirar guarniciones de países ya conquistados
      for (const g of [...this.armies.groups.values()]) if (g.isGarrison && this.conquered.has(g.country)) for (const i of [...g.members]) this.armies.kill(i);
    } else {
      // Comienzo en los Llanos orientales de Colombia (terreno llano, lejos de la guarnición de Bogotá)
      const [sx, sz] = lonLatToXZ(-71.2, 5.2);
      [p.x, p.z] = this.map.nearestLand(sx, sz);
      for (let i = 0; i < 3; i++) this.armies.spawn(p.x, p.z, faction, Owner.Player, 100, 0);
      // Despejar enemigos demasiado cerca del inicio
      for (const g of [...this.armies.groups.values()]) {
        if (g.id === 0 || g.isGarrison) continue;
        const dg = Math.hypot(g.x - p.x, g.z - p.z);
        if (dg < 130 || (dg < 420 && this.armies.groupStrength(g) > 1500)) for (const i of [...g.members]) this.armies.kill(i);
      }
      // Una patrulla pequeña cerca para el primer combate
      {
        const [ex, ez] = this.map.nearestLand(p.x + 45, p.z + 20);
        this.armies.spawnArmy(ex, ez, ((faction + 1) % 3) as FactionId, 120, COUNTRIES[0].id, 0.8);
      }
    }
    p.heading = Math.PI;
    this.camYaw = p.heading;

    window.addEventListener('resize', () => this.resize(container));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    hud.bind(this);
    this.hud.toast(`${FACTIONS[faction].emoji} ${FACTIONS[faction].name}: ¡en marcha por Sudamérica!`, 4000);
  }

  /**
   * Crea el renderizador con varios intentos: iOS Safari a veces entrega un contexto WebGL ya perdido
   * (falla getShaderPrecisionFormat), sobre todo en visores embebidos o con 'high-performance'.
   */
  private static createRenderer(container: HTMLElement, quality: Quality): THREE.WebGLRenderer {
    const attempts: THREE.WebGLRendererParameters[] = [
      { antialias: quality >= 1, powerPreference: quality === 2 ? 'high-performance' : 'default' },
      { antialias: false, powerPreference: 'default' },
      { antialias: false, powerPreference: 'low-power', depth: true, stencil: false },
    ];
    let lastErr: unknown = null;
    for (const params of attempts) {
      // El canvas se inserta en el documento ANTES de crear el contexto.
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'display:block;width:100%;height:100%';
      container.prepend(canvas);
      try {
        const r = new THREE.WebGLRenderer({ ...params, canvas, failIfMajorPerformanceCaveat: false });
        const gl = r.getContext();
        if (gl.isContextLost()) throw new Error('Contexto WebGL perdido al crearse');
        return r;
      } catch (e) {
        lastErr = e;
        canvas.remove();
        console.warn('Fallo al crear WebGL con', params, e);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('No se pudo crear el contexto WebGL: ' + String(lastErr));
  }

  private resize(container: HTMLElement): void {
    const w = container.clientWidth, h = container.clientHeight;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Compila los shaders antes del primer frame para evitar un congelamiento inicial. */
  warmup(): void {
    const p = this.armies.player;
    this.terrain.update(p.x, p.z, 1);
    this.renderer.compile(this.scene, this.camera);
  }

  start(): void {
    this.running = true;
    this.lastT = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (t - this.lastT) / 1000);
      this.lastT = t;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------------ bucle principal
  private frame(dt: number): void {
    this.playTime += dt;
    this.fpsN++;
    const nowT = performance.now();
    if (nowT - this.fpsAcc >= 1000) { this.fps = Math.round((this.fpsN * 1000) / Math.max(1, nowT - this.fpsAcc)); this.fpsAcc = nowT; this.fpsN = 0; }
    const inp = this.input.poll(dt);
    // Cámara
    this.camYaw += inp.yaw;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + inp.pitch, 0.18, 1.5);
    this.targetDist = THREE.MathUtils.clamp(this.targetDist * inp.zoom, 9, 2300);
    if (this.strategic && (Math.abs(inp.yaw) > 0 || inp.zoom !== 1)) { /* el usuario retoma el control */ }
    this.camDist += (this.targetDist - this.camDist) * Math.min(1, dt * 6);
    if (this.camDist > 600) this.camPitch = Math.max(this.camPitch, THREE.MathUtils.lerp(0.5, 1.45, Math.min(1, (this.camDist - 600) / 1200)));

    // Movimiento relativo a la cámara
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    const rx = -fz, rz = fx;
    const mx = fx * -inp.joyY + rx * inp.joyX;
    const mz = fz * -inp.joyY + rz * inp.joyX;

    if (this.input.consumeKey(' ')) this.useSpecial();
    if (this.input.consumeKey('m')) this.toggleStrategic();

    this.armies.update(dt, mx, mz, this.aggressive);
    this.gold += this.armies.goldEarned;
    this.kills += this.armies.killsThisFrame;
    if (this.armies.playerLossesThisFrame > 0) this.hud.flashDamage();

    // Tributo de países conquistados
    let tribute = 0;
    for (const c of this.conquered) tribute += COUNTRIES[c].difficulty * 2;
    this.gold += tribute * dt;

    this.updateChallenges(dt);

    // País actual
    const p = this.armies.player;
    const c = this.map.countryAt(p.x, p.z);
    if (c && c !== this.currentCountry) this.enterCountry(c);

    // Refuerzos y guardado
    this.reinforceTimer -= dt;
    if (this.reinforceTimer <= 0) { this.reinforceTimer = 25; this.armies.reinforce(this.conquered, this.armies.playerStrength()); }
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 20; this.save(); }

    // Derrota total: refuerzo de emergencia
    if (this.armies.player.members.length === 0) {
      this.hud.toast('Tu ejército fue aniquilado. Los supervivientes reagrupan tres nuevas unidades.', 5000);
      for (let i = 0; i < 3; i++) this.armies.spawn(p.x, p.z, this.armies.playerFaction, Owner.Player, 100, 0);
      this.gold = Math.max(this.gold, 300);
    }

    // Cámara: posición
    const gy = this.map.groundY(p.x, p.z);
    // En vista estratégica el foco se desliza hacia el centro del continente.
    const k = THREE.MathUtils.smoothstep(this.camDist, 700, 1500);
    const focus = this.tmpV.set(THREE.MathUtils.lerp(p.x, MAP_W / 2, k), THREE.MathUtils.lerp(gy + 1.5, 4, k), THREE.MathUtils.lerp(p.z, MAP_H / 2, k));
    const cp = this.camera.position;
    cp.set(
      focus.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist,
      focus.y + Math.sin(this.camPitch) * this.camDist,
      focus.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist,
    );
    const camGround = this.map.groundY(cp.x, cp.z);
    if (cp.y < camGround + 2.5) cp.y = camGround + 2.5;
    this.camera.lookAt(focus);
    this.camera.far = Math.max(2500, this.camDist * 4);
    this.camera.updateProjectionMatrix();

    // Mundo
    this.terrain.update(p.x, p.z, this.camDist < 400 ? 3 : 1);
    this.sky.update(dt, focus, this.camDist);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.density = this.sky.fogDensity(this.camDist);
    fog.color.copy(this.sky.fogColor);
    this.armyRenderer.update(dt, this.playTime, this.camera, this.renderer.domElement.clientHeight);

    // HUD
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) { this.hudTimer = 0.25; this.hud.update(this); }

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------------ países y desafíos
  private enterCountry(c: Country): void {
    this.currentCountry = c;
    const first = !this.visited.has(c.id);
    this.visited.add(c.id);
    const biome = BIOME_NAMES[this.map.biomeAt(this.armies.player.x, this.armies.player.z)];
    this.hud.countryBanner(c, first, biome, this.conquered.has(c.id));
    if (first && !this.conquered.has(c.id)) {
      // Desafío principal del país: tomar la capital
      const garrison = [...this.armies.groups.values()].find((g) => g.isGarrison && g.country === c.id);
      if (garrison) {
        garrison.challenge = this.nextChallengeId;
        this.challenges.push({
          id: this.nextChallengeId++, kind: 'garrison', groupId: garrison.id, country: c.id,
          title: `Toma ${c.capital}`,
          desc: `Derrota a la guarnición de ${c.capital} (${Math.round(this.armies.groupStrength(garrison)).toLocaleString('es')} soldados) para conquistar ${c.name}.`,
          reward: 500 + c.difficulty * 450, timeLeft: -1, initial: this.armies.groupStrength(garrison),
        });
        this.hud.toast(`Nuevo desafío: ${c.capital} está defendida. Conquístala y recibirás tributo.`, 6000);
      }
    }
  }

  private updateChallenges(dt: number): void {
    // Emboscadas y hordas periódicas
    this.ambushTimer -= dt;
    const p = this.armies.player;
    const pStr = this.armies.playerStrength();
    if (this.ambushTimer <= 0 && pStr > 0) {
      this.ambushTimer = 55 + Math.random() * 50;
      const horde = pStr > 4000 && Math.random() < 0.35;
      const ratio = horde ? 1.6 + Math.random() * 1.2 : 0.45 + Math.random() * 0.7;
      const total = Math.max(120, Math.round(pStr * ratio));
      const ang = Math.random() * Math.PI * 2, dist = horde ? 220 : 110;
      const [x, z] = this.map.nearestLand(
        THREE.MathUtils.clamp(p.x + Math.cos(ang) * dist, 2, MAP_W - 3),
        THREE.MathUtils.clamp(p.z + Math.sin(ang) * dist, 2, MAP_H - 3),
      );
      const faction = Math.floor(Math.random() * 3) as FactionId;
      const c = this.map.countryAt(x, z);
      const g = this.armies.spawnArmy(x, z, faction, total, c ? c.id : -1, 1, this.nextChallengeId);
      g.state = GroupState.Hunt; g.timer = 999;
      const fname = FACTIONS[faction].demonym;
      const ch: Challenge = {
        id: this.nextChallengeId++, kind: horde ? 'horde' : 'ambush', groupId: g.id, country: c ? c.id : -1,
        title: horde ? `¡Horda ${fname}!` : `Emboscada ${fname}`,
        desc: horde
          ? `Una horda de ${total.toLocaleString('es')} ${fname} marcha contra ti. Resiste o huye.`
          : `${total.toLocaleString('es')} ${fname} te tienden una emboscada. Derrótalos antes de que acabe el tiempo.`,
        reward: Math.round((horde ? 300 : 120) + total * (horde ? 0.9 : 0.5)), timeLeft: horde ? 240 : 150, initial: total,
      };
      this.challenges.push(ch);
      this.hud.toast(`${horde ? '⚠️' : '⚔️'} ${ch.title}: ${ch.desc}`, 6000);
    }
    for (const ch of [...this.challenges]) {
      const g = this.armies.groups.get(ch.groupId);
      if (!g) {
        // Grupo eliminado: desafío completado
        this.gold += ch.reward;
        this.challenges.splice(this.challenges.indexOf(ch), 1);
        if (ch.kind === 'garrison') {
          this.conquered.add(ch.country);
          const c = COUNTRIES[ch.country];
          this.hud.toast(`🏛️ ¡${c.name} conquistado! +${ch.reward} oro y tributo de ${c.difficulty * 2} oro/s.`, 7000);
          if (this.conquered.size === COUNTRIES.length) this.hud.toast('🌎 ¡Has unificado toda Sudamérica bajo tu estandarte! Sigue jugando para defenderla.', 12000);
        } else {
          this.hud.toast(`✅ ${ch.title} superada: +${ch.reward} oro.`, 5000);
        }
        continue;
      }
      if (ch.timeLeft > 0) {
        ch.timeLeft -= dt;
        if (ch.timeLeft <= 0) {
          this.challenges.splice(this.challenges.indexOf(ch), 1);
          g.challenge = -1; g.timer = 0;
          this.hud.toast(`⏱️ ${ch.title}: tiempo agotado. El enemigo sigue merodeando.`, 4000);
        }
      }
    }
  }

  // ------------------------------------------------------------------ acciones del jugador
  buyBattalion(tier: number): boolean {
    const cost = TIER_COST[tier];
    if (this.gold < cost) { this.hud.toast('Oro insuficiente.', 2000); return false; }
    const p = this.armies.player;
    const i = this.armies.spawn(p.x, p.z, this.armies.playerFaction, Owner.Player, TIER_SIZES[tier], 0);
    if (i < 0) { this.hud.toast('Límite de batallones alcanzado.', 2000); return false; }
    this.gold -= cost;
    this.hud.toast(`${FACTIONS[this.armies.playerFaction].unitNames[tier]} reclutada.`, 2000);
    return true;
  }

  buyUpgrade(kind: 'attack' | 'defense' | 'morale'): boolean {
    const lvl = this.armies.upgrades[kind];
    if (lvl >= 5) return false;
    const cost = 900 * (lvl + 1) * (lvl + 1);
    if (this.gold < cost) { this.hud.toast('Oro insuficiente.', 2000); return false; }
    this.gold -= cost;
    this.armies.upgrades[kind]++;
    return true;
  }

  refillCost(): number {
    let missing = 0;
    for (const i of this.armies.player.members) missing += this.armies.maxCount[i] - this.armies.count[i];
    return Math.ceil(missing * 2.2);
  }
  refill(): boolean {
    const cost = this.refillCost();
    if (cost <= 0) return false;
    if (this.gold < cost) { this.hud.toast('Oro insuficiente.', 2000); return false; }
    this.gold -= cost;
    for (const i of this.armies.player.members) this.armies.count[i] = this.armies.maxCount[i];
    return true;
  }

  /** Fusiona batallones pequeños del mismo tamaño nominal para reducir el número de unidades. */
  mergeBattalions(): void {
    const a = this.armies;
    const small = a.player.members.filter((i) => a.maxCount[i] <= 1000).sort((p, q) => a.count[p] - a.count[q]);
    let merged = 0;
    while (small.length >= 2) {
      const i = small.shift()!, j = small.shift()!;
      const total = a.count[i] + a.count[j];
      a.count[j] = total; a.maxCount[j] = Math.max(a.maxCount[j], total);
      a.kill(i); merged++;
      small.push(j); small.sort((p, q) => a.count[p] - a.count[q]);
      if (a.player.members.length <= 6) break;
    }
    if (merged) this.hud.toast(`${merged} fusiones realizadas.`, 2000);
  }

  useSpecial(): void {
    const a = this.armies;
    if (a.specialCooldown > 0) return;
    const f = FACTIONS[a.playerFaction];
    a.specialT = f.special.duration;
    a.specialCooldown = f.special.cooldown;
    if (a.playerFaction === FactionId.RapaNui) a.moai.push({ x: a.player.x, z: a.player.z, t: f.special.duration });
    if (a.playerFaction === FactionId.Incas) for (const i of a.player.members) a.morale[i] = Math.min(1, a.morale[i] + 0.3);
    this.hud.toast(`${f.emoji} ${f.special.name}!`, 2000);
  }

  toggleAggressive(): void { this.aggressive = !this.aggressive; }

  toggleStrategic(): void {
    this.strategic = !this.strategic;
    if (this.strategic) {
      this.savedView = [this.targetDist, this.camPitch, this.camYaw];
      this.targetDist = 1500; this.camPitch = 1.5; this.camYaw = 0; // norte arriba
    } else if (this.savedView) {
      [this.targetDist, this.camPitch, this.camYaw] = this.savedView;
    }
  }
  isStrategic(): boolean { return this.strategic; }

  // ------------------------------------------------------------------ guardado
  save(): void {
    const a = this.armies;
    const data: SaveData = {
      v: 1, faction: a.playerFaction, gold: Math.floor(this.gold), upgrades: a.upgrades,
      battalions: a.player.members.map((i) => Math.round(a.count[i])),
      px: a.player.x, pz: a.player.z,
      conquered: [...this.conquered], visited: [...this.visited], kills: this.kills, playTime: this.playTime, quality: this.quality,
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* sin almacenamiento */ }
  }
  static load(): SaveData | null {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      return s ? (JSON.parse(s) as SaveData) : null;
    } catch { return null; }
  }
  static clearSave(): void { try { localStorage.removeItem(SAVE_KEY); } catch { /* */ } }
}
