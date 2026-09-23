import type { Asset, Slide } from '../../types';
import { measureImage } from '../../utils/image';
import { uid } from '../../utils/id';
import { createSlide } from '../../utils/slideFactory';

/** Representasi netral hasil parsing dokumen apa pun. */
export interface DocSection {
  heading: string;
  paragraphs: string[];
  bullets: string[];
  notes?: string;
  /** Data URL gambar pertama yang ditemukan di bagian ini (mis. hasil sisipan `mammoth` untuk DOCX). */
  imageDataUrl?: string;
}

export interface ParsedDoc {
  title: string;
  sections: DocSection[];
}

const MAX_SLIDES = 40;
const MAX_BULLETS = 6;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

/** Ubah data URL gambar sebuah bagian jadi `Asset` siap pakai (diukur, diberi id). `null` bila gagal (mis. data URL rusak). */
async function sectionImageAsset(dataUrl: string): Promise<Asset | null> {
  try {
    const { width, height } = await measureImage(dataUrl);
    if (width < 24 || height < 24) return null; // ikon dekoratif kecil, bukan konten
    return { id: uid('as'), name: 'gambar-dokumen', kind: 'image', dataUrl, width, height, source: 'upload' };
  } catch {
    return null;
  }
}

/**
 * Ubah dokumen terstruktur menjadi slide modular: satu slide judul + satu slide per bagian.
 * Paragraf dipecah menjadi kalimat-kalimat ringkas; bagian panjang dilanjutkan di slide berikutnya.
 * Gambar pertama tiap bagian (bila ada, mis. dari DOCX) dipasang ke slide PERTAMA bagian itu.
 */
export async function sectionsToSlides(doc: ParsedDoc, subtitle = ''): Promise<{ slides: Slide[]; assets: Record<string, Asset> }> {
  const slides: Slide[] = [createSlide({ layout: 'title', title: clip(doc.title || 'Presentasi', 120), subtitle })];
  const assets: Record<string, Asset> = {};

  for (const sec of doc.sections) {
    if (slides.length >= MAX_SLIDES) break;
    const points = [...sec.bullets, ...sec.paragraphs.flatMap(splitSentences)].map((p) => clip(p, 170)).filter(Boolean);
    const heading = clip(sec.heading || doc.title || 'Bagian', 110);
    const image = sec.imageDataUrl ? await sectionImageAsset(sec.imageDataUrl) : null;
    if (image) assets[image.id] = image;

    if (!points.length) {
      slides.push(createSlide({ layout: 'auto', title: heading, notes: sec.notes ?? '', imageId: image?.id ?? null }));
      continue;
    }
    for (let i = 0; i < points.length && slides.length < MAX_SLIDES; i += MAX_BULLETS) {
      slides.push(
        createSlide({
          layout: 'auto',
          title: i === 0 ? heading : `${heading} (lanjutan)`,
          bullets: points.slice(i, i + MAX_BULLETS),
          notes: i === 0 ? sec.notes ?? '' : '',
          imageId: i === 0 ? (image?.id ?? null) : null,
        }),
      );
    }
  }
  return { slides, assets };
}
