import type { QualityTier } from '../types';

export interface TierConfig {
  /** Batas atas resolusi tekstur slide (lebar; tinggi = 9/16). Ukuran aktual mengikuti layar, lihat pickTexWidth. */
  texW: number;
  texH: number;
  /** Batas device pixel ratio renderer. */
  maxDpr: number;
  antialias: boolean;
  /** Pengali kepadatan mesh untuk transisi vertex. */
  segmentScale: number;
}

export const TIER_CONFIG: Record<QualityTier, TierConfig> = {
  high: { texW: 2560, texH: 1440, maxDpr: 2, antialias: true, segmentScale: 1 },
  medium: { texW: 1920, texH: 1080, maxDpr: 1.5, antialias: true, segmentScale: 0.75 },
  low: { texW: 1280, texH: 720, maxDpr: 1, antialias: false, segmentScale: 0.5 },
};

const ORDER: QualityTier[] = ['low', 'medium', 'high'];

export function lowerTier(t: QualityTier): QualityTier {
  return ORDER[Math.max(0, ORDER.indexOf(t) - 1)];
}

/**
 * Graceful degradation tahap 1: tebak tier grafis dari perangkat.
 * Tahap 2 (adaptif) dijalankan DeckRenderer saat frame-rate terukur rendah.
 */
export function detectQuality(): QualityTier {
  if (typeof navigator === 'undefined') return 'medium';
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile =
    /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent) ||
    (nav.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820);
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 8;
  if (mobile || cores <= 2 || mem <= 2) return 'low';
  if (cores <= 4 || mem <= 4) return 'medium';
  return 'high';
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Uji dukungan WebGL memakai canvas sekali pakai (agar canvas asli tetap bersih). */
export function detectWebGL(): 'webgl2' | 'webgl' | null {
  try {
    const c = document.createElement('canvas');
    if (c.getContext('webgl2')) return 'webgl2';
    if (c.getContext('webgl')) return 'webgl';
  } catch {
    /* abaikan */
  }
  return null;
}

/** Anak tangga lebar tekstur — dikuantisasi agar mengubah ukuran jendela tidak membuat ulang tekstur terus-menerus. */
const TEX_STEPS = [960, 1280, 1600, 1920, 2560];

/**
 * Lebar tekstur terkecil yang tetap ≥ lebar piksel fisik bidang slide di layar, dibatasi `cap`.
 * Tekstur yang lebih kecil dari layar diperbesar (buram); yang sama persis tampil 1:1 (tajam).
 */
export function pickTexWidth(physicalPx: number, cap: number): number {
  const step = TEX_STEPS.find((s) => s >= physicalPx) ?? TEX_STEPS[TEX_STEPS.length - 1];
  return Math.min(cap, step);
}
