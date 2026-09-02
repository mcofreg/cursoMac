import { WorldMap, MAP_W, MAP_H, COUNTRIES } from '../world/SouthAmerica';
import { FACTIONS, FactionId, matchup } from '../game/Factions';

export const MAX_BAT = 4096;
export const enum Owner { Player = 0, AI = 1 }
export const enum BState { Idle = 0, Move = 1, Fight = 2, Rout = 3 }
export const enum GroupState { Patrol = 0, Hunt = 1, Hold = 2, Flee = 3 }

export interface Group {
  id: number;
  members: number[];
  x: number; z: number; heading: number;
  tx: number; tz: number;
  state: GroupState;
  country: number;
  timer: number;
  /** Bonus de dificultad (multiplica ataque/defensa) */
  power: number;
  /** Identificador de desafío al que pertenece (o -1) */
  challenge: number;
  isGarrison: boolean;
}

export interface CombatEvent { x: number; z: number; kind: 'melee' | 'ranged' | 'death'; faction: number; fromX?: number; fromZ?: number; intensity: number }

export function headingFromDir(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/**
 * Estado de todos los batallones en arreglos planos (SoA) para poder subirlos a la GPU
 * como textura en cada frame y simular miles de batallones sin coste de objetos.
 */
export class Armies {
  readonly x = new Float32Array(MAX_BAT);
  readonly z = new Float32Array(MAX_BAT);
  readonly heading = new Float32Array(MAX_BAT);
  readonly count = new Float32Array(MAX_BAT);
  readonly maxCount = new Float32Array(MAX_BAT);
  readonly faction = new Uint8Array(MAX_BAT);
  readonly owner = new Uint8Array(MAX_BAT);
  readonly state = new Uint8Array(MAX_BAT);
  readonly alive = new Uint8Array(MAX_BAT);
  readonly morale = new Float32Array(MAX_BAT);
  readonly tx = new Float32Array(MAX_BAT);
  readonly tz = new Float32Array(MAX_BAT);
  readonly moving = new Float32Array(MAX_BAT);
  readonly group = new Int16Array(MAX_BAT);
  readonly engageT = new Float32Array(MAX_BAT);
  readonly routT = new Float32Array(MAX_BAT);
  readonly target = new Int16Array(MAX_BAT).fill(-1);
  readonly lastHitBy = new Int8Array(MAX_BAT).fill(-1);
  /** Fracción de daño acumulado no entero (para restar soldados enteros) */
  readonly dmgAcc = new Float32Array(MAX_BAT);
  private free: number[] = [];
  high = 0;
  liveCount = 0;

  groups = new Map<number, Group>();
  private nextGroup = 1;
  readonly player: Group = { id: 0, members: [], x: 0, z: 0, heading: 0, tx: 0, tz: 0, state: GroupState.Hold, country: -1, timer: 0, power: 1, challenge: -1, isGarrison: false };
  playerFaction: FactionId = FactionId.Romanos;
  /** Mejoras del jugador (niveles 0..3) */
  upgrades = { attack: 0, defense: 0, morale: 0 };
  /** Habilidad especial activa (segundos restantes) */
  specialT = 0;
  specialCooldown = 0;
  /** Puntos donde hay tótems moái activos */
  moai: { x: number; z: number; t: number }[] = [];
  /** Cola de eventos visuales del frame */
  events: CombatEvent[] = [];
  /** Oro ganado este frame por el jugador */
  goldEarned = 0;
  killsThisFrame = 0;
  playerLossesThisFrame = 0;
  totalSoldiers = 0;
  rnd: () => number;

  private grid = new Map<number, number[]>();

  constructor(public map: WorldMap, seed = 7) {
    let s = seed >>> 0;
    this.rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    this.groups.set(0, this.player);
  }

  spawn(x: number, z: number, faction: FactionId, owner: Owner, count: number, groupId: number): number {
    let i: number;
    if (this.free.length) i = this.free.pop()!;
    else if (this.high < MAX_BAT) i = this.high++;
    else return -1;
    [x, z] = this.map.nearestLand(x, z);
    this.x[i] = x; this.z[i] = z; this.tx[i] = x; this.tz[i] = z;
    this.heading[i] = 0;
    this.count[i] = count; this.maxCount[i] = count;
    this.faction[i] = faction; this.owner[i] = owner;
    this.state[i] = BState.Idle; this.alive[i] = 1;
    this.morale[i] = 1; this.moving[i] = 0; this.engageT[i] = 0; this.routT[i] = 0;
    this.target[i] = -1; this.lastHitBy[i] = -1; this.dmgAcc[i] = 0;
    this.group[i] = groupId;
    const g = this.groups.get(groupId);
    if (g) g.members.push(i);
    this.liveCount++;
    return i;
  }

  kill(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0; this.count[i] = 0;
    this.free.push(i);
    this.liveCount--;
    const g = this.groups.get(this.group[i]);
    if (g) {
      const k = g.members.indexOf(i);
      if (k >= 0) g.members.splice(k, 1);
      if (g.members.length === 0 && g.id !== 0) this.groups.delete(g.id);
    }
  }

  newGroup(x: number, z: number, country: number, power = 1, challenge = -1, isGarrison = false): Group {
    const g: Group = { id: this.nextGroup++, members: [], x, z, heading: 0, tx: x, tz: z, state: isGarrison ? GroupState.Hold : GroupState.Patrol, country, timer: this.rnd() * 5, power, challenge, isGarrison };
    this.groups.set(g.id, g);
    return g;
  }

  /** Crea un ejército de IA con `total` soldados repartidos en batallones. */
  spawnArmy(x: number, z: number, faction: FactionId, total: number, country: number, power = 1, challenge = -1, isGarrison = false): Group {
    const g = this.newGroup(x, z, country, power, challenge, isGarrison);
    let remaining = total;
    const size = total >= 60000 ? 10000 : total >= 8000 ? 2000 : total >= 3000 ? 1000 : total >= 800 ? 200 : 100;
    while (remaining > 0 && g.members.length < 40) {
      const c = Math.min(remaining, size);
      remaining -= c;
      const ang = this.rnd() * Math.PI * 2, r = this.rnd() * 10;
      this.spawn(x + Math.cos(ang) * r, z + Math.sin(ang) * r, faction, Owner.AI, c, g.id);
    }
    return g;
  }

  playerStrength(): number {
    let s = 0;
    for (const i of this.player.members) s += this.count[i];
    return s;
  }
  groupStrength(g: Group): number {
    let s = 0;
    for (const i of g.members) s += this.count[i];
    return s;
  }

  // ------------------------------------------------------------------ formaciones
  /** Ancho aproximado del frente de un batallón. */
  /** Separación efectiva: los batallones grandes se compactan (mismo cálculo que el shader). */
  spacing(i: number): number {
    const f = FACTIONS[this.faction[i]];
    return f.spacing * Math.min(1, Math.max(0.6, Math.pow(400 / Math.max(1, this.count[i]), 0.15)));
  }
  frontWidth(i: number): number {
    return Math.ceil(Math.sqrt(this.count[i] * 1.8)) * this.spacing(i);
  }
  depth(i: number): number {
    const cols = Math.max(1, Math.ceil(Math.sqrt(this.count[i] * 1.8)));
    return Math.ceil(this.count[i] / cols) * this.spacing(i);
  }

  /** Coloca objetivos de cada batallón alrededor del ancla del grupo (líneas sucesivas). */
  private layoutGroup(g: Group): void {
    // Ancho máximo del frente: crece con el tamaño del ejército para que el grupo sea aproximadamente cuadrado.
    let area = 0;
    for (const i of g.members) area += (this.frontWidth(i) + 3) * (this.depth(i) + 3);
    const maxWidth = Math.max(g.id === 0 ? 70 : 90, Math.sqrt(area) * 1.25);
    const gap = 3;
    const cosH = Math.cos(g.heading), sinH = Math.sin(g.heading);
    let rowW = 0, rowD = 0, back = 0;
    const row: number[] = [];
    const flush = () => {
      if (!row.length) return;
      let cx = -(rowW - gap) / 2;
      for (const i of row) {
        const w = this.frontWidth(i);
        const lx = cx + w / 2, lz = back;
        // rotación por heading (mismo convenio que el shader)
        this.tx[i] = g.x + lx * cosH + lz * sinH;
        this.tz[i] = g.z - lx * sinH + lz * cosH;
        cx += w + gap;
      }
      back += rowD + gap;
      row.length = 0; rowW = 0; rowD = 0;
    };
    for (const i of g.members) {
      const w = this.frontWidth(i);
      if (rowW + w > maxWidth && row.length) flush();
      row.push(i);
      rowW += w + gap;
      rowD = Math.max(rowD, this.depth(i));
    }
    flush();
  }

  // ------------------------------------------------------------------ actualización
  private rebuildGrid(): void {
    this.grid.clear();
    for (let i = 0; i < this.high; i++) {
      if (!this.alive[i]) continue;
      const key = (Math.floor(this.x[i] / 48) << 8) | Math.floor(this.z[i] / 48);
      let arr = this.grid.get(key);
      if (!arr) { arr = []; this.grid.set(key, arr); }
      arr.push(i);
    }
  }
  private nearby(x: number, z: number, out: number[]): void {
    out.length = 0;
    const cx = Math.floor(x / 48), cz = Math.floor(z / 48);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const arr = this.grid.get(((cx + dx) << 8) | (cz + dz));
      if (arr) for (const i of arr) out.push(i);
    }
  }

  private tmp: number[] = [];

  update(dt: number, playerMoveX: number, playerMoveZ: number, aggressive: boolean): void {
    this.events.length = 0;
    this.goldEarned = 0; this.killsThisFrame = 0; this.playerLossesThisFrame = 0;
    this.rebuildGrid();
    if (this.specialT > 0) this.specialT -= dt;
    if (this.specialCooldown > 0) this.specialCooldown -= dt;
    for (const m of this.moai) m.t -= dt;
    this.moai = this.moai.filter((m) => m.t > 0);

    // --- Jugador: el ancla se mueve con el joystick.
    const pf = FACTIONS[this.playerFaction];
    const p = this.player;
    let pSpeed = 11 * pf.speed;
    if (this.specialT > 0) {
      if (this.playerFaction === FactionId.Incas) pSpeed *= 1.9;
      if (this.playerFaction === FactionId.Romanos) pSpeed *= 0.4;
    }
    const ml = Math.hypot(playerMoveX, playerMoveZ);
    if (ml > 0.05) {
      const k = Math.min(1, ml);
      let nx = p.x + (playerMoveX / ml) * k * pSpeed * dt;
      let nz = p.z + (playerMoveZ / ml) * k * pSpeed * dt;
      const b = this.map.biomeAt(nx, nz);
      if (b === 12) { nx = p.x + (nx - p.x) * 0.55; nz = p.z + (nz - p.z) * 0.55; } // río: más lento
      if (this.map.walkable(nx, nz)) { p.x = nx; p.z = nz; }
      else if (this.map.walkable(nx, p.z)) p.x = nx;
      else if (this.map.walkable(p.x, nz)) p.z = nz;
      p.x = Math.max(1, Math.min(MAP_W - 2, p.x)); p.z = Math.max(1, Math.min(MAP_H - 2, p.z));
      const target = headingFromDir(playerMoveX, playerMoveZ);
      let d = target - p.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.heading += d * Math.min(1, dt * 4);
    }
    this.layoutGroup(p);

    // --- Grupos de IA
    const pStr = this.playerStrength();
    for (const g of this.groups.values()) {
      if (g.id === 0) continue;
      g.timer -= dt;
      const gStr = this.groupStrength(g);
      const dPlayer = Math.hypot(p.x - g.x, p.z - g.z);
      const f = FACTIONS[this.faction[g.members[0]]];
      if (g.timer <= 0) {
        g.timer = 1.5 + this.rnd() * 2;
        if (g.isGarrison) {
          g.state = dPlayer < 60 ? GroupState.Hunt : GroupState.Hold;
        } else if (dPlayer < 220 && gStr >= pStr * 0.6 && (gStr <= pStr * 8 || pStr >= 3000)) {
          // Cazan si son competitivos; las grandes hordas ignoran a ejércitos insignificantes.
          g.state = GroupState.Hunt;
        } else if (dPlayer < 100 && gStr < pStr * 0.35) {
          g.state = GroupState.Flee;
        } else if (g.state !== GroupState.Patrol || Math.hypot(g.tx - g.x, g.tz - g.z) < 12) {
          g.state = GroupState.Patrol;
          const [wx, wz] = this.map.randomLandPoint(g.country >= 0 ? g.country : null, this.rnd);
          // Patrulla dentro de un radio razonable de su posición.
          const ddx = wx - g.x, ddz = wz - g.z, l = Math.hypot(ddx, ddz) || 1;
          const r = Math.min(l, 140);
          const nx = g.x + (ddx / l) * r, nz = g.z + (ddz / l) * r;
          [g.tx, g.tz] = this.map.walkable(nx, nz) ? [nx, nz] : [wx, wz];
        }
      }
      let gx = g.tx, gz = g.tz, speed = 7 * f.speed;
      if (g.state === GroupState.Hunt) { gx = p.x; gz = p.z; speed = 8.5 * f.speed; }
      if (g.state === GroupState.Flee) { gx = g.x + (g.x - p.x); gz = g.z + (g.z - p.z); speed = 10 * f.speed; }
      if (g.state === GroupState.Hold) { gx = g.x; gz = g.z; }
      // Si algún miembro está combatiendo, el ancla espera.
      let fighting = false;
      for (const i of g.members) if (this.state[i] === BState.Fight) { fighting = true; break; }
      const dx = gx - g.x, dz = gz - g.z, l = Math.hypot(dx, dz);
      if (l > 2 && !fighting) {
        const step = Math.min(l, speed * dt);
        const nx = g.x + (dx / l) * step, nz = g.z + (dz / l) * step;
        if (this.map.walkable(nx, nz)) { g.x = nx; g.z = nz; }
        else if (this.map.walkable(nx, g.z)) g.x = nx;
        else if (this.map.walkable(g.x, nz)) g.z = nz;
        else { g.timer = 0; }
        const th = headingFromDir(dx, dz);
        let d = th - g.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
        g.heading += d * Math.min(1, dt * 3);
      }
      this.layoutGroup(g);
    }

    // --- Batallones: buscar enemigo, moverse, combatir.
    this.totalSoldiers = 0;
    const near = this.tmp;
    for (let i = 0; i < this.high; i++) {
      if (!this.alive[i]) continue;
      this.totalSoldiers += this.count[i];
      const fi = FACTIONS[this.faction[i]];
      const gi = this.groups.get(this.group[i])!;
      const isPlayer = this.owner[i] === Owner.Player;

      // Enemigo más cercano dentro del radio de percepción.
      let best = -1, bestD = 1e9;
      const aggro = isPlayer ? (aggressive ? 60 : 28) : 45;
      this.nearby(this.x[i], this.z[i], near);
      for (const j of near) {
        if (j === i || this.group[j] === this.group[i]) continue;
        if (this.owner[j] === Owner.AI && this.owner[i] === Owner.AI && this.faction[j] === this.faction[i]) continue; // misma civilización IA no se ataca
        const d = Math.hypot(this.x[j] - this.x[i], this.z[j] - this.z[i]);
        if (d < bestD) { bestD = d; best = j; }
      }
      const reach = fi.range + (this.frontWidth(i) + (best >= 0 ? this.frontWidth(best) : 0)) * 0.5;
      this.target[i] = best >= 0 && bestD < aggro + reach ? best : -1;

      // Rout (huida)
      if (this.state[i] === BState.Rout) {
        this.routT[i] -= dt;
        if (this.routT[i] <= 0) { this.state[i] = BState.Idle; this.morale[i] = 0.55; }
        else {
          const away = best >= 0 ? [this.x[i] - this.x[best], this.z[i] - this.z[best]] : [Math.cos(i), Math.sin(i)];
          const l = Math.hypot(away[0], away[1]) || 1;
          this.moveTowards(i, this.x[i] + (away[0] / l) * 30, this.z[i] + (away[1] / l) * 30, 12 * fi.speed, dt);
          this.moving[i] = 1;
          continue;
        }
      }

      // ¿Puede atacar?
      let inRange = false;
      if (this.target[i] >= 0) {
        inRange = bestD <= reach + 0.5;
      }
      const leashFromFormation = Math.hypot(this.tx[i] - this.x[i], this.tz[i] - this.z[i]);
      if (this.target[i] >= 0 && !inRange && leashFromFormation < (isPlayer ? 45 : 80)) {
        // Avanzar hacia el enemigo
        this.moveTowards(i, this.x[best], this.z[best], 9 * fi.speed * (isPlayer && this.specialT > 0 && this.playerFaction === FactionId.Incas ? 1.9 : 1), dt);
        this.state[i] = BState.Move;
      } else if (inRange) {
        this.state[i] = BState.Fight;
        this.moving[i] = Math.max(0, this.moving[i] - dt * 4);
        this.heading[i] = this.turnTo(this.heading[i], headingFromDir(this.x[best] - this.x[i], this.z[best] - this.z[i]), dt * 5);
        this.engageT[i] += dt;
        this.attack(i, best, bestD, dt);
      } else {
        this.engageT[i] = 0;
        // Volver a la formación
        let spd = (isPlayer ? 13.5 : 9.5) * fi.speed;
        if (isPlayer && this.specialT > 0 && this.playerFaction === FactionId.Incas) spd *= 1.9;
        if (isPlayer && this.specialT > 0 && this.playerFaction === FactionId.Romanos) spd *= 0.5;
        if (leashFromFormation > 0.6) {
          this.moveTowards(i, this.tx[i], this.tz[i], spd, dt);
          this.state[i] = BState.Move;
        } else {
          this.state[i] = BState.Idle;
          this.moving[i] = Math.max(0, this.moving[i] - dt * 4);
          this.heading[i] = this.turnTo(this.heading[i], gi.heading, dt * 3);
        }
        this.morale[i] = Math.min(1, this.morale[i] + dt * 0.06);
      }
    }

    // Bajas: aplicar daño acumulado y eliminar batallones destruidos.
    for (let i = 0; i < this.high; i++) {
      if (!this.alive[i]) continue;
      if (this.dmgAcc[i] >= 1) {
        const k = Math.floor(this.dmgAcc[i]);
        this.dmgAcc[i] -= k;
        const killed = Math.min(k, this.count[i]);
        this.count[i] -= killed;
        if (this.owner[i] === Owner.AI && this.lastHitBy[i] === Owner.Player) {
          this.goldEarned += killed * 1.0;
          this.killsThisFrame += killed;
        }
        if (this.owner[i] === Owner.Player) this.playerLossesThisFrame += killed;
      }
      if (this.count[i] < 1) {
        if (this.owner[i] === Owner.AI && this.lastHitBy[i] === Owner.Player) this.goldEarned += 40 + this.maxCount[i] * 0.3;
        this.events.push({ x: this.x[i], z: this.z[i], kind: 'death', faction: this.faction[i], intensity: Math.min(1, this.maxCount[i] / 2000) });
        this.kill(i);
      }
    }
  }

  private turnTo(h: number, target: number, k: number): number {
    let d = target - h; d = Math.atan2(Math.sin(d), Math.cos(d));
    return h + d * Math.min(1, k);
  }

  private moveTowards(i: number, tx: number, tz: number, speed: number, dt: number): void {
    const dx = tx - this.x[i], dz = tz - this.z[i];
    const l = Math.hypot(dx, dz);
    if (l < 0.01) return;
    const step = Math.min(l, speed * dt);
    let nx = this.x[i] + (dx / l) * step, nz = this.z[i] + (dz / l) * step;
    if (!this.map.walkable(nx, nz)) {
      if (this.map.walkable(nx, this.z[i])) nz = this.z[i];
      else if (this.map.walkable(this.x[i], nz)) nx = this.x[i];
      else { this.moving[i] = 0; return; }
    }
    this.x[i] = nx; this.z[i] = nz;
    this.moving[i] = Math.min(1, this.moving[i] + dt * 5);
    this.heading[i] = this.turnTo(this.heading[i], headingFromDir(dx, dz), dt * 6);
  }

  private attack(i: number, j: number, dist: number, dt: number): void {
    const fa = FACTIONS[this.faction[i]], fb = FACTIONS[this.faction[j]];
    const ga = this.groups.get(this.group[i])!, gb = this.groups.get(this.group[j])!;
    const isPlayerA = this.owner[i] === Owner.Player, isPlayerB = this.owner[j] === Owner.Player;
    let atk = fa.attack * (isPlayerA ? 1 + this.upgrades.attack * 0.12 : ga.power);
    let def = fb.defense * (isPlayerB ? 1 + this.upgrades.defense * 0.12 : gb.power);
    const melee = dist <= 3.5 + (this.frontWidth(i) + this.frontWidth(j)) * 0.5;
    let mul = matchup(fa.id, fb.id);
    if (!melee) mul *= fa.rangedMul;
    // Habilidades: pilum romano (primeros 3 s del choque), especial activo.
    if (fa.id === FactionId.Romanos && this.engageT[i] < 3) mul *= 1.8;
    if (fa.id === FactionId.RapaNui && this.engageT[i] < 2.5) mul *= 1.6;
    if (isPlayerA && this.specialT > 0) {
      if (this.playerFaction === FactionId.Romanos) mul *= 0.6;
    }
    if (isPlayerB && this.specialT > 0) {
      if (this.playerFaction === FactionId.Romanos) def *= 2.0;
      if (this.playerFaction === FactionId.RapaNui) def *= 1.5;
    }
    for (const m of this.moai) {
      if (isPlayerB && Math.hypot(m.x - this.x[j], m.z - this.z[j]) < 30) { def *= 1.3; break; }
    }
    if (this.state[j] === BState.Rout) def *= 0.6;
    const dmg = Math.pow(this.count[i], 0.85) * atk * mul * 0.06 * dt / def;
    this.dmgAcc[j] += dmg;
    this.lastHitBy[j] = this.owner[i];
    // Moral
    const ratio = dmg / Math.max(1, this.count[j]);
    const moraleMul = fb.morale * (isPlayerB ? 1 + this.upgrades.morale * 0.15 : 1);
    this.morale[j] -= (ratio * 2.2) / moraleMul;
    if (this.morale[j] < 0.22 && this.state[j] !== BState.Rout) {
      this.state[j] = BState.Rout;
      this.routT[j] = isPlayerB ? 4 : 7;
    }
    if (this.rnd() < dt * 6) {
      this.events.push({
        x: melee ? (this.x[i] + this.x[j]) / 2 : this.x[j], z: melee ? (this.z[i] + this.z[j]) / 2 : this.z[j],
        kind: melee ? 'melee' : 'ranged', faction: this.faction[i], fromX: this.x[i], fromZ: this.z[i],
        intensity: Math.min(1, this.count[i] / 1500),
      });
    }
  }

  // ------------------------------------------------------------------ población del mundo
  populateWorld(difficultyMul = 1): void {
    for (const c of COUNTRIES) {
      const nGroups = 2 + Math.round(c.difficulty * 1.2);
      for (let k = 0; k < nGroups; k++) {
        const [x, z] = this.map.randomLandPoint(c.id, this.rnd);
        const faction = Math.floor(this.rnd() * 3) as FactionId;
        const total = Math.round((80 + this.rnd() * 500 * c.difficulty) * difficultyMul);
        this.spawnArmy(x, z, faction, total, c.id, 0.9 + c.difficulty * 0.05);
      }
      // Grandes hordas que cruzan el continente (visibles desde el espacio)
      const hordes = 1 + Math.round(c.difficulty * 1.2);
      for (let k = 0; k < hordes; k++) {
        const [x, z] = this.map.randomLandPoint(c.id, this.rnd);
        const faction = Math.floor(this.rnd() * 3) as FactionId;
        const total = Math.round((4000 + this.rnd() * 10000 * c.difficulty) * difficultyMul);
        this.spawnArmy(x, z, faction, total, c.id, 0.9 + c.difficulty * 0.05);
      }
      // Guarnición en la capital
      const garrisonFaction = ((c.id + 1) % 3) as FactionId;
      const gTotal = Math.round((600 + c.difficulty * 2500) * difficultyMul);
      const [gx, gz] = this.map.nearestLand(c.cap[0], c.cap[1]);
      this.spawnArmy(gx, gz, garrisonFaction, gTotal, c.id, 1 + c.difficulty * 0.06, -1, true);
    }
  }

  /** Refuerzos periódicos para que el continente nunca quede vacío. */
  reinforce(conquered: Set<number>, playerStr: number): void {
    const byCountry = new Map<number, number>();
    for (const g of this.groups.values()) if (g.id !== 0) byCountry.set(g.country, (byCountry.get(g.country) ?? 0) + 1);
    for (const c of COUNTRIES) {
      if (conquered.has(c.id)) continue;
      const n = byCountry.get(c.id) ?? 0;
      if (n < 3 + c.difficulty) {
        const [x, z] = this.map.randomLandPoint(c.id, this.rnd);
        const faction = Math.floor(this.rnd() * 3) as FactionId;
        const total = Math.round(Math.max(300, Math.min(60000, playerStr * (0.3 + this.rnd() * 0.9))));
        this.spawnArmy(x, z, faction, total, c.id, 0.9 + c.difficulty * 0.05);
        return;
      }
    }
  }
}
