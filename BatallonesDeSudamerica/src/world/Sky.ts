import * as THREE from 'three';
import { MAP_W, MAP_H } from './SouthAmerica';
import { hash01 } from '../util/Noise';

/** Cielo procedural, sol, luna, agua animada y nubes voxel. */
export class Sky {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;
  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private water: THREE.Mesh;
  private waterMat: THREE.ShaderMaterial;
  private clouds: THREE.InstancedMesh;
  private cloudSeeds: Float32Array;
  /** Hora del día en [0,1): 0 = medianoche, 0.5 = mediodía. */
  time = 0.3;
  daySeconds = 600;
  readonly sunDir = new THREE.Vector3();
  readonly fogColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSun: { value: new THREE.Vector3(0, 1, 0) },
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uNight: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_Position.z = gl_Position.w * 0.9999; // siempre al fondo
        }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 uSun, uTop, uHorizon; uniform float uNight;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(max(h,0.0), 0.55));
          float sd = max(dot(vDir, uSun), 0.0);
          // disco y halo solar
          col += vec3(1.0, 0.85, 0.6) * pow(sd, 900.0) * 6.0;
          col += vec3(1.0, 0.6, 0.3) * pow(sd, 12.0) * 0.35 * (1.0 - uNight*0.5);
          // luna
          float md = max(dot(vDir, -uSun), 0.0);
          col += vec3(0.8,0.85,1.0) * pow(md, 1500.0) * 2.0 * uNight;
          // estrellas
          vec3 sp = floor(vDir * 140.0);
          float st = step(0.9975, hash(sp)) * uNight * smoothstep(0.0, 0.25, vDir.y);
          col += vec3(st);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(6000, 32, 16), this.domeMat);
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xffffff, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 400;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.6;
    const sc = this.sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90;
    this.group.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a4a30, 0.7);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.15);
    this.group.add(this.hemi, this.ambient);

    // Agua: un plano grande con olas en el shader y fresnel.
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSun: { value: this.sunDir },
        uDeep: { value: new THREE.Color(0x0b3a66) },
        uShallow: { value: new THREE.Color(0x2a9fd6) },
        uFogColor: { value: this.fogColor },
        uFogDensity: { value: 0.002 },
      },
      vertexShader: `
        varying vec3 vWorld; varying float vFog; varying float vDist;
        uniform float uFogDensity;
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vec4 mv = viewMatrix * w;
          float d = length(mv.xyz);
          vDist = d;
          vFog = 1.0 - exp(-uFogDensity*uFogDensity*d*d);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vWorld; varying float vFog; varying float vDist;
        uniform float uTime; uniform vec3 uSun, uDeep, uShallow, uFogColor;
        void main(){
          vec2 p = vWorld.xz;
          float amp = clamp(1.0 - vDist / 350.0, 0.0, 1.0); // sin olas a lo lejos (evita aliasing)
          float w = (sin(p.x*0.35 + uTime*1.3) * cos(p.y*0.29 - uTime*1.1)
                  + 0.5*sin((p.x+p.y)*0.9 + uTime*2.0)) * amp;
          vec3 n = normalize(vec3(0.25*w, 1.0, 0.2*w));
          vec3 v = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 col = mix(uDeep, uShallow, 0.35 + 0.35*w);
          vec3 hv = normalize(v + uSun);
          float spec = pow(max(dot(n, hv), 0.0), 180.0) * max(uSun.y, 0.0);
          col += spec * vec3(1.0, 0.95, 0.85) * 1.5;
          col = mix(col, uFogColor, vFog);
          gl_FragColor = vec4(col, 0.82 + fres*0.15);
        }`,
    });
    const wg = new THREE.PlaneGeometry(MAP_W * 3, MAP_H * 3, 1, 1);
    wg.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wg, this.waterMat);
    this.water.position.set(MAP_W / 2, 0.45, MAP_H / 2);
    this.water.frustumCulled = false;
    this.water.renderOrder = 1;
    this.group.add(this.water);

    // Nubes voxel: cada nube son varios bloques planos.
    const N = 900;
    const cg = new THREE.BoxGeometry(1, 1, 1);
    const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    this.clouds = new THREE.InstancedMesh(cg, cm, N);
    this.clouds.castShadow = true;
    this.clouds.receiveShadow = false;
    this.clouds.frustumCulled = false;
    this.cloudSeeds = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const cluster = Math.floor(i / 6);
      const bx = hash01(cluster * 3.1) * MAP_W, bz = hash01(cluster * 7.7) * MAP_H;
      this.cloudSeeds[i * 4] = bx + (hash01(i * 1.3) - 0.5) * 22;
      this.cloudSeeds[i * 4 + 1] = 62 + hash01(cluster * 9.1) * 12 + (hash01(i * 2.9) - 0.5) * 3;
      this.cloudSeeds[i * 4 + 2] = bz + (hash01(i * 5.7) - 0.5) * 14;
      this.cloudSeeds[i * 4 + 3] = 6 + hash01(i * 4.4) * 10;
    }
    this.group.add(this.clouds);
    scene.add(this.group);
    scene.fog = new THREE.FogExp2(0x9fc5e8, 0.0025);
    this.update(0, new THREE.Vector3(MAP_W / 2, 0, MAP_H / 2), 40);
  }

  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private tmpP = new THREE.Vector3();

  update(dt: number, focus: THREE.Vector3, camDist: number): void {
    this.time = (this.time + dt / this.daySeconds) % 1;
    const ang = (this.time - 0.25) * Math.PI * 2; // 0.25 = amanecer
    this.sunDir.set(Math.cos(ang) * 0.6, Math.sin(ang), Math.sin(ang * 0.7) * 0.5).normalize();
    const elev = this.sunDir.y;
    const day = THREE.MathUtils.smoothstep(elev, -0.1, 0.25);
    const dusk = 1 - Math.min(1, Math.abs(elev) / 0.25);
    const night = 1 - day;

    const top = new THREE.Color(0x2a6fd6).lerp(new THREE.Color(0x03040c), night);
    const horizon = new THREE.Color(0xb9dbf5).lerp(new THREE.Color(0xff8c42), dusk * 0.7).lerp(new THREE.Color(0x0b0d1a), night * 0.95);
    this.domeMat.uniforms.uSun.value.copy(this.sunDir);
    (this.domeMat.uniforms.uTop.value as THREE.Color).copy(top);
    (this.domeMat.uniforms.uHorizon.value as THREE.Color).copy(horizon);
    this.domeMat.uniforms.uNight.value = night;

    const sunCol = new THREE.Color(0xfff2dc).lerp(new THREE.Color(0xff9a4a), dusk).lerp(new THREE.Color(0x4a5a9a), night);
    this.sun.color.copy(sunCol);
    this.sun.intensity = 0.25 + 3.0 * day;
    this.hemi.intensity = 0.15 + 0.6 * day;
    this.ambient.intensity = 0.06 + 0.12 * day;
    this.sun.position.copy(focus).addScaledVector(this.sunDir.y > 0.02 ? this.sunDir : this.sunDir.clone().negate(), 200);
    this.sun.target.position.copy(focus);
    // La sombra acompaña al jugador; se desactiva en vista estratégica.
    this.sun.castShadow = camDist < 260;
    const shadowSize = Math.max(60, Math.min(160, camDist * 1.6));
    const sc = this.sun.shadow.camera;
    sc.left = -shadowSize; sc.right = shadowSize; sc.top = shadowSize; sc.bottom = -shadowSize;
    sc.updateProjectionMatrix();

    this.fogColor.copy(horizon);
    this.dome.position.copy(focus);
    this.waterMat.uniforms.uTime.value += dt;
    this.waterMat.uniforms.uFogDensity.value = 0.0028 * Math.min(1, 80 / camDist);

    // Nubes a la deriva (ocultas en la vista estratégica)
    this.clouds.visible = camDist < 900;
    const t = this.waterMat.uniforms.uTime.value * 0.35;
    for (let i = 0; i < this.clouds.count; i++) {
      const s = this.cloudSeeds;
      const x = ((s[i * 4] + t) % MAP_W + MAP_W) % MAP_W;
      this.tmpP.set(x, s[i * 4 + 1], s[i * 4 + 2]);
      this.tmpS.set(s[i * 4 + 3], 2.2, s[i * 4 + 3] * 0.7);
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      this.clouds.setMatrixAt(i, this.tmpM);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  /** Densidad de niebla en función de la distancia de cámara. */
  fogDensity(camDist: number): number {
    return 0.0032 * Math.min(1, 60 / Math.max(camDist, 10)) + 0.00008;
  }
}
