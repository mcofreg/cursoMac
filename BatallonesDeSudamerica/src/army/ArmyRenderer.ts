import * as THREE from 'three';
import { Armies, MAX_BAT, CombatEvent } from './Army';
import { FACTIONS, FactionId } from '../game/Factions';
import { WorldMap, MAP_W, MAP_H } from '../world/SouthAmerica';

/**
 * Renderizado de soldados 100% en GPU.
 * La CPU sólo sube una textura con los datos de cada batallón (posición, rumbo, cantidad, facción...).
 * Cada instancia conoce su batallón y su puesto en la formación, y calcula su posición en el vertex shader,
 * apoyándose en la textura de alturas del terreno. Tres niveles de detalle:
 *   A) soldado voxel completo animado,  B) soldado simple,  C) puntos (cada punto = N soldados).
 */

const TEX_W = 128;
const TEX_H = (MAX_BAT * 2) / TEX_W;

const COMMON_GLSL = /* glsl */ `
uniform sampler2D uBat; uniform vec2 uBatSize;
uniform sampler2D uHeight; uniform vec2 uMapSize;
uniform float uTime; uniform float uSpacing; uniform float uAspect; uniform float uStyle;
attribute float aBat; attribute float aSlot; attribute float aPart;
vec4 fetchBat(float b, float k){
  float i = b * 2.0 + k;
  float x = mod(i, uBatSize.x); float y = floor(i / uBatSize.x);
  return texture2D(uBat, (vec2(x, y) + 0.5) / uBatSize);
}
float hsh(float n){ return fract(sin(n * 12.9898 + 78.233) * 43758.5453); }
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
void rotX(inout vec3 p, float pivotY, float a){
  vec2 d = vec2(p.y - pivotY, p.z); d = rot2(a) * d; p.y = d.x + pivotY; p.z = d.y;
}
float groundY(vec2 xz){
  float g = texture2D(uHeight, xz / uMapSize).r * 255.0;
  return g < 0.5 ? 0.7 : g + 1.0;
}
float effSpacing(float count){ return uSpacing * clamp(pow(400.0 / max(count, 1.0), 0.15), 0.6, 1.0); }
vec2 slotLocal(float slot, float count, float bat){
  float cols = max(1.0, ceil(sqrt(count * uAspect)));
  float row = floor(slot / cols); float col = mod(slot, cols);
  float sp = effSpacing(count);
  vec2 local = vec2(col - (cols - 1.0) * 0.5, row) * sp;
  float h1 = hsh(slot * 1.37 + bat * 0.113), h2 = hsh(slot * 3.71 + bat * 0.291);
  if (uStyle > 1.5) local.y += (local.x * local.x) / max(1.0, cols * sp * 1.6);
  if (uStyle > 0.5) local += (vec2(h1, h2) - 0.5) * sp * 0.7;
  return local;
}
`;

const SOLDIER_BEGIN = /* glsl */ `
vec4 b0 = fetchBat(aBat, 0.0);
vec4 b1 = fetchBat(aBat, 1.0);
float count = b0.w;
vec3 transformed = vec3(position);
bool isFlag = aPart >= 10.0;
if (count < 0.5 || (!isFlag && aSlot >= count)) {
  transformed = vec3(0.0, -5000.0, 0.0);
} else {
  vec2 local = isFlag ? vec2(0.0, -1.2) : slotLocal(aSlot, count, aBat);
  float hs = hsh(aSlot * 0.77 + aBat * 1.31);
  float moving = b1.z;
  float mode = b1.w; // 0 idle, 1 lucha, 2 huida
  float fight = (mode > 0.5 && mode < 1.5) ? 1.0 : 0.0;
  float ph = uTime * (mode > 1.5 ? 10.0 : 7.5) + hs * 6.283;
  float swing = sin(ph) * 0.65 * moving;
  float atk = sin(uTime * 9.0 + hs * 6.283);
  vec3 p = transformed;
  if (!isFlag) {
    if (aPart == 1.0) rotX(p, 0.78, swing);
    else if (aPart == 2.0) rotX(p, 0.78, -swing);
    else if (aPart == 3.0 || aPart == 7.0) rotX(p, 1.38, -swing * 0.8 - fight * 0.6);
    else if (aPart == 4.0 || aPart == 6.0) rotX(p, 1.38, swing * 0.8 - fight * (1.1 + atk * 0.8));
    p.y += abs(sin(ph)) * 0.07 * moving;
    if (mode > 1.5) rotX(p, 0.0, 0.25); // huida: inclinado hacia delante
  } else if (aPart == 11.0) {
    // tela de la bandera ondeando
    p.x += sin(uTime * 3.0 + p.y * 2.0 + aBat) * 0.12 * (p.z);
  }
  vec2 wl = rot2(b0.z) * local;
  vec2 xz = rot2(b0.z) * vec2(p.x, p.z);
  vec2 world = b0.xy + wl;
  transformed = vec3(world.x + xz.x, groundY(world + vec2(0.5)) + p.y, world.y + xz.y);
}
`;

const SOLDIER_NORMAL = /* glsl */ `
vec3 objectNormal = vec3(normal);
{
  vec4 nb0 = fetchBat(aBat, 0.0);
  vec2 nxz = rot2(nb0.z) * vec2(objectNormal.x, objectNormal.z);
  objectNormal = vec3(nxz.x, objectNormal.y, nxz.y);
}
`;

const SOLDIER_COLOR = /* glsl */ `
#include <color_vertex>
{
  vec4 cb1 = fetchBat(aBat, 1.0);
  float owner = cb1.y;
  vColor.rgb *= owner < 0.5 ? 1.12 : 0.92;
  if (aPart == 11.0) {
    int f = int(cb1.x + 0.5);
    vec3 fc = f == 0 ? vec3(0.84, 0.16, 0.16) : (f == 1 ? vec3(0.96, 0.64, 0.0) : vec3(0.18, 0.77, 0.71));
    vColor.rgb = fc * (owner < 0.5 ? 1.2 : 0.75);
  }
  if (aPart == 12.0) vColor.rgb = owner < 0.5 ? vec3(1.0, 0.85, 0.3) : vec3(0.25, 0.25, 0.28);
}
`;

interface Box { w: number; h: number; d: number; x: number; y: number; z: number; c: [number, number, number]; part: number }

function buildBoxes(boxes: Box[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], part: number[] = [];
  const faces: [number[], number[][]][] = [
    [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
    [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
    [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
    [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
    [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
  ];
  for (const b of boxes) {
    for (const [n, q] of faces) {
      const shade = n[1] > 0 ? 1.0 : n[1] < 0 ? 0.6 : n[2] !== 0 ? 0.85 : 0.75;
      const v = q.map(([sx, sy, sz]) => [b.x + (sx * b.w) / 2, b.y + (sy * b.h) / 2, b.z + (sz * b.d) / 2]);
      const idx = [0, 1, 2, 0, 2, 3];
      for (const k of idx) {
        pos.push(...v[k]); nor.push(...n); col.push(b.c[0] * shade, b.c[1] * shade, b.c[2] * shade); part.push(b.part);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  return g;
}

const SKIN: [number, number, number][] = [[0.85, 0.65, 0.5], [0.62, 0.42, 0.28], [0.55, 0.36, 0.22]];

/** Soldado detallado por facción (~14 cajas). Mira hacia -Z. */
function soldierGeometry(f: FactionId): THREE.BufferGeometry {
  const skin = SKIN[f];
  const B: Box[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: [number, number, number], part: number) => B.push({ w, h, d, x, y, z, c, part });
  // piernas (0.78 cadera)
  const legC: [number, number, number] = f === 0 ? [0.55, 0.15, 0.15] : f === 1 ? [0.35, 0.25, 0.2] : skin;
  box(0.22, 0.78, 0.26, -0.14, 0.39, 0, legC, 1);
  box(0.22, 0.78, 0.26, 0.14, 0.39, 0, legC, 2);
  if (f === 0) { // Legionario: túnica roja, lorica segmentata, casco con cresta, scutum, gladius
    box(0.56, 0.62, 0.34, 0, 1.09, 0, [0.72, 0.72, 0.78], 0);
    box(0.6, 0.18, 0.38, 0, 0.82, 0, [0.7, 0.12, 0.12], 0);
    box(0.18, 0.6, 0.2, -0.38, 1.1, 0, skin, 3);
    box(0.18, 0.6, 0.2, 0.38, 1.1, 0, skin, 4);
    box(0.34, 0.34, 0.34, 0, 1.6, 0, skin, 5);
    box(0.38, 0.2, 0.38, 0, 1.78, 0, [0.75, 0.75, 0.8], 5);
    box(0.08, 0.12, 0.42, 0, 1.95, -0.02, [0.85, 0.15, 0.1], 5);
    box(0.5, 0.9, 0.08, -0.5, 1.05, -0.22, [0.75, 0.15, 0.12], 7);
    box(0.12, 0.12, 0.08, -0.5, 1.05, -0.28, [0.85, 0.75, 0.3], 7);
    box(0.06, 0.06, 0.7, 0.4, 1.15, -0.4, [0.8, 0.8, 0.85], 6);
  } else if (f === 1) { // Guerrero inca: unku a cuadros, escudo de caña, macana, tocado de plumas, honda
    box(0.5, 0.62, 0.32, 0, 1.09, 0, [0.85, 0.45, 0.1], 0);
    box(0.52, 0.22, 0.34, 0, 1.28, 0, [0.15, 0.15, 0.3], 0);
    box(0.52, 0.16, 0.34, 0, 0.9, 0, [0.9, 0.85, 0.6], 0);
    box(0.16, 0.6, 0.18, -0.34, 1.1, 0, skin, 3);
    box(0.16, 0.6, 0.18, 0.34, 1.1, 0, skin, 4);
    box(0.34, 0.34, 0.34, 0, 1.6, 0, skin, 5);
    box(0.4, 0.12, 0.4, 0, 1.82, 0, [0.9, 0.2, 0.15], 5);
    box(0.1, 0.4, 0.1, 0, 2.05, 0.05, [0.95, 0.85, 0.2], 5);
    box(0.36, 0.36, 0.06, -0.42, 1.05, -0.2, [0.75, 0.6, 0.3], 7);
    box(0.05, 0.9, 0.05, 0.4, 1.0, -0.15, [0.4, 0.25, 0.12], 6);
    box(0.2, 0.14, 0.2, 0.4, 1.45, -0.15, [0.5, 0.5, 0.52], 6);
  } else { // Rapa Nui: torso desnudo con pintura blanca, taparrabo, tocado de plumas, mata'a
    box(0.54, 0.62, 0.32, 0, 1.09, 0, skin, 0);
    box(0.56, 0.1, 0.34, 0, 1.2, 0, [0.95, 0.95, 0.9], 0);
    box(0.56, 0.1, 0.34, 0, 0.98, 0, [0.95, 0.95, 0.9], 0);
    box(0.56, 0.18, 0.36, 0, 0.82, 0, [0.85, 0.75, 0.5], 0);
    box(0.17, 0.62, 0.19, -0.36, 1.1, 0, skin, 3);
    box(0.17, 0.62, 0.19, 0.36, 1.1, 0, skin, 4);
    box(0.34, 0.34, 0.34, 0, 1.6, 0, skin, 5);
    box(0.44, 0.1, 0.44, 0, 1.8, 0, [0.9, 0.9, 0.85], 5);
    box(0.5, 0.3, 0.1, 0, 2.0, -0.05, [0.95, 0.95, 0.95], 5);
    box(0.05, 1.7, 0.05, 0.4, 1.3, -0.1, [0.45, 0.3, 0.15], 6);
    box(0.14, 0.25, 0.08, 0.4, 2.25, -0.1, [0.1, 0.1, 0.12], 6);
    box(0.3, 0.5, 0.06, -0.42, 1.0, -0.2, [0.5, 0.35, 0.2], 7);
  }
  return buildBoxes(B);
}

/** Soldado simplificado (3 cajas) para distancias medias. */
function simpleSoldierGeometry(f: FactionId): THREE.BufferGeometry {
  const body: [number, number, number] = f === 0 ? [0.7, 0.18, 0.18] : f === 1 ? [0.85, 0.5, 0.12] : [0.6, 0.42, 0.28];
  const head: [number, number, number] = f === 0 ? [0.72, 0.72, 0.78] : f === 1 ? [0.9, 0.3, 0.2] : [0.92, 0.9, 0.85];
  return buildBoxes([
    { w: 0.44, h: 0.8, d: 0.3, x: 0, y: 0.4, z: 0, c: [0.3, 0.22, 0.18], part: 1 },
    { w: 0.6, h: 0.7, d: 0.34, x: 0, y: 1.15, z: 0, c: body, part: 0 },
    { w: 0.4, h: 0.5, d: 0.4, x: 0, y: 1.72, z: 0, c: head, part: 5 },
  ]);
}

function flagGeometry(): THREE.BufferGeometry {
  return buildBoxes([
    { w: 0.12, h: 4.2, d: 0.12, x: 0, y: 2.1, z: 0, c: [0.35, 0.22, 0.12], part: 10 },
    { w: 0.08, h: 1.4, d: 2.0, x: 0, y: 3.4, z: 1.05, c: [1, 1, 1], part: 11 },
    { w: 0.4, h: 0.4, d: 0.4, x: 0, y: 4.4, z: 0, c: [1, 0.85, 0.3], part: 12 },
  ]);
}

interface Tier {
  meshes: THREE.InstancedMesh[]; // por facción
  bat: Float32Array[]; slot: Float32Array[];
  used: number[];
  capacity: number;
}

export class ArmyRenderer {
  readonly group = new THREE.Group();
  private batData: Float32Array<ArrayBuffer>;
  private batTex: THREE.DataTexture;
  private heightTex: THREE.DataTexture;
  private uniforms: Record<string, THREE.IUniform>;
  private tierA: Tier;
  private tierB: Tier;
  private points: THREE.Points;
  private pBat: Float32Array; private pSlot: Float32Array; private pPer: Float32Array;
  private pointsCap: number;
  private flags: THREE.InstancedMesh;
  private flagBat: Float32Array;
  private assignTimer = 0;
  private order: number[] = [];
  private particles: Particles;
  private moaiMeshes: THREE.Mesh[] = [];
  private moaiGeo: THREE.BufferGeometry;
  private moaiMat: THREE.MeshStandardMaterial;

  constructor(private armies: Armies, map: WorldMap, quality: 0 | 1 | 2) {
    this.batData = new Float32Array(new ArrayBuffer(TEX_W * TEX_H * 4 * 4));
    this.batTex = new THREE.DataTexture(this.batData, TEX_W, TEX_H, THREE.RGBAFormat, THREE.FloatType);
    this.batTex.minFilter = THREE.NearestFilter; this.batTex.magFilter = THREE.NearestFilter;
    this.batTex.needsUpdate = true;
    this.heightTex = new THREE.DataTexture(map.heightTex, MAP_W, MAP_H, THREE.RedFormat, THREE.UnsignedByteType);
    this.heightTex.minFilter = THREE.NearestFilter; this.heightTex.magFilter = THREE.NearestFilter;
    this.heightTex.needsUpdate = true;
    this.uniforms = {
      uBat: { value: this.batTex }, uBatSize: { value: new THREE.Vector2(TEX_W, TEX_H) },
      uHeight: { value: this.heightTex }, uMapSize: { value: new THREE.Vector2(MAP_W, MAP_H) },
      uTime: { value: 0 },
    };
    const capA = [2500, 6000, 12000][quality];
    const capB = [10000, 30000, 60000][quality];
    this.pointsCap = [120000, 300000, 600000][quality];
    this.tierA = this.makeTier(capA, soldierGeometry, quality >= 1);
    this.tierB = this.makeTier(capB, simpleSoldierGeometry, false);

    // Nivel C: puntos
    this.pBat = new Float32Array(this.pointsCap); this.pSlot = new Float32Array(this.pointsCap); this.pPer = new Float32Array(this.pointsCap);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(this.pointsCap * 3), 3));
    // BufferAttribute (no Float32BufferAttribute): comparte el buffer en vez de copiarlo.
    pg.setAttribute('aBat', new THREE.BufferAttribute(this.pBat, 1));
    pg.setAttribute('aSlot', new THREE.BufferAttribute(this.pSlot, 1));
    pg.setAttribute('aPer', new THREE.BufferAttribute(this.pPer, 1));
    const pm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { ...this.uniforms, uScale: { value: 500 }, uSpacing: { value: 1.3 }, uAspect: { value: 1.8 }, uStyle: { value: 0 } },
      vertexShader: COMMON_GLSL + /* glsl */ `
        attribute float aPer; varying vec3 vCol; varying float vAlpha;
        uniform float uScale;
        void main(){
          vec4 b0 = fetchBat(aBat, 0.0); vec4 b1 = fetchBat(aBat, 1.0);
          float count = b0.w;
          if (count < 0.5 || aSlot >= count) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; return; }
          vec2 local = slotLocal(min(aSlot + aPer * 0.5, count - 1.0), count, aBat);
          vec2 world = b0.xy + rot2(b0.z) * local;
          float y = groundY(world + vec2(0.5)) + 1.0;
          vec4 mv = modelViewMatrix * vec4(world.x, y, world.y, 1.0);
          gl_Position = projectionMatrix * mv;
          float dia = sqrt(aPer) * effSpacing(count) * 0.9;
          float px = dia * uScale / max(1.0, -mv.z);
          gl_PointSize = clamp(px, 1.5, 14.0);
          vAlpha = clamp(px / 3.0, 0.3, 0.75);
          int f = int(b1.x + 0.5);
          vec3 fc = f == 0 ? vec3(0.95, 0.2, 0.18) : (f == 1 ? vec3(1.0, 0.7, 0.05) : vec3(0.2, 0.9, 0.85));
          vCol = b1.y < 0.5 ? mix(fc, vec3(1.0, 0.95, 0.6), 0.45) * 1.3 : fc;
          if (b1.w > 1.5) vCol *= 0.6;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying float vAlpha;
        void main(){
          vec2 d = gl_PointCoord - 0.5; float r = length(d);
          if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.25, r) * vAlpha;
          gl_FragColor = vec4(vCol, a);
        }`,
    });
    this.points = new THREE.Points(pg, pm);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.group.add(this.points);

    // Banderas
    const fg = flagGeometry();
    this.flagBat = new Float32Array(MAX_BAT);
    fg.setAttribute('aBat', new THREE.InstancedBufferAttribute(this.flagBat, 1));
    fg.setAttribute('aSlot', new THREE.InstancedBufferAttribute(new Float32Array(MAX_BAT), 1));
    const fm = this.makeMaterial(1.0, 1.8, 0);
    this.flags = new THREE.InstancedMesh(fg, fm, MAX_BAT);
    this.flags.castShadow = false;
    this.flags.frustumCulled = false;
    this.flags.count = 0;
    this.group.add(this.flags);

    this.particles = new Particles(map, 6000);
    this.group.add(this.particles.points);

    this.moaiGeo = buildBoxes([
      { w: 1.6, h: 1.2, d: 1.6, x: 0, y: 0.6, z: 0, c: [0.55, 0.32, 0.25], part: 0 },
      { w: 1.3, h: 4.2, d: 1.1, x: 0, y: 3.2, z: 0, c: [0.55, 0.5, 0.45], part: 0 },
      { w: 1.5, h: 0.5, d: 1.3, x: 0, y: 3.2, z: -0.1, c: [0.5, 0.45, 0.4], part: 0 },
      { w: 0.5, h: 1.6, d: 0.5, x: 0, y: 3.6, z: -0.75, c: [0.45, 0.4, 0.36], part: 0 },
      { w: 1.4, h: 0.8, d: 1.4, x: 0, y: 5.6, z: 0, c: [0.75, 0.25, 0.2], part: 0 },
    ]);
    this.moaiMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, emissive: new THREE.Color(0x2ec4b6), emissiveIntensity: 0.15 });
  }

  private makeMaterial(spacing: number, aspect: number, style: number): THREE.MeshLambertMaterial {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const extra = { uSpacing: { value: spacing }, uAspect: { value: aspect }, uStyle: { value: style } };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms, extra);
      shader.vertexShader = COMMON_GLSL + shader.vertexShader
        .replace('#include <begin_vertex>', SOLDIER_BEGIN)
        .replace('#include <beginnormal_vertex>', SOLDIER_NORMAL)
        .replace('#include <color_vertex>', SOLDIER_COLOR);
    };
    mat.customProgramCacheKey = () => `soldier${spacing}${aspect}${style}`;
    return mat;
  }

  private makeDepthMaterial(spacing: number, aspect: number, style: number): THREE.MeshDepthMaterial {
    const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    const extra = { uSpacing: { value: spacing }, uAspect: { value: aspect }, uStyle: { value: style } };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms, extra);
      shader.vertexShader = COMMON_GLSL + shader.vertexShader.replace('#include <begin_vertex>', SOLDIER_BEGIN);
    };
    mat.customProgramCacheKey = () => `soldierDepth${spacing}${aspect}${style}`;
    return mat;
  }

  private makeTier(capacity: number, geoFn: (f: FactionId) => THREE.BufferGeometry, shadows: boolean): Tier {
    const tier: Tier = { meshes: [], bat: [], slot: [], used: [0, 0, 0], capacity };
    for (let f = 0; f < 3; f++) {
      const fac = FACTIONS[f];
      const style = fac.formation === 'cerrada' ? 0 : fac.formation === 'suelta' ? 1 : 2;
      const geo = geoFn(f as FactionId);
      const bat = new Float32Array(capacity), slot = new Float32Array(capacity);
      geo.setAttribute('aBat', new THREE.InstancedBufferAttribute(bat, 1));
      geo.setAttribute('aSlot', new THREE.InstancedBufferAttribute(slot, 1));
      const mesh = new THREE.InstancedMesh(geo, this.makeMaterial(fac.spacing, 1.8, style), capacity);
      mesh.customDepthMaterial = this.makeDepthMaterial(fac.spacing, 1.8, style);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      tier.meshes.push(mesh); tier.bat.push(bat); tier.slot.push(slot);
      this.group.add(mesh);
    }
    return tier;
  }

  setShadows(on: boolean): void {
    for (const m of this.tierA.meshes) m.castShadow = on;
  }

  /** Reparte los puestos de cada batallón entre los niveles de detalle según distancia a la cámara. */
  private assign(camPos: THREE.Vector3): void {
    const a = this.armies;
    const order = this.order;
    order.length = 0;
    for (let i = 0; i < a.high; i++) if (a.alive[i]) order.push(i);
    const dist = new Float32Array(a.high);
    for (const i of order) dist[i] = Math.hypot(a.x[i] - camPos.x, a.z[i] - camPos.z, camPos.y * 0.7);
    order.sort((p, q) => dist[p] - dist[q]);

    const usedA = [0, 0, 0], usedB = [0, 0, 0];
    let usedP = 0, usedF = 0;
    const DA = 110, DB = 420;
    for (const i of order) {
      const f = a.faction[i];
      const d = dist[i];
      const count = a.count[i];
      let slot = 0;
      if (d < DA) {
        const n = Math.min(count, this.tierA.capacity - usedA[f]);
        const bat = this.tierA.bat[f], sl = this.tierA.slot[f];
        for (let k = 0; k < n; k++) { bat[usedA[f] + k] = i; sl[usedA[f] + k] = slot + k; }
        usedA[f] += n; slot += n;
      }
      if (d < DB && slot < count) {
        const n = Math.min(count - slot, this.tierB.capacity - usedB[f]);
        const bat = this.tierB.bat[f], sl = this.tierB.slot[f];
        for (let k = 0; k < n; k++) { bat[usedB[f] + k] = i; sl[usedB[f] + k] = slot + k; }
        usedB[f] += n; slot += n;
      }
      if (slot < count) {
        const per = d < DB ? 10 : d < 1400 ? 100 : 1000;
        const remaining = count - slot;
        const n = Math.min(Math.ceil(remaining / per), this.pointsCap - usedP);
        for (let k = 0; k < n; k++) { this.pBat[usedP + k] = i; this.pSlot[usedP + k] = slot + k * per; this.pPer[usedP + k] = per; }
        usedP += n;
      }
      if (d < 900 && usedF < MAX_BAT) { this.flagBat[usedF++] = i; }
    }
    for (let f = 0; f < 3; f++) {
      const ma = this.tierA.meshes[f], mb = this.tierB.meshes[f];
      ma.count = usedA[f]; mb.count = usedB[f];
      (ma.geometry.getAttribute('aBat') as THREE.InstancedBufferAttribute).needsUpdate = true;
      (ma.geometry.getAttribute('aSlot') as THREE.InstancedBufferAttribute).needsUpdate = true;
      (mb.geometry.getAttribute('aBat') as THREE.InstancedBufferAttribute).needsUpdate = true;
      (mb.geometry.getAttribute('aSlot') as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    this.points.geometry.setDrawRange(0, usedP);
    for (const n of ['aBat', 'aSlot', 'aPer']) (this.points.geometry.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true;
    this.flags.count = usedF;
    (this.flags.geometry.getAttribute('aBat') as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  update(dt: number, time: number, camera: THREE.PerspectiveCamera, viewportH: number): void {
    const a = this.armies;
    // Textura de batallones
    const d = this.batData;
    for (let i = 0; i < a.high; i++) {
      const o = i * 8;
      d[o] = a.x[i]; d[o + 1] = a.z[i]; d[o + 2] = a.heading[i]; d[o + 3] = a.alive[i] ? a.count[i] : 0;
      d[o + 4] = a.faction[i]; d[o + 5] = a.owner[i]; d[o + 6] = a.moving[i];
      d[o + 7] = a.state[i] === 2 ? 1 : a.state[i] === 3 ? 2 : 0;
    }
    this.batTex.needsUpdate = true;
    this.uniforms.uTime.value = time;
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = viewportH / (2 * Math.tan((camera.fov * Math.PI) / 360));

    this.assignTimer -= dt;
    if (this.assignTimer <= 0) {
      this.assignTimer = 0.12;
      this.assign(camera.position);
    }
    this.particles.setScale((this.points.material as THREE.ShaderMaterial).uniforms.uScale.value);
    this.particles.update(dt, a.events);

    // Moáis
    while (this.moaiMeshes.length < a.moai.length) {
      const m = new THREE.Mesh(this.moaiGeo, this.moaiMat);
      m.castShadow = true;
      this.group.add(m); this.moaiMeshes.push(m);
    }
    while (this.moaiMeshes.length > a.moai.length) { const m = this.moaiMeshes.pop()!; this.group.remove(m); }
    a.moai.forEach((mo, k) => {
      const m = this.moaiMeshes[k];
      m.position.set(mo.x, this.particles.map.groundY(mo.x, mo.z), mo.z);
      const s = Math.min(1, mo.t * 2) * (0.9 + 0.1 * Math.sin(time * 4));
      m.scale.setScalar(s);
    });
  }
}

/** Partículas de combate: polvo, chispas y proyectiles. */
class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array; private vel: Float32Array; private life: Float32Array; private col: Float32Array; private size: Float32Array;
  private head = 0;
  constructor(public map: WorldMap, private n: number) {
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.col = new Float32Array(n * 3); this.size = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 500 } },
      vertexShader: `attribute float aLife; attribute float aSize; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC = color; vA = clamp(aLife, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_Position = projectionMatrix * mv; gl_PointSize = aLife > 0.0 ? clamp(aSize * uScale / max(1.0,-mv.z), 1.0, 24.0) : 0.0; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ float r = length(gl_PointCoord-0.5); if(r>0.5) discard; gl_FragColor = vec4(vC, (1.0-r*2.0)*vA); }`,
      vertexColors: true,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }
  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number, g: number, b: number, life: number, size: number): void {
    const i = this.head; this.head = (this.head + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.life[i] = life; this.size[i] = size;
  }
  update(dt: number, events: CombatEvent[]): void {
    for (const e of events) {
      const y = this.map.groundY(e.x, e.z);
      const n = 2 + Math.round(e.intensity * 10);
      if (e.kind === 'melee') {
        for (let k = 0; k < n; k++) {
          const a = Math.random() * 6.283, s = 1 + Math.random() * 3;
          this.emit(e.x + (Math.random() - 0.5) * 6, y + 1.2, e.z + (Math.random() - 0.5) * 6, Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s, 1.0, 0.85, 0.4, 0.6, 0.5);
          this.emit(e.x + (Math.random() - 0.5) * 8, y + 0.3, e.z + (Math.random() - 0.5) * 8, Math.cos(a) * 0.6, 0.6, Math.sin(a) * 0.6, 0.55, 0.45, 0.3, 1.4, 1.6);
        }
      } else if (e.kind === 'ranged' && e.fromX !== undefined && e.fromZ !== undefined) {
        const fy = this.map.groundY(e.fromX, e.fromZ);
        for (let k = 0; k < n; k++) {
          const t = 0.9;
          const sx = e.fromX + (Math.random() - 0.5) * 8, sz = e.fromZ + (Math.random() - 0.5) * 8;
          const tx = e.x + (Math.random() - 0.5) * 8, tz = e.z + (Math.random() - 0.5) * 8;
          const c = e.faction === 1 ? [0.75, 0.75, 0.7] : e.faction === 0 ? [0.9, 0.8, 0.6] : [0.3, 0.3, 0.32];
          this.emit(sx, fy + 1.8, sz, (tx - sx) / t, (y - fy) / t + 4.9 * t, (tz - sz) / t, c[0], c[1], c[2], t, 0.45);
        }
      } else if (e.kind === 'death') {
        const m = 20 + Math.round(e.intensity * 60);
        for (let k = 0; k < m; k++) {
          const a = Math.random() * 6.283, s = 2 + Math.random() * 6;
          this.emit(e.x, y + 1, e.z, Math.cos(a) * s, 3 + Math.random() * 6, Math.sin(a) * s, 1.0, 0.6, 0.2, 1.8, 1.2);
        }
      }
    }
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 9.8 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const gy = this.map.groundY(this.pos[i * 3], this.pos[i * 3 + 2]);
      if (this.pos[i * 3 + 1] < gy) { this.pos[i * 3 + 1] = gy; this.vel[i * 3 + 1] *= -0.2; this.vel[i * 3] *= 0.5; this.vel[i * 3 + 2] *= 0.5; }
    }
    const g = this.points.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aLife') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
  }
  setScale(s: number): void { (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = s; }
}
