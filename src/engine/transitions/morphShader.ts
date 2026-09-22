/**
 * Shader elemen bersama untuk Magic Move.
 *
 * Satu quad seukuran slide; fragment shader menghitung SEMUANYA dalam piksel logis slide 1920×1080:
 *   - rect saat ini = lerp(rectA, rectB, uP)      → berpindah + membesar/mengecil
 *   - radius sudut  = lerp(radA, radB, uP)        → lingkaran ⇄ kartu ⇄ tepi tajam (SDF kotak membulat)
 *   - isi           = mix(texA, texB, uMixT)      → logo melebur menjadi foto (cover-fit per tekstur)
 *   - bayangan lembut mengikuti bentuk yang berubah (SDF bergeser ke bawah)
 * Tidak ada potongan keras: bentuk, ukuran, dan isi berubah kontinu.
 */

export const MORPH_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const MORPH_FRAGMENT = /* glsl */ `
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform vec4 uRectA;     // x, y, w, h (px logis, origin kiri-atas)
uniform vec4 uRectB;
uniform vec2 uRad;       // radius sudut A, B
uniform vec2 uShadow;    // intensitas bayangan A, B
uniform vec2 uAspect;    // rasio w/h tekstur A, B
uniform float uP;        // progres gerak (sudah ter-ease)
uniform float uMixT;     // progres peleburan isi
uniform float uPop;      // "mekar": pembesaran ekstra di tengah perjalanan
varying vec2 vUv;

const float PI = 3.14159265359;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

// Cover-fit: isi tekstur (rasio texAspect) memenuhi kotak (rasio boxAspect) tanpa distorsi.
vec2 coverUv(vec2 q, float boxAspect, float texAspect) {
  vec2 s = boxAspect > texAspect ? vec2(1.0, texAspect / boxAspect) : vec2(boxAspect / texAspect, 1.0);
  return 0.5 + (q - 0.5) * s;
}

void main() {
  vec2 P = vec2(vUv.x * 1920.0, (1.0 - vUv.y) * 1080.0);
  float e = clamp(uP, 0.0, 1.0);

  // Dua kurva: elemen BERGESER lebih dulu (ep), lalu MEKAR — ukuran, sudut, bayangan (es).
  float ep = smoothstep(0.0, 0.78, e);
  float es = smoothstep(0.26, 1.0, e);

  vec2 cA = uRectA.xy + uRectA.zw * 0.5;
  vec2 cB = uRectB.xy + uRectB.zw * 0.5;
  vec2 dv = cB - cA;
  float dl = length(dv);
  vec2 nrm = dl > 1.0 ? vec2(-dv.y, dv.x) / dl : vec2(0.0);
  vec2 c = mix(cA, cB, ep) + nrm * sin(ep * PI) * dl * 0.09;   // lintasan sedikit melengkung
  vec2 sz = mix(uRectA.zw, uRectB.zw, es) * (1.0 + uPop * sin(es * PI));
  float r = min(mix(uRad.x, uRad.y, es), min(sz.x, sz.y) * 0.5);

  float d = sdRoundBox(P - c, sz * 0.5, r);
  float shape = 1.0 - smoothstep(-0.8, 0.8, d);

  // Bayangan mengikuti isi yang terlihat: baru muncul saat foto mulai melebur (bukan di sekitar cincin).
  float shadowAmt = mix(uShadow.x, uShadow.y, uMixT);
  float ds = sdRoundBox(P - c - vec2(0.0, 26.0), sz * 0.5, r);
  float shadow = shadowAmt * 0.45 * (1.0 - smoothstep(-40.0, 60.0, ds));

  vec2 q = (P - c) / sz + 0.5;                       // 0..1 di dalam kotak, y ke bawah
  float boxAspect = sz.x / max(sz.y, 1.0);
  vec2 qa = coverUv(q, boxAspect, uAspect.x);
  vec2 qb = coverUv(q, boxAspect, uAspect.y);
  vec4 ca = texture2D(uTexA, vec2(qa.x, 1.0 - qa.y));
  vec4 cb = texture2D(uTexB, vec2(qb.x, 1.0 - qb.y));

  // Peleburan isi dengan alpha benar (premultiplied): sudut transparan lencana tidak menggelapkan foto.
  vec3 pm = mix(ca.rgb * ca.a, cb.rgb * cb.a, uMixT);
  float am = mix(ca.a, cb.a, uMixT);
  vec3 rgb = pm / max(am, 0.0001);

  float body = am * shape;
  float a = body + (1.0 - shape) * shadow;
  if (a < 0.002) discard;
  gl_FragColor = vec4(rgb * body / max(a, 0.0001), a);
}
`;
