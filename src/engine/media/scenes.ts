import type { Language } from '../../types';
import { rgba } from '../../utils/color';

/**
 * Katalog animasi generatif: ilustrasi bergerak yang digambar dengan kode (Canvas 2D) — tanpa berkas, tanpa jaringan,
 * jadi ikut terbawa utuh ke hasil ekspor. Setiap adegan murni fungsi waktu `t` (detik) → deterministik, tanpa state.
 * Label penjelas (mis. "Eritrosit", "Nukleus") mengikuti bahasa proyek.
 */

export const SCENE_W = 960;
export const SCENE_H = 540;
const W = SCENE_W;
const H = SCENE_H;
const TAU = Math.PI * 2;

type C = CanvasRenderingContext2D;
export interface SceneOpts {
  lang: Language;
  /** Rentang x adegan yang benar-benar terlihat (kartu potret memangkas sisi kiri-kanan) → label ditempatkan di dalamnya. */
  safe?: [number, number];
}

/** Area terlihat untuk penggambaran yang sedang berjalan (diatur `drawScene`). */
let SAFE: [number, number] = [0, SCENE_W];
/** Kotak label yang sudah digambar pada frame ini — label berikutnya menghindarinya (kartu potret memadatkan adegan). */
let PLACED: [number, number, number, number][] = [];
type Draw = (ctx: C, t: number, o: SceneOpts) => void;

export interface SceneDef {
  id: string;
  label: string;
  description: string;
  /** Kata kunci (id + en, bentuk dasar) untuk mencocokkan topik slide. */
  keywords: string[];
  /** Warna kartu pratinjau. */
  accent: string;
  draw: Draw;
}

/* ------------------------------ util ------------------------------ */

const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const rnd = (i: number, k = 0): number => hash(i * 7.31 + k * 13.77 + 1.13);
const mod = (a: number, n: number): number => ((a % n) + n) % n;
const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number): number => {
  const x = clamp((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const easeOut = (x: number): number => 1 - Math.pow(1 - clamp(x), 3);

function glow(ctx: C, x: number, y: number, r: number, color: string, a: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Persegi bulat dengan radius per sudut [kiri-atas, kanan-atas, kanan-bawah, kiri-bawah] (tanpa ctx.roundRect agar aman di browser lama). */
function rrect(ctx: C, x: number, y: number, w: number, h: number, r: [number, number, number, number]): void {
  const [a, b, c, d] = r.map((v) => Math.min(v, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + a, y);
  ctx.lineTo(x + w - b, y);
  ctx.arcTo(x + w, y, x + w, y + b, b);
  ctx.lineTo(x + w, y + h - c);
  ctx.arcTo(x + w, y + h, x + w - c, y + h, c);
  ctx.lineTo(x + d, y + h);
  ctx.arcTo(x, y + h, x, y + h - d, d);
  ctx.lineTo(x, y + a);
  ctx.arcTo(x, y, x + a, y, a);
  ctx.closePath();
}

function vgrad(ctx: C, stops: [number, string][]): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function vignette(ctx: C, a = 0.5): void {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.66);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Label penjelas dengan garis penunjuk. `side` = arah teks (1 kanan, -1 kiri). */
function tag(ctx: C, x: number, y: number, text: string, prefSide: 1 | -1 = 1, alpha = 1, rise = 1): void {
  const [s0, s1] = SAFE;
  if (alpha <= 0.02 || x < s0 + 8 || x > s1 - 8) return; // sasaran di luar area terlihat
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '600 17px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width;
  // Balik arah bila teks tidak muat di sisi pilihan (mis. pada kartu potret yang memangkas tepi).
  const need = 40 + 22 + w + 10;
  const roomR = s1 - 8 - x;
  const roomL = x - (s0 + 8);
  const side: 1 | -1 = (prefSide > 0 ? roomR >= need || roomR >= roomL : !(roomL >= need || roomL >= roomR)) ? 1 : -1;
  const ex = x + side * 40;
  const tx = side > 0 ? ex + 22 : ex - 22 - w;
  const px = clamp(tx, s0 + 12, Math.max(s0 + 12, s1 - w - 12));
  // Geser label (searah `rise`) sampai tidak menumpuk label lain.
  let ey = y - 30 * rise;
  const step = rise >= 0 ? -34 : 34;
  for (let i = 0; i < 6; i++) {
    const hit = PLACED.some(([a, b, c, d]) => px - 9 < c && px + w + 9 > a && ey - 15 < d && ey + 15 > b);
    if (!hit) break;
    ey += step;
  }
  PLACED.push([px - 9, ey - 15, px + w + 9, ey + 15]);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ex, ey);
  ctx.lineTo(ex + side * 14, ey);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, 3.4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(6,8,20,0.62)';
  rrect(ctx, px - 9, ey - 15, w + 18, 30, [15, 15, 15, 15]);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(text, px, ey + 1);
  ctx.restore();
}

const L = (o: SceneOpts, id: string, en: string): string => (o.lang === 'en' ? en : id);

function ellipse(ctx: C, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
}

/* ------------------------------ adegan ------------------------------ */

/** Sel darah mengalir di pembuluh: eritrosit (cakram bikonkaf berputar), leukosit, trombosit. */
const blood: Draw = (ctx, t, o) => {
  vgrad(ctx, [[0, '#2b0710'], [1, '#12030a']]);
  const cy = H / 2;
  const half = 172;

  // Dinding pembuluh (jaringan endotel) + lumen berisi plasma.
  const wall = ctx.createLinearGradient(0, cy - half - 46, 0, cy + half + 46);
  wall.addColorStop(0, '#b5566a');
  wall.addColorStop(0.5, '#6e1c2c');
  wall.addColorStop(1, '#b5566a');
  ctx.fillStyle = wall;
  ctx.fillRect(0, cy - half - 46, W, half * 2 + 92);
  const lumen = ctx.createLinearGradient(0, cy - half, 0, cy + half);
  lumen.addColorStop(0, '#4a0b18');
  lumen.addColorStop(0.5, '#8a2032');
  lumen.addColorStop(1, '#4a0b18');
  ctx.fillStyle = lumen;
  ctx.fillRect(0, cy - half, W, half * 2);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 16; i++) {
      const x = mod(i * 68 - t * 9, W + 68) - 34;
      ellipse(ctx, x, cy + side * (half + 22), 34, 12);
      ctx.fillStyle = 'rgba(232,140,158,0.30)';
      ctx.fill();
    }
  }

  const flow = (lane: number, k: number) => 1.15 - lane * lane * 0.7 * k; // aliran lebih cepat di tengah
  const pos = (i: number, span: number, speed: number, lane: number, salt: number) => ({
    x: mod(rnd(i, salt) * span + t * speed * flow(lane, 1), span) - 90,
    y: cy + lane * (half - 44) + Math.sin(t * 1.3 + i * 2.1) * 9,
  });

  // Trombosit (keping darah).
  for (let i = 0; i < 30; i++) {
    const lane = rnd(i, 21) * 2 - 1;
    const { x, y } = pos(i, W + 180, 86, lane, 22);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 1.5 + i);
    ellipse(ctx, 0, 0, 7 + rnd(i, 23) * 3, 4.5);
    ctx.fillStyle = '#ffc8a8';
    ctx.fill();
    ctx.restore();
  }

  // Eritrosit — cakram bikonkaf yang berputar (tampak menyempit saat menyamping).
  const rbc: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const lane = rnd(i, 1) * 2 - 1;
    const { x, y } = pos(i, W + 180, 78 * (0.85 + rnd(i, 2) * 0.3), lane, 3);
    const r = 21 + rnd(i, 4) * 11;
    const a = t * (0.6 + rnd(i, 5) * 1.2) + i * 1.7;
    const sq = 0.4 + 0.6 * Math.abs(Math.cos(a));
    rbc.push({ x, y, r });
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 0.8 + i) * 0.5);
    const g = ctx.createRadialGradient(0, 0, r * 0.05, 0, 0, r);
    g.addColorStop(0, '#9c0f27');
    g.addColorStop(0.45, '#d92b46');
    g.addColorStop(0.8, '#f2586b');
    g.addColorStop(1, '#ff8a96');
    ellipse(ctx, 0, 0, r, r * sq);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,190,198,0.55)';
    ctx.stroke();
    ctx.restore();
  }

  // Leukosit — lebih besar, pucat, berinti bergelambir.
  const wbcLane = [-0.45, 0.42, 0.02];
  const wbc: { x: number; y: number }[] = [];
  wbcLane.forEach((lane, i) => {
    const x = mod(i * 330 + t * 26 * flow(lane, 1), W + 300) - 150;
    const y = cy + lane * (half - 60) + Math.sin(t * 0.9 + i) * 8;
    wbc.push({ x, y });
    const g = ctx.createRadialGradient(x - 10, y - 12, 4, x, y, 50);
    g.addColorStop(0, '#fbf6ff');
    g.addColorStop(1, '#bfaee6');
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(x, y, 48 + Math.sin(t * 2 + i) * 1.5, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + 0.6 + t * 0.15;
      ctx.fillStyle = '#5a3aa6';
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 15, y + Math.sin(a) * 14, 15, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(120,90,190,0.5)';
    for (let k = 0; k < 14; k++) {
      ctx.beginPath();
      ctx.arc(x + Math.cos(k * 1.9) * 33, y + Math.sin(k * 2.7) * 33, 2, 0, TAU);
      ctx.fill();
    }
  });
  vignette(ctx, 0.55);

  // Label mengikuti sel; pudar di dekat tepi layar.
  const edge = (x: number) => smooth(SAFE[0] + 20, SAFE[0] + 110, x) * (1 - smooth(SAFE[1] - 110, SAFE[1] - 20, x));
  tag(ctx, wbc[0].x, wbc[0].y - 44, L(o, 'Leukosit (sel darah putih)', 'White blood cell'), 1, edge(wbc[0].x), 0.9);
  tag(ctx, rbc[0].x, rbc[0].y - rbc[0].r * 0.6, L(o, 'Eritrosit (sel darah merah)', 'Red blood cell'), -1, edge(rbc[0].x), 1);
};

/** Sel hewan: membran bergelombang, nukleus, mitokondria mengorbit, badan Golgi, ribosom. */
const cell: Draw = (ctx, t, o) => {
  const bg = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.6);
  bg.addColorStop(0, '#0f3438');
  bg.addColorStop(1, '#04121a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H / 2 + 6;
  const R = 208;
  const memb = (a: number, inset = 0) => R - inset + 6 * Math.sin(3 * a + t * 0.9) + 4 * Math.sin(5 * a - t * 1.3);
  const path = (inset: number) => {
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * TAU;
      const r = memb(a, inset);
      const x = cx + Math.cos(a) * r * 1.22;
      const y = cy + Math.sin(a) * r * 0.98;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
  };
  path(0);
  const fill = ctx.createRadialGradient(cx - 60, cy - 70, 20, cx, cy, R * 1.2);
  fill.addColorStop(0, 'rgba(140,240,200,0.42)');
  fill.addColorStop(0.6, 'rgba(50,150,150,0.30)');
  fill.addColorStop(1, 'rgba(14,80,92,0.42)');
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = '#7ff0d0';
  ctx.shadowBlur = 18;
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#a6f5dc';
  ctx.stroke();
  ctx.shadowBlur = 0;
  path(12);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(200,255,240,0.4)';
  ctx.stroke();

  // Sitoplasma: ribosom & vesikel melayang.
  for (let i = 0; i < 48; i++) {
    const a = rnd(i, 1) * TAU + t * (0.03 + rnd(i, 2) * 0.05);
    const rr = Math.sqrt(rnd(i, 3)) * R * 0.9;
    const x = cx + Math.cos(a) * rr * 1.2 + Math.sin(t * 0.7 + i) * 4;
    const y = cy + Math.sin(a) * rr * 0.95 + Math.cos(t * 0.6 + i) * 4;
    ctx.fillStyle = i % 5 === 0 ? 'rgba(255,220,140,0.55)' : 'rgba(200,255,240,0.45)';
    ctx.beginPath();
    ctx.arc(x, y, i % 5 === 0 ? 4 : 2.2, 0, TAU);
    ctx.fill();
  }

  // Retikulum endoplasma.
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(120,220,205,0.55)';
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    for (let x = -120; x <= 120; x += 6) {
      const y = 96 + k * 12 + Math.sin(x * 0.06 + t * 1.4 + k) * 8;
      if (x === -120) ctx.moveTo(cx - 30 + x, cy + y);
      else ctx.lineTo(cx - 30 + x, cy + y);
    }
    ctx.stroke();
  }

  // Nukleus.
  const nx = cx - 12;
  const ny = cy - 4;
  const nr = 74 * (1 + 0.015 * Math.sin(t * 1.6));
  glow(ctx, nx, ny, nr * 1.7, '#8a6cff', 0.35);
  const ng = ctx.createRadialGradient(nx - 20, ny - 24, 8, nx, ny, nr);
  ng.addColorStop(0, '#a58cff');
  ng.addColorStop(1, '#3a2a99');
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.arc(nx, ny, nr, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(210,200,255,0.75)';
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.5;
  for (let k = 0; k < 6; k++) {
    ctx.beginPath();
    for (let a = 0; a < 5; a += 0.2) {
      const rr = 14 + a * 8 + Math.sin(a * 3 + t + k) * 3;
      const x = nx + Math.cos(a + k * 1.05) * rr;
      const y = ny + Math.sin(a + k * 1.05) * rr;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  glow(ctx, nx + 14, ny - 12, 26, '#ffcf5c', 0.9);
  ctx.fillStyle = '#ffd77a';
  ctx.beginPath();
  ctx.arc(nx + 14, ny - 12, 13, 0, TAU);
  ctx.fill();

  // Mitokondria mengorbit.
  const mito: { x: number; y: number }[] = [];
  for (let k = 0; k < 3; k++) {
    const a = t * 0.22 + k * 2.09;
    const x = cx + Math.cos(a) * 158;
    const y = cy + Math.sin(a) * 118;
    mito.push({ x, y });
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    const g = ctx.createLinearGradient(0, -18, 0, 18);
    g.addColorStop(0, '#ffb070');
    g.addColorStop(1, '#c94b2a');
    ellipse(ctx, 0, 0, 36, 18);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffd9b0';
    ctx.stroke();
    ctx.beginPath();
    for (let i = -24; i <= 24; i += 8) {
      ctx.moveTo(i, i % 16 === 0 ? -11 : 11);
      ctx.lineTo(i + 4, i % 16 === 0 ? 11 : -11);
    }
    ctx.strokeStyle = 'rgba(255,225,190,0.7)';
    ctx.stroke();
    ctx.restore();
  }

  // Badan Golgi.
  const gx = cx + 122;
  const gy = cy - 96;
  ctx.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.arc(gx, gy + k * 11 - 20, 34 - k * 3, Math.PI * 1.1 + Math.sin(t + k) * 0.05, Math.PI * 1.9);
    ctx.lineWidth = 6;
    ctx.strokeStyle = `rgba(255,209,102,${0.95 - k * 0.12})`;
    ctx.stroke();
  }
  vignette(ctx, 0.5);

  tag(ctx, cx + Math.cos(2.5) * memb(2.5) * 1.22, cy + Math.sin(2.5) * memb(2.5) * 0.98, L(o, 'Membran sel', 'Cell membrane'), -1, 1, -0.9);
  tag(ctx, nx - nr * 0.7, ny - nr * 0.7, L(o, 'Nukleus (inti sel)', 'Nucleus'), -1, 1, 1);
  tag(ctx, mito[0].x, mito[0].y + 12, L(o, 'Mitokondria', 'Mitochondrion'), 1, 1, -0.6);
  tag(ctx, gx + 14, gy - 22, L(o, 'Badan Golgi', 'Golgi apparatus'), 1, 1, 1);
};

/** Jantung berdetak (lub-dub) dengan gelombang EKG bergulir. */
const heart: Draw = (ctx, t, o) => {
  vgrad(ctx, [[0, '#1a0524'], [1, '#050208']]);
  const period = 60 / 72;
  const ph = mod(t / period, 1);
  const p = mod(ph - 0.25, 1);
  const beat = Math.exp(-Math.pow((p - 0.06) / 0.045, 2)) + 0.55 * Math.exp(-Math.pow((p - 0.26) / 0.06, 2));
  const cx = W / 2;
  const cy = H * 0.4;
  const r = 138 * (1 + 0.085 * beat);
  glow(ctx, cx, cy, 340, '#ff3b78', 0.28 + 0.2 * beat);

  // Riak denyut.
  for (let k = 0; k < 3; k++) {
    const q = mod(t / period + k / 3, 1);
    ctx.strokeStyle = `rgba(255,110,150,${(1 - q) * 0.4})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r * (0.85 + q * 1.05), 0, TAU);
    ctx.stroke();
  }
  // Bentuk hati (kurva parametrik).
  const k = r / 17;
  ctx.beginPath();
  for (let i = 0; i <= 160; i++) {
    const a = (i / 160) * TAU;
    const x = 16 * Math.pow(Math.sin(a), 3);
    const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
    if (i) ctx.lineTo(cx + x * k, cy - y * k + r * 0.05);
    else ctx.moveTo(cx + x * k, cy - y * k + r * 0.05);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, '#ff6f8f');
  g.addColorStop(0.55, '#e0245e');
  g.addColorStop(1, '#8f0f3e');
  ctx.fillStyle = g;
  ctx.shadowColor = '#ff3b78';
  ctx.shadowBlur = 30;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,200,215,0.5)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.42, cy - r * 0.42, r * 0.22, r * 0.12, -0.7, 0, TAU);
  ctx.fill();

  // Grid + EKG.
  const base = H * 0.86;
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let x = 40; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, base - 90);
    ctx.lineTo(x, base + 40);
    ctx.stroke();
  }
  for (let y = base - 80; y <= base + 40; y += 30) {
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(W - 40, y);
    ctx.stroke();
  }
  const ecg = (q: number): number =>
    0.1 * Math.exp(-Math.pow((q - 0.18) / 0.03, 2)) -
    0.12 * Math.exp(-Math.pow((q - 0.295) / 0.012, 2)) +
    Math.exp(-Math.pow((q - 0.31) / 0.011, 2)) -
    0.25 * Math.exp(-Math.pow((q - 0.325) / 0.012, 2)) +
    0.22 * Math.exp(-Math.pow((q - 0.55) / 0.05, 2));
  const speed = 190;
  ctx.beginPath();
  let hy = base;
  for (let x = 40; x <= W - 40; x += 3) {
    const tx = t - (W - 40 - x) / speed;
    const y = base - ecg(mod(tx / period, 1)) * 74;
    hy = y;
    if (x === 40) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = '#5cffb1';
  ctx.shadowColor = '#5cffb1';
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;
  glow(ctx, W - 40, hy, 26, '#5cffb1', 0.9);
  ctx.fillStyle = '#eafff5';
  ctx.beginPath();
  ctx.arc(W - 40, hy, 5, 0, TAU);
  ctx.fill();

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.font = '800 54px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('72', 52, 92);
  ctx.font = '600 20px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('BPM', 128, 92);
  ctx.font = '500 17px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(L(o, 'Detak jantung normal', 'Normal heart rate'), 54, 120);
  vignette(ctx, 0.4);
};

/** Heliks ganda DNA berputar dengan pasangan basa. */
const dna: Draw = (ctx, t, o) => {
  vgrad(ctx, [[0, '#07051b'], [1, '#1b0f3c']]);
  glow(ctx, W / 2, H / 2, 420, '#6a4dff', 0.16);
  const A = 96;
  const step = 14;
  const n = Math.ceil((W + 340) / step);
  const rot = -0.22;
  const pt = (i: number) => {
    const x = -W / 2 - 170 + i * step;
    const ang = x * 0.026 + t * 1.1;
    return { x, ang, y1: A * Math.sin(ang), z: Math.cos(ang) };
  };
  const toScreen = (x: number, y: number) => ({
    x: W / 2 + x * Math.cos(rot) - y * Math.sin(rot),
    y: H / 2 + x * Math.sin(rot) + y * Math.cos(rot),
  });
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(rot);
  // Pasangan basa.
  for (let i = 0; i < n; i += 2) {
    const { x, y1, z } = pt(i);
    const a = 0.3 + 0.5 * ((z + 1) / 2);
    const pair = i % 4 === 0 ? ['#ff6b9d', '#5ce1e6'] : ['#ffd166', '#a78bfa'];
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(pair[0], a);
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, 0);
    ctx.stroke();
    ctx.strokeStyle = rgba(pair[1], a);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, -y1);
    ctx.stroke();
  }
  // Tulang punggung gula-fosfat.
  for (const s of [1, -1]) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const { x, y1 } = pt(i);
      if (i) ctx.lineTo(x, y1 * s);
      else ctx.moveTo(x, y1 * s);
    }
    ctx.lineWidth = 6;
    ctx.strokeStyle = s > 0 ? 'rgba(124,245,255,0.5)' : 'rgba(255,124,224,0.5)';
    ctx.stroke();
  }
  // Bola fosfat diurutkan berdasarkan kedalaman.
  const balls: { x: number; y: number; z: number; c: string }[] = [];
  for (let i = 0; i < n; i += 1) {
    const { x, y1, z } = pt(i);
    balls.push({ x, y: y1, z, c: '#7cf5ff' }, { x, y: -y1, z: -z, c: '#ff7ce0' });
  }
  balls.sort((a, b) => a.z - b.z);
  for (const b of balls) {
    const r = 6.5 + 3.5 * b.z;
    ctx.fillStyle = rgba(b.c, 0.55 + 0.45 * ((b.z + 1) / 2));
    ctx.beginPath();
    ctx.arc(b.x, b.y, Math.max(2, r), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  vignette(ctx, 0.45);
  const i0 = Math.round((-150 + W / 2 + 170) / step);
  const a = pt(i0);
  const sp = toScreen(a.x, a.y1);
  tag(ctx, sp.x, sp.y, L(o, 'Tulang punggung gula–fosfat', 'Sugar–phosphate backbone'), -1, 1, 1);
  const i1 = Math.round((150 + W / 2 + 170) / step / 2) * 2;
  const b = pt(i1 - (i1 % 4 === 0 ? 0 : 2));
  const sp2 = toScreen(b.x, 0);
  tag(ctx, sp2.x, sp2.y, L(o, 'Pasangan basa (A–T, G–C)', 'Base pairs (A–T, G–C)'), 1, 1, -0.9);
};

/** Atom: inti (proton + neutron) dan elektron beredar di orbit miring dengan jejak cahaya. */
const atom: Draw = (ctx, t, o) => {
  const bg = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.6);
  bg.addColorStop(0, '#111a4d');
  bg.addColorStop(1, '#03030c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H / 2;
  glow(ctx, cx, cy, 130, '#7aa2ff', 0.4);
  const tilt = [0, Math.PI / 3, (2 * Math.PI) / 3];
  const orbit = (k: number) => ({ rx: 250, ry: 88, rot: tilt[k] + t * 0.06 });
  const at = (k: number, a: number) => {
    const { rx, ry, rot } = orbit(k);
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    return { x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) };
  };
  for (let k = 0; k < 3; k++) {
    const { rx, ry, rot } = orbit(k);
    ctx.strokeStyle = 'rgba(170,200,255,0.28)';
    ctx.lineWidth = 1.8;
    ellipse(ctx, cx, cy, rx, ry, rot);
    ctx.stroke();
  }
  // Inti.
  for (let i = 0; i < 12; i++) {
    const a = i * 2.39996;
    const rr = 11 * Math.sqrt(i + 0.5);
    const x = cx + Math.cos(a) * rr + Math.sin(t * 3 + i * 2) * 1.5;
    const y = cy + Math.sin(a) * rr + Math.cos(t * 3.3 + i) * 1.5;
    const proton = i % 2 === 0;
    const g = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 13);
    g.addColorStop(0, proton ? '#ff9aa6' : '#c3d0ff');
    g.addColorStop(1, proton ? '#d3243d' : '#5670d6');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 12.5, 0, TAU);
    ctx.fill();
  }
  // Elektron + jejak.
  let e0 = { x: 0, y: 0 };
  for (let k = 0; k < 3; k++) {
    const w = 1.5 + k * 0.28;
    const a0 = t * w + k * 2.1;
    for (let j = 26; j >= 0; j--) {
      const p = at(k, a0 - j * 0.045);
      const f = 1 - j / 26;
      ctx.fillStyle = `rgba(92,240,255,${f * 0.45})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2 + f * 5, 0, TAU);
      ctx.fill();
    }
    const p = at(k, a0);
    if (k === 0) e0 = p;
    glow(ctx, p.x, p.y, 30, '#5cf0ff', 0.85);
    ctx.fillStyle = '#eaffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, TAU);
    ctx.fill();
  }
  vignette(ctx, 0.4);
  tag(ctx, cx - 14, cy + 26, L(o, 'Nukleus: proton (+) & neutron', 'Nucleus: protons (+) & neutrons'), -1, 1, -1.1);
  tag(ctx, e0.x, e0.y, L(o, 'Elektron (−)', 'Electron (−)'), e0.x > cx ? 1 : -1, 1, e0.y > cy ? -0.9 : 1.1);
};

/** Tata surya: planet mengelilingi Matahari pada orbit elips. */
const solar: Draw = (ctx, t, o) => {
  vgrad(ctx, [[0, '#02030c'], [1, '#0a0a26']]);
  for (let i = 0; i < 110; i++) {
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.6 + rnd(i, 3)) + i));
    ctx.fillStyle = `rgba(255,255,255,${tw * 0.7})`;
    ctx.fillRect(rnd(i, 1) * W, rnd(i, 2) * H, 1.6, 1.6);
  }
  const cx = W / 2;
  const cy = H / 2 + 6;
  const ratio = 0.36;
  const planets = [
    { n: ['Merkurius', 'Mercury'], r: 70, s: 1.7, size: 5, c: '#b8b0a8' },
    { n: ['Venus', 'Venus'], r: 108, s: 1.25, size: 8, c: '#f2c48d' },
    { n: ['Bumi', 'Earth'], r: 148, s: 1.0, size: 9, c: '#4a90ff' },
    { n: ['Mars', 'Mars'], r: 192, s: 0.8, size: 7, c: '#e2673a' },
    { n: ['Jupiter', 'Jupiter'], r: 258, s: 0.46, size: 20, c: '#e9b57a' },
    { n: ['Saturnus', 'Saturn'], r: 330, s: 0.32, size: 15, c: '#e7d29a' },
  ];
  planets.forEach((p) => {
    ctx.strokeStyle = 'rgba(190,210,255,0.18)';
    ctx.lineWidth = 1.4;
    ellipse(ctx, cx, cy, p.r, p.r * ratio);
    ctx.stroke();
  });
  const pos = planets.map((p, i) => {
    const a = t * 0.55 * p.s + i * 1.3;
    return { a, x: cx + Math.cos(a) * p.r, y: cy + Math.sin(a) * p.r * ratio };
  });
  const drawPlanet = (i: number) => {
    const p = planets[i];
    const { x, y, a } = pos[i];
    const depth = 0.85 + 0.25 * Math.sin(a);
    const r = p.size * depth;
    if (i === 5) {
      ctx.strokeStyle = 'rgba(231,210,154,0.85)';
      ctx.lineWidth = 3.5;
      ellipse(ctx, x, y, r * 2.1, r * 0.72, -0.25);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, p.c);
    g.addColorStop(1, '#1a1a2a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    if (i === 2) {
      const ma = t * 3;
      ctx.fillStyle = '#e8e8f0';
      ctx.beginPath();
      ctx.arc(x + Math.cos(ma) * 17, y + Math.sin(ma) * 7, 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textBaseline = 'middle';
    ctx.fillText(L(o, p.n[0], p.n[1]), x + r + 6, y - r - 3);
  };
  pos.forEach((p, i) => Math.sin(p.a) < 0 && drawPlanet(i));
  glow(ctx, cx, cy, 130, '#ffb020', 0.5);
  const sg = ctx.createRadialGradient(cx, cy, 4, cx, cy, 38);
  sg.addColorStop(0, '#fff6c8');
  sg.addColorStop(0.5, '#ffc93c');
  sg.addColorStop(1, '#ff7a1a');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(cx, cy, 36 + Math.sin(t * 2) * 1, 0, TAU);
  ctx.fill();
  pos.forEach((p, i) => Math.sin(p.a) >= 0 && drawPlanet(i));
  vignette(ctx, 0.35);
  tag(ctx, cx - 22, cy - 22, L(o, 'Matahari', 'Sun'), -1, 1, 1.2);
};

/** Gelombang laut berlapis saat senja. */
const waves: Draw = (ctx, t) => {
  vgrad(ctx, [[0, '#1c1147'], [0.5, '#c2437a'], [1, '#ff9a5c']]);
  glow(ctx, W * 0.68, H * 0.46, 260, '#ffd19a', 0.55);
  ctx.fillStyle = '#fff0cf';
  ctx.beginPath();
  ctx.arc(W * 0.68, H * 0.46, 44, 0, TAU);
  ctx.fill();
  const colors = ['#ff8f7a', '#e8566f', '#a83a7a', '#5a2b82', '#243a8a', '#0b1f52'];
  colors.forEach((c, k) => {
    const y0 = H * 0.5 + k * 46;
    const amp = 12 + k * 4;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const y = y0 + amp * Math.sin(x * 0.013 + t * (0.8 + k * 0.18) + k * 1.4) + amp * 0.45 * Math.sin(x * 0.029 - t * (1.2 + k * 0.2));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, y0 - amp, 0, y0 + 150);
    g.addColorStop(0, c);
    g.addColorStop(1, k === 5 ? '#050c26' : colors[k + 1]);
    ctx.fillStyle = g;
    ctx.fill();
  });
  for (let i = 0; i < 26; i++) {
    const y = H * 0.56 + rnd(i, 1) * 70;
    const x = W * 0.68 + (rnd(i, 2) - 0.5) * 120 * (0.4 + (y - H * 0.5) / 90);
    ctx.fillStyle = `rgba(255,240,210,${0.25 + 0.5 * Math.abs(Math.sin(t * 2 + i))})`;
    ctx.fillRect(x, y, 14 + rnd(i, 3) * 20, 2);
  }
  vignette(ctx, 0.3);
};

/** Jaringan: simpul bergerak, sambungan dinamis, dan sinyal berjalan di sepanjang garis. */
const network: Draw = (ctx, t) => {
  vgrad(ctx, [[0, '#070b24'], [1, '#14103c']]);
  const N = 46;
  const pts = Array.from({ length: N }, (_, i) => ({
    x: 50 + rnd(i, 1) * (W - 100) + Math.sin(t * (0.25 + rnd(i, 3) * 0.3) + i) * 34,
    y: 40 + rnd(i, 2) * (H - 80) + Math.cos(t * (0.22 + rnd(i, 4) * 0.3) + i * 1.7) * 28,
    hub: i % 9 === 0,
  }));
  const colors = ['#4de1ff', '#ff5fd2', '#ffd166'];
  ctx.lineCap = 'round';
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d > 165) continue;
      const a = (1 - d / 165) * 0.5;
      ctx.strokeStyle = `rgba(140,170,255,${a})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[j].x, pts[j].y);
      ctx.stroke();
      if (rnd(i * 61 + j, 5) > 0.55) {
        const u = mod(t * (0.35 + rnd(i + j, 6) * 0.5) + rnd(i * 17 + j, 7), 1);
        const x = pts[i].x + (pts[j].x - pts[i].x) * u;
        const y = pts[i].y + (pts[j].y - pts[i].y) * u;
        glow(ctx, x, y, 14, colors[(i + j) % 3], 0.9);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, TAU);
        ctx.fill();
      }
    }
  }
  pts.forEach((p, i) => {
    const c = colors[i % 3];
    const r = p.hub ? 9 : 4.5;
    if (p.hub) {
      const q = mod(t * 0.6 + i * 0.13, 1);
      ctx.strokeStyle = rgba(c, (1 - q) * 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + q * 28, 0, TAU);
      ctx.stroke();
    }
    glow(ctx, p.x, p.y, r * 3.2, c, 0.6);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.55, 0, TAU);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
  vignette(ctx, 0.4);
};

/** Pertumbuhan: batang naik bergiliran, garis tren tergambar, angka menghitung naik. */
const growth: Draw = (ctx, t, o) => {
  vgrad(ctx, [[0, '#08122e'], [1, '#0e2354']]);
  const T = mod(t, 9);
  const fade = T > 8.2 ? 1 - (T - 8.2) / 0.8 : 1;
  const left = 90;
  const right = W - 90;
  const base = H - 92;
  const ch = 320;
  ctx.strokeStyle = 'rgba(150,180,255,0.14)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = base - (ch * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }
  const vals = [0.26, 0.34, 0.41, 0.55, 0.62, 0.79, 0.94];
  const n = vals.length;
  const gap = 26;
  const bw = (right - left - gap * (n - 1)) / n;
  ctx.globalAlpha = fade;
  const tops: { x: number; y: number; q: number }[] = [];
  vals.forEach((v, i) => {
    const q = easeOut((T - 0.4 - i * 0.28) / 1.1);
    const h = ch * v * q;
    const x = left + i * (bw + gap);
    const g = ctx.createLinearGradient(0, base - h, 0, base);
    g.addColorStop(0, '#4de1ff');
    g.addColorStop(1, '#6a4dff');
    ctx.fillStyle = g;
    rrect(ctx, x, base - h, bw, Math.max(0, h), [10, 10, 2, 2]);
    ctx.fill();
    tops.push({ x: x + bw / 2, y: base - ch * v * q, q });
  });
  // Garis tren.
  const line = easeOut((T - 1.2) / 3.4);
  const upto = line * (n - 1);
  ctx.beginPath();
  tops.forEach((p, i) => {
    const y = p.y - 26;
    if (i > upto + 0.001) return;
    if (i === 0) ctx.moveTo(p.x, y);
    else if (i <= Math.floor(upto)) ctx.lineTo(p.x, y);
  });
  const li = Math.floor(upto);
  if (li < n - 1 && line > 0) {
    const a = tops[li];
    const b = tops[li + 1];
    const f = upto - li;
    ctx.lineTo(a.x + (b.x - a.x) * f, a.y - 26 + (b.y - a.y) * f);
  }
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffd166';
  ctx.shadowColor = '#ffd166';
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;
  tops.forEach((p, i) => {
    if (i <= upto && p.q > 0.3) {
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.arc(p.x, p.y - 26, 5.5, 0, TAU);
      ctx.fill();
    }
  });
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.font = '800 58px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(`+${Math.round(128 * easeOut((T - 0.5) / 4))}%`, 96, 92);
  ctx.font = '500 18px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(L(o, 'Pertumbuhan', 'Growth'), 98, 120);
  ctx.globalAlpha = 1;
  vignette(ctx, 0.35);
};

/** Roda gigi saling mengait. */
const gears: Draw = (ctx, t) => {
  vgrad(ctx, [[0, '#0b0f1a'], [1, '#1c2436']]);
  const gear = (cx: number, cy: number, R: number, teeth: number, ang: number, accent: string) => {
    const inner = R * 0.82;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a0 = ang + (i / teeth) * TAU;
      const da = TAU / teeth;
      const pts: [number, number][] = [
        [inner, a0],
        [R, a0 + da * 0.14],
        [R, a0 + da * 0.4],
        [inner, a0 + da * 0.54],
      ];
      pts.forEach(([r, a], k) => {
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0 && k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
    g.addColorStop(0, '#dfe7f7');
    g.addColorStop(1, '#5b6b8d');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.6, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#12182a';
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.26, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,28,50,0.8)';
    ctx.lineWidth = R * 0.09;
    for (let k = 0; k < 5; k++) {
      const a = ang + (k / 5) * TAU;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3);
      ctx.lineTo(cx + Math.cos(a) * R * 0.56, cy + Math.sin(a) * R * 0.56);
      ctx.stroke();
    }
  };
  const w = t * 0.5;
  const A = { x: 250, y: 300, R: 112, n: 18 };
  const B = { R: 72, n: 12 };
  const bAng = -0.5;
  const bx = A.x + Math.cos(bAng) * (A.R + B.R) * 0.93;
  const by = A.y + Math.sin(bAng) * (A.R + B.R) * 0.93;
  const Cc = { R: 56, n: 9 };
  const cAng = 0.5;
  const cx2 = bx + Math.cos(cAng) * (B.R + Cc.R) * 0.93;
  const cy2 = by + Math.sin(cAng) * (B.R + Cc.R) * 0.93;
  gear(A.x, A.y, A.R, A.n, w, '#ffb020');
  gear(bx, by, B.R, B.n, -w * (A.n / B.n) + Math.PI / B.n, '#4de1ff');
  gear(cx2, cy2, Cc.R, Cc.n, w * (A.n / Cc.n) + Math.PI / Cc.n, '#ff5fd2');
  const D = { x: 720, y: 290, R: 140, n: 22 };
  const E = { R: 62, n: 10 };
  const eAng = 2.7;
  const ex = D.x + Math.cos(eAng) * (D.R + E.R) * 0.93;
  const ey = D.y + Math.sin(eAng) * (D.R + E.R) * 0.93;
  gear(D.x, D.y, D.R, D.n, -w * 0.7, '#a78bfa');
  gear(ex, ey, E.R, E.n, w * 0.7 * (D.n / E.n) + Math.PI / E.n, '#5cffb1');
  vignette(ctx, 0.4);
};

/** Siklus air: penguapan, kondensasi awan, hujan, dan aliran kembali ke laut. */
const weather: Draw = (ctx, t, o) => {
  vgrad(ctx, [[0, '#14305f'], [0.6, '#e98a57'], [1, '#ffcf8a']]);
  // Matahari + sinar berputar.
  const sx = 120;
  const sy = 110;
  glow(ctx, sx, sy, 200, '#ffd27a', 0.6);
  ctx.strokeStyle = 'rgba(255,225,150,0.55)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = t * 0.3 + (i / 12) * TAU;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(a) * 52, sy + Math.sin(a) * 52);
    ctx.lineTo(sx + Math.cos(a) * (68 + Math.sin(t * 2 + i) * 5), sy + Math.sin(a) * (68 + Math.sin(t * 2 + i) * 5));
    ctx.stroke();
  }
  ctx.fillStyle = '#fff1b8';
  ctx.beginPath();
  ctx.arc(sx, sy, 42, 0, TAU);
  ctx.fill();
  // Gunung.
  ctx.beginPath();
  ctx.moveTo(500, H);
  ctx.lineTo(620, 250);
  ctx.lineTo(700, 320);
  ctx.lineTo(790, 210);
  ctx.lineTo(960, 400);
  ctx.lineTo(960, H);
  ctx.closePath();
  const mg = ctx.createLinearGradient(0, 210, 0, H);
  mg.addColorStop(0, '#5f6f8f');
  mg.addColorStop(1, '#27324e');
  ctx.fillStyle = mg;
  ctx.fill();
  ctx.fillStyle = '#f2f6ff';
  ctx.beginPath();
  ctx.moveTo(790, 210);
  ctx.lineTo(760, 250);
  ctx.lineTo(786, 244);
  ctx.lineTo(806, 262);
  ctx.lineTo(826, 244);
  ctx.closePath();
  ctx.fill();
  // Laut.
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= 560; x += 8) ctx.lineTo(x, 400 + Math.sin(x * 0.03 + t * 1.6) * 6);
  ctx.lineTo(560, H);
  ctx.closePath();
  const sea = ctx.createLinearGradient(0, 400, 0, H);
  sea.addColorStop(0, '#2b7fc4');
  sea.addColorStop(1, '#0b3a7a');
  ctx.fillStyle = sea;
  ctx.fill();
  // Aliran sungai dari gunung ke laut.
  ctx.setLineDash([12, 10]);
  ctx.lineDashOffset = -t * 28;
  ctx.strokeStyle = 'rgba(160,215,255,0.85)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(700, 330);
  ctx.bezierCurveTo(660, 380, 640, 420, 560, 430);
  ctx.stroke();
  ctx.setLineDash([]);
  // Penguapan: uap naik dari laut ke awan.
  for (let i = 0; i < 16; i++) {
    const q = mod(t * 0.22 + rnd(i, 1), 1);
    const x = 140 + rnd(i, 2) * 300 + Math.sin(t * 1.2 + i) * 10;
    const y = 400 - q * 250;
    ctx.fillStyle = `rgba(255,255,255,${Math.sin(q * Math.PI) * 0.6})`;
    ctx.beginPath();
    ctx.arc(x, y, 5 + q * 4, 0, TAU);
    ctx.fill();
  }
  // Awan yang menebal + hujan.
  const cloud = (x: number, y: number, s: number, dark: number) => {
    const puffs: [number, number, number][] = [[-70, 8, 38], [-30, -14, 48], [22, -8, 52], [66, 10, 38], [0, 16, 52]];
    puffs.forEach(([dx, dy, r]) => {
      const g = ctx.createRadialGradient(x + dx * s, y + dy * s - 8, 4, x + dx * s, y + dy * s, r * s);
      g.addColorStop(0, `rgb(${255 - dark},${255 - dark},${255 - dark * 0.6})`);
      g.addColorStop(1, `rgb(${210 - dark},${222 - dark},${240 - dark * 0.6})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + dx * s, y + dy * s, r * s, 0, TAU);
      ctx.fill();
    });
  };
  const dark = 40 + 30 * Math.sin(t * 0.5);
  cloud(470, 120, 1 + 0.04 * Math.sin(t), dark);
  ctx.strokeStyle = 'rgba(190,225,255,0.9)';
  ctx.lineWidth = 2.4;
  for (let i = 0; i < 34; i++) {
    const q = mod(t * 0.9 + rnd(i, 1), 1);
    const x = 410 + rnd(i, 2) * 130 + q * 20;
    const y = 165 + q * 235;
    ctx.globalAlpha = 1 - q * 0.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 4, y - 16);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  vignette(ctx, 0.25);
  tag(ctx, 300, 300, L(o, 'Evaporasi (penguapan)', 'Evaporation'), -1, 1, 1);
  tag(ctx, 545, 140, L(o, 'Kondensasi', 'Condensation'), 1, 1, 0.5);
  tag(ctx, 470, 290, L(o, 'Presipitasi (hujan)', 'Precipitation'), 1, 1, -0.4);
  tag(ctx, 620, 400, L(o, 'Aliran air', 'Runoff'), 1, 1, -0.4);
};

/** Luar angkasa: bintang paralaks, planet bercincin, dan roket dengan api. */
const space: Draw = (ctx, t) => {
  vgrad(ctx, [[0, '#02030c'], [1, '#0d0b30']]);
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < 60; i++) {
      const sp = 14 + layer * 26;
      const x = mod(rnd(i, 1 + layer) * W - t * sp, W);
      const y = rnd(i, 4 + layer) * H;
      const s = 0.8 + layer * 0.8;
      ctx.fillStyle = `rgba(255,255,255,${0.35 + layer * 0.25})`;
      ctx.fillRect(x, y, s, s);
    }
  }
  // Planet bercincin.
  const px = 760;
  const py = 380;
  glow(ctx, px, py, 300, '#7a5cff', 0.25);
  ctx.strokeStyle = 'rgba(220,200,255,0.5)';
  ctx.lineWidth = 12;
  ellipse(ctx, px, py, 210, 52, -0.35);
  ctx.stroke();
  const pg = ctx.createRadialGradient(px - 50, py - 60, 20, px, py, 130);
  pg.addColorStop(0, '#b9a4ff');
  pg.addColorStop(1, '#2d1b78');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.arc(px, py, 118, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, 118, 0, TAU);
  ctx.clip();
  ctx.strokeStyle = 'rgba(220,200,255,0.5)';
  ctx.lineWidth = 12;
  ellipse(ctx, px, py, 210, 52, -0.35);
  ctx.stroke();
  ctx.restore();
  // Bintang jatuh.
  const sc = mod(t, 5) / 5;
  if (sc < 0.25) {
    const q = sc / 0.25;
    const x = 200 + q * 340;
    const y = 60 + q * 150;
    const g = ctx.createLinearGradient(x, y, x - 110, y - 46);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 110, y - 46);
    ctx.stroke();
  }
  // Roket.
  const rx = 330;
  const ry = 290 + Math.sin(t * 1.3) * 14;
  ctx.save();
  ctx.translate(rx, ry);
  ctx.rotate(-0.42);
  for (let k = 0; k < 30; k++) {
    const q = mod(t * 2.6 + k / 30, 1);
    const x = -84 - q * 170;
    const y = Math.sin(k * 5 + t * 6) * 10 * q;
    const r = 24 * (1 - q) + 2;
    ctx.fillStyle = q < 0.4 ? `rgba(255,${210 - q * 300},90,${0.9 - q})` : `rgba(255,${120 - q * 60},60,${0.7 - q * 0.7})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#c93b46';
  ctx.beginPath();
  ctx.moveTo(-40, -22);
  ctx.lineTo(-76, -58);
  ctx.lineTo(-76, -14);
  ctx.closePath();
  ctx.moveTo(-40, 22);
  ctx.lineTo(-76, 58);
  ctx.lineTo(-76, 14);
  ctx.closePath();
  ctx.fill();
  const bodyG = ctx.createLinearGradient(0, -34, 0, 34);
  bodyG.addColorStop(0, '#ffffff');
  bodyG.addColorStop(1, '#b7c2dc');
  ctx.fillStyle = bodyG;
  ctx.beginPath();
  ctx.moveTo(96, 0);
  ctx.bezierCurveTo(60, -40, 0, -36, -68, -30);
  ctx.lineTo(-68, 30);
  ctx.bezierCurveTo(0, 36, 60, 40, 96, 0);
  ctx.fill();
  ctx.fillStyle = '#c93b46';
  ctx.beginPath();
  ctx.moveTo(96, 0);
  ctx.bezierCurveTo(78, -20, 60, -32, 44, -35);
  ctx.lineTo(44, 35);
  ctx.bezierCurveTo(60, 32, 78, 20, 96, 0);
  ctx.fill();
  ctx.fillStyle = '#6ad7ff';
  ctx.beginPath();
  ctx.arc(-6, 0, 15, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#dbe6ff';
  ctx.stroke();
  ctx.restore();
  vignette(ctx, 0.35);
};

/* ------------------------------ katalog ------------------------------ */

export const SCENES: SceneDef[] = [
  {
    id: 'blood',
    label: 'Sel darah',
    description: 'Eritrosit, leukosit, dan trombosit mengalir di pembuluh darah.',
    keywords: ['!darah', '!eritrosit', '!leukosit', '!trombosit', '!hemoglobin', 'pembuluh', 'sirkulasi', 'plasma', 'anemia', 'blood', 'circulat', 'vein', 'artery', 'hematolog'],
    accent: '#e23a4e',
    draw: blood,
  },
  {
    id: 'cell',
    label: 'Struktur sel',
    description: 'Membran, nukleus, mitokondria, dan Golgi pada sel hewan.',
    keywords: [' sel ', '!organel', 'membran', '!mitokondria', '!nukleus', '!sitoplasma', 'biologi', 'jaringan', ' cell', 'organelle', 'nucleus', 'biology', 'mikroskop', 'microscop'],
    accent: '#5fe3c1',
    draw: cell,
  },
  {
    id: 'heart',
    label: 'Jantung & EKG',
    description: 'Jantung berdetak dengan gelombang EKG bergulir.',
    keywords: ['!jantung', '!detak', '!denyut', 'kardio', '!ekg', 'tensi', 'kesehatan', 'medis', 'heart', 'pulse', 'cardio', 'health', 'kedokteran'],
    accent: '#ff3b78',
    draw: heart,
  },
  {
    id: 'dna',
    label: 'Heliks DNA',
    description: 'Heliks ganda DNA berputar dengan pasangan basa.',
    keywords: ['!dna', ' gen ', '!genetik', '!kromosom', ' rna ', '!genom', 'hereditas', 'mutasi', 'genetic', 'chromosome', 'genome', 'heredit', 'bioteknologi', 'biotech'],
    accent: '#7cf5ff',
    draw: dna,
  },
  {
    id: 'atom',
    label: 'Atom',
    description: 'Inti atom dan elektron yang beredar di orbitnya.',
    keywords: ['!atom', '!molekul', '!elektron', '!proton', 'neutron', 'kimia', 'fisika', 'partikel', 'unsur', 'molecul', 'electron', 'chemistry', 'physics', 'quantum', 'kuantum'],
    accent: '#5cf0ff',
    draw: atom,
  },
  {
    id: 'solar',
    label: 'Tata surya',
    description: 'Planet mengelilingi Matahari pada orbitnya.',
    keywords: ['!tata surya', '!planet', '!matahari', '!orbit', 'astronomi', 'galaksi', 'bumi', 'jupiter', ' mars ', 'solar system', 'astronom', 'galaxy', 'earth'],
    accent: '#ffc93c',
    draw: solar,
  },
  {
    id: 'waves',
    label: 'Gelombang',
    description: 'Gelombang laut berlapis saat senja.',
    keywords: ['!gelombang', 'suara', 'bunyi', 'laut', '!ombak', '!frekuensi', 'samudra', 'pantai', 'wave', 'sound', 'ocean', ' sea ', 'frequency', 'beach', 'akustik'],
    accent: '#ff8f7a',
    draw: waves,
  },
  {
    id: 'network',
    label: 'Jaringan',
    description: 'Simpul terhubung dengan sinyal yang berjalan.',
    keywords: ['!jaringan', '!internet', 'jejaring', '!saraf', '!neural', 'konektivitas', 'server', 'koneksi', 'kecerdasan buatan', 'data', 'network', 'connect', 'digital', 'teknologi', 'technology', 'sosial media', 'social media', ' ai ', 'cloud', 'otak', 'brain'],
    accent: '#4de1ff',
    draw: network,
  },
  {
    id: 'growth',
    label: 'Pertumbuhan',
    description: 'Batang naik, garis tren, dan angka yang menghitung naik.',
    keywords: ['!pertumbuhan', '!grafik', '!statistik', '!penjualan', '!pendapatan', 'ekonomi', 'naik', ' tren', 'bisnis', 'pemasaran', ' laba ', 'investasi', 'growth', '!revenue', 'sales', 'chart', 'profit', 'trend', 'business', 'marketing', 'kinerja', 'target'],
    accent: '#ffd166',
    draw: growth,
  },
  {
    id: 'gears',
    label: 'Roda gigi',
    description: 'Roda gigi saling mengait dan berputar.',
    keywords: ['!mesin', '!roda gigi', 'proses', 'teknik', '!otomasi', 'industri', 'mekanik', 'sistem', 'produksi', 'manufaktur', '!gear', 'machine', 'engineering', 'mechanic', 'process', 'workflow', 'automation', 'operasional'],
    accent: '#ffb020',
    draw: gears,
  },
  {
    id: 'weather',
    label: 'Siklus air',
    description: 'Evaporasi, kondensasi, presipitasi, dan aliran air.',
    keywords: ['!hujan', '!siklus air', '!cuaca', 'awan', 'iklim', '!evaporasi', '!kondensasi', 'presipitasi', 'hidrologi', ' air ', ' rain ', '!water cycle', 'weather', 'climate', 'cloud', 'lingkungan', 'environment'],
    accent: '#6ac2ff',
    draw: weather,
  },
  {
    id: 'space',
    label: 'Luar angkasa',
    description: 'Roket meluncur di antara bintang dan planet bercincin.',
    keywords: ['!luar angkasa', '!roket', 'bintang', '!antariksa', 'misi', 'satelit', '! space ', '!rocket', ' star ', ' stars ', 'satellite', 'nasa', 'peluncuran', 'startup', 'inovasi', 'innovation'],
    accent: '#a78bfa',
    draw: space,
  },
];

export const SCENE_BY_ID: Record<string, SceneDef> = Object.fromEntries(SCENES.map((s) => [s.id, s]));

/** Gambar adegan pada waktu `t`. `scale` = piksel kanvas per satuan adegan (960×540) — kecil untuk pratinjau mini. */
export function drawScene(ctx: CanvasRenderingContext2D, id: string, t: number, opts: SceneOpts, scale = 1): void {
  const def = SCENE_BY_ID[id] ?? SCENES[0];
  SAFE = opts.safe ?? [0, SCENE_W];
  PLACED = [];
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.textBaseline = 'alphabetic';
  def.draw(ctx, t, opts);
  ctx.restore();
}

/** Gambar diam adegan (poster) untuk thumbnail/pustaka. */
export function sceneToDataUrl(id: string, opts: SceneOpts, t = 2.6, width = 960): string {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.round((width * SCENE_H) / SCENE_W);
  const ctx = c.getContext('2d')!;
  drawScene(ctx, id, t, opts, c.width / SCENE_W);
  return c.toDataURL('image/jpeg', 0.86);
}

/** Cocokkan teks slide dengan katalog: skor lebih tinggi = lebih relevan (judul > subjudul/kata kunci > poin). */
export function suggestScenes(slide: { title: string; subtitle: string; bullets: string[]; imageQuery?: string }): { scene: SceneDef; score: number }[] {
  const strip = (s: string) => ` ${s.toLowerCase().replace(/\*\*|==|\*/g, '')} `;
  const fields: [string, number][] = [
    [strip(slide.title), 3],
    [strip(slide.subtitle), 2],
    [strip(slide.imageQuery ?? ''), 2],
    ...slide.bullets.map((b): [string, number] => [strip(b), 1]),
  ];
  return SCENES.map((scene) => {
    let score = 0;
    for (const [text, w] of fields) {
      for (const k of scene.keywords) {
        // Awalan "!" = kata kunci spesifik topik (bobot 2×), mis. "darah" jauh lebih menentukan daripada "digital".
        const strong = k.startsWith('!');
        if (text.includes(strong ? k.slice(1) : k)) score += w * (strong ? 2 : 1);
      }
    }
    return { scene, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}
