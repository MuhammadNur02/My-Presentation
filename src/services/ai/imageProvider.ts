import { generateArtDataUrl } from '../../engine/generativeArt';
import type { Asset, ResolvedTheme } from '../../types';
import { uid } from '../../utils/id';
import { blobToDataUrl, measureImage } from '../../utils/image';

/**
 * Sumber gambar kontekstual.
 *  - Dengan kunci Unsplash: foto stok bebas hak cipta (API resmi, mendukung CORS).
 *  - Tanpa kunci / gagal: seni generatif offline deterministik dari kata kunci (selalu tersedia).
 * Titik ekstensi untuk generator gambar AI (DALL-E / Stable Diffusion): tambahkan provider
 * baru yang mengembalikan `Asset` dengan `source: 'stock'`.
 */

export interface ImageCandidate {
  id: string;
  thumb: string;
  /** URL gambar penuh; kosong untuk kandidat seni (dihasilkan saat dipilih). */
  full: string;
  credit: string;
  source: 'stock' | 'art';
  seed: string;
}

interface UnsplashPhoto {
  id: string;
  urls: { small: string; regular: string; raw: string };
  user: { name: string };
  alt_description?: string | null;
}

async function searchUnsplash(query: string, key: string, count: number): Promise<ImageCandidate[]> {
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape&content_filter=high`;
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${key.trim()}` } });
  if (!res.ok) throw new Error(`Unsplash ${res.status}`);
  const json = (await res.json()) as { results: UnsplashPhoto[] };
  return json.results.map((p) => ({
    id: p.id,
    thumb: p.urls.small,
    full: `${p.urls.raw}&w=1920&q=80&fm=jpg&fit=max`,
    credit: `Foto: ${p.user.name} / Unsplash`,
    source: 'stock' as const,
    seed: query,
  }));
}

function artCandidates(query: string, theme: Pick<ResolvedTheme, 'mode'>, count: number, salt = ''): ImageCandidate[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = `${query}#${salt}${i}`;
    return {
      id: `art_${seed}`,
      thumb: generateArtDataUrl(seed, theme, 480, 270),
      full: '',
      credit: 'Ilustrasi generatif',
      source: 'art' as const,
      seed,
    };
  });
}

export async function searchImages(
  query: string,
  opts: { unsplashKey: string; theme: Pick<ResolvedTheme, 'mode'>; count?: number },
): Promise<{ candidates: ImageCandidate[]; note?: string }> {
  const count = opts.count ?? 6;
  const q = query.trim() || 'abstract';
  if (opts.unsplashKey.trim()) {
    try {
      const found = await searchUnsplash(q, opts.unsplashKey, count);
      if (found.length) return { candidates: found };
    } catch (err) {
      return {
        candidates: artCandidates(q, opts.theme, count),
        note: `Unsplash gagal (${err instanceof Error ? err.message : 'galat'}); memakai ilustrasi generatif.`,
      };
    }
  }
  return { candidates: artCandidates(q, opts.theme, count) };
}

export async function candidateToAsset(c: ImageCandidate, theme: Pick<ResolvedTheme, 'mode'>, name: string): Promise<Asset> {
  if (c.source === 'art') {
    return {
      id: uid('as'),
      name,
      kind: 'image',
      dataUrl: generateArtDataUrl(c.seed, theme, 1920, 1080),
      width: 1920,
      height: 1080,
      source: 'art',
      credit: c.credit,
    };
  }
  const res = await fetch(c.full);
  if (!res.ok) throw new Error(`Gagal mengunduh gambar (${res.status})`);
  const dataUrl = await blobToDataUrl(await res.blob());
  const { width, height } = await measureImage(dataUrl);
  return { id: uid('as'), name, kind: 'image', dataUrl, width, height, source: 'stock', credit: c.credit };
}

/** Gambar kontekstual otomatis untuk satu slide (dipakai tahap Generate). */
export async function contextImageAsset(
  query: string,
  opts: { unsplashKey: string; theme: Pick<ResolvedTheme, 'mode'>; variant: number },
): Promise<Asset> {
  if (opts.unsplashKey.trim()) {
    try {
      const [first] = await searchUnsplash(query, opts.unsplashKey, 3);
      if (first) return await candidateToAsset(first, opts.theme, query);
    } catch {
      /* jatuh ke seni generatif */
    }
  }
  const [art] = artCandidates(query, opts.theme, 1, `v${opts.variant}-`);
  return candidateToAsset({ ...art, thumb: '' }, opts.theme, query);
}
