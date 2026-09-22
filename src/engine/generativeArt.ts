import { hashString, mulberry32 } from '../utils/hash';
import type { ResolvedTheme } from '../types';

/**
 * Seni generatif deterministik: satu seed (kata kunci) → satu "ilustrasi" unik.
 * Dipakai sebagai gambar kontekstual offline (tanpa API) dan sebagai fallback layout.
 */

interface Palette {
  base: string;
  c1: string;
  c2: string;
  c3: string;
}

function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;
}

function paletteFor(seed: string, mode: 'dark' | 'light'): Palette {
  const h = hashString(seed) % 360;
  if (mode === 'light') {
    return { base: hsl(h, 40, 94), c1: hsl(h, 75, 62), c2: hsl(h + 42, 80, 68), c3: hsl(h - 36, 70, 74) };
  }
  return { base: hsl(h, 55, 8), c1: hsl(h, 75, 50), c2: hsl(h + 42, 85, 58), c3: hsl(h - 36, 80, 62) };
}

function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace(/[\d.]+\)$/, `${alpha})`));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function paintArt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: string,
  mode: 'dark' | 'light' = 'dark',
): void {
  const rnd = mulberry32(hashString(seed));
  const pal = paletteFor(seed, mode);
  const style = Math.floor(rnd() * 4);
  const cols = [pal.c1, pal.c2, pal.c3];

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x, y);

  // Dasar gradien diagonal.
  const base = ctx.createLinearGradient(0, 0, w * rnd(), h);
  base.addColorStop(0, pal.base);
  base.addColorStop(1, mode === 'dark' ? hsl(hashString(seed) % 360, 60, 16) : hsl(hashString(seed) % 360, 50, 86));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Cahaya lembut berlapis.
  for (let i = 0; i < 5; i++) {
    glow(ctx, rnd() * w, rnd() * h, Math.max(w, h) * (0.35 + rnd() * 0.4), cols[i % 3], 0.55 + rnd() * 0.3);
  }

  if (style === 0) {
    // Gelombang berlapis.
    for (let i = 0; i < 7; i++) {
      const amp = h * (0.05 + rnd() * 0.08);
      const freq = 1 + rnd() * 2.2;
      const phase = rnd() * Math.PI * 2;
      const baseY = h * (0.35 + (i / 7) * 0.65);
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let px = 0; px <= w; px += 8) {
        ctx.lineTo(px, baseY + Math.sin((px / w) * Math.PI * 2 * freq + phase) * amp);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, baseY - amp, 0, h);
      g.addColorStop(0, cols[i % 3].replace(/[\d.]+\)$/, '0.55)'));
      g.addColorStop(1, cols[(i + 1) % 3].replace(/[\d.]+\)$/, '0.05)'));
      ctx.fillStyle = g;
      ctx.fill();
    }
  } else if (style === 1) {
    // Cincin konsentris.
    const cx = w * (0.3 + rnd() * 0.4);
    const cy = h * (0.3 + rnd() * 0.4);
    for (let i = 1; i <= 16; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, i * Math.min(w, h) * 0.06, 0, Math.PI * 2);
      ctx.strokeStyle = cols[i % 3].replace(/[\d.]+\)$/, `${0.5 - i * 0.025})`);
      ctx.lineWidth = 2 + rnd() * 3;
      ctx.stroke();
    }
  } else if (style === 2) {
    // Orb-orb translusen.
    for (let i = 0; i < 9; i++) {
      const r = Math.min(w, h) * (0.06 + rnd() * 0.22);
      const px = rnd() * w;
      const py = rnd() * h;
      const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
      g.addColorStop(0, cols[i % 3].replace(/[\d.]+\)$/, '0.9)'));
      g.addColorStop(1, cols[(i + 1) % 3].replace(/[\d.]+\)$/, '0.12)'));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Ubin geometris.
    const n = 8 + Math.floor(rnd() * 5);
    const cell = w / n;
    for (let gx = 0; gx < n; gx++) {
      for (let gy = 0; gy < Math.ceil(h / cell); gy++) {
        if (rnd() < 0.45) continue;
        ctx.fillStyle = cols[Math.floor(rnd() * 3)].replace(/[\d.]+\)$/, `${0.08 + rnd() * 0.32})`);
        const pad = cell * 0.08;
        const rr = cell * (rnd() < 0.5 ? 0.5 : 0.12);
        ctx.beginPath();
        ctx.roundRect?.(gx * cell + pad, gy * cell + pad, cell - pad * 2, cell - pad * 2, rr);
        if (!ctx.roundRect) ctx.rect(gx * cell + pad, gy * cell + pad, cell - pad * 2, cell - pad * 2);
        ctx.fill();
      }
    }
  }

  // Butiran halus + vinyet agar terasa "fotografis".
  ctx.fillStyle = mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const specks = Math.floor((w * h) / 4500);
  for (let i = 0; i < specks; i++) ctx.fillRect(rnd() * w, rnd() * h, 1.6, 1.6);
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, mode === 'dark' ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.12)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}

/** Hasilkan gambar 16:9 beresolusi tinggi sebagai data URL (JPEG). */
export function generateArtDataUrl(
  seed: string,
  theme: Pick<ResolvedTheme, 'mode'>,
  width = 1920,
  height = 1080,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  paintArt(ctx, 0, 0, width, height, seed, theme.mode);
  return canvas.toDataURL('image/jpeg', 0.9);
}
