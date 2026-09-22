/**
 * Kerangka GLSL bersama untuk semua transisi.
 *
 * Setiap transisi = dua "layer" (slide keluar & masuk), masing-masing berupa mesh bidang
 * bersubdivisi. Definisi transisi hanya menyediakan dua fungsi:
 *   - vertex:   void transformVertex(inout vec3 pos, vec2 uv, inout float shade, inout float alpha)
 *   - fragment: vec4  shadeFragment(vec2 uv, float shade, float alpha)
 *
 * Uniform (dibagi kedua layer kecuali uLayer & uMap):
 *   uProgress  progres SETELAH easing (0..1)
 *   uDir       +1 maju, -1 mundur
 *   uLayer     0 = slide keluar, 1 = slide masuk
 *   uIntensity pengali kekuatan efek
 *   uSize      ukuran bidang dunia (16 × 9)
 */

const UNIFORMS = /* glsl */ `
uniform float uProgress;
uniform float uDir;
uniform float uLayer;
uniform float uIntensity;
uniform float uTime;
uniform vec2 uSize;
`;

/**
 * Pada transisi "satu layer beranimasi di atas slide diam" (zoom, shatter, doors, toss, roll),
 * layer yang beranimasi bergantung arah: maju → slide keluar, mundur → slide masuk.
 * animQ(): progres animasi layer tersebut (0 = utuh di tempat, 1 = sudah pergi).
 */
const LAYER_HELPERS = /* glsl */ `
bool isAnim() { return (uLayer < 0.5) == (uDir > 0.0); }
float animQ() { return uDir > 0.0 ? uProgress : 1.0 - uProgress; }
`;

const VERTEX_COMMON = /* glsl */ `
const float PI = 3.14159265359;
${LAYER_HELPERS}

mat3 rotY(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, 0.0, -s,  0.0, 1.0, 0.0,  s, 0.0, c);
}
mat3 rotX(float a) {
  float c = cos(a), s = sin(a);
  return mat3(1.0, 0.0, 0.0,  0.0, c, s,  0.0, -s, c);
}
mat3 rotZ(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, s, 0.0,  -s, c, 0.0,  0.0, 0.0, 1.0);
}
mat2 rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}
float easeInOut(float t) {
  return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
}
// Jendela waktu per-vertex: delay01 (0..1) menggeser awal, span = lebar jendela.
float stagger(float p, float delay01, float span) {
  float start = delay01 * (1.0 - span);
  return clamp((p - start) / span, 0.0, 1.0);
}
`;

const FRAGMENT_COMMON = /* glsl */ `
const float PI = 3.14159265359;
${LAYER_HELPERS}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(11.7, 3.1);
    a *= 0.5;
  }
  return v;
}
`;

export const DEFAULT_FRAGMENT = /* glsl */ `
vec4 shadeFragment(vec2 uv, float shade, float alpha) {
  vec4 c = texture2D(uMap, uv);
  c.rgb *= shade;
  c.a = alpha;
  return c;
}
`;

/** `tiles` = geometri ubin: menambah atribut aTile (xy = pusat ubin, z = acak stabil). */
export function buildVertexShader(body: string, tiles = false): string {
  return /* glsl */ `
${UNIFORMS}
${tiles ? 'attribute vec3 aTile;' : ''}
varying vec2 vUv;
varying float vShade;
varying float vAlpha;
${VERTEX_COMMON}
${body}
void main() {
  vUv = uv;
  vShade = 1.0;
  vAlpha = 1.0;
  vec3 pos = position;
  transformVertex(pos, uv, vShade, vAlpha);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;
}

export function buildFragmentShader(body: string): string {
  return /* glsl */ `
${UNIFORMS}
uniform sampler2D uMap;
varying vec2 vUv;
varying float vShade;
varying float vAlpha;
${FRAGMENT_COMMON}
${body}
void main() {
  vec4 c = shadeFragment(vUv, vShade, vAlpha);
  if (c.a < 0.003) discard;
  gl_FragColor = c;
}
`;
}
