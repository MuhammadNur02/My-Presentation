import {
  AdditiveBlending,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import { mulberry32 } from '../../utils/hash';

const COUNT = 72;

const VERTEX = /* glsl */ `
attribute vec4 aSeed;   // x,y = posisi awal (0..1), z = kecepatan, w = ukuran/fase
uniform float uTime;
varying vec2 vUv;
varying float vA;
varying float vMix;
void main() {
  vUv = uv;
  float sp = aSeed.z;
  float y = fract(aSeed.y + uTime * 0.018 * sp);
  float x = aSeed.x + 0.025 * sin(uTime * 0.35 * sp + aSeed.w * 40.0);
  vec2 c = vec2((x - 0.5) * 17.0, (y - 0.5) * 10.0);
  float size = 0.09 + aSeed.w * aSeed.w * 0.36;
  vA = smoothstep(0.0, 0.14, y) * smoothstep(1.0, 0.86, y) * (0.55 + 0.45 * sin(uTime * 0.8 * sp + aSeed.w * 30.0));
  vMix = fract(aSeed.w * 7.31);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(c + position.xy * size, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
uniform float uAlpha;
varying vec2 vUv;
varying float vA;
varying float vMix;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.0);
  vec3 col = mix(uA, uB, step(0.5, vMix));
  gl_FragColor = vec4(col, a * vA * uAlpha);
}
`;

/**
 * Partikel cahaya melayang di latar (satu draw call, instancing). Seluruh gerak dihitung di vertex
 * shader dari waktu → nol pekerjaan CPU per frame selain mengisi uniform `uTime`.
 */
export class ParticleField {
  readonly mesh: Mesh;
  private geo: InstancedBufferGeometry;
  private mat: ShaderMaterial;
  private t0 = -1;

  constructor() {
    const base = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    geo.instanceCount = COUNT;
    const seeds = new Float32Array(COUNT * 4);
    const rnd = mulberry32(20240607);
    for (let i = 0; i < COUNT; i++) {
      seeds[i * 4] = rnd();
      seeds[i * 4 + 1] = rnd();
      seeds[i * 4 + 2] = 0.6 + rnd() * 0.9;
      seeds[i * 4 + 3] = rnd();
    }
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
    this.geo = geo;
    this.mat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uA: { value: new Color() }, uB: { value: new Color() }, uAlpha: { value: 0 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
  }

  /** Warna dari tema; tema gelap memakai pencampuran aditif (bercahaya), tema terang pencampuran biasa. */
  configure(a: string, b: string, dark: boolean, order: number): void {
    (this.mat.uniforms.uA.value as Color).set(a);
    (this.mat.uniforms.uB.value as Color).set(b);
    this.mat.blending = dark ? AdditiveBlending : NormalBlending;
    this.mat.uniforms.uAlpha.value = 0;
    this.mat.needsUpdate = true;
    this.mesh.renderOrder = order;
    this.t0 = -1;
  }

  update(t: number): void {
    if (this.t0 < 0) this.t0 = t;
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uAlpha.value = Math.min(1, (t - this.t0) / 1.4);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
