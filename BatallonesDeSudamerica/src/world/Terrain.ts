import * as THREE from 'three';
import { WorldMap, MAP_W, MAP_H, BIOME_COLORS, Biome } from './SouthAmerica';
import { hash01 } from '../util/Noise';

const CHUNK = 32;

/**
 * Terreno voxel estilo Minecraft.
 * - Chunks detallados (1 vóxel) alrededor del jugador, generados bajo demanda.
 * - Una malla gruesa (4 vóxeles) de todo el continente, siempre visible, para la vista estratégica.
 */
export class Terrain {
  readonly group = new THREE.Group();
  private chunks = new Map<string, THREE.Mesh>();
  private material: THREE.MeshStandardMaterial;
  private coarse!: THREE.Mesh;
  private lastCenter = [-9999, -9999];

  constructor(private map: WorldMap) {
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.0,
      flatShading: true,
    });
    this.buildCoarse();
  }

  private colorOf(x: number, z: number, biome: Biome, top: boolean, h: number): [number, number, number] {
    const base = BIOME_COLORS[biome];
    const v = 0.9 + hash01(x * 7 + z * 131) * 0.2;
    let r = base[0] * v, g = base[1] * v, b = base[2] * v;
    if (!top) {
      // Laterales: tierra/roca oscura, nieve en cumbres.
      if (biome === Biome.Snow) { r *= 0.85; g *= 0.87; b *= 0.92; }
      else if (biome === Biome.Beach || biome === Biome.Desert) { r *= 0.78; g *= 0.72; b *= 0.6; }
      else if (biome === Biome.Ocean) { r *= 0.8; g *= 0.85; b *= 0.9; }
      else {
        const rock = h > 14;
        r = rock ? 0.38 * v : 0.42 * v; g = rock ? 0.36 * v : 0.3 * v; b = rock ? 0.35 * v : 0.2 * v;
      }
    } else if (biome === Biome.Rainforest) {
      // Dosel: manchas de verde más claro/oscuro
      const k = hash01(x * 3 + z * 17);
      g *= 0.85 + k * 0.4; r *= 0.8 + k * 0.4;
    }
    return [r, g, b];
  }

  /** Construye la malla de columnas para una región con paso `step`. */
  private buildRegion(x0: number, z0: number, w: number, d: number, step: number, coarse: boolean): THREE.BufferGeometry | null {
    const pos: number[] = [], nor: number[] = [], col: number[] = [];
    const map = this.map;
    // Para la malla gruesa, precalcular el mínimo de cada bloque (queda siempre bajo el terreno detallado).
    let coarseH: Int8Array | null = null;
    const cw = Math.ceil(MAP_W / step), ch = Math.ceil(MAP_H / step);
    if (step > 1) {
      coarseH = new Int8Array(cw * ch).fill(127);
      for (let z = 0; z < MAP_H; z++) {
        const row = (z / step | 0) * cw;
        for (let x = 0; x < MAP_W; x++) {
          const v = map.height[z * MAP_W + x];
          const k = row + (x / step | 0);
          if (v < coarseH[k]) coarseH[k] = v;
        }
      }
    }
    const hAt = (x: number, z: number): number => {
      if (x < 0 || z < 0 || x >= MAP_W || z >= MAP_H) return -12;
      if (step === 1) return map.height[z * MAP_W + x];
      return coarseH![(z / step | 0) * cw + (x / step | 0)];
    };
    const pushQuad = (
      a: number[], b: number[], c: number[], dd: number[], n: number[], cA: number[], cB: number[], cC: number[], cD: number[],
    ) => {
      pos.push(...a, ...b, ...c, ...a, ...c, ...dd);
      for (let i = 0; i < 6; i++) nor.push(...n);
      col.push(...cA, ...cB, ...cC, ...cA, ...cC, ...cD);
    };
    for (let z = z0; z < z0 + d; z += step) {
      for (let x = x0; x < x0 + w; x += step) {
        if (x >= MAP_W || z >= MAP_H) continue;
        const h = hAt(x, z);
        const biome = map.biome[Math.min(MAP_H - 1, z) * MAP_W + Math.min(MAP_W - 1, x)] as Biome;
        const isWaterCell = biome === Biome.River || biome === Biome.Lake;
        if (!coarse && h < 0) continue; // el mar lo pinta la malla gruesa
        const top = h + 1;
        const y = isWaterCell ? top - 0.35 : top;
        const [r, g, b] = this.colorOf(x, z, biome, true, h);
        // Oclusión ambiental por vecinos más altos (por vértice).
        const hN = hAt(x, z - step), hS = hAt(x, z + step), hW = hAt(x - step, z), hE = hAt(x + step, z);
        const hNW = hAt(x - step, z - step), hNE = hAt(x + step, z - step), hSW = hAt(x - step, z + step), hSE = hAt(x + step, z + step);
        const ao = (s1: number, s2: number, c: number) => {
          const k = (s1 > h ? 1 : 0) + (s2 > h ? 1 : 0) + (c > h ? 1 : 0);
          return 1 - k * 0.16;
        };
        const aNW = ao(hN, hW, hNW), aNE = ao(hN, hE, hNE), aSW = ao(hS, hW, hSW), aSE = ao(hS, hE, hSE);
        const cc = (a: number) => [r * a, g * a, b * a];
        const X1 = x + step, Z1 = z + step;
        pushQuad([x, y, z], [x, y, Z1], [X1, y, Z1], [X1, y, z], [0, 1, 0], cc(aNW), cc(aSW), cc(aSE), cc(aNE));
        // Laterales: sólo donde el vecino es más bajo.
        const [sr, sg, sb] = this.colorOf(x, z, biome, false, h);
        const side = (nb: number, a: number[], b2: number[], c: number[], d2: number[], n: number[]) => {
          if (nb >= h) return;
          const bottom = nb + 1;
          const shade = 0.78;
          const darker = 0.6;
          const t = [sr * shade, sg * shade, sb * shade];
          const bo = [sr * darker, sg * darker, sb * darker];
          // a,b arriba; c,d abajo
          pos.push(a[0], top, a[2], c[0], bottom, c[2], d2[0], bottom, d2[2], a[0], top, a[2], d2[0], bottom, d2[2], b2[0], top, b2[2]);
          for (let i = 0; i < 6; i++) nor.push(...n);
          col.push(...t, ...bo, ...bo, ...t, ...bo, ...t);
        };
        side(hN, [X1, 0, z], [x, 0, z], [X1, 0, z], [x, 0, z], [0, 0, -1]);
        side(hS, [x, 0, Z1], [X1, 0, Z1], [x, 0, Z1], [X1, 0, Z1], [0, 0, 1]);
        side(hW, [x, 0, z], [x, 0, Z1], [x, 0, z], [x, 0, Z1], [-1, 0, 0]);
        side(hE, [X1, 0, Z1], [X1, 0, z], [X1, 0, Z1], [X1, 0, z], [1, 0, 0]);
      }
    }
    if (pos.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    return geo;
  }

  private buildCoarse(): void {
    const t0 = performance.now();
    const geo = this.buildRegion(0, 0, MAP_W, MAP_H, 4, true)!;
    this.coarse = new THREE.Mesh(geo, this.material);
    this.coarse.receiveShadow = true;
    this.coarse.frustumCulled = false;
    this.coarse.renderOrder = -1;
    this.group.add(this.coarse);
    // Fondo marino alrededor del mapa
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * 6, MAP_H * 6), new THREE.MeshStandardMaterial({ color: 0x12395c, roughness: 1 }));
    bed.rotateX(-Math.PI / 2);
    bed.position.set(MAP_W / 2, -9, MAP_H / 2);
    bed.renderOrder = -2;
    this.group.add(bed);
    console.info(`Malla continental: ${(geo.attributes.position.count / 3) | 0} triángulos en ${(performance.now() - t0).toFixed(0)} ms`);
  }

  /** Mantiene cargados los chunks detallados alrededor de (cx, cz). */
  update(cx: number, cz: number, radiusChunks: number): void {
    const ccx = Math.floor(cx / CHUNK), ccz = Math.floor(cz / CHUNK);
    if (ccx === this.lastCenter[0] && ccz === this.lastCenter[1]) return;
    this.lastCenter = [ccx, ccz];
    const keep = new Set<string>();
    let built = 0;
    for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
      for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
        const kx = ccx + dx, kz = ccz + dz;
        if (kx < 0 || kz < 0 || kx * CHUNK >= MAP_W || kz * CHUNK >= MAP_H) continue;
        const key = `${kx},${kz}`;
        keep.add(key);
        if (this.chunks.has(key) || built >= 6) continue; // máx. 6 chunks nuevos por frame
        const geo = this.buildRegion(kx * CHUNK, kz * CHUNK, CHUNK, CHUNK, 1, false);
        built++;
        if (!geo) { this.chunks.set(key, new THREE.Mesh()); continue; }
        const mesh = new THREE.Mesh(geo, this.material);
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        this.chunks.set(key, mesh);
        this.group.add(mesh);
      }
    }
    if (built >= 6) this.lastCenter = [-9999, -9999]; // seguir construyendo el próximo frame
    for (const [key, mesh] of this.chunks) {
      if (keep.has(key)) continue;
      this.group.remove(mesh);
      mesh.geometry?.dispose();
      this.chunks.delete(key);
    }
  }
}
