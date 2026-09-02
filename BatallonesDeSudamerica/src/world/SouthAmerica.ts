import { Noise2D, clamp, smoothstep } from '../util/Noise';

/** Dimensiones del mapa en vóxeles. Un vóxel ≈ 5 km reales. */
export const MAP_W = 1024;
export const MAP_H = 1472;
const LON0 = -82, LON1 = -34, LAT0 = -56, LAT1 = 13;

export function lonLatToXZ(lon: number, lat: number): [number, number] {
  return [
    ((lon - LON0) / (LON1 - LON0)) * MAP_W,
    ((LAT1 - lat) / (LAT1 - LAT0)) * MAP_H,
  ];
}

// Contorno aproximado del continente (lon, lat), en sentido horario desde La Guajira.
const COAST: [number, number][] = [
  [-71.7, 12.4], [-70, 11.7], [-68, 10.5], [-64, 10.6], [-62, 10.7], [-61.5, 10], [-60.5, 8.5],
  [-58.5, 7.5], [-55, 6], [-52, 4.5], [-51.5, 4], [-50, 0.5], [-48, -1], [-44, -2.5], [-41, -3],
  [-38.5, -3.7], [-35.2, -5.5], [-34.8, -7], [-35, -9], [-37, -11], [-38.5, -13], [-39, -16],
  [-39.5, -18], [-40, -20], [-41, -22], [-43, -23], [-44, -23.2], [-46.5, -24], [-48, -25.5],
  [-48.5, -28], [-49.5, -29.5], [-50.5, -31], [-52, -32.5], [-53.5, -33.7], [-54.5, -34.5],
  [-56, -34.9], [-58.4, -34.6], [-57, -36.5], [-57.5, -38], [-62, -39], [-63, -41], [-65, -42],
  [-64.5, -43], [-65.5, -45], [-67.5, -46], [-67, -47.5], [-68.5, -50], [-69, -52], [-68.5, -53],
  [-66, -55], [-68, -55], [-70, -54], [-72, -53.5], [-74, -52], [-75, -50], [-74.5, -47],
  [-73.5, -44], [-73.5, -41], [-73.5, -38], [-72.5, -36], [-71.6, -33], [-71.5, -30], [-71.3, -27],
  [-70.5, -24], [-70.2, -21], [-70.3, -18.3], [-71.5, -17.5], [-75, -15.5], [-77, -12],
  [-78.5, -9], [-80, -7], [-81.2, -5], [-80.5, -3.5], [-80.5, -2], [-80.9, -1], [-80, 0], [-79, 1],
  [-78.5, 2], [-77.5, 4], [-77.5, 6.5], [-77.2, 8], [-76.5, 8.5], [-75.5, 10], [-74.5, 11],
  [-72.5, 11.8],
];

// Columna vertebral de los Andes.
const ANDES: [number, number][] = [
  [-73, 11], [-75.5, 5], [-78, 0], [-77, -6], [-75, -12], [-70, -16], [-67.5, -20], [-69, -25],
  [-70, -30], [-70.5, -35], [-71.5, -40], [-72.5, -46], [-73, -51],
];

const AMAZONAS: [number, number][] = [
  [-77.5, -5], [-74, -4.5], [-70, -4], [-66, -3.2], [-62, -3.5], [-58, -2.6], [-55, -2.2], [-52, -1.6], [-50, -0.5],
];
const PARANA: [number, number][] = [
  [-52, -19], [-54, -22.5], [-56.5, -25.5], [-58.5, -28.5], [-59.5, -31.5], [-59, -33.5], [-57.5, -34.7],
];
const ORINOCO: [number, number][] = [[-70, 3.5], [-67, 6], [-64.5, 7.5], [-61.5, 8.4]];

export interface Country {
  id: number;
  name: string;
  capital: string;
  /** Posición de la capital (x, z) */
  cap: [number, number];
  /** Dificultad relativa 1..10 */
  difficulty: number;
  seeds: [number, number][];
  color: string;
}

type RawCountry = Omit<Country, 'id' | 'cap' | 'seeds'> & { capLL: [number, number]; seedsLL: [number, number][] };
const RAW_COUNTRIES: RawCountry[] = [
  { name: 'Colombia', capital: 'Bogotá', capLL: [-74.1, 4.6], difficulty: 1, seedsLL: [[-74, 4], [-72, 8], [-76, 2]], color: '#f2c14e' },
  { name: 'Venezuela', capital: 'Caracas', capLL: [-66.9, 10.5], difficulty: 2, seedsLL: [[-66, 8], [-63, 7]], color: '#e8743b' },
  { name: 'Las Guayanas', capital: 'Georgetown', capLL: [-58.2, 6.8], difficulty: 2, seedsLL: [[-57, 5], [-53, 4]], color: '#6ab04c' },
  { name: 'Ecuador', capital: 'Quito', capLL: [-78.5, -0.2], difficulty: 2, seedsLL: [[-78.5, -1.5]], color: '#f9e79f' },
  { name: 'Perú', capital: 'Cusco', capLL: [-72, -13.5], difficulty: 3, seedsLL: [[-75, -10], [-77.5, -6], [-72, -14]], color: '#e74c3c' },
  { name: 'Brasil', capital: 'Brasilia', capLL: [-47.9, -15.8], difficulty: 5, seedsLL: [[-60, -4], [-52, -6], [-45, -6], [-48, -12], [-42, -12], [-45, -18], [-50, -20], [-53, -27], [-40, -18]], color: '#27ae60' },
  { name: 'Bolivia', capital: 'La Paz', capLL: [-68.1, -16.5], difficulty: 4, seedsLL: [[-64.5, -17], [-66, -19.5]], color: '#c0392b' },
  { name: 'Paraguay', capital: 'Asunción', capLL: [-57.6, -25.3], difficulty: 4, seedsLL: [[-58, -23.5]], color: '#2980b9' },
  { name: 'Uruguay', capital: 'Montevideo', capLL: [-56.2, -34.9], difficulty: 5, seedsLL: [[-56, -33]], color: '#5dade2' },
  { name: 'Chile', capital: 'Santiago', capLL: [-70.7, -33.4], difficulty: 7, seedsLL: [[-70.3, -20], [-70.5, -27], [-71, -33], [-72.5, -40], [-73, -47], [-71, -52]], color: '#d35400' },
  { name: 'Argentina', capital: 'Buenos Aires', capLL: [-58.4, -34.6], difficulty: 8, seedsLL: [[-64, -27], [-63, -34], [-66, -40], [-68, -46], [-69, -51], [-58.5, -34.3], [-60, -30]], color: '#85c1e9' },
];

export const COUNTRIES: Country[] = RAW_COUNTRIES.map((c, i) => ({
  id: i,
  name: c.name,
  capital: c.capital,
  cap: lonLatToXZ(c.capLL[0], c.capLL[1]),
  difficulty: c.difficulty,
  seeds: c.seedsLL.map((s) => lonLatToXZ(s[0], s[1])),
  color: c.color,
}));

export const enum Biome {
  Ocean = 0, Beach, Rainforest, Savanna, Pampa, Steppe, Desert, Rock, Snow, Puna, DryCaribbean, Lake, River,
}

export const BIOME_COLORS: [number, number, number][] = [
  [0.16, 0.42, 0.62], // Ocean (fondo marino)
  [0.87, 0.80, 0.58], // Beach
  [0.13, 0.42, 0.14], // Rainforest
  [0.53, 0.60, 0.25], // Savanna
  [0.45, 0.66, 0.28], // Pampa
  [0.62, 0.58, 0.40], // Steppe
  [0.86, 0.72, 0.46], // Desert
  [0.46, 0.44, 0.42], // Rock
  [0.95, 0.96, 0.98], // Snow
  [0.60, 0.55, 0.36], // Puna
  [0.68, 0.68, 0.40], // DryCaribbean
  [0.20, 0.45, 0.70], // Lake
  [0.22, 0.48, 0.70], // River
];

export const BIOME_NAMES = [
  'Océano', 'Playa', 'Selva amazónica', 'Sabana', 'Pampa', 'Estepa patagónica', 'Desierto de Atacama',
  'Roca andina', 'Nieves eternas', 'Puna', 'Caribe seco', 'Lago', 'Río',
];

function distToPolyline(px: number, pz: number, pts: [number, number][], closed: boolean): number {
  let best = Infinity;
  const n = pts.length;
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const abx = b[0] - a[0], abz = b[1] - a[1];
    const l2 = abx * abx + abz * abz;
    let t = ((px - a[0]) * abx + (pz - a[1]) * abz) / (l2 || 1);
    t = clamp(t, 0, 1);
    const dx = px - (a[0] + abx * t), dz = pz - (a[1] + abz * t);
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function pointInPoly(px: number, pz: number, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    const hit = (zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-9) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/** Datos del mundo: alturas, biomas, países. */
export class WorldMap {
  readonly height = new Int8Array(MAP_W * MAP_H); // -12 (fondo marino) .. 60
  readonly biome = new Uint8Array(MAP_W * MAP_H);
  readonly country = new Uint8Array(MAP_W * MAP_H); // 255 = mar
  /** Textura de alturas normalizadas (0..255), solo tierra, para el shader de soldados. */
  readonly heightTex = new Uint8Array(new ArrayBuffer(MAP_W * MAP_H));
  readonly noise = new Noise2D(20260902);
  readonly coastXZ = COAST.map(([lo, la]) => lonLatToXZ(lo, la));
  private readonly andesXZ = ANDES.map(([lo, la]) => lonLatToXZ(lo, la));
  private readonly riversXZ = [AMAZONAS, PARANA, ORINOCO].map((r) => r.map(([lo, la]) => lonLatToXZ(lo, la)));
  readonly titicaca = lonLatToXZ(-69.3, -15.8);

  constructor() {
    this.generate();
  }

  private generate(): void {
    const t0 = performance.now();
    // 1) Campo de distancia a la costa en baja resolución.
    const S = 4;
    const cw = MAP_W / S, ch = MAP_H / S;
    const sdf = new Float32Array(cw * ch);
    const andes = new Float32Array(cw * ch);
    const river = new Float32Array(cw * ch);
    const ctry = new Uint8Array(cw * ch);
    for (let cz = 0; cz < ch; cz++) {
      for (let cx = 0; cx < cw; cx++) {
        const px = cx * S + S / 2, pz = cz * S + S / 2;
        const d = distToPolyline(px, pz, this.coastXZ, true);
        const inside = pointInPoly(px, pz, this.coastXZ);
        const idx = cz * cw + cx;
        sdf[idx] = inside ? d : -d;
        andes[idx] = distToPolyline(px, pz, this.andesXZ, false);
        let rd = Infinity;
        for (const r of this.riversXZ) rd = Math.min(rd, distToPolyline(px, pz, r, false));
        river[idx] = rd;
        // País: Voronoi de semillas.
        let best = Infinity, bc = 255;
        for (const c of COUNTRIES) {
          for (const s of c.seeds) {
            const dx = px - s[0], dz = pz - s[1];
            const dd = dx * dx + dz * dz;
            if (dd < best) { best = dd; bc = c.id; }
          }
        }
        ctry[idx] = bc;
      }
    }
    const sample = (arr: Float32Array, x: number, z: number) => {
      const fx = clamp(x / S - 0.5, 0, cw - 1.001), fz = clamp(z / S - 0.5, 0, ch - 1.001);
      const ix = Math.floor(fx), iz = Math.floor(fz);
      const tx = fx - ix, tz = fz - iz;
      const a = arr[iz * cw + ix], b = arr[iz * cw + ix + 1];
      const c = arr[(iz + 1) * cw + ix], d = arr[(iz + 1) * cw + ix + 1];
      return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    };

    const n = this.noise;
    const [tx, tz] = this.titicaca;
    for (let z = 0; z < MAP_H; z++) {
      const lat = LAT1 - (z / MAP_H) * (LAT1 - LAT0);
      for (let x = 0; x < MAP_W; x++) {
        const idx = z * MAP_W + x;
        const lon = LON0 + (x / MAP_W) * (LON1 - LON0);
        const d = sample(sdf, x, z) + n.fbm(x * 0.02, z * 0.02, 3) * 4; // costa irregular
        const dA = sample(andes, x, z);
        const dR = sample(river, x, z);
        const cId = ctry[Math.min(ch - 1, z >> 2) * cw + Math.min(cw - 1, x >> 2)];

        if (d < 0) {
          // Mar
          const depth = clamp(-d * 0.25, 1, 12);
          this.height[idx] = -Math.round(depth);
          this.biome[idx] = Biome.Ocean;
          this.country[idx] = 255;
          this.heightTex[idx] = 0;
          continue;
        }

        let h = 1 + smoothstep(0, 30, d) * 2.5;
        h += (n.fbm(x * 0.012, z * 0.012, 4) + 0.3) * 3.5; // colinas suaves
        // Andes
        const ridge = n.ridged(x * 0.022, z * 0.022, 3);
        const andesW = Math.exp(-((dA / 42) ** 2));
        h += andesW * (16 + ridge * 20);
        // Macizo brasileño y escudo guayanés
        const [bx, bz] = lonLatToXZ(-47, -18);
        const dBr = Math.hypot(x - bx, (z - bz) * 0.8);
        h += Math.exp(-((dBr / 320) ** 2)) * (7 + n.fbm(x * 0.03, z * 0.03, 3) * 4);
        const [gx, gz] = lonLatToXZ(-60, 4);
        const dGu = Math.hypot(x - gx, z - gz);
        h += Math.exp(-((dGu / 130) ** 2)) * (7 + n.fbm(x * 0.04, z * 0.04, 3) * 5);
        // Patagonia: mesetas escalonadas
        if (lat < -38 && dA > 60) h += 3 + Math.floor((n.fbm(x * 0.02, z * 0.02, 2) + 1) * 2);

        let biome: Biome;
        const westOfAndes = lon < -70 - (lat + 20) * 0.02; // lado del Pacífico
        if (h > 40) biome = Biome.Snow;
        else if (h > 26) biome = Biome.Rock;
        else if (andesW > 0.35 && h > 12) biome = Biome.Puna;
        else if (lat < -17 && lat > -29 && westOfAndes && dA < 130) biome = Biome.Desert;
        else if (lat < -38) biome = h > 20 ? Biome.Rock : Biome.Steppe;
        else if (lat < -28) biome = Biome.Pampa;
        else if (lat > 8.5) biome = Biome.DryCaribbean;
        else if (lat > -16 && dA > 40 && h < 9) biome = Biome.Rainforest;
        else if (lat > -16 && dA > 40) biome = Biome.Rainforest;
        else biome = Biome.Savanna;
        if (d < 3.5 && h < 6) { biome = Biome.Beach; h = Math.min(h, 2); }
        if (lat < -50 && h > 14) biome = Biome.Snow;

        // Ríos: cauce a nivel 0
        const riverW = 5 + n.noise(x * 0.05, z * 0.05) * 1.5;
        if (dR < riverW && andesW < 0.4) {
          h = 0; biome = Biome.River;
        } else if (dR < riverW + 4 && andesW < 0.4) {
          h = Math.min(h, 1 + (dR - riverW) * 0.5);
        }
        // Lago Titicaca (a altura andina)
        const dT = Math.hypot(x - tx, z - tz);
        if (dT < 13) { biome = Biome.Lake; h = Math.max(1, Math.round(h)); }

        const hi = Math.round(clamp(h, biome === Biome.River ? 0 : 1, 60));
        this.height[idx] = hi;
        this.biome[idx] = biome;
        this.country[idx] = cId;
        this.heightTex[idx] = Math.max(0, hi);
      }
    }
    console.info(`Mundo generado en ${(performance.now() - t0).toFixed(0)} ms`);
  }

  h(x: number, z: number): number {
    const xi = Math.floor(x), zi = Math.floor(z);
    if (xi < 0 || zi < 0 || xi >= MAP_W || zi >= MAP_H) return -8;
    return this.height[zi * MAP_W + xi];
  }
  biomeAt(x: number, z: number): Biome {
    const xi = clamp(Math.floor(x), 0, MAP_W - 1), zi = clamp(Math.floor(z), 0, MAP_H - 1);
    return this.biome[zi * MAP_W + xi] as Biome;
  }
  countryAt(x: number, z: number): Country | null {
    const xi = Math.floor(x), zi = Math.floor(z);
    if (xi < 0 || zi < 0 || xi >= MAP_W || zi >= MAP_H) return null;
    const c = this.country[zi * MAP_W + xi];
    return c === 255 ? null : COUNTRIES[c];
  }
  /** ¿Se puede caminar? (tierra o río) */
  walkable(x: number, z: number): boolean {
    return this.h(x, z) >= 0;
  }
  /** Altura de la superficie donde pisan las unidades. */
  groundY(x: number, z: number): number {
    const h = this.h(x, z);
    return h < 0 ? 0.3 : h + 1;
  }
  /** Punto aleatorio caminable dentro de un país (o cualquier país si null). */
  randomLandPoint(countryId: number | null, rnd: () => number): [number, number] {
    for (let i = 0; i < 400; i++) {
      const x = rnd() * MAP_W, z = rnd() * MAP_H;
      const idx = Math.floor(z) * MAP_W + Math.floor(x);
      if (this.height[idx] < 1) continue;
      if (countryId !== null && this.country[idx] !== countryId) continue;
      return [x, z];
    }
    const c = countryId !== null ? COUNTRIES[countryId] : COUNTRIES[0];
    return [c.cap[0], c.cap[1]];
  }
  /** Ajusta un punto para que caiga en tierra (búsqueda en espiral). */
  nearestLand(x: number, z: number): [number, number] {
    if (this.walkable(x, z)) return [x, z];
    for (let r = 1; r < 60; r++) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const nx = x + Math.cos(ang) * r, nz = z + Math.sin(ang) * r;
        if (this.walkable(nx, nz)) return [nx, nz];
      }
    }
    return [COUNTRIES[0].cap[0], COUNTRIES[0].cap[1]];
  }
}
