import type { EasingId, TransitionConfig, TransitionId } from '../../types';
import { DEFAULT_FRAGMENT } from './shaderTemplates';

export interface TransitionDefinition {
  id: TransitionId;
  label: string;
  description: string;
  category: 'Klasik' | '3D' | 'Morph' | 'Mosaik' | 'Efek';
  /** Subdivisi mesh (kolom, baris) — dipakai untuk morph/gelombang per-vertex. */
  segments: [number, number];
  /** Grid ubin (kolom, baris): geometri quad terpisah, tiap ubin bergerak sendiri (atribut aTile). */
  tiles?: [number, number];
  /** Render dua sisi (mis. halaman yang tergulung memperlihatkan sisi belakangnya). */
  doubleSided?: boolean;
  /**
   * Magic Move: elemen bersama (logo/foto ber-tag sama) dipasangkan dan diterbangkan sebagai elemen
   * terpisah; layer dasar hanya memuat sisa slide dan berganti dengan crossfade halus.
   */
  magic?: boolean;
  vertex: string;
  fragment?: string;
  /** Layer yang digambar paling atas (bergantung arah navigasi). */
  onTop: (dir: 1 | -1) => 'in' | 'out';
  defaults: Omit<TransitionConfig, 'type'>;
}

const inTop = () => 'in' as const;

/* ------------------------------------------------------------------ */
/* Vertex: seluruh matematika 3D (matriks rotasi, interpolasi vertex)   */
/* ------------------------------------------------------------------ */

/** Tanpa deformasi geometri — efeknya sepenuhnya di fragment shader. */
const IDENTITY_VERTEX = /* glsl */ `
void transformVertex(inout vec3 pos, vec2 uv, inout float shade, inout float alpha) {}
`;

const FADE_VERTEX = /* glsl */ `
void transformVertex(inout vec3 pos, vec2 uv, inout float shade, inout float alpha) {
  float p = uProgress;
  float s = mix(1.0 + 0.05 * uIntensity * p, 1.0 - 0.04 * uIntensity * (1.0 - p), uLayer);
  pos.xy *= s;
}
`;

const FADE_FRAGMENT = /* glsl */ `
vec4 shadeFragment(vec2 uv, float shade, float alpha) {
  float p = uProgress;
  vec2 warp = vec2(fbm(uv * 3.5 + 1.7), fbm(uv * 3.5 + 8.3)) - 0.5;
  vec2 st = uv;
  float a = 1.0;
  if (uLayer > 0.5) {
    // Disolusi "cair": ambang naik mengikuti noise domain-warp.
    float n = smoothstep(0.15, 0.85, fbm(uv * vec2(3.2, 1.8) + warp * 0.9));
    float edge = 0.24;
    float th = mix(0.0, 1.0 + edge, p);
    a = smoothstep(0.0, edge, th - n);
    st += warp * (1.0 - a) * 0.07 * uIntensity;
  } else {
    st += warp * p * 0.05 * uIntensity;
  }
  vec4 c = texture2D(uMap, st);
  c.rgb *= shade;
  c.a = a;
  return c;
}
`;

const SLIDE_VERTEX = /* glsl */ `
void transformVertex(inout vec3 pos, vec2 uv, inout float shade, inout float alpha) {
  float p = uProgress;
  float par = clamp(0.3 * uIntensity, 0.1, 0.9);   // parallax layer keluar
  if (uLayer < 0.5) {
    pos.x += -uDir * p * uSize.x * par;
    pos.z -= p * 1.5 * uIntensity;
    shade = 1.0 - 0.55 * p;
  } else {
    pos.x += uDir * (1.0 - p) * uSize.x;
  }
}
`;

const ZOOM_VERTEX = /* glsl */ `
void transformVertex(inout vec3 pos, vec2 uv, inout float shade, inout float alpha) {
  float p = uProgress;
  float I = min(uIntensity, 1.6);
  bool fwd = uDir > 0.0;
  if (uLayer < 0.5) {                     // keluar: menembus kamera (maju) / menjauh (mundur)
    pos.z += uDir * p * p * 9.0 * I;
    alpha = fwd ? 1.0 - smoothstep(0.25, 0.9, p) : 1.0;
    shade = 1.0 - 0.35 * p;
  } else {                                // masuk: datang dari kedalaman (maju) / dari depan (mundur)
    float q = 1.0 - p;
    pos.z += -uDir * q * q * 7.0 * I;
    alpha = fwd ? 1.0 : smoothstep(0.1, 0.75, p);
    shade = mix(0.65, 1.0, p);
  }
}
`;

const CUBE_VERTEX = /* glsl */ `
void transformVertex(inout vec3 pos, vec2 uv, inout float shade, inout float alpha) {
  float hw = uSize.x * 0.5;                       // setengah lebar kubus
  float p = uProgress;
  float a = -uDir * p * PI * 0.5;                 // sudut putar kubus
  vec3 center = vec3(0.0, 0.0, -hw);              // pusat kubus
  vec3 local;
  if (uLayer < 0.5) {
    // Sisi depan: bidang digeser ke muka kubus lalu diputar bersama kubus.
    local = rotY(a) * (pos + vec3(0.0, 0.0, hw));
    shade = 1.0 - 0.5 * p;
  } else {
    // Sisi masuk: berorientasi 90° (rotY), dipasang di sisi kanan/kiri kubus, ikut berputar.
    local = rotY(a) * (rotY(uDir * PI * 0.5) * pos + vec3(uDir * hw, 0.0, 0.0));
    shade = 0.5 + 0.5 * p;
  }
  pos = center + local;
  pos.z -= sin(p * PI) * 2.5 * uIntensity;        // tarik mundur agar perputaran terlihat utuh
}
`;

const FLIP_VERTEX = /* glsl */ `
void transformVertex(inout vec3 pos, vec2 uv, inout float shade, inout float alpha) {
  float p = uProgress;
  float a = uLayer < 0.5 ? -uDir * p * PI : uDir * (1.0 - p) * PI;
  pos = rotY(a) * pos;
  pos.z += sin(p * PI) * 2.0 * uIntensity;
  shade = 1.0 - 0.4 * abs(sin(a));
}
`;

const CAROUSEL_VERTEX = /* glsl */ `
void transformVertex(inout vec3 pos, vec2 uv, inout float shade, inout float alpha) {
  float R = 15.0;                                  // radius cincin
  float delta = (uSize.x / R) * 1.06;              // sudut antar panel
  float p = uProgress;
  float phi = uLayer < 0.5 ? -uDir * p * delta : uDir * (1.0 - p) * delta;
  vec3 center = vec3(0.0, 0.0, -R);
  pos = center + rotY(phi) * (pos + vec3(0.0, 0.0, R));
  pos.z -= sin(p * PI) * 1.5 * uIntensity;
  shade = 1.0 - 0.45 * clamp(abs(phi) / delta, 0.0, 1.0);
}
`;

/**
 * MORPH MESH — interpolasi vertex sejati.
 * Setiap vertex bidang diinterpolasi antara posisi datar dan posisi pada permukaan bola
 * (peta panjang-busur: lon = x/R, lat = y/R), dengan jendela waktu berbeda per-vertex
 * (gelombang merambat dari pusat). Bola berputar 180°, lalu slide masuk "membuka" kembali.
 */
const MORPH_VERTEX = /* glsl */ `
void transformVertex(inout vec3 pos, vec2 uv, inout float shade, inout float alpha) {
  float p = uProgress;
  float R = 5.2 / clamp(uIntensity, 0.6, 1.5);
  vec2 c = (uv - 0.5) * vec2(uSize.x / uSize.y, 1.0);
  float rr = clamp(length(c) / 1.02, 0.0, 1.0);    // 0 di pusat → 1 di sudut

  float spinBase = -uDir * smoothstep(0.2, 0.8, p) * PI;
  float amt, spin;
  if (uLayer < 0.5) {
    float t = clamp(p / 0.5, 0.0, 1.0);
    amt = easeInOut(stagger(t, rr, 0.6));          // datar → bola, dari pusat ke tepi
    spin = spinBase;
  } else {
    float t = clamp((p - 0.5) / 0.5, 0.0, 1.0);
    amt = 1.0 - easeInOut(stagger(t, 1.0 - rr, 0.6)); // bola → datar, dari tepi ke pusat
    spin = spinBase + uDir * PI;
  }

  float lon = pos.x / R;
  float lat = pos.y / R;
  vec3 sph = R * vec3(sin(lon) * cos(lat), sin(lat), cos(lon) * cos(lat));
  vec3 flat3 = vec3(pos.xy, R);                    // relatif terhadap pusat bola (0,0,-R)
  vec3 m = rotY(spin) * mix(flat3, sph, amt);
  vec3 n = rotY(spin) * normalize(mix(vec3(0.0, 0.0, 1.0), sph / R, amt));

  pos = vec3(0.0, 0.0, -R) + m;
  shade = mix(1.0, 0.5 + 0.5 * clamp(n.z * 0.85 + 0.25, 0.0, 1.0), amt);
}
`;

const RIPPLE_VERTEX = /* glsl */ `
void transformVertex(inout vec3 pos, vec2 uv, inout float shade, inout float alpha) {
  float p = uProgress;
  vec2 c = (uv - 0.5) * vec2(uSize.x / uSize.y, 1.0);
  float d = length(c);
  float env = sin(p * PI);
  pos.z += sin(d * 14.0 - p * 20.0) * 0.32 * env * uIntensity * (1.0 - clamp(d, 0.0, 1.0) * 0.6);
}
`;

const RIPPLE_FRAGMENT = /* glsl */ `
vec4 shadeFragment(vec2 uv, float shade, float alpha) {
  float p = uProgress;
  vec2 c = (uv - 0.5) * vec2(uSize.x / uSize.y, 1.0);
  float d = length(c);
  float R = mix(-0.15, 1.2, p);                    // radius cincin pengungkap
  float ring = d - R;
  vec2 dir = c / max(d, 0.0001);
  float wave = sin(ring * 28.0) * exp(-abs(ring) * 5.0) * 0.03 * uIntensity * sin(p * PI);
  vec2 st = uv + dir * wave * vec2(uSize.y / uSize.x, 1.0);
  float a = uLayer > 0.5 ? 1.0 - smoothstep(0.0, 0.12, ring) : 1.0;
  vec4 col = texture2D(uMap, st);
  col.rgb *= shade * (1.0 + wave * 5.0);
  col.a = a;
  return col;
}
`;

const PIXELATE_FRAGMENT = /* glsl */ `
vec4 shadeFragment(vec2 uv, float shade, float alpha) {
  float p = uProgress;
  float f = sin(p * PI);                            // 0 → 1 → 0
  float minCells = 28.0 / clamp(uIntensity, 0.5, 2.0);
  float cellsX = exp(mix(log(1920.0), log(minCells), f));
  vec2 cells = vec2(cellsX, cellsX * uSize.y / uSize.x);
  vec2 st = f < 0.002 ? uv : (floor(uv * cells) + 0.5) / cells;
  float a = 1.0;
  if (uLayer > 0.5) {
    float r = hash21(floor(uv * vec2(64.0, 36.0)));
    a = step(r, mix(-0.1, 1.1, p));
  }
  vec4 c = texture2D(uMap, st);
  c.rgb *= shade;
  c.a = a;
  return c;
}
`;

/* ------------------------------------------------------------------ */
/* Transisi tambahan                                                    */
/* ------------------------------------------------------------------ */

/** Sapuan diagonal dengan garis tepi bercahaya. */
const WIPE_FRAGMENT = /* glsl */ `
vec4 shadeFragment(vec2 uv, float shade, float alpha) {
  float p = uProgress;
  vec2 dv = normalize(vec2(1.0, 0.55));
  float s = dot(uv - 0.5, dv) / (abs(dv.x) + abs(dv.y)) + 0.5;   // 0..1 sepanjang arah sapuan
  if (uDir < 0.0) s = 1.0 - s;
  float e = 0.07;
  float front = mix(-e, 1.0 + e, p);
  vec4 c = texture2D(uMap, uv);
  float a = 1.0;
  if (uLayer > 0.5) {
    a = 1.0 - smoothstep(front - e, front + e, s);
    float glowLine = exp(-pow((s - front) / 0.03, 2.0));
    c.rgb += glowLine * 0.35 * uIntensity;
  }
  c.a = a;
  return c;
}
`;

/** Pintu geser: slide keluar terbelah dua ke kiri/kanan, mengungkap slide masuk. */
const DOORS_FRAGMENT = /* glsl */ `
vec4 shadeFragment(vec2 uv, float shade, float alpha) {
  float q = animQ();
  vec2 st = uv;
  float a = 1.0;
  float sh = 0.7 + 0.3 * q;                        // slide diam di bawah: makin terang saat pintu terbuka
  if (isAnim()) {
    float slide = q * 0.5;
    float inner;                                   // jarak ke sisi dalam pintu (ruang tekstur)
    if (uv.x < 0.5) { st.x = uv.x + slide; inner = 0.5 - st.x; }
    else            { st.x = uv.x - slide; inner = st.x - 0.5; }
    a = step(0.0, inner);
    sh = mix(0.55, 1.0, smoothstep(0.0, 0.14, inner));
  }
  vec4 c = texture2D(uMap, st);
  c.rgb *= sh;
  c.a = a;
  return c;
}
`;

/** Kartu dilempar: slide di atas terlempar ke samping sambil berputar (pivot di bawah). */
const TOSS_VERTEX = /* glsl */ `
void transformVertex(inout vec3 pos, vec2 uv, inout float shade, inout float alpha) {
  float qa = animQ();
  if (isAnim()) {
    float I = min(uIntensity, 1.6);
    vec2 piv = vec2(0.0, -uSize.y * 0.5);
    float a = -uDir * qa * 0.55 * I;
    pos.xy = rot2(a) * (pos.xy - piv) + piv;
    pos += vec3(uDir * qa * uSize.x * 1.2, -qa * uSize.y * 0.25, qa * 1.5);
    shade = 1.0 - 0.15 * qa;
  } else {
    pos.xy *= 0.92 + 0.08 * qa;
    shade = 0.6 + 0.4 * qa;
  }
}
`;

/** Spin Zoom: slide keluar berputar & membesar; slide masuk berputar dari kecil sambil menampak. */
const SPIN_VERTEX = /* glsl */ `
void transformVertex(inout vec3 pos, vec2 uv, inout float shade, inout float alpha) {
  float p = uProgress;
  float I = min(uIntensity, 1.6);
  if (uLayer < 0.5) {
    float a = -uDir * p * 0.8 * I;
    pos.xy = rot2(a) * (pos.xy * (1.0 + p * 0.9));
    shade = 1.0 - 0.4 * p;
  } else {
    float a = uDir * (1.0 - p) * 0.8 * I;
    pos.xy = rot2(a) * (pos.xy * (0.45 + 0.55 * p));
    alpha = smoothstep(0.05, 0.7, p);
  }
}
`;

/**
 * Page Roll — halaman terkelupas: bidang dilipat mengelilingi silinder (busur) lalu rebah ke
 * belakang (sisi belakang tampak). Interpolasi vertex: x' = xf + R sin(s/R), z' = R(1 - cos(s/R)).
 */
const ROLL_VERTEX = /* glsl */ `
void transformVertex(inout vec3 pos, vec2 uv, inout float shade, inout float alpha) {
  float qa = animQ();
  if (!isAnim()) { shade = 0.7 + 0.3 * qa; return; }
  float R = 0.9 * clamp(uIntensity, 0.6, 1.5);
  float sx = uDir > 0.0 ? 1.0 : -1.0;              // arah kelupas
  float x = pos.x * sx;
  float hw = uSize.x * 0.5;
  float xf = mix(hw, -hw - 2.4 * R, qa);           // posisi garis lipatan
  float s = x - xf;
  if (s > 0.0) {
    float th = s / R;
    if (th < PI) {
      x = xf + R * sin(th);
      pos.z = R * (1.0 - cos(th));
      shade = 1.0 - 0.28 * (1.0 - cos(th));
    } else {
      x = xf - (s - PI * R);
      pos.z = 2.0 * R;
      shade = 0.56;
    }
  }
  pos.x = x * sx;
}
`;

const ROLL_FRAGMENT = /* glsl */ `
vec4 shadeFragment(vec2 uv, float shade, float alpha) {
  vec4 c = texture2D(uMap, uv);
  if (!gl_FrontFacing) {                            // sisi belakang kertas: pucat & lebih gelap
    float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    c.rgb = mix(c.rgb, vec3(g), 0.75) * 0.8 + 0.05;
  }
  c.rgb *= shade;
  c.a = alpha;
  return c;
}
`;

/** Vortex: bidang terpelintir ke pusat (sudut puntir menurun terhadap jarak), lalu terurai. */
const SWIRL_VERTEX = /* glsl */ `
void transformVertex(inout vec3 pos, vec2 uv, inout float shade, inout float alpha) {
  float p = uProgress;
  float I = min(uIntensity, 1.6);
  float r = clamp(length(pos.xy / (uSize * 0.5)), 0.0, 1.4);
  float fall = pow(clamp(1.0 - r / 1.2, 0.0, 1.0), 1.5);
  float ang;
  if (uLayer < 0.5) {
    ang = -uDir * p * 4.5 * I * fall;
    pos.z -= p * 2.5;
    shade = 1.0 - 0.5 * p;
  } else {
    ang = uDir * (1.0 - p) * 4.5 * I * fall;
    pos.z -= (1.0 - p) * 2.5;
    alpha = smoothstep(0.0, 0.7, p);
  }
  pos.xy = rot2(ang) * pos.xy;
}
`;

/** Mosaic Flip: grid ubin, tiap ubin terbalik 180° dengan gelombang diagonal + jitter acak. */
const TILES_VERTEX = /* glsl */ `
void transformVertex(inout vec3 pos, vec2 uv, inout float shade, inout float alpha) {
  vec2 cuv = aTile.xy / uSize + 0.5;
  float d = clamp((cuv.x * 0.6 + (1.0 - cuv.y) * 0.4) * 0.8 + aTile.z * 0.2, 0.0, 1.0);
  float t = easeInOut(stagger(uProgress, d, 0.5));
  float a = uLayer < 0.5 ? -uDir * t * PI : uDir * (1.0 - t) * PI;
  vec3 c = vec3(aTile.xy, 0.0);
  pos = c + rotY(a) * (pos - c);
  pos.z += sin(t * PI) * 1.4 * uIntensity;
  shade = 1.0 - 0.4 * abs(sin(a));
}
`;

/** Venetian Blinds: bilah horizontal berputar pada sumbu X, dari atas ke bawah. */
const BLINDS_VERTEX = /* glsl */ `
void transformVertex(inout vec3 pos, vec2 uv, inout float shade, inout float alpha) {
  vec2 cuv = aTile.xy / uSize + 0.5;
  float d = clamp(1.0 - cuv.y, 0.0, 1.0);
  float t = easeInOut(stagger(uProgress, d, 0.55));
  float a = uLayer < 0.5 ? uDir * t * PI : -uDir * (1.0 - t) * PI;
  vec3 c = vec3(aTile.xy, 0.0);
  pos = c + rotX(a) * (pos - c);
  pos.z += sin(t * PI) * 0.8 * uIntensity;
  shade = 1.0 - 0.5 * abs(sin(a));
}
`;

/** Shatter: slide di atas pecah jadi ubin yang terlempar keluar (berputar 3D) mulai dari pusat. */
const SHATTER_VERTEX = /* glsl */ `
void transformVertex(inout vec3 pos, vec2 uv, inout float shade, inout float alpha) {
  if (!isAnim()) return;
  float I = min(uIntensity, 1.6);
  float q = animQ();
  vec2 cuv = aTile.xy / uSize + 0.5;
  float r = aTile.z;
  float d = clamp(length((cuv - 0.5) * vec2(1.6, 1.0)) * 0.75 + r * 0.25, 0.0, 1.0);
  float t = stagger(q, d, 0.6);
  vec3 c = vec3(aTile.xy, 0.0);
  float ang = (r - 0.5) * 7.0 * t * I;
  pos = c + rotZ(ang * 0.6) * (rotY(ang) * (pos - c));
  vec2 dir = normalize(aTile.xy + vec2(0.001, 0.0));
  pos += vec3(dir * t * t * 7.0 * I, t * (2.0 + 4.0 * r) * I);
  alpha = 1.0 - smoothstep(0.6, 1.0, t);
  shade = 1.0 - 0.3 * t;
}
`;

/** Halftone: titik-titik membesar (menyapu diagonal) sampai menutup seluruh slide baru. */
const HALFTONE_FRAGMENT = /* glsl */ `
vec4 shadeFragment(vec2 uv, float shade, float alpha) {
  vec2 g = vec2(48.0, 27.0);
  vec2 cell = floor(uv * g);
  float dist = length(fract(uv * g) - 0.5);
  float dl = (cell.x / g.x + (1.0 - cell.y / g.y)) * 0.5;
  float t = clamp((uProgress - dl * 0.5) / 0.5, 0.0, 1.0);
  float rad = t * 0.85;
  vec4 c = texture2D(uMap, uv);
  c.a = uLayer > 0.5 ? 1.0 - smoothstep(rad - 0.08, rad, dist) : 1.0;
  return c;
}
`;

/** Digital Glitch: pita bergeser acak, pemisahan kanal RGB, blok korup, scanline. */
const GLITCH_FRAGMENT = /* glsl */ `
vec4 shadeFragment(vec2 uv, float shade, float alpha) {
  float p = uProgress;
  float f = sin(p * PI);
  float I = clamp(uIntensity, 0.4, 2.0);
  float tq = floor(p * 26.0);                      // waktu terkuantisasi → glitch "patah-patah"
  float band = floor(uv.y * 30.0);
  float on = step(0.6, hash21(vec2(band, tq)));
  float shift = (hash21(vec2(band + 11.0, tq)) - 0.5) * 0.28 * f * I * on;
  float blk = step(0.93, hash21(vec2(floor(uv.x * 12.0), floor(uv.y * 18.0) + tq)));
  vec2 st = uv + vec2(shift + blk * 0.06 * f, 0.0);
  float ca = 0.014 * f * I;
  vec4 c;
  c.r = texture2D(uMap, st + vec2(ca, 0.0)).r;
  c.g = texture2D(uMap, st).g;
  c.b = texture2D(uMap, st - vec2(ca, 0.0)).b;
  c.rgb *= 1.0 - 0.07 * f * sin(uv.y * 900.0);
  c.rgb += blk * 0.15 * f;
  float a = 1.0;
  if (uLayer > 0.5) a = step(hash21(vec2(band, floor(uv.x * 6.0) + 3.0)), smoothstep(0.3, 0.7, p));
  c.a = a;
  return c;
}
`;

/** Layer dasar Magic Move: crossfade bersih (elemen bersama dianimasikan terpisah oleh engine). */
const MAGIC_FRAGMENT = /* glsl */ `
vec4 shadeFragment(vec2 uv, float shade, float alpha) {
  vec4 c = texture2D(uMap, uv);
  c.a = uLayer > 0.5 ? smoothstep(0.08, 0.72, uProgress) : 1.0;
  return c;
}
`;

/** Warp Zoom: kedua slide terseret zoom radial (blur bergerak) seperti terbang menembus terowongan. */
const CROSSZOOM_FRAGMENT = /* glsl */ `
vec4 shadeFragment(vec2 uv, float shade, float alpha) {
  float p = uProgress;
  float I = clamp(uIntensity, 0.4, 2.0);
  float e = smoothstep(0.0, 1.0, p);
  // Slide keluar membesar (menembus kamera); slide masuk dimulai membesar lalu mengecil ke ukuran normal.
  // Keduanya hanya menyampel di dalam rentang tekstur → tanpa tepi/klem.
  float scale = uLayer < 0.5 ? mix(1.0, 0.5, e) : mix(0.6, 1.0, e);
  float strength = sin(p * PI) * 0.3 * I;
  vec2 c = uv - 0.5;
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 20; i++) {
    float t = float(i) / 19.0;
    float w = 1.0 - t * 0.5;
    acc += texture2D(uMap, 0.5 + c * scale * (1.0 - strength * t)) * w;
    wsum += w;
  }
  vec4 col = acc / wsum;
  col.rgb *= 1.0 + 0.15 * sin(p * PI);
  col.a = uLayer > 0.5 ? smoothstep(0.15, 0.75, p) : 1.0;
  return col;
}
`;

/** Iris Reveal: lingkaran terbuka dari pusat memperlihatkan slide baru; tepi bercahaya. */
const IRIS_FRAGMENT = /* glsl */ `
vec4 shadeFragment(vec2 uv, float shade, float alpha) {
  float p = uProgress;
  float I = clamp(uIntensity, 0.4, 2.0);
  vec2 c = uv - 0.5;
  float d = length(c * vec2(16.0 / 9.0, 1.0));
  float r = p * 1.24;
  vec2 st = uv;
  float a = 1.0;
  float rim = 0.0;
  if (uLayer > 0.5) {
    st = 0.5 + c * mix(0.86, 1.0, p);
    float soft = 0.035;
    a = 1.0 - smoothstep(r - soft, r, d);
    rim = (smoothstep(r - 0.07, r - 0.01, d) - smoothstep(r - 0.01, r + 0.006, d)) * step(0.001, p) * (1.0 - smoothstep(0.85, 1.0, p));
  } else {
    st = 0.5 + c * mix(1.0, 0.94, p);
    shade = 1.0 - 0.35 * p;
  }
  vec4 col = texture2D(uMap, st);
  col.rgb *= shade;
  col.rgb += rim * 0.42 * I;
  col.a = a;
  return col;
}
`;

/** Diagonal Stripes: bilah diagonal menyapu bergantian arah, membuka slide baru. */
const STRIPES_FRAGMENT = /* glsl */ `
vec4 shadeFragment(vec2 uv, float shade, float alpha) {
  float p = uProgress;
  float I = clamp(uIntensity, 0.4, 2.0);
  vec2 g = vec2(uv.x * 1.7778, uv.y);
  float nrm = dot(g, vec2(0.5, 0.866));
  float alng = dot(g, vec2(0.866, -0.5));
  float count = 6.0 + 4.0 * I;
  float idx = floor(nrm * count);
  float dir = mod(idx, 2.0) < 0.5 ? 1.0 : -1.0;
  float t = clamp((alng + 0.5) / 2.05, 0.0, 1.0);
  t = dir > 0.0 ? t : 1.0 - t;
  float delay = hash21(vec2(idx, 3.0)) * 0.18;
  vec4 col = texture2D(uMap, uv);
  if (uLayer > 0.5) {
    float edge = p * 1.22 - delay - t;
    col.a = smoothstep(0.0, 0.03, edge);
    col.rgb += (1.0 - smoothstep(0.0, 0.05, edge)) * step(0.0, edge) * 0.25;
  } else {
    col.rgb *= 1.0 - 0.3 * p;
  }
  return col;
}
`;

/* ------------------------------------------------------------------ */
/* Registri                                                            */
/* ------------------------------------------------------------------ */

export const TRANSITIONS: Record<TransitionId, TransitionDefinition> = {
  fade: {
    id: 'fade',
    label: 'Fluid Fade',
    description: 'Disolusi cair dengan distorsi noise organik.',
    category: 'Klasik',
    segments: [1, 1],
    vertex: FADE_VERTEX,
    fragment: FADE_FRAGMENT,
    onTop: inTop,
    defaults: { duration: 1.2, easing: 'power2.inOut', intensity: 1 },
  },
  slide: {
    id: 'slide',
    label: 'Parallax Push',
    description: 'Slide baru menutup slide lama dengan kedalaman parallax.',
    category: 'Klasik',
    segments: [1, 1],
    vertex: SLIDE_VERTEX,
    onTop: inTop,
    defaults: { duration: 0.9, easing: 'power3.inOut', intensity: 1 },
  },
  zoom: {
    id: 'zoom',
    label: 'Zoom 3D',
    description: 'Menembus kamera menuju slide berikutnya di kedalaman.',
    category: '3D',
    segments: [1, 1],
    vertex: ZOOM_VERTEX,
    onTop: (dir) => (dir > 0 ? 'out' : 'in'),
    defaults: { duration: 1.2, easing: 'power2.inOut', intensity: 1 },
  },
  cube: {
    id: 'cube',
    label: 'Cube Rotate',
    description: 'Dua muka kubus berputar 90° dengan pencahayaan sisi.',
    category: '3D',
    segments: [1, 1],
    vertex: CUBE_VERTEX,
    onTop: inTop,
    defaults: { duration: 1.3, easing: 'power3.inOut', intensity: 1 },
  },
  flip: {
    id: 'flip',
    label: 'Flip Card',
    description: 'Kartu dibalik 180° pada sumbu vertikal.',
    category: '3D',
    segments: [1, 1],
    vertex: FLIP_VERTEX,
    onTop: inTop,
    defaults: { duration: 1.3, easing: 'power2.inOut', intensity: 1 },
  },
  carousel: {
    id: 'carousel',
    label: 'Carousel 3D',
    description: 'Panel slide berputar pada cincin silinder.',
    category: '3D',
    segments: [1, 1],
    vertex: CAROUSEL_VERTEX,
    onTop: inTop,
    defaults: { duration: 1.3, easing: 'power3.inOut', intensity: 1 },
  },
  morph: {
    id: 'morph',
    label: 'Morph Mesh',
    description: 'Vertex slide melengkung menjadi bola, berputar, lalu terbuka.',
    category: 'Morph',
    segments: [96, 54],
    vertex: MORPH_VERTEX,
    onTop: inTop,
    defaults: { duration: 1.9, easing: 'sine.inOut', intensity: 1 },
  },
  ripple: {
    id: 'ripple',
    label: 'Liquid Ripple',
    description: 'Riak air memancar dari pusat mengungkap slide baru.',
    category: 'Morph',
    segments: [96, 54],
    vertex: RIPPLE_VERTEX,
    fragment: RIPPLE_FRAGMENT,
    onTop: inTop,
    defaults: { duration: 1.5, easing: 'power2.inOut', intensity: 1 },
  },
  pixelate: {
    id: 'pixelate',
    label: 'Pixel Morph',
    description: 'Slide memecah menjadi piksel lalu menyusun ulang.',
    category: 'Mosaik',
    segments: [1, 1],
    vertex: IDENTITY_VERTEX,
    fragment: PIXELATE_FRAGMENT,
    onTop: inTop,
    defaults: { duration: 1.1, easing: 'power2.inOut', intensity: 1 },
  },
  wipe: {
    id: 'wipe',
    label: 'Glow Wipe',
    description: 'Sapuan diagonal dengan garis tepi bercahaya.',
    category: 'Klasik',
    segments: [1, 1],
    vertex: IDENTITY_VERTEX,
    fragment: WIPE_FRAGMENT,
    onTop: inTop,
    defaults: { duration: 1.0, easing: 'power3.inOut', intensity: 1 },
  },
  doors: {
    id: 'doors',
    label: 'Barn Doors',
    description: 'Slide terbelah dua dan membuka seperti pintu geser.',
    category: 'Klasik',
    segments: [1, 1],
    vertex: IDENTITY_VERTEX,
    fragment: DOORS_FRAGMENT,
    onTop: (dir) => (dir > 0 ? 'out' : 'in'),
    defaults: { duration: 1.3, easing: 'power3.inOut', intensity: 1 },
  },
  toss: {
    id: 'toss',
    label: 'Card Toss',
    description: 'Kartu slide dilempar ke samping sambil berputar.',
    category: '3D',
    segments: [1, 1],
    vertex: TOSS_VERTEX,
    onTop: (dir) => (dir > 0 ? 'out' : 'in'),
    defaults: { duration: 1.1, easing: 'power3.inOut', intensity: 1 },
  },
  spin: {
    id: 'spin',
    label: 'Spin Zoom',
    description: 'Berputar sambil memperbesar/memperkecil ke slide berikutnya.',
    category: '3D',
    segments: [1, 1],
    vertex: SPIN_VERTEX,
    onTop: inTop,
    defaults: { duration: 1.3, easing: 'power2.inOut', intensity: 1 },
  },
  roll: {
    id: 'roll',
    label: 'Page Curl',
    description: 'Halaman terkelupas dan menggulung, sisi belakang tampak.',
    category: '3D',
    segments: [160, 4],
    doubleSided: true,
    vertex: ROLL_VERTEX,
    fragment: ROLL_FRAGMENT,
    onTop: (dir) => (dir > 0 ? 'out' : 'in'),
    defaults: { duration: 1.6, easing: 'power2.inOut', intensity: 1 },
  },
  swirl: {
    id: 'swirl',
    label: 'Vortex Twist',
    description: 'Bidang terpelintir seperti pusaran lalu terurai.',
    category: 'Morph',
    segments: [96, 54],
    vertex: SWIRL_VERTEX,
    onTop: inTop,
    defaults: { duration: 1.6, easing: 'sine.inOut', intensity: 1 },
  },
  tiles: {
    id: 'tiles',
    label: 'Mosaic Flip',
    description: 'Grid ubin terbalik berurutan dalam gelombang diagonal.',
    category: 'Mosaik',
    segments: [1, 1],
    tiles: [20, 12],
    vertex: TILES_VERTEX,
    onTop: inTop,
    defaults: { duration: 1.6, easing: 'power2.inOut', intensity: 1 },
  },
  blinds: {
    id: 'blinds',
    label: 'Venetian Blinds',
    description: 'Bilah horizontal berputar bergiliran dari atas.',
    category: 'Mosaik',
    segments: [1, 1],
    tiles: [1, 10],
    vertex: BLINDS_VERTEX,
    onTop: inTop,
    defaults: { duration: 1.4, easing: 'power2.inOut', intensity: 1 },
  },
  shatter: {
    id: 'shatter',
    label: 'Shatter',
    description: 'Slide pecah menjadi keping 3D yang beterbangan.',
    category: 'Mosaik',
    segments: [1, 1],
    tiles: [24, 14],
    vertex: SHATTER_VERTEX,
    onTop: (dir) => (dir > 0 ? 'out' : 'in'),
    defaults: { duration: 1.5, easing: 'power2.inOut', intensity: 1 },
  },
  halftone: {
    id: 'halftone',
    label: 'Halftone Dots',
    description: 'Titik-titik tumbuh menutupi slide baru.',
    category: 'Mosaik',
    segments: [1, 1],
    vertex: IDENTITY_VERTEX,
    fragment: HALFTONE_FRAGMENT,
    onTop: inTop,
    defaults: { duration: 1.4, easing: 'sine.inOut', intensity: 1 },
  },
  magic: {
    id: 'magic',
    label: 'Magic Move',
    description: 'Logo/foto ber-tag sama bergeser mulus lalu mekar menjadi elemen baru — tanpa potongan keras.',
    category: 'Morph',
    segments: [1, 1],
    magic: true,
    vertex: IDENTITY_VERTEX,
    fragment: MAGIC_FRAGMENT,
    onTop: inTop,
    defaults: { duration: 1.7, easing: 'power3.inOut', intensity: 1 },
  },
  glitch: {
    id: 'glitch',
    label: 'Digital Glitch',
    description: 'Gangguan sinyal: pita bergeser, RGB terpisah, blok korup.',
    category: 'Efek',
    segments: [1, 1],
    vertex: IDENTITY_VERTEX,
    fragment: GLITCH_FRAGMENT,
    onTop: inTop,
    defaults: { duration: 1.0, easing: 'power2.inOut', intensity: 1 },
  },
  crosszoom: {
    id: 'crosszoom',
    label: 'Warp Zoom',
    description: 'Zoom radial dengan blur gerak — seperti terbang menembus terowongan ke slide berikutnya.',
    category: 'Efek',
    segments: [1, 1],
    vertex: IDENTITY_VERTEX,
    fragment: CROSSZOOM_FRAGMENT,
    onTop: inTop,
    defaults: { duration: 1.3, easing: 'power2.inOut', intensity: 1 },
  },
  iris: {
    id: 'iris',
    label: 'Iris Reveal',
    description: 'Lingkaran terbuka dari pusat dengan tepi bercahaya mengungkap slide baru.',
    category: 'Klasik',
    segments: [1, 1],
    vertex: IDENTITY_VERTEX,
    fragment: IRIS_FRAGMENT,
    onTop: inTop,
    defaults: { duration: 1.3, easing: 'power3.inOut', intensity: 1 },
  },
  stripes: {
    id: 'stripes',
    label: 'Diagonal Stripes',
    description: 'Bilah diagonal menyapu bergantian arah membuka slide baru.',
    category: 'Mosaik',
    segments: [1, 1],
    vertex: IDENTITY_VERTEX,
    fragment: STRIPES_FRAGMENT,
    onTop: inTop,
    defaults: { duration: 1.2, easing: 'power2.inOut', intensity: 1 },
  },
};

export const TRANSITION_CATEGORIES = ['Klasik', '3D', 'Morph', 'Mosaik', 'Efek'] as const;

export const TRANSITION_LIST: TransitionDefinition[] = Object.values(TRANSITIONS);

export const EASING_OPTIONS: { id: EasingId; label: string }[] = [
  { id: 'power2.inOut', label: 'Halus' },
  { id: 'power3.inOut', label: 'Dinamis' },
  { id: 'expo.inOut', label: 'Sinematik (Expo)' },
  { id: 'sine.inOut', label: 'Lembut (Sine)' },
  { id: 'circ.inOut', label: 'Melengkung (Circ)' },
  { id: 'power4.out', label: 'Meluncur (Out)' },
];

export function fragmentFor(def: TransitionDefinition): string {
  return def.fragment ?? DEFAULT_FRAGMENT;
}

export function defaultTransition(type: TransitionId): TransitionConfig {
  return { type, ...TRANSITIONS[type].defaults };
}
