/**
 * Shader jalur ADEGAN. Setiap lapisan slide adalah quad dengan tekstur sendiri; semua animasi
 * (posisi, skala, rotasi, opasitas, mask sapuan, blur, klip) berjalan di GPU lewat uniform/transform.
 */

const COMMON = /* glsl */ `
varying vec2 vLocal;   // uv lokal quad (0..1, y ke atas)
varying vec2 vUv;      // uv tekstur (jendela potongan untuk animasi per-kata)
varying vec2 vW;       // posisi dunia (xy)
`;

export const FLAT_VERTEX = /* glsl */ `
uniform vec4 uUvRect;   // offset.xy, skala.zw jendela tekstur
${COMMON}
void main() {
  vLocal = uv;
  vUv = uUvRect.xy + uv * uUvRect.zw;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xy;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const FLAT_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
uniform float uReveal;      // 1 = tampak penuh; <1 = sapuan mask
uniform vec2 uRevealDir;    // arah sapuan (sumbu, ruang uv)
uniform float uBlur;        // bias mip → blur murah
uniform vec4 uClip;         // xMin, xMax, yMin, yMax (dunia)
uniform float uClipOn;
${COMMON}
void main() {
  if (uClipOn > 0.5 && (vW.x < uClip.x || vW.x > uClip.y || vW.y < uClip.z || vW.y > uClip.w)) discard;
  vec4 c = texture2D(uMap, vUv, uBlur);
  float m = 1.0;
  if (uReveal < 0.999) {
    float s = dot(vLocal - 0.5, uRevealDir) + 0.5;
    float front = mix(-0.03, 1.03, uReveal);
    m = 1.0 - smoothstep(front - 0.03, front, s);
  }
  float a = c.a * uOpacity * m;
  if (a < 0.002) discard;
  gl_FragColor = vec4(c.rgb, a);
}
`;

export const CARD_VERTEX = /* glsl */ `
${COMMON}
void main() {
  vLocal = uv;
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xy;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/**
 * Kartu: kotak membulat SDF (radius sudut, bayangan lembut, bingkai tipis) dengan isi cover-fit
 * yang dapat di-zoom/geser di dalam bingkai (Ken Burns) tanpa menggerakkan bingkainya.
 */
export const CARD_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec2 uSize;        // ukuran isi (px logis)
uniform float uMargin;     // margin quad untuk bayangan (px logis)
uniform float uRadius;
uniform float uShadow;
uniform float uBorder;
uniform float uAspect;     // rasio tekstur
uniform float uZoom;
uniform vec2 uPan;
uniform float uOpacity;
uniform float uReveal;
uniform vec2 uRevealDir;
uniform float uBlur;
uniform vec4 uClip;
uniform float uClipOn;
${COMMON}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}
vec2 coverUv(vec2 q, float boxAspect, float texAspect) {
  vec2 s = boxAspect > texAspect ? vec2(1.0, texAspect / boxAspect) : vec2(boxAspect / texAspect, 1.0);
  return 0.5 + (q - 0.5) * s;
}

void main() {
  if (uClipOn > 0.5 && (vW.x < uClip.x || vW.x > uClip.y || vW.y < uClip.z || vW.y > uClip.w)) discard;
  vec2 total = uSize + vec2(2.0 * uMargin);
  vec2 p = vec2((vLocal.x - 0.5) * total.x, (0.5 - vLocal.y) * total.y);   // px logis, y ke bawah
  float r = min(uRadius, min(uSize.x, uSize.y) * 0.5);

  float d = sdRoundBox(p, uSize * 0.5, r);
  float shape = 1.0 - smoothstep(-0.8, 0.8, d);
  float ds = sdRoundBox(p - vec2(0.0, 26.0), uSize * 0.5, r);
  float shadow = uShadow * 0.45 * (1.0 - smoothstep(-40.0, 60.0, ds));

  vec2 q = p / uSize + 0.5;                       // 0..1 di dalam kotak, y ke bawah
  vec2 qa = coverUv(q, uSize.x / max(uSize.y, 1.0), uAspect);
  qa = (qa - 0.5) / uZoom + 0.5 + uPan;
  vec4 c = texture2D(uMap, vec2(qa.x, 1.0 - qa.y), uBlur);
  c.rgb = mix(c.rgb, vec3(1.0), uBorder * 0.14 * smoothstep(-2.6, -1.0, d) * (1.0 - smoothstep(-1.0, 0.0, d)));

  float m = 1.0;
  if (uReveal < 0.999) {
    float s = dot(vec2(q.x, 1.0 - q.y) - 0.5, uRevealDir) + 0.5;
    float front = mix(-0.03, 1.03, uReveal);
    m = 1.0 - smoothstep(front - 0.03, front, s);
  }

  float body = c.a * shape;
  float a = body + (1.0 - shape) * shadow;
  a *= uOpacity * m;
  if (a < 0.002) discard;
  float aTot = body + (1.0 - shape) * shadow;
  gl_FragColor = vec4(c.rgb * body / max(aTot, 0.0001), a);
}
`;
