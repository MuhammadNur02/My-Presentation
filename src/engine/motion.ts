import type { AmbientMedia, BuildAnimation, MotionRole, Slide, TextSplit } from '../types';

/**
 * Resolusi gerak: dari gaya slide (`Slide.build`) + penyetelan per elemen (`Slide.motion`)
 * menjadi parameter animasi konkret per peran. Fungsi murni — dipakai engine, UI, dan perencana AI.
 */

export interface ResolvedMotion {
  enter: BuildAnimation;
  split: TextSplit;
  /** Jeda total (detik) sebelum elemen mulai masuk = jeda urutan bawaan + penyetelan pengguna. */
  delay: number;
  duration: number;
  /** Jeda antar potongan teks (kata/baris). */
  stagger: number;
  /** Jeda antar poin (khusus peran `body`). */
  itemStagger: number;
}

/** Urutan gaya untuk mode `mix`: tiap elemen (berdasarkan urutan) memakai gaya berbeda. */
export const MIX_ORDER: BuildAnimation[] = [
  'fade-up',
  'slide-left',
  'scale',
  'drop',
  'zoom-out',
  'slide-right',
  'rotate-in',
  'bounce',
  'zoom-in',
  'tilt-up',
  'flip-x',
  'spiral',
  'elastic',
];

export const ROLE_LABEL: Record<MotionRole, string> = {
  title: 'Judul',
  subtitle: 'Subjudul',
  body: 'Poin / kartu',
  media: 'Foto / media',
  logo: 'Logo',
};

const DEFAULT_DURATION: Record<MotionRole, number> = { title: 0.9, subtitle: 0.8, body: 0.75, media: 1.05, logo: 0.75 };
const BASE_DELAY: Record<MotionRole, number> = { title: 0, subtitle: 0.14, media: 0.06, logo: 0.1, body: 0.3 };

const TEXT_ROLES: MotionRole[] = ['title', 'subtitle', 'body'];
export const isTextRole = (r: MotionRole | null): boolean => !!r && TEXT_ROLES.includes(r);

/** Urutan build elemen (untuk mode `mix` & jeda): 0 judul, 1 subjudul, 2 media/logo, 3+ poin. */
export function resolveMotion(slide: Slide, role: MotionRole, order: number): ResolvedMotion {
  const o = slide.motion?.roles?.[role];
  let enter: BuildAnimation = o?.enter ?? slide.build;
  if (enter === 'mix') enter = MIX_ORDER[Math.max(0, order) % MIX_ORDER.length];
  // Logo bergerak halus secara bawaan (bukan efek liar) kecuali dipilih eksplisit.
  if (role === 'logo' && !o?.enter && slide.build !== 'none') enter = 'scale';
  const itemStagger = role === 'body' ? o?.stagger ?? 0.13 : 0;
  return {
    enter,
    split: o?.split ?? 'block',
    delay: BASE_DELAY[role] + (o?.delay ?? 0),
    duration: o?.duration ?? DEFAULT_DURATION[role],
    stagger: role === 'body' ? 0.045 : o?.stagger ?? (o?.split === 'lines' ? 0.12 : 0.055),
    itemStagger,
  };
}

export function ambientOf(slide: Slide): { media: AmbientMedia; aurora: boolean; particles: boolean } {
  return { media: slide.motion?.ambientMedia ?? 'none', aurora: !!slide.motion?.aurora, particles: !!slide.motion?.particles };
}

/** Apakah slide memiliki animasi masuk untuk teks (judul/subjudul/poin)? */
export function hasTextEntrance(slide: Slide): boolean {
  return TEXT_ROLES.some((r) => resolveMotion(slide, r, 0).enter !== 'none');
}

/** Apakah ada gerak ambient yang perlu render terus-menerus? */
export function hasAmbient(slide: Slide): boolean {
  const a = ambientOf(slide);
  return a.media !== 'none' || a.aurora || a.particles;
}
