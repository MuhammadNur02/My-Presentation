import type { AmbientMedia, BuildAnimation, MotionStyle, Slide, SlideMotion, Tone, TransitionId } from '../../types';
import { hashString } from '../../utils/hash';

/**
 * Gaya gerak = bahasa gerak yang konsisten untuk SELURUH deck, agar terasa seperti pertunjukan yang
 * dirancang, bukan kumpulan efek acak. Setiap gaya menyelaraskan tiga tingkat:
 *   1) halaman  — palet transisi kecil (3–4 jenis) + transisi aksen + Magic Move bila ada elemen bersama;
 *   2) elemen   — animasi masuk per peran (judul, subjudul, poin, media, logo), teks per kata/baris;
 *   3) mikro    — gerak ambient (Ken Burns / melayang, cahaya latar aurora).
 */

export interface MotionStylePreset {
  id: MotionStyle;
  label: string;
  tagline: string;
  /** Kumpulan transisi yang cocok; deck memakai subset kecil (palet) agar konsisten. */
  pool: TransitionId[];
  /** Transisi "aksen" untuk pergantian bagian (sampul, kutipan, gambar penuh). */
  accent: TransitionId;
  intro: TransitionId;
  /** Ukuran palet. */
  paletteSize: number;
}

export const MOTION_STYLES: Record<MotionStyle, MotionStylePreset> = {
  elegant: {
    id: 'elegant',
    label: 'Halus',
    tagline: 'Tenang, rapi, profesional',
    pool: ['fade', 'slide', 'iris', 'wipe', 'doors', 'roll'],
    accent: 'zoom',
    intro: 'fade',
    paletteSize: 3,
  },
  cinematic: {
    id: 'cinematic',
    label: 'Sinematik',
    tagline: 'Megah seperti trailer film',
    pool: ['zoom', 'crosszoom', 'cube', 'morph', 'carousel', 'iris', 'doors', 'roll', 'flip'],
    accent: 'morph',
    intro: 'zoom',
    paletteSize: 4,
  },
  energetic: {
    id: 'energetic',
    label: 'Energik',
    tagline: 'Cepat, berani, penuh kejutan',
    pool: ['glitch', 'shatter', 'stripes', 'crosszoom', 'tiles', 'swirl', 'spin', 'toss', 'blinds', 'halftone', 'ripple', 'pixelate'],
    accent: 'shatter',
    intro: 'ripple',
    paletteSize: 4,
  },
  minimal: {
    id: 'minimal',
    label: 'Minimal',
    tagline: 'Hening, fokus pada isi',
    pool: ['fade', 'slide', 'wipe'],
    accent: 'fade',
    intro: 'fade',
    paletteSize: 2,
  },
};

export const MOTION_STYLE_LIST = Object.values(MOTION_STYLES);

export function styleForTone(tone: Tone): MotionStyle {
  return { professional: 'elegant', creative: 'cinematic', minimal: 'minimal', educational: 'elegant' }[tone] as MotionStyle;
}

/** Palet kecil yang stabil (deterministik dari `seed`): deck terasa konsisten, bukan acak. */
export function paletteFor(style: MotionStyle, seed: string): TransitionId[] {
  const p = MOTION_STYLES[style];
  const start = (hashString(seed) >>> 0) % p.pool.length; // hashString bisa negatif → paksa unsigned
  return Array.from({ length: Math.min(p.paletteSize, p.pool.length) }, (_, i) => p.pool[(start + i) % p.pool.length]);
}

/** Gaya masuk + penyetelan gerak untuk satu slide sesuai gaya proyek. */
export function motionForSlide(style: MotionStyle, slide: Slide, index: number): { build: BuildAnimation; motion: SlideMotion } {
  const quote = slide.layout === 'quote';
  const alt = index % 2 === 0;
  const cycle = <T,>(xs: T[]): T => xs[index % xs.length];
  switch (style) {
    case 'cinematic':
      return {
        build: 'fade-up',
        motion: {
          roles: {
            title: { enter: 'rise', split: quote ? 'lines' : 'words', duration: 0.95, stagger: quote ? 0.14 : 0.07 },
            subtitle: { enter: 'fade-up', duration: 0.9 },
            body: { enter: alt ? 'slide-left' : 'slide-right', stagger: 0.14, duration: 0.8 },
            media: { enter: cycle<BuildAnimation>(['zoom-out', 'tilt-up', 'zoom-in']), duration: 1.25 },
            logo: { enter: 'scale' },
          },
          ambientMedia: cycle<AmbientMedia>(['kenburns', 'drift', 'tilt3d']),
          aurora: true,
          particles: index % 2 === 0,
        },
      };
    case 'energetic': {
      const bodyIn: BuildAnimation[] = ['drop', 'slide-right', 'flip-in', 'bounce', 'flip-x', 'elastic'];
      return {
        build: 'bounce',
        motion: {
          roles: {
            title: { enter: cycle<BuildAnimation>(['bounce', 'elastic', 'glitch-in', 'spiral']), split: 'words', duration: 0.7, stagger: 0.05 },
            subtitle: { enter: cycle<BuildAnimation>(['drop', 'wipe-down', 'zoom-in']), duration: 0.7 },
            body: { enter: bodyIn[index % bodyIn.length], stagger: 0.1, duration: 0.65 },
            media: { enter: cycle<BuildAnimation>(['flip-in', 'spiral', 'elastic']), duration: 0.9 },
            logo: { enter: 'bounce' },
          },
          ambientMedia: cycle<AmbientMedia>(['float', 'sway', 'pulse', 'tilt3d']),
          aurora: true,
          particles: true,
        },
      };
    }
    case 'minimal':
      return {
        build: 'fade',
        motion: {
          roles: {
            title: { enter: 'blur-in', duration: 1 },
            subtitle: { enter: 'fade' },
            body: { enter: 'fade', stagger: 0.1 },
            media: { enter: 'fade', duration: 1.1 },
          },
          ambientMedia: 'none',
          aurora: false,
        },
      };
    default:
      return {
        build: alt ? 'fade-up' : 'slide-left',
        motion: {
          roles: {
            title: quote ? { enter: 'typewriter', duration: 1.1 } : { split: 'block', duration: 0.9 },
            subtitle: { enter: 'fade' },
            body: { stagger: 0.12 },
            media: { enter: 'scale', duration: 1.1 },
          },
          ambientMedia: cycle<AmbientMedia>(['kenburns', 'drift']),
          aurora: true,
          particles: index === 0,
        },
      };
  }
}

/** Terapkan gaya gerak ke seluruh slide (animasi elemen + ambient). Transisi direncanakan terpisah. */
export function applyMotionStyle(slides: Slide[], style: MotionStyle): Slide[] {
  return slides.map((s, i) => ({ ...s, ...motionForSlide(style, s, i) }));
}
