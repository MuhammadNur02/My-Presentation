import type { Slide } from '../../types';
import { createSlide } from '../../utils/slideFactory';

/** Representasi netral hasil parsing dokumen apa pun. */
export interface DocSection {
  heading: string;
  paragraphs: string[];
  bullets: string[];
  notes?: string;
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

/**
 * Ubah dokumen terstruktur menjadi slide modular: satu slide judul + satu slide per bagian.
 * Paragraf dipecah menjadi kalimat-kalimat ringkas; bagian panjang dilanjutkan di slide berikutnya.
 */
export function sectionsToSlides(doc: ParsedDoc, subtitle = ''): Slide[] {
  const slides: Slide[] = [
    createSlide({ layout: 'title', title: clip(doc.title || 'Presentasi', 120), subtitle }),
  ];

  for (const sec of doc.sections) {
    if (slides.length >= MAX_SLIDES) break;
    const points = [...sec.bullets, ...sec.paragraphs.flatMap(splitSentences)].map((p) => clip(p, 170)).filter(Boolean);
    const heading = clip(sec.heading || doc.title || 'Bagian', 110);

    if (!points.length) {
      slides.push(createSlide({ layout: 'auto', title: heading, notes: sec.notes ?? '' }));
      continue;
    }
    for (let i = 0; i < points.length && slides.length < MAX_SLIDES; i += MAX_BULLETS) {
      slides.push(
        createSlide({
          layout: 'auto',
          title: i === 0 ? heading : `${heading} (lanjutan)`,
          bullets: points.slice(i, i + MAX_BULLETS),
          notes: i === 0 ? sec.notes ?? '' : '',
        }),
      );
    }
  }
  return slides;
}
