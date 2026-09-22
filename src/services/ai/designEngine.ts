import { defaultTransition } from '../../engine/transitions/definitions';
import type { Asset, LayoutId, MotionStyle, Project, ResolvedTheme, Slide, Tone, TransitionId } from '../../types';
import { suggestScenes } from '../../engine/media/scenes';
import { sceneAsset } from '../media/assets';
import { imageQueryFor } from './keywords';
import { contextImageAsset } from './imageProvider';
import { MOTION_STYLES, applyMotionStyle, paletteFor, styleForTone } from './motionPresets';

/**
 * "AI Design Engine" tahap Generate: memilih tata letak, menyusun animasi elemen,
 * menyisipkan gambar kontekstual, dan merencanakan transisi 3D/WebGL Morph antar slide.
 * Sepenuhnya deterministik & offline (kecuali gambar stok bila kunci Unsplash diisi).
 */

export const GENERATION_STEPS = [
  { id: 'layout', label: 'Menganalisis konten & memilih tata letak terbaik' },
  { id: 'animation', label: 'Menyusun koreografi gerak: teks, foto, ambient' },
  { id: 'images', label: 'Membuat gambar kontekstual beresolusi tinggi' },
  { id: 'morph', label: 'Menghitung matriks transisi 3D/WebGL Morph' },
  { id: 'engine', label: 'Menyiapkan & mengompilasi shader WebGL' },
] as const;

/** Layout yang punya slot media (foto/animasi). */
const MEDIA_LAYOUTS: LayoutId[] = ['content', 'split', 'image-full'];
/** Skor minimal agar animasi dipasang otomatis (kata kunci spesifik di judul/subjudul). */
const AUTO_SCENE_MIN_SCORE = 4;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* -------------------------------- Layout -------------------------------- */

export function suggestLayout(slide: Slide, index: number, total: number, prev: LayoutId): LayoutId {
  if (slide.layout !== 'auto') return slide.layout;
  const n = slide.bullets.length;
  if (index === 0) return 'title';
  if (index === total - 1 && n === 0) return 'image-full';
  if (slide.bullets.some((b) => /^\s*(-{3,}|\|)\s*$/.test(b))) return 'compare';
  const barred = n >= 3 && n <= 5 && slide.bullets.every((b) => b.includes('|'));
  if (barred && slide.bullets.every((b) => /^(?:\d{4}|q[1-4]|fase|tahap|phase|stage|step|langkah|minggu|bulan|week|month)/i.test(b.trim()))) return 'timeline';
  if (n >= 3 && n <= 4 && slide.bullets.every((b) => b.includes('|') || /^\S*\d\S*\s/.test(b))) return 'stats';
  if (n >= 3 && n <= 5 && /langkah|tahap|cara |proses|alur|steps?|how to|process|workflow/i.test(slide.title)) return 'numbered';
  if (n === 0) return slide.title.length > 60 ? 'quote' : index % 2 === 0 ? 'statement' : 'image-full';
  if (n === 1 && slide.bullets[0].length > 90) return 'quote';
  return prev === 'content' ? 'split' : 'content';
}

/** Apakah slide memiliki elemen utama (hero) yang dapat dimorfingkan? Lihat Slide.heroTag. */
function hasHero(slide: Slide): boolean {
  if ((slide.heroTag ?? 'hero') === '') return false;
  switch (slide.layout) {
    case 'title':
      return slide.showLogo || !!slide.imageId; // lencana logo atau foto
    case 'split':
    case 'image-full':
      return true;
    case 'content':
      return !!slide.imageId;
    default:
      return false;
  }
}

const sharesHero = (a: Slide, b: Slide): boolean =>
  hasHero(a) && hasHero(b) && (a.heroTag ?? 'hero') === (b.heroTag ?? 'hero');

/**
 * Rencanakan transisi tiap slide dengan BAHASA GERAK yang konsisten: deck memakai palet kecil (3–4 jenis)
 * dari gaya gerak, transisi aksen di pergantian bagian, dan Magic Move bila dua slide berurutan berbagi
 * elemen utama (logo/foto). Intensitas/durasi menyesuaikan kepadatan konten.
 */
export function planTransitions(slides: Slide[], tone: Tone, style: MotionStyle = styleForTone(tone)): Slide[] {
  const preset = MOTION_STYLES[style];
  const palette = paletteFor(style, slides[0]?.id ?? 'deck');
  let cursor = 0;
  let prev: TransitionId | null = null;
  const next = (): TransitionId => palette[cursor++ % palette.length];
  return slides.map((slide, i) => {
    let type: TransitionId;
    if (i === 0) {
      type = preset.intro;
    } else if (sharesHero(slides[i - 1], slide) && (i === 1 || prev !== 'magic')) {
      // Elemen utama (logo/foto) ber-tag sama di dua slide berurutan → Magic Move: bergeser mulus lalu
      // mekar menjadi elemen baru. Tidak dipakai dua kali beruntun (kecuali sampul) agar tetap istimewa.
      type = 'magic';
    } else if (slide.layout === 'quote' || slide.layout === 'image-full' || slide.layout === 'title' || slide.layout === 'statement') {
      type = preset.accent;
    } else {
      type = next();
    }
    if (type === prev) type = next();
    if (type === prev) type = next();
    prev = type;

    const base = defaultTransition(type);
    const density = Math.min(1, (slide.bullets.length + (slide.subtitle ? 1 : 0)) / 6);
    const speed = style === 'minimal' ? 0.8 : style === 'energetic' ? 0.85 : style === 'cinematic' ? 1.1 : 1;
    return {
      ...slide,
      transition: {
        ...base,
        intensity: +(base.intensity * (1.1 - density * 0.3)).toFixed(2),
        duration: +(base.duration * speed).toFixed(2),
      },
    };
  });
}

/* -------------------------------- Gambar -------------------------------- */

function wantsImage(slide: Slide, tone: Tone, contentCounter: { n: number }): boolean {
  if (slide.imageId) return false;
  switch (slide.layout) {
    case 'split':
    case 'image-full':
      return true;
    case 'title':
      return false; // sampul memakai lencana logo ikonik; foto pertama muncul di slide 2 lewat Magic Move
    case 'content':
      contentCounter.n++;
      return tone === 'creative' || (tone !== 'minimal' && contentCounter.n % 2 === 1);
    default:
      return false;
  }
}

/* ------------------------------- Orkestrasi ------------------------------ */

export interface GenerationResult {
  slides: Slide[];
  assets: Asset[];
}

export async function runGeneration(opts: {
  project: Project;
  theme: ResolvedTheme;
  unsplashKey: string;
  onProgress: (step: number, fraction: number) => void;
  signal?: AbortSignal;
}): Promise<GenerationResult> {
  const { project, theme, unsplashKey, onProgress, signal } = opts;
  const { tone } = project;
  const style: MotionStyle = project.motionStyle ?? styleForTone(tone);
  const check = () => {
    if (signal?.aborted) throw new DOMException('Dibatalkan', 'AbortError');
  };

  // 1 — Layout cerdas
  onProgress(0, 0);
  let prevLayout: LayoutId = 'title';
  let slides = project.slides.map((s, i, all) => {
    const layout = suggestLayout(s, i, all.length, prevLayout);
    prevLayout = layout;
    return { ...s, layout };
  });
  await sleep(550);
  onProgress(0, 1);
  check();

  // 2 — Animasi elemen
  onProgress(1, 0);
  slides = applyMotionStyle(slides, style);
  await sleep(450);
  onProgress(1, 1);
  check();

  // 3 — Gambar kontekstual
  onProgress(2, 0);
  const assets: Asset[] = [];
  const counter = { n: 0 };
  const targets = slides.map((s) => wantsImage(s, tone, counter));
  // Animasi penjelas: slide yang topiknya jelas cocok dengan animasi bawaan (mis. "sel darah") memakai animasi bergerak
  // sebagai media utamanya. Dibatasi 4 per deck dan tiap adegan hanya sekali agar deck tetap variatif.
  const autoScene = new Map<number, string>();
  {
    const used = new Set<string>();
    slides
      .map((s, i) => ({ i, best: MEDIA_LAYOUTS.includes(s.layout) && !s.imageId ? suggestScenes(s)[0] : undefined }))
      .filter((x) => x.best && x.best.score >= AUTO_SCENE_MIN_SCORE)
      .sort((a, b) => b.best!.score - a.best!.score)
      .forEach(({ i, best }) => {
        if (autoScene.size >= 4 || used.has(best!.scene.id)) return;
        used.add(best!.scene.id);
        autoScene.set(i, best!.scene.id);
      });
  }
  const total = slides.filter((_, i) => targets[i] || autoScene.has(i)).length;
  let done = 0;
  for (let i = 0; i < slides.length; i++) {
    if (!targets[i] && !autoScene.has(i)) continue;
    check();
    const s = slides[i];
    const query = s.imageQuery || imageQueryFor(s.title, s.subtitle);
    const sceneId = autoScene.get(i);
    const asset = sceneId
      ? sceneAsset(sceneId, project.language)
      : await contextImageAsset(query, { unsplashKey, theme, variant: i });
    assets.push(asset);
    slides[i] = { ...s, imageId: asset.id, imageQuery: query };
    onProgress(2, ++done / Math.max(1, total));
    await sleep(0); // beri kesempatan UI menggambar progres
  }
  onProgress(2, 1);

  // 4 — Matriks transisi
  onProgress(3, 0);
  slides = planTransitions(slides, tone, style);
  await sleep(600);
  onProgress(3, 1);
  check();

  // 5 — Warm-up engine (kompilasi shader sesungguhnya terjadi saat studio memuat renderer)
  onProgress(4, 0);
  await sleep(450);
  onProgress(4, 1);

  return { slides, assets };
}
