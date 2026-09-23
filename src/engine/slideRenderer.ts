import type { LayoutOverride, MotionRole, ResolvedTheme, Slide } from '../types';
import { rgba } from '../utils/color';
import { hashString, mulberry32 } from '../utils/hash';
import { paintArt } from './generativeArt';
import { imgH, imgW, type DrawableImage } from './imageStore';
import type { LayerEdit, LayerInfo, LayerRole, SlideLayer } from './layers';
import {
  drawTextBlock,
  fitRichText,
  layoutRichText,
  relayoutBlock,
  stripRichText,
  type FontSpec,
  type TextAlign,
  type TextBlock,
} from './richText';
import type { DrawOptions, Rect, SharedElement } from './sharedElements';
import { SLIDE_H as H, SLIDE_W as W } from './themes';

/**
 * Renderer slide berbasis LAPISAN (ruang logis 1920×1080).
 *
 * `buildLayers` menjalankan layout sekali dan menghasilkan daftar `SlideLayer`. Daftar itu dipakai:
 *  - `drawSlide`     → jalur DATAR: semua lapisan digambar berurutan ke satu kanvas (transisi, thumbnail, fallback);
 *  - `SceneView`     → jalur ADEGAN: tiap lapisan menjadi tekstur/mesh sendiri yang digerakkan GPU;
 *  - `describeLayers`→ metadata untuk UI (klik elemen di Live Monitor, edit posisi manual).
 *
 * Tata letak MANUAL: `Slide.overrides[idLapisan]` menimpa posisi/ukuran hasil layout otomatis. Penimpaan
 * diterapkan saat lapisan dibuat (`place` / `addText` / `addHero`), sehingga jalur datar, adegan, Magic Move,
 * dan ekspor otomatis ikut memakainya.
 */

export interface RenderContext {
  theme: ResolvedTheme;
  getImage: (id: string | null | undefined) => DrawableImage | null;
  /** Aset ini bergerak (GIF/video/generatif) dan sumbernya siap? */
  isLive?: (id: string | null | undefined) => boolean;
  logoId: string | null;
  index: number;
  total: number;
}

const M = 120; // margin horizontal standar
const TEXT_PAD = 14; // margin tekstur lapisan teks
const BADGE_D = 176; // diameter lencana logo sampul
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Primitif                                                            */
/* ------------------------------------------------------------------ */

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCover(ctx: CanvasRenderingContext2D, img: DrawableImage, x: number, y: number, w: number, h: number): void {
  const iw = imgW(img) || w;
  const ih = imgH(img) || h;
  const ir = iw / ih;
  const br = w / h;
  let sw = iw;
  let sh = ih;
  let sx = 0;
  let sy = 0;
  if (ir > br) {
    sw = ih * br;
    sx = (iw - sw) / 2;
  } else {
    sh = iw / br;
    sy = (ih - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

interface Glow {
  cx: number;
  cy: number;
  r: number;
  color: string;
  alpha: number;
}

/** Posisi cahaya latar (deterministik dari id slide) — sama untuk jalur datar & adegan. */
function glowsFor(theme: ResolvedTheme, seedKey: string): Glow[] {
  const rnd = mulberry32(hashString(seedKey));
  const a = theme.mode === 'dark' ? 0.26 : 0.2;
  const spots: [string, number][] = [
    [theme.accent, a],
    [theme.accent2, a * 0.75],
  ];
  return spots.map(([color, alpha], i) => {
    const cx = i === 0 ? W * (0.55 + rnd() * 0.45) : W * (rnd() * 0.45);
    const cy = i === 0 ? H * (rnd() * 0.5) : H * (0.5 + rnd() * 0.5);
    const r = 900 + rnd() * 300;
    return { cx, cy, r, color, alpha };
  });
}

/** Jalur blob organik: poligon acak-tapi-deterministik (seed tetap) dihaluskan dengan quadraticCurveTo per titik. */
function blobPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, wobble: number, points: number, seed: number): void {
  const rnd = mulberry32(seed);
  const pts: [number, number][] = Array.from({ length: points }, (_, i) => {
    const a = (i / points) * TAU;
    const rad = r * (1 - wobble / 2 + rnd() * wobble);
    return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
  });
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[pts.length - 1], pts[0]);
  ctx.beginPath();
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < points; i++) {
    const cur = pts[i];
    const next = pts[(i + 1) % points];
    const m = mid(cur, next);
    ctx.quadraticCurveTo(cur[0], cur[1], m[0], m[1]);
  }
  ctx.closePath();
}

/** Panel warna diagonal terpotong di pojok kanan-atas — motif "blok" terinspirasi templat Canva. */
function paintCornerBlock(ctx: CanvasRenderingContext2D, theme: ResolvedTheme): void {
  const cut = W * 0.22;
  const a = theme.mode === 'dark' ? 0.32 : 0.14;
  const g = ctx.createLinearGradient(W - cut - 240, 0, W, H * 0.58);
  g.addColorStop(0, rgba(theme.accent, a * 0.55));
  g.addColorStop(1, rgba(theme.accent2, a));
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(W, 0);
  ctx.lineTo(W, H * 0.62);
  ctx.lineTo(W - cut, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Aksen blob organik lembut di pojok kiri-bawah — motif "blob" terinspirasi templat Canva. */
function paintCornerBlob(ctx: CanvasRenderingContext2D, theme: ResolvedTheme): void {
  const cx = W * 0.07;
  const cy = H * 0.95;
  const r = 210;
  const a = theme.mode === 'dark' ? 0.28 : 0.16;
  ctx.save();
  blobPath(ctx, cx, cy, r, 0.35, 9, hashString('theme-blockblob'));
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.3);
  g.addColorStop(0, rgba(theme.accent2, a));
  g.addColorStop(1, rgba(theme.accent2, 0));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/**
 * Pola dekoratif tipis di latar. Memudar di tengah (tempat teks) dan menguat di tepi agar teks tetap
 * terbaca; digambar di lapisan latar sehingga ikut ke semua jalur render.
 */
function paintPattern(ctx: CanvasRenderingContext2D, theme: ResolvedTheme): void {
  const kind = theme.pattern;
  if (!kind || kind === 'none') return;
  if (kind === 'blockblob') {
    // Beda dari pola lain di bawah (tekstur abu-abu tipis dari theme.text): pola ini SENGAJA memakai
    // warna aksen tema sebagai motif desain yang terlihat jelas, bukan tekstur latar yang halus.
    paintCornerBlock(ctx, theme);
    paintCornerBlob(ctx, theme);
    return;
  }
  const a = theme.mode === 'dark' ? 0.1 : 0.085;
  const g = ctx.createRadialGradient(W / 2, H / 2, 240, W / 2, H / 2, 1180);
  g.addColorStop(0, rgba(theme.text, a * 0.2));
  g.addColorStop(1, rgba(theme.text, a));
  ctx.save();
  ctx.strokeStyle = g;
  ctx.fillStyle = g;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  switch (kind) {
    case 'dots': {
      const gap = 56;
      for (let y = gap / 2; y < H; y += gap) {
        for (let x = gap / 2; x < W; x += gap) {
          ctx.moveTo(x + 3.2, y);
          ctx.arc(x, y, 3.2, 0, TAU);
        }
      }
      ctx.fill();
      break;
    }
    case 'grid': {
      const gap = 96;
      for (let x = 0; x <= W; x += gap) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
      }
      for (let y = 0; y <= H; y += gap) {
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();
      break;
    }
    case 'diagonal': {
      const gap = 72;
      for (let k = -H; k < W; k += gap) {
        ctx.moveTo(k, H);
        ctx.lineTo(k + H, 0);
      }
      ctx.stroke();
      break;
    }
    case 'arcs': {
      ctx.lineWidth = 2.6;
      for (let i = 1; i <= 15; i++) {
        ctx.moveTo(W + 60 + i * 110, H + 60);
        ctx.arc(W + 60, H + 60, i * 110, 0, TAU);
      }
      for (let i = 1; i <= 6; i++) {
        ctx.moveTo(-60 + i * 110, -60);
        ctx.arc(-60, -60, i * 110, 0, TAU);
      }
      ctx.stroke();
      break;
    }
    case 'waves': {
      ctx.lineWidth = 3;
      for (let j = 0; j < 10; j++) {
        for (let x = 0; x <= W; x += 24) {
          const y = H * 0.5 + j * 54 + Math.sin(x / 170 + j * 0.55) * 34;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

function paintGradientBg(ctx: CanvasRenderingContext2D, theme: ResolvedTheme): void {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, theme.bg1);
  g.addColorStop(1, theme.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  paintPattern(ctx, theme);
}

function paintGlow(ctx: CanvasRenderingContext2D, g: Glow): void {
  const rg = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, g.r);
  rg.addColorStop(0, rgba(g.color, g.alpha));
  rg.addColorStop(1, rgba(g.color, 0));
  ctx.fillStyle = rg;
  ctx.fillRect(g.cx - g.r, g.cy - g.r, g.r * 2, g.r * 2);
}

function drawBackground(ctx: CanvasRenderingContext2D, theme: ResolvedTheme, seedKey: string, glows = true): void {
  paintGradientBg(ctx, theme);
  if (glows) for (const g of glowsFor(theme, seedKey)) paintGlow(ctx, g);
}

/** Kartu gambar bersudut membulat + bayangan; jika tanpa gambar → seni generatif. */
function drawImageCard(
  ctx: CanvasRenderingContext2D,
  img: DrawableImage | null,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  theme: ResolvedTheme,
  seed: string,
): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 26;
  ctx.fillStyle = theme.bg2;
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.clip();
  if (img) drawCover(ctx, img, x, y, w, h);
  else paintArt(ctx, x, y, w, h, seed, theme.mode);
  ctx.restore();

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  roundRectPath(ctx, x + 1, y + 1, w - 2, h - 2, radius);
  ctx.stroke();
  ctx.restore();
}

/**
 * Isi foto hero (tanpa bingkai/bayangan): cover-crop gambar, atau seni generatif bila kosong.
 * `decor` = dekorasi yang MELEKAT pada elemen agar ikut terbang saat Magic Move.
 */
type HeroDecor = 'none' | 'edge' | 'overlay';

function paintImageContent(
  ctx: CanvasRenderingContext2D,
  img: DrawableImage | null,
  w: number,
  h: number,
  theme: ResolvedTheme,
  seed: string,
  decor: HeroDecor,
): void {
  if (img) drawCover(ctx, img, 0, 0, w, h);
  else paintArt(ctx, 0, 0, w, h, seed, decor === 'overlay' ? 'dark' : theme.mode);
  if (decor === 'edge') {
    const eg = ctx.createLinearGradient(w - 160, 0, w, 0);
    eg.addColorStop(0, rgba(theme.bg1, 0));
    eg.addColorStop(1, rgba(theme.bg1, 0.55));
    ctx.fillStyle = eg;
    ctx.fillRect(w - 160, 0, 160, h);
  } else if (decor === 'overlay') {
    const og = ctx.createLinearGradient(0, h * 0.18, 0, h);
    og.addColorStop(0, 'rgba(0,0,0,0)');
    og.addColorStop(0.55, 'rgba(0,0,0,0.5)');
    og.addColorStop(1, 'rgba(0,0,0,0.88)');
    ctx.fillStyle = og;
    ctx.fillRect(0, 0, w, h);
  }
}

/**
 * Lencana logo IKONIK: cakram bulat dengan bingkai cincin gradien (aksen → aksen 2) dan cincin
 * tipis di tepi. Logo di-contain di tengah; tanpa logo → monogram huruf pertama judul.
 * Seluruhnya digambar DI DALAM kotak (x, y, d, d); sudut kotak dibiarkan transparan.
 */
function paintBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  d: number,
  logo: DrawableImage | null,
  theme: ResolvedTheme,
  letter: string,
): void {
  const R = d / 2;
  const cx = x + R;
  const cy = y + R;

  ctx.fillStyle = theme.bg1;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.clip();
  const disc = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
  if (theme.mode === 'dark') {
    disc.addColorStop(0, 'rgba(255,255,255,0.20)');
    disc.addColorStop(1, 'rgba(255,255,255,0.06)');
  } else {
    disc.addColorStop(0, '#ffffff');
    disc.addColorStop(1, rgba(theme.accent, 0.08));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, d, d);
  }
  ctx.fillStyle = disc;
  ctx.fillRect(x, y, d, d);
  ctx.restore();

  // Cincin bingkai gradien (pembatas lingkaran di tepi logo).
  const ringW = d * 0.05;
  const ring = ctx.createLinearGradient(x, y, x + d, y + d);
  ring.addColorStop(0, theme.accent);
  ring.addColorStop(1, theme.accent2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = ringW;
  ctx.beginPath();
  ctx.arc(cx, cy, R - ringW * 0.5 - d * 0.018, 0, TAU);
  ctx.stroke();
  // Cincin tipis luar.
  ctx.strokeStyle = rgba(theme.accent, 0.42);
  ctx.lineWidth = Math.max(1.5, d * 0.011);
  ctx.beginPath();
  ctx.arc(cx, cy, R - ctx.lineWidth * 0.5, 0, TAU);
  ctx.stroke();

  // Isi: logo (contain) atau monogram.
  const inner = d * 0.56;
  if (logo && imgW(logo)) {
    const s = Math.min(inner / imgW(logo), inner / imgH(logo));
    const lw = imgW(logo) * s;
    const lh = imgH(logo) * s;
    ctx.drawImage(logo, cx - lw / 2, cy - lh / 2, lw, lh);
  } else {
    const g = ctx.createLinearGradient(cx - inner / 2, cy - inner / 2, cx + inner / 2, cy + inner / 2);
    g.addColorStop(0, theme.accent);
    g.addColorStop(1, theme.accent2);
    ctx.fillStyle = g;
    ctx.font = `800 ${Math.round(d * 0.44)}px ${theme.fontHeading}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, cx, cy + d * 0.02);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }
}

const monogramOf = (slide: Slide): string => {
  const t = stripRichText(slide.title || '').trim();
  const ch = /[\p{L}\p{N}]/u.exec(t)?.[0];
  return (ch ?? '★').toUpperCase();
};

/* ------------------------------------------------------------------ */
/* Pembangun lapisan                                                    */
/* ------------------------------------------------------------------ */

let measureCtx: CanvasRenderingContext2D | null = null;
/** Konteks khusus pengukuran teks (tidak bergantung pada kanvas tujuan). */
function mctx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    measureCtx = c.getContext('2d')!;
  }
  return measureCtx;
}

interface L {
  m: CanvasRenderingContext2D;
  slide: Slide;
  rc: RenderContext;
  theme: ResolvedTheme;
  img: DrawableImage | null;
  logo: DrawableImage | null;
  seed: string;
  scale: number;
  /** Tag elemen utama slide ('' = tanpa Magic Move). */
  heroTag: string;
  /** Foto slide adalah media bergerak. */
  live: boolean;
  layers: SlideLayer[];
  /** Pergeseran teks yang dipindah manual — dekorasi pendamping (garis aksen) ikut bergeser. */
  moved: Record<string, { dx: number; dy: number; dh: number }>;
}

interface AddSpec {
  id: string;
  role: LayerRole;
  motionRole?: MotionRole | null;
  order?: number;
  rect: Rect;
  mode?: 'flat' | 'card';
  pad?: number;
  /** Penggambaran absolut (jalur datar); untuk lapisan flat juga menjadi sumber `paint`. */
  abs?: (ctx: CanvasRenderingContext2D) => void;
  /** Isi lokal untuk kartu. */
  content?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  radius?: number;
  shadow?: number;
  border?: boolean;
  tag?: string;
  shared?: 'logo' | 'image';
  contentKey?: string;
  edit?: LayerEdit;
  live?: string | null;
  maxTex?: number;
  pieces?: Rect[];
  lines?: Rect[];
}

function add(L: L, s: AddSpec): void {
  const rect = s.rect;
  L.layers.push({
    id: s.id,
    role: s.role,
    motionRole: s.motionRole ?? null,
    order: s.order ?? -1,
    mode: s.mode ?? 'flat',
    rect,
    pad: s.mode === 'card' ? 0 : s.pad ?? 0,
    radius: s.radius ?? 0,
    shadow: s.shadow ?? 0,
    border: !!s.border,
    tag: s.tag ?? '',
    shared: s.shared,
    contentKey: s.contentKey ?? s.id,
    edit: s.edit,
    live: s.live ?? null,
    maxTex: s.maxTex,
    pieces: s.pieces,
    lines: s.lines,
    paint:
      s.content ??
      ((ctx) => {
        ctx.translate(-rect.x, -rect.y);
        s.abs?.(ctx);
      }),
    flat: s.abs,
  });
}

const finite = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;

/**
 * Penimpaan tata letak elemen, DISANITASI: nilai bukan-angka/NaN dibuang dan sisanya dibatasi ke rentang waras. Berkas proyek
 * hasil impor atau kolom angka bisa menghasilkan nilai aneh (negatif, NaN, raksasa) yang akan merusak kanvas & tekstur.
 */
const ovOf = (L: L, id: string): LayoutOverride | undefined => {
  const o = L.slide.overrides?.[id];
  if (!o || typeof o !== 'object') return undefined;
  const clean: LayoutOverride = {
    x: finite(o.x, -4000, 6000),
    y: finite(o.y, -4000, 6000),
    w: finite(o.w, 24, 6000),
    h: finite(o.h, 24, 6000),
    scale: finite(o.scale, 0.2, 6),
    radius: finite(o.radius, 0, 4000),
  };
  return Object.values(clean).some((v) => v !== undefined) ? clean : undefined;
};

/** Terapkan penempatan manual (x, y, w, h) pada kotak sebuah elemen. */
function place(L: L, id: string, r: Rect): Rect {
  const o = ovOf(L, id);
  if (!o) return r;
  return { x: o.x ?? r.x, y: o.y ?? r.y, w: Math.max(24, o.w ?? r.w), h: Math.max(24, o.h ?? r.h) };
}

const heading = (L: L, size: number, weight = 800, color?: string): FontSpec => ({
  family: L.theme.fontHeading,
  size: Math.round(size),
  weight,
  color: color ?? L.theme.text,
  highlight: L.theme.accent,
});

const body = (L: L, size: number, weight = 400, color?: string, highlight?: string): FontSpec => ({
  family: L.theme.fontBody,
  size: Math.round(size),
  weight,
  color: color ?? L.theme.text,
  highlight: highlight ?? L.theme.accent,
});

/** Kata & baris sebuah blok teks dalam koordinat lokal (untuk animasi per kata / per baris). */
function blockPieces(block: TextBlock, boxW: number, align: TextAlign, ox = 0): { words: Rect[]; lines: Rect[] } {
  const words: Rect[] = [];
  const lines: Rect[] = [];
  block.lines.forEach((line, i) => {
    const off = align === 'center' ? (boxW - line.width) / 2 : align === 'right' ? boxW - line.width : 0;
    const y = i * block.lineHeight;
    lines.push({ x: ox + off, y, w: Math.max(1, line.width), h: block.lineHeight });
    for (const w of line.words) {
      if (w.text.trim()) words.push({ x: ox + off + w.x, y, w: w.w, h: block.lineHeight });
    }
  });
  return { words, lines };
}

interface TextSpec {
  id: string;
  role: 'title' | 'subtitle' | 'body';
  order: number;
  block: TextBlock;
  x: number;
  y: number;
  boxW: number;
  align: TextAlign;
  indent?: number;
  /** Digambar sebelum teks (mis. penanda poin); (x, y) = pojok kiri-atas kotak teks final. */
  pre?: (ctx: CanvasRenderingContext2D, x: number, y: number, block: TextBlock) => void;
}

function addText(L: L, s: TextSpec): void {
  const indent = s.indent ?? 0;
  const o = ovOf(L, s.id);
  let block = s.block;
  let boxW = s.boxW;
  const x = o?.x ?? s.x;
  const y = o?.y ?? s.y;
  if (o && (o.w != null || o.scale != null)) {
    const wrap = Math.max(60, (o.w != null ? o.w : block.wrap + indent) - indent);
    block = relayoutBlock(L.m, block, wrap, o.scale ?? 1);
    boxW = s.boxW > 0 ? wrap : 0;
  }
  const dh = block.height - s.block.height;
  if (x !== s.x || y !== s.y || dh !== 0) L.moved[s.id] = { dx: x - s.x, dy: y - s.y, dh };

  const { words, lines } = blockPieces(block, boxW, s.align, indent);
  const rectW = o?.w ?? (boxW > 0 ? boxW + indent : indent + block.width);
  add(L, {
    id: s.id,
    role: s.role,
    motionRole: s.role,
    order: s.order,
    rect: { x, y, w: rectW, h: block.height },
    pad: TEXT_PAD,
    edit: 'text',
    pieces: words,
    lines,
    abs: (ctx) => {
      s.pre?.(ctx, x, y, block);
      drawTextBlock(ctx, block, x + indent, y, boxW, s.align);
    },
  });
}

/**
 * Garis aksen kecil. `follow` = id teks pendamping: bila teks itu digeser/diubah ukurannya manual, garis ikut bergeser;
 * `below` = garis berada DI BAWAH teks itu (ikut turun saat teks memanjang).
 */
function addBar(L: L, id: string, x: number, y: number, w: number, motionRole: MotionRole | null, order: number, follow?: string, below = false): void {
  const { theme } = L;
  const d = follow ? L.moved[follow] : undefined;
  const bx = x + (d?.dx ?? 0);
  const by = y + (d?.dy ?? 0) + (below ? d?.dh ?? 0 : 0);
  add(L, {
    id,
    role: 'decor',
    motionRole,
    order,
    rect: { x: bx, y: by, w, h: 8 },
    pad: 4,
    abs: (ctx) => {
      const g = ctx.createLinearGradient(bx, by, bx + w, by);
      g.addColorStop(0, theme.accent);
      g.addColorStop(1, theme.accent2);
      ctx.fillStyle = g;
      roundRectPath(ctx, bx, by, w, 8, 4);
      ctx.fill();
    },
  });
}

/**
 * Elemen foto hero. `card` = kartu berbayang + bingkai; `bleed` = panel tanpa bayangan (split / layar penuh).
 * Posisi, ukuran, dan radius sudut dapat ditimpa manual (id "hero").
 */
function addHero(L: L, rect: Rect, radius: number, shadow: number, decor: HeroDecor, style: 'card' | 'bleed', border = false): void {
  const { img, theme, seed, slide } = L;
  const o = ovOf(L, 'hero');
  const r = place(L, 'hero', rect);
  const rad = Math.max(0, Math.min(o?.radius ?? radius, Math.min(r.w, r.h) / 2));
  add(L, {
    id: 'hero',
    role: 'media',
    motionRole: 'media',
    order: 2,
    mode: 'card',
    rect: r,
    radius: rad,
    shadow,
    border,
    tag: L.heroTag,
    shared: 'image',
    edit: 'free',
    // Animasi/video: tekstur kartu dilukis ulang tiap frame → batasi ukurannya (sumber jarang > 1280 px).
    live: L.live ? slide.imageId : null,
    maxTex: L.live ? 1280 : undefined,
    contentKey: slide.imageId ? `img:${slide.imageId}` : `art:${seed}`,
    content: (ctx, w, h) => paintImageContent(ctx, img, w, h, theme, seed, decor),
    abs:
      style === 'card'
        ? (ctx) => drawImageCard(ctx, img, r.x, r.y, r.w, r.h, rad, theme, seed)
        : (ctx) => {
            ctx.save();
            ctx.translate(r.x, r.y);
            roundRectPath(ctx, 0, 0, r.w, r.h, rad);
            ctx.clip();
            paintImageContent(ctx, img, r.w, r.h, theme, seed, decor);
            ctx.restore();
          },
  });
}

interface BulletLayout {
  blocks: TextBlock[];
  gap: number;
  height: number;
  size: number;
}

/** Cari ukuran font terbesar agar semua poin muat pada tinggi tersedia. */
function layoutBullets(
  L: L,
  items: string[],
  width: number,
  startSize: number,
  maxH: number,
  color?: string,
  highlight?: string,
): BulletLayout {
  let size = Math.round(startSize);
  for (let attempt = 0; attempt < 14; attempt++) {
    const gap = size * 0.62;
    const blocks = items.map((t) => layoutRichText(L.m, t, body(L, size, 400, color, highlight), width, 1.3));
    const height = blocks.reduce((s, b) => s + b.height, 0) + gap * Math.max(0, blocks.length - 1);
    if (height <= maxH || size <= 24) return { blocks, gap, height, size };
    size = Math.max(24, Math.floor(size * 0.93));
  }
  return { blocks: [], gap: 0, height: 0, size };
}

function drawMarker(ctx: CanvasRenderingContext2D, theme: ResolvedTheme, x: number, top: number, block: TextBlock): void {
  const mg = ctx.createLinearGradient(x, top, x + 20, top + 20);
  mg.addColorStop(0, theme.accent);
  mg.addColorStop(1, theme.accent2);
  ctx.fillStyle = mg;
  const mr = Math.max(7, block.spec.size * 0.2);
  ctx.beginPath();
  ctx.arc(x + mr, top + block.lineHeight / 2, mr, 0, TAU);
  ctx.fill();
}

function addBullets(L: L, lay: BulletLayout, x: number, y: number, indent: number, marker = true): void {
  const { theme } = L;
  let cy = y;
  lay.blocks.forEach((block, i) => {
    addText(L, {
      id: `bullet-${i}`,
      role: 'body',
      order: 3 + i,
      block,
      x,
      y: cy,
      boxW: 0,
      align: 'left',
      indent,
      pre: marker ? (ctx, px, py, b) => drawMarker(ctx, theme, px, py, b) : undefined,
    });
    cy += block.height + lay.gap;
  });
}

/** Panel kartu bersudut membulat (permukaan tema + garis tepi). */
function paintPanel(ctx: CanvasRenderingContext2D, theme: ResolvedTheme, r: Rect, radius: number): void {
  ctx.fillStyle = theme.surface;
  roundRectPath(ctx, r.x, r.y, r.w, r.h, radius);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.border;
  roundRectPath(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, radius);
  ctx.stroke();
}

const gradientFill = (ctx: CanvasRenderingContext2D, theme: ResolvedTheme, x0: number, x1: number, flip = false): CanvasGradient => {
  const g = ctx.createLinearGradient(x0, 0, Math.max(x1, x0 + 1), 0);
  g.addColorStop(0, flip ? theme.accent2 : theme.accent);
  g.addColorStop(1, flip ? theme.accent : theme.accent2);
  return g;
};

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

function layoutTitle(L: L): void {
  const { slide, img, scale } = L;
  const hasImg = !!img;
  const x = hasImg ? M : 160;
  const w = hasImg ? 830 : W - 320;
  const align: TextAlign = hasImg ? 'left' : 'center';
  const showBadge = slide.showLogo;
  const badgeH = showBadge ? BADGE_D + 44 : 8 + 44; // lencana + jarak, atau garis aksen bila logo dimatikan

  const title = fitRichText(L.m, slide.title || 'Judul presentasi', heading(L, (hasImg ? 104 : 132) * scale), w, showBadge ? 380 : 440, 54, 1.1);
  const sub = slide.subtitle ? fitRichText(L.m, slide.subtitle, body(L, 46 * scale, 400, L.theme.muted), w, 190, 26, 1.35) : null;
  const total = badgeH + title.height + (sub ? 38 + sub.height : 0);
  const y0 = Math.max(40, (H - total) / 2);
  const titleY = y0 + badgeH;

  // Lencana logo ikonik. Bila sampul memiliki foto, lencana memakai tag "logo" (foto = "hero");
  // bila tidak, lencana itulah elemen utama (hero) yang akan mekar menjadi foto di slide berikutnya.
  if (showBadge) {
    const base: Rect = { x: align === 'center' ? x + (w - BADGE_D) / 2 : x, y: y0, w: BADGE_D, h: BADGE_D };
    const placed = place(L, 'badge', base);
    const d = Math.max(48, Math.min(placed.w, placed.h));
    const rect: Rect = { x: placed.x, y: placed.y, w: d, h: d };
    const letter = monogramOf(slide);
    const { logo, theme } = L;
    add(L, {
      id: 'badge',
      role: hasImg ? 'logo' : 'media',
      motionRole: hasImg ? 'logo' : 'media',
      order: 2,
      mode: 'card',
      rect,
      radius: d / 2,
      tag: hasImg ? 'logo' : L.heroTag,
      shared: 'logo',
      edit: 'lock',
      contentKey: `badge:${L.rc.logoId ?? letter}`,
      content: (ctx, cw) => paintBadge(ctx, 0, 0, cw, logo, theme, letter),
      abs: (ctx) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(rect.x + d / 2, rect.y + d / 2, d / 2, 0, TAU);
        ctx.clip();
        paintBadge(ctx, rect.x, rect.y, d, logo, theme, letter);
        ctx.restore();
      },
    });
  }

  addText(L, { id: 'title', role: 'title', order: 0, block: title, x, y: titleY, boxW: w, align });
  if (!showBadge) addBar(L, 'bar', align === 'center' ? x + (w - 110) / 2 : x, y0, 110, 'title', 0, 'title');
  if (sub) addText(L, { id: 'subtitle', role: 'subtitle', order: 1, block: sub, x, y: titleY + title.height + 38, boxW: w, align });

  if (hasImg) addHero(L, { x: 1010, y: 130, w: 790, h: 820 }, 44, 1, 'none', 'card', true);
}

/** Kepala standar (judul + garis aksen + subjudul); mengembalikan y awal area isi. */
function drawHeader(L: L): number {
  const { slide, scale } = L;
  const logoReserve = slide.showLogo && L.rc.logoId ? 260 : 0;
  const w = W - M * 2 - logoReserve;
  const title = fitRichText(L.m, slide.title || 'Judul slide', heading(L, 70 * scale), w, 180, 40, 1.14);
  let y = 104;
  addText(L, { id: 'title', role: 'title', order: 0, block: title, x: M, y, boxW: w, align: 'left' });
  addBar(L, 'bar', M, y + title.height + 16, 96, 'title', 0, 'title', true);
  y += title.height + 16 + 8;
  if (slide.subtitle) {
    const sub = fitRichText(L.m, slide.subtitle, body(L, 36 * scale, 400, L.theme.muted), W - M * 2, 100, 22, 1.3);
    y += 22;
    addText(L, { id: 'subtitle', role: 'subtitle', order: 1, block: sub, x: M, y, boxW: W - M * 2, align: 'left' });
    y += sub.height;
  }
  return y + 52;
}

function layoutContent(L: L): void {
  const { slide, img, scale } = L;
  const top = drawHeader(L);
  const hasImg = !!img;
  const bodyW = hasImg ? 890 : W - M * 2;
  const bottom = H - 110;

  if (slide.bullets.length) {
    const lay = layoutBullets(L, slide.bullets, bodyW - 52, 44 * scale, bottom - top);
    addBullets(L, lay, M, top, 52);
  }
  if (hasImg) {
    const bx = 1090;
    const by = Math.max(top - 28, 236);
    addHero(L, { x: bx, y: by, w: W - M - bx, h: H - 110 - by }, 36, 1, 'none', 'card', true);
  }
}

function layoutSplit(L: L): void {
  const { slide, scale, theme } = L;
  const panelW = 900;
  addHero(L, { x: 0, y: 0, w: panelW, h: H }, 0, 0, 'edge', 'bleed');

  const x = 1010;
  const w = W - x - 110;
  const title = fitRichText(L.m, slide.title || 'Judul slide', heading(L, 68 * scale), w, 300, 38, 1.14);
  const sub = slide.subtitle ? fitRichText(L.m, slide.subtitle, body(L, 34 * scale, 400, theme.muted), w, 140, 22, 1.3) : null;
  const headH = 8 + 20 + title.height + (sub ? 20 + sub.height : 0);
  const maxBul = H - 200 - headH - 40;
  const lay = slide.bullets.length ? layoutBullets(L, slide.bullets, w - 46, 36 * scale, Math.max(200, maxBul)) : null;
  const total = headH + (lay ? 44 + lay.height : 0);
  let y = Math.max(96, (H - total) / 2);

  addText(L, { id: 'title', role: 'title', order: 0, block: title, x, y: y + 28, boxW: w, align: 'left' });
  addBar(L, 'bar', x, y, 96, 'title', 0, 'title');
  y += 28 + title.height;
  if (sub) {
    const sy = y + 20;
    addText(L, { id: 'subtitle', role: 'subtitle', order: 1, block: sub, x, y: sy, boxW: w, align: 'left' });
    y = sy + sub.height;
  }
  if (lay) addBullets(L, lay, x, y + 44, 46);
}

function layoutImageFull(L: L): void {
  const { slide, scale, theme } = L;
  // Foto full-bleed + gradasi gelap di bawah menjadi SATU elemen hero (agar ikut mekar saat Magic Move).
  addHero(L, { x: 0, y: 0, w: W, h: H }, 0, 0, 'overlay', 'bleed');

  const w = 1400;
  const white = '#ffffff';
  const title = fitRichText(L.m, slide.title || 'Judul slide', { ...heading(L, 100 * scale, 800, white), highlight: theme.accent2 }, w, 330, 50, 1.1);
  const sub = slide.subtitle
    ? fitRichText(L.m, slide.subtitle, body(L, 44 * scale, 400, 'rgba(255,255,255,0.84)', theme.accent2), w, 130, 24, 1.3)
    : null;
  const bl = slide.bullets.length
    ? layoutBullets(L, slide.bullets.slice(0, 3), w - 40, 34 * scale, 210, 'rgba(255,255,255,0.92)', theme.accent2)
    : null;
  const total = title.height + (sub ? 18 + sub.height : 0) + (bl ? 30 + bl.height : 0);
  let y = H - 104 - total;

  addText(L, { id: 'title', role: 'title', order: 0, block: title, x: M, y, boxW: w, align: 'left' });
  y += title.height;
  if (sub) {
    const sy = y + 18;
    addText(L, { id: 'subtitle', role: 'subtitle', order: 1, block: sub, x: M, y: sy, boxW: w, align: 'left' });
    y = sy + sub.height;
  }
  if (bl) addBullets(L, bl, M, y + 30, 40);
}

function layoutQuote(L: L): void {
  const { slide, scale, theme } = L;
  const w = 1400;
  const x = (W - w) / 2;
  const quote = fitRichText(
    L.m,
    slide.title || 'Tuliskan kutipan di sini',
    { ...heading(L, 76 * scale, 500), italicBase: true },
    w,
    520,
    36,
    1.32,
  );
  const sub = slide.subtitle ? fitRichText(L.m, slide.subtitle, body(L, 38 * scale, 500, theme.muted), w, 100, 22, 1.3) : null;
  const total = quote.height + (sub ? 64 + sub.height : 0);
  const y0 = (H - total) / 2;

  // Tanda kutip besar (dekorasi statis di belakang teks).
  add(L, {
    id: 'quote-mark',
    role: 'decor',
    rect: { x: x - 60, y: y0 - 260, w: 520, h: 640 },
    abs: (ctx) => {
      ctx.save();
      ctx.font = `700 520px ${theme.fontHeading}`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = rgba(theme.accent, 0.2);
      ctx.fillText('“', x - 40, y0 - 250);
      ctx.restore();
    },
  });
  addText(L, { id: 'title', role: 'title', order: 0, block: quote, x, y: y0, boxW: w, align: 'center' });
  if (sub) {
    const sy = y0 + quote.height + 34;
    addText(L, { id: 'subtitle', role: 'subtitle', order: 1, block: sub, x, y: sy + 30, boxW: w, align: 'center' });
    addBar(L, 'bar', W / 2 - 40, sy, 80, 'subtitle', 1, 'subtitle');
  }
}

function splitStat(text: string, i: number): { value: string; label: string } {
  const bar = text.split(/\s*\|\s*/);
  if (bar.length >= 2) return { value: bar[0], label: bar.slice(1).join(' ') };
  const m = /^(\S*\d\S*)\s+(.+)$/.exec(text);
  if (m) return { value: m[1], label: m[2] };
  return { value: String(i + 1).padStart(2, '0'), label: text };
}

/** Nilai besar bergradien; font dikecilkan hingga muat `maxW`. Mengembalikan ukuran akhir & lebar. */
function fitValue(ctx: CanvasRenderingContext2D, theme: ResolvedTheme, value: string, startSize: number, maxW: number): { size: number; width: number } {
  let vs = Math.round(startSize);
  ctx.font = `800 ${vs}px ${theme.fontHeading}`;
  while (ctx.measureText(value).width > maxW && vs > 30) {
    vs = Math.floor(vs * 0.92);
    ctx.font = `800 ${vs}px ${theme.fontHeading}`;
  }
  return { size: vs, width: ctx.measureText(value).width };
}

function layoutStats(L: L): void {
  const { slide, theme, scale } = L;
  const top = drawHeader(L);
  const items = slide.bullets.slice(0, 4);
  if (!items.length) return;
  const gap = 36;
  const cw = (W - M * 2 - gap * (items.length - 1)) / items.length;
  const ch = Math.min(440, H - 110 - Math.max(top, 330));
  const cy = Math.max(top + 10, (H - ch) / 2 + 60);

  items.forEach((text, i) => {
    const { value, label } = splitStat(text, i);
    const id = `card-${i}`;
    const r = place(L, id, { x: M + i * (cw + gap), y: cy, w: cw, h: ch });
    add(L, {
      id,
      role: 'body',
      motionRole: 'body',
      order: 3 + i,
      rect: r,
      pad: 6,
      edit: 'free',
      abs: (ctx) => {
        paintPanel(ctx, theme, r, 32);
        // Garis aksen kecil di pojok kartu.
        const bg = ctx.createLinearGradient(r.x + 40, r.y + 40, r.x + 96, r.y + 40);
        bg.addColorStop(0, theme.accent);
        bg.addColorStop(1, theme.accent2);
        ctx.fillStyle = bg;
        roundRectPath(ctx, r.x + 40, r.y + 40, 56, 8, 4);
        ctx.fill();

        const { size: vs, width: vw } = fitValue(ctx, theme, value, 122 * scale, r.w - 80);
        ctx.fillStyle = gradientFill(ctx, theme, r.x + 40, r.x + 40 + vw);
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText(value, r.x + 40, r.y + 84);

        const lab = fitRichText(ctx, label, body(L, 34 * scale, 500, theme.muted), r.w - 80, r.h - 84 - vs * 1.2 - 40, 20, 1.3);
        drawTextBlock(ctx, lab, r.x + 40, r.y + 84 + vs * 1.18, r.w - 80, 'left');
      },
    });
  });
}

/**
 * Grafik batang: tiap butir "nilai | label" (format sama seperti `stats`/`timeline`) menjadi satu
 * batang vertikal, tingginya proporsional terhadap nilai terbesar di antara semua butir. Angka
 * diekstrak dari bagian "nilai" lewat regex (mendukung "%", satuan, dsb — hanya digit yang dipakai
 * untuk menghitung tinggi); butir tanpa angka jatuh ke tinggi nol. Tiap batang = layer terpisah agar
 * ikut animasi stagger otomatis (peran "body") dan bisa digeser manual satu per satu di panel Posisi.
 */
function layoutChart(L: L): void {
  const { slide, theme, scale } = L;
  const top = drawHeader(L);
  const items = slide.bullets.slice(0, 6);
  if (!items.length) return;

  const parsed = items.map((text, i) => {
    const { value, label } = splitStat(text, i);
    const m = /-?\d+(?:[.,]\d+)?/.exec(value);
    const num = m ? Math.max(0, parseFloat(m[0].replace(',', '.'))) : 0;
    return { display: value, label, num };
  });
  const maxNum = Math.max(1, ...parsed.map((p) => p.num));

  const gap = 32;
  const n = parsed.length;
  const barW = (W - M * 2 - gap * (n - 1)) / n;
  const bottom = H - 158; // sumbu dasar: sisakan ruang untuk label kategori di bawahnya
  const chartTop = Math.max(top + 70, 340);
  const maxBarH = Math.max(80, bottom - chartTop);

  add(L, {
    id: 'axis',
    role: 'decor',
    rect: { x: M, y: bottom, w: W - M * 2, h: 2 },
    abs: (ctx) => {
      ctx.fillStyle = theme.border;
      ctx.fillRect(M, bottom, W - M * 2, 2);
    },
  });

  parsed.forEach((p, i) => {
    const id = `bar-${i}`;
    const slot = { x: M + i * (barW + gap), y: bottom - maxBarH, w: barW, h: maxBarH };
    const r = place(L, id, slot);
    const flip = i % 2 === 1;
    add(L, {
      id,
      role: 'body',
      motionRole: 'body',
      order: 3 + i,
      rect: r,
      pad: 8,
      edit: 'free',
      abs: (ctx) => {
        const barH = Math.max(12, Math.min(r.h, (p.num / maxNum) * r.h));
        const by = bottom - barH;
        const radius = Math.min(18, r.w / 2, barH / 2);
        const g = ctx.createLinearGradient(0, by, 0, bottom);
        g.addColorStop(0, flip ? theme.accent2 : theme.accent);
        g.addColorStop(1, flip ? theme.accent : theme.accent2);
        ctx.fillStyle = g;
        roundRectPath(ctx, r.x, by, r.w, barH, radius);
        ctx.fill();

        fitValue(ctx, theme, p.display, 46 * scale, r.w + 12); // efek samping: men-set ctx.font ke ukuran yang muat
        ctx.fillStyle = theme.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(p.display, r.x + r.w / 2, by - 16);

        const labelW = r.w + gap * 0.7;
        const lab = fitRichText(ctx, p.label, body(L, 28 * scale, 500, theme.muted), labelW, 74, 16, 1.25);
        drawTextBlock(ctx, lab, r.x + r.w / 2 - labelW / 2, bottom + 20, labelW, 'center');

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
      },
    });
  });
}

/** Daftar bernomor: tiap poin = satu baris panel dengan angka besar bergradien. */
function layoutNumbered(L: L): void {
  const { slide, theme, scale } = L;
  const top = drawHeader(L);
  const items = slide.bullets.slice(0, 5);
  if (!items.length) return;
  const gap = 16;
  const bottom = H - 96;
  const rowH = Math.min(150, (bottom - top - gap * (items.length - 1)) / items.length);
  const startY = Math.max(top, top + (bottom - top - (rowH * items.length + gap * (items.length - 1))) / 2 - 10);

  items.forEach((text, i) => {
    const id = `row-${i}`;
    const r = place(L, id, { x: M, y: startY + i * (rowH + gap), w: W - M * 2, h: rowH });
    add(L, {
      id,
      role: 'body',
      motionRole: 'body',
      order: 3 + i,
      rect: r,
      pad: 6,
      edit: 'free',
      abs: (ctx) => {
        paintPanel(ctx, theme, r, Math.min(30, r.h / 2));
        const num = String(i + 1).padStart(2, '0');
        const { size: ns, width: nw } = fitValue(ctx, theme, '00', Math.min(r.h * 0.56, 92 * scale), r.w * 0.2); // lebar kolom tetap agar teks lurus
        const nx = r.x + 40;
        ctx.font = `800 ${ns}px ${theme.fontHeading}`;
        ctx.fillStyle = gradientFill(ctx, theme, nx, nx + nw, i % 2 === 1);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(num, nx, r.y + r.h / 2 + ns * 0.04);
        // Garis pemisah tipis antara angka dan teks.
        const sx = nx + nw + 34;
        ctx.fillStyle = theme.border;
        ctx.fillRect(sx, r.y + r.h * 0.24, 2, r.h * 0.52);
        const tx = sx + 36;
        const blk = fitRichText(ctx, text, body(L, 40 * scale), r.x + r.w - 40 - tx, r.h - 26, 20, 1.26);
        drawTextBlock(ctx, blk, tx, r.y + (r.h - blk.height) / 2, 0, 'left');
      },
    });
  });
}

/** Linimasa horizontal: tiap langkah = satu kolom (titik pada garis + nilai + keterangan). */
function layoutTimeline(L: L): void {
  const { slide, theme, scale } = L;
  const top = drawHeader(L);
  const items = slide.bullets.slice(0, 5);
  if (!items.length) return;
  const n = items.length;
  const colW = (W - M * 2) / n;
  const ch = Math.min(460, H - 110 - top - 10);
  const y0 = Math.max(top + 10, (H - ch) / 2 + 50);

  items.forEach((text, i) => {
    const { value, label } = splitStat(text, i);
    const id = `step-${i}`;
    const r = place(L, id, { x: M + i * colW, y: y0, w: colW, h: ch });
    add(L, {
      id,
      role: 'body',
      motionRole: 'body',
      order: 3 + i,
      rect: r,
      pad: 24,
      edit: 'free',
      abs: (ctx) => {
        const ly = r.y + 34;
        const cx = r.x + r.w / 2;
        // Garis waktu (menyambung antar kolom yang berdampingan).
        const x0 = i === 0 ? cx : r.x;
        const x1 = i === n - 1 ? cx : r.x + r.w;
        const lg = ctx.createLinearGradient(x0, 0, x1, 0);
        lg.addColorStop(0, rgba(theme.accent, 0.5));
        lg.addColorStop(1, rgba(theme.accent2, 0.5));
        ctx.strokeStyle = lg;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, ly);
        ctx.lineTo(x1, ly);
        ctx.stroke();
        // Titik: cincin luar + inti gradien + bintik pusat.
        ctx.strokeStyle = rgba(theme.accent, 0.35);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, ly, 27, 0, TAU);
        ctx.stroke();
        const dg = ctx.createLinearGradient(cx - 18, ly - 18, cx + 18, ly + 18);
        dg.addColorStop(0, theme.accent);
        dg.addColorStop(1, theme.accent2);
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.arc(cx, ly, 18, 0, TAU);
        ctx.fill();
        ctx.fillStyle = theme.bg1;
        ctx.beginPath();
        ctx.arc(cx, ly, 6.5, 0, TAU);
        ctx.fill();

        const inner = r.w - 36;
        const { size: vs, width: vw } = fitValue(ctx, theme, value, 78 * scale, inner);
        ctx.fillStyle = gradientFill(ctx, theme, cx - vw / 2, cx + vw / 2, i % 2 === 1);
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText(value, cx - vw / 2, ly + 62);
        const lab = fitRichText(ctx, label, body(L, 30 * scale, 500, theme.muted), inner, r.h - 62 - vs * 1.25 - 40, 18, 1.3);
        drawTextBlock(ctx, lab, r.x + 18, ly + 62 + vs * 1.22, inner, 'center');
      },
    });
  });
}

/** Pisahkan poin menjadi dua sisi: pemisah "---" (atau "|"); tanpa pemisah → dibagi dua. */
function splitCompare(bullets: string[]): [string[], string[]] {
  const idx = bullets.findIndex((b) => /^\s*(-{3,}|\|)\s*$/.test(b));
  if (idx >= 0) return [bullets.slice(0, idx), bullets.slice(idx + 1)];
  const mid = Math.ceil(bullets.length / 2);
  return [bullets.slice(0, mid), bullets.slice(mid)];
}

/** Bandingkan: dua panel berdampingan; poin pertama tiap sisi = judul panel. */
function layoutCompare(L: L): void {
  const { slide, theme, scale } = L;
  const top = drawHeader(L);
  if (!slide.bullets.length) return;
  const sides = splitCompare(slide.bullets);
  const gap = 48;
  const pw = (W - M * 2 - gap) / 2;
  const avail = Math.min(620, H - 100 - top);
  // Tinggi panel = isi terpanjang (judul + poin) + ruang, agar tidak ada panel kosong yang menjulang.
  const need = sides.map(([head, ...items]) => {
    const hb = head ? fitRichText(L.m, head, heading(L, 46 * scale, 800), pw - 80, 120, 26, 1.15) : null;
    const lay = items.length ? layoutBullets(L, items, pw - 124, 34 * scale, 420) : null;
    return 70 + (hb ? hb.height + 26 : 0) + (lay ? lay.height : 0) + 50;
  });
  const ph = Math.max(260, Math.min(avail, Math.max(...need)));

  sides.forEach((side, i) => {
    const id = `panel-${i}`;
    const r = place(L, id, { x: M + i * (pw + gap), y: top, w: pw, h: ph });
    const color = i === 0 ? theme.accent : theme.accent2;
    add(L, {
      id,
      role: 'body',
      motionRole: 'body',
      order: 3 + i,
      rect: r,
      pad: 6,
      edit: 'free',
      abs: (ctx) => {
        paintPanel(ctx, theme, r, 32);
        // Pita aksen di sisi atas panel.
        const sg = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
        sg.addColorStop(0, rgba(color, 0.9));
        sg.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = sg;
        roundRectPath(ctx, r.x + 40, r.y + 34, r.w - 80, 8, 4);
        ctx.fill();

        const [head, ...items] = side;
        let y = r.y + 70;
        if (head) {
          const hb = fitRichText(ctx, head, heading(L, 46 * scale, 800, color), r.w - 80, 120, 26, 1.15);
          drawTextBlock(ctx, hb, r.x + 40, y, 0, 'left');
          y += hb.height + 26;
        }
        if (items.length) {
          const lay = layoutBullets(L, items, r.w - 80 - 44, 34 * scale, Math.max(120, r.y + r.h - 40 - y));
          lay.blocks.forEach((b) => {
            const mr = Math.max(7, b.spec.size * 0.2);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(r.x + 40 + mr, y + b.lineHeight / 2, mr, 0, TAU);
            ctx.fill();
            drawTextBlock(ctx, b, r.x + 40 + 44, y, 0, 'left');
            y += b.height + lay.gap;
          });
        }
      },
    });
  });
}

/** Pernyataan besar: satu kalimat berukuran raksasa di tengah, dikelilingi cincin dekoratif. */
function layoutStatement(L: L): void {
  const { slide, theme, scale } = L;
  const w = 1560;
  const x = (W - w) / 2;
  const title = fitRichText(L.m, slide.title || 'Tulis pernyataan utama di sini', heading(L, 156 * scale, 900), w, 620, 64, 1.06);
  const sub = slide.subtitle ? fitRichText(L.m, slide.subtitle, body(L, 46 * scale, 400, theme.muted), w, 150, 26, 1.3) : null;
  const bl = slide.bullets.slice(0, 3).map((t) => layoutRichText(L.m, t, body(L, 34 * scale, 500, theme.muted), w, 1.25));
  const bulletsH = bl.reduce((s, b) => s + b.height, 0) + 14 * Math.max(0, bl.length - 1);
  const total = 8 + 44 + title.height + (sub ? 34 + sub.height : 0) + (bl.length ? 40 + bulletsH : 0);
  let y = Math.max(50, (H - total) / 2);

  // Cincin dekoratif statis.
  const ring = (id: string, cx: number, cy: number, r: number, color: string, alpha: number, lw: number) =>
    add(L, {
      id,
      role: 'decor',
      rect: { x: cx - r - lw, y: cy - r - lw, w: (r + lw) * 2, h: (r + lw) * 2 },
      maxTex: 1100,
      abs: (ctx) => {
        ctx.strokeStyle = rgba(color, alpha);
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.stroke();
      },
    });
  ring('ring-0', 1560, 190, 500, theme.accent, 0.22, 3);
  ring('ring-1', 300, 930, 370, theme.accent2, 0.2, 3);
  ring('ring-2', 1560, 190, 330, theme.accent, 0.1, 2);

  const barY = y;
  y += 8 + 44;
  addText(L, { id: 'title', role: 'title', order: 0, block: title, x, y, boxW: w, align: 'center' });
  addBar(L, 'bar', W / 2 - 55, barY, 110, 'title', 0, 'title');
  y += title.height;
  if (sub) {
    y += 34;
    addText(L, { id: 'subtitle', role: 'subtitle', order: 1, block: sub, x, y, boxW: w, align: 'center' });
    y += sub.height;
  }
  if (bl.length) {
    y += 40;
    bl.forEach((b, i) => {
      addText(L, { id: `bullet-${i}`, role: 'body', order: 3 + i, block: b, x, y, boxW: w, align: 'center' });
      y += b.height + 14;
    });
  }
}

/** Logo pojok (tag "logo") + nomor slide. */
function layoutChrome(L: L, layout: string): void {
  const { slide, rc, theme, logo } = L;
  // Di sampul, logo tampil sebagai lencana bulat — tidak digandakan.
  if (layout !== 'title' && slide.showLogo && logo && imgW(logo)) {
    const s = Math.min(230 / imgW(logo), 84 / imgH(logo));
    const lw = imgW(logo) * s;
    const lh = imgH(logo) * s;
    const rect = place(L, 'logo', { x: W - 96 - lw, y: 56, w: lw, h: lh });
    add(L, {
      id: 'logo',
      role: 'logo',
      motionRole: 'logo',
      order: 2,
      mode: 'card',
      rect,
      tag: 'logo',
      shared: 'logo',
      edit: 'lock',
      contentKey: `logo:${rc.logoId}`,
      content: (c, w, h) => c.drawImage(logo, 0, 0, w, h),
      abs: (ctx) => ctx.drawImage(logo, rect.x, rect.y, rect.w, rect.h),
    });
  }
  if (theme.showSlideNumber && rc.total > 0 && layout !== 'title') {
    const light = layout === 'image-full';
    const pad = (n: number) => String(n).padStart(2, '0');
    add(L, {
      id: 'number',
      role: 'number',
      rect: { x: W - 96 - 200, y: H - 56 - 34, w: 200, h: 48 },
      pad: 6,
      abs: (ctx) => {
        ctx.save();
        ctx.font = `500 24px ${theme.fontBody}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = light ? 'rgba(255,255,255,0.7)' : rgba(theme.muted, 0.85);
        ctx.fillText(`${pad(rc.index + 1)} / ${pad(rc.total)}`, W - 96, H - 56);
        ctx.restore();
      },
    });
  }
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  live: boolean;
  theme: ResolvedTheme;
  index: number;
  total: number;
  logoId: string | null;
  img: DrawableImage | null;
  logo: DrawableImage | null;
  layers: SlideLayer[];
}
const layerCache = new WeakMap<Slide, CacheEntry>();

/** Jalankan layout & hasilkan lapisan (di-cache per slide selama masukan yang sama). */
export function buildLayers(slide: Slide, rc: RenderContext): SlideLayer[] {
  const img = rc.getImage(slide.imageId);
  const logo = rc.logoId ? rc.getImage(rc.logoId) : null;
  // "Bergerak" ikut menentukan hasil layout (lapisan foto ditandai live) — jangan pakai layout ber-cache milik konteks lain.
  const live = !!slide.imageId && !!rc.isLive?.(slide.imageId);
  const hit = layerCache.get(slide);
  if (
    hit &&
    hit.live === live &&
    hit.theme === rc.theme &&
    hit.index === rc.index &&
    hit.total === rc.total &&
    hit.logoId === rc.logoId &&
    hit.img === img &&
    hit.logo === logo
  ) {
    return hit.layers;
  }

  const layout = slide.layout === 'auto' ? 'content' : slide.layout;
  const L: L = {
    m: mctx(),
    slide,
    rc,
    theme: rc.theme,
    img,
    logo,
    seed: slide.imageQuery || slide.title || slide.id,
    scale: slide.textScale || 1,
    heroTag: slide.heroTag ?? 'hero',
    live,
    layers: [],
    moved: {},
  };

  // Latar: gradien + pola + cahaya (jalur datar memakai drawBackground; adegan memakai lapisan ini).
  add(L, {
    id: 'bg',
    role: 'bg',
    rect: { x: 0, y: 0, w: W, h: H },
    abs: (ctx) => paintGradientBg(ctx, rc.theme),
  });
  if (layout !== 'image-full') {
    glowsFor(rc.theme, slide.id).forEach((g, i) =>
      add(L, {
        id: `glow-${i}`,
        role: 'glow',
        rect: { x: g.cx - g.r, y: g.cy - g.r, w: g.r * 2, h: g.r * 2 },
        maxTex: 512,
        abs: (ctx) => paintGlow(ctx, g),
      }),
    );
  }

  switch (layout) {
    case 'title':
      layoutTitle(L);
      break;
    case 'split':
      layoutSplit(L);
      break;
    case 'image-full':
      layoutImageFull(L);
      break;
    case 'quote':
      layoutQuote(L);
      break;
    case 'stats':
      layoutStats(L);
      break;
    case 'chart':
      layoutChart(L);
      break;
    case 'numbered':
      layoutNumbered(L);
      break;
    case 'timeline':
      layoutTimeline(L);
      break;
    case 'compare':
      layoutCompare(L);
      break;
    case 'statement':
      layoutStatement(L);
      break;
    default:
      layoutContent(L);
  }
  layoutChrome(L, layout);

  layerCache.set(slide, { live, theme: rc.theme, index: rc.index, total: rc.total, logoId: rc.logoId, img, logo, layers: L.layers });
  return L.layers;
}

const isOmitted = (l: SlideLayer, omit: readonly string[]): boolean =>
  (!!l.tag && omit.includes(l.tag)) ||
  (omit.includes('@text') && (l.motionRole === 'title' || l.motionRole === 'subtitle' || l.motionRole === 'body'));

/** Jalur DATAR: gambar seluruh slide ke `ctx` (yang sudah di-scale ke ruang 1920×1080). */
export function drawSlide(ctx: CanvasRenderingContext2D, slide: Slide, rc: RenderContext, opts: DrawOptions = {}): void {
  const layout = slide.layout === 'auto' ? 'content' : slide.layout;
  const layers = buildLayers(slide, rc);
  const omit = opts.omitTags ?? [];

  ctx.save();
  ctx.textBaseline = 'top';
  drawBackground(ctx, rc.theme, slide.id, layout !== 'image-full');
  for (const l of layers) {
    if (l.role === 'bg' || l.role === 'glow' || isOmitted(l, omit)) continue;
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    if (l.flat) {
      l.flat(ctx);
    } else {
      ctx.translate(l.rect.x, l.rect.y);
      l.paint(ctx, l.rect.w, l.rect.h);
    }
    ctx.restore();
  }
  ctx.restore();
}

/** Layar kosong (sisi "dari" pada transisi intro slide pertama). */
export function drawBlank(ctx: CanvasRenderingContext2D, theme: ResolvedTheme): void {
  drawBackground(ctx, theme, 'blank', false);
}

/** Elemen bersama (tag) sebuah slide — untuk Magic Move. */
export function collectSharedElements(slide: Slide, rc: RenderContext): SharedElement[] {
  return buildLayers(slide, rc)
    .filter((l) => l.shared)
    .map((l) => ({
      tag: l.tag,
      kind: l.shared!,
      contentKey: l.contentKey,
      rect: l.rect,
      radius: l.radius,
      shadow: l.shadow,
      paint: l.paint,
    }));
}

const numOf = (id: string): number => Number(id.split('-')[1] ?? 0) + 1;

function labelOf(l: SlideLayer): string {
  switch (l.id.split('-')[0]) {
    case 'title':
      return 'Judul';
    case 'subtitle':
      return 'Subjudul';
    case 'bullet':
      return `Poin ${numOf(l.id)}`;
    case 'hero':
      return l.live ? 'Animasi' : 'Foto';
    case 'badge':
      return 'Lencana logo';
    case 'logo':
      return 'Logo';
    case 'card':
      return `Kartu ${numOf(l.id)}`;
    case 'bar':
      return `Batang ${numOf(l.id)}`;
    case 'row':
      return `Baris ${numOf(l.id)}`;
    case 'step':
      return `Langkah ${numOf(l.id)}`;
    case 'panel':
      return `Panel ${numOf(l.id)}`;
    default:
      return l.id;
  }
}

/** Metadata lapisan beranimasi/dapat diedit (judul, subjudul, poin, media, logo, kartu) untuk UI. */
export function describeLayers(slide: Slide, rc: RenderContext): LayerInfo[] {
  return buildLayers(slide, rc)
    .filter((l) => l.motionRole && l.role !== 'decor')
    .map((l) => ({
      id: l.id,
      role: l.role,
      motionRole: l.motionRole,
      rect: l.rect,
      mode: l.mode,
      label: labelOf(l),
      edit: l.edit ?? 'free',
      radius: l.radius,
      live: !!l.live,
    }));
}
