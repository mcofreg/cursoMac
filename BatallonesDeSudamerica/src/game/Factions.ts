/** Definición de las tres civilizaciones. Poder medio equivalente, estilos distintos. */
export const enum FactionId { Romanos = 0, Incas = 1, RapaNui = 2 }

export interface Faction {
  id: FactionId;
  name: string;
  demonym: string;
  emoji: string;
  /** Color principal (HUD, puntos lejanos) */
  color: string;
  colorRGB: [number, number, number];
  attack: number;
  defense: number;
  speed: number;
  /** Alcance de ataque en unidades del mundo */
  range: number;
  /** Multiplicador de daño a distancia (si range > 3) */
  rangedMul: number;
  morale: number;
  /** Separación entre soldados y forma de la formación */
  spacing: number;
  formation: 'cerrada' | 'suelta' | 'medialuna';
  weapons: string;
  style: string;
  special: { name: string; desc: string; cooldown: number; duration: number };
  unitNames: [string, string, string];
}

export const FACTIONS: Faction[] = [
  {
    id: FactionId.Romanos,
    name: 'Legiones Romanas',
    demonym: 'romanos',
    emoji: '🦅',
    color: '#d62828',
    colorRGB: [0.84, 0.16, 0.16],
    attack: 1.0, defense: 1.35, speed: 0.85, range: 4, rangedMul: 0.8, morale: 1.2,
    spacing: 1.05, formation: 'cerrada',
    weapons: 'Scutum, gladius y pilum',
    style: 'Muro de escudos disciplinado. Lentos pero casi imposibles de romper. Abren cada combate con una lluvia de pilum.',
    special: { name: 'Testudo', desc: 'Formación tortuga: defensa ×2, velocidad y ataque reducidos durante 10 s.', cooldown: 30, duration: 10 },
    unitNames: ['Centuria', 'Cohorte', 'Legión'],
  },
  {
    id: FactionId.Incas,
    name: 'Ejército del Tawantinsuyu',
    demonym: 'incas',
    emoji: '☀️',
    color: '#f4a300',
    colorRGB: [0.96, 0.64, 0.0],
    attack: 1.1, defense: 0.9, speed: 1.25, range: 16, rangedMul: 0.55, morale: 1.0,
    spacing: 1.6, formation: 'suelta',
    weapons: 'Warak’a (honda), macana estrellada y escudo de caña',
    style: 'Guerreros veloces de altura. Hostigan con hondas desde lejos y rematan con macanas. Frágiles en el choque directo.',
    special: { name: 'Carrera Chasqui', desc: 'Velocidad ×1.9 durante 6 s para envolver o escapar.', cooldown: 25, duration: 6 },
    unitNames: ['Pachaka (100)', 'Waranqa (1000)', 'Hunu (10 000)'],
  },
  {
    id: FactionId.RapaNui,
    name: 'Guerreros de Rapa Nui',
    demonym: 'rapanui',
    emoji: '🗿',
    color: '#2ec4b6',
    colorRGB: [0.18, 0.77, 0.71],
    attack: 1.35, defense: 1.0, speed: 1.0, range: 6, rangedMul: 0.9, morale: 1.1,
    spacing: 1.35, formation: 'medialuna',
    weapons: 'Mata’a de obsidiana, paoa y ua ceremonial',
    style: 'Lanceros feroces en media luna. Golpe inicial devastador con lanzas de obsidiana; protegidos por el mana de los moái.',
    special: { name: 'Mana del Moái', desc: 'Un moái guardián aparece: moral y defensa ×1.5 para aliados cercanos durante 15 s.', cooldown: 35, duration: 15 },
    unitNames: ['Mata (100)', 'Hanga (1000)', 'Hua’ai (10 000)'],
  },
];

/** Matriz piedra-papel-tijera: bonus de A contra B. */
export function matchup(a: FactionId, b: FactionId): number {
  if (a === b) return 1;
  // Romanos > Incas (armadura vs hondas), Incas > Rapa Nui (movilidad vs lanzas), Rapa Nui > Romanos (lanzas largas vs escudos)
  if ((a === FactionId.Romanos && b === FactionId.Incas) ||
      (a === FactionId.Incas && b === FactionId.RapaNui) ||
      (a === FactionId.RapaNui && b === FactionId.Romanos)) return 1.15;
  return 0.9;
}

export const TIER_SIZES = [100, 1000, 10000];
export const TIER_COST = [400, 3200, 26000];
