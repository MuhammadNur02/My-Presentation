import type { Language, LayoutId, Slide, Tone } from '../../types';
import { createSlide } from '../../utils/slideFactory';

export interface OutlineRequest {
  topic: string;
  tone: Tone;
  slideCount: number;
  language: Language;
}

export interface OutlineSlide {
  layout: LayoutId;
  title: string;
  subtitle: string;
  bullets: string[];
  notes: string;
  imageQuery: string;
}

export interface Outline {
  title: string;
  slides: OutlineSlide[];
}

const LAYOUTS: LayoutId[] = ['auto', 'title', 'content', 'split', 'image-full', 'quote', 'stats', 'numbered', 'timeline', 'compare', 'statement'];

const str = (v: unknown, max = 400): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Validasi & bersihkan keluaran mentah (dari LLM maupun generator) menjadi Outline yang aman. */
export function normalizeOutline(raw: unknown, fallbackTitle: string): Outline {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(obj.slides) ? obj.slides : [];
  const slides: OutlineSlide[] = list
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .slice(0, 40)
    .map((s) => {
      const layout = LAYOUTS.includes(s.layout as LayoutId) ? (s.layout as LayoutId) : 'auto';
      const bullets = Array.isArray(s.bullets) ? s.bullets.map((b) => str(b, 220)).filter(Boolean).slice(0, 8) : [];
      return {
        layout,
        title: str(s.title, 160) || 'Slide',
        subtitle: str(s.subtitle, 240),
        bullets,
        notes: str(s.notes, 1200),
        imageQuery: str(s.image_query ?? s.imageQuery, 120),
      };
    });
  return { title: str(obj.title, 120) || fallbackTitle, slides };
}

export function outlineToSlides(outline: Outline): Slide[] {
  return outline.slides.map((s) =>
    createSlide({
      layout: s.layout,
      title: s.title,
      subtitle: s.subtitle,
      bullets: s.bullets,
      notes: s.notes,
      imageQuery: s.imageQuery,
    }),
  );
}
