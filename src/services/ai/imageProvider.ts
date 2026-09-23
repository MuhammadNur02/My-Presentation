import { generateArtDataUrl } from '../../engine/generativeArt';
import type { Asset, ResolvedTheme } from '../../types';
import { uid } from '../../utils/id';
import { blobToDataUrl, measureImage } from '../../utils/image';
import { functionErrorMessage } from '../functionError';
import { supabase } from '../supabase';

/**
 * Sumber gambar kontekstual.
 *  - Masuk dengan Google: foto stok Unsplash asli lewat proxy hosted `search-unsplash` (kunci milik
 *    aplikasi, gratis untuk pengguna — tanpa memotong kredit, karena Unsplash sendiri gratis dipakai).
 *  - Belum masuk / gagal: seni generatif offline deterministik dari kata kunci (selalu tersedia).
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

async function searchUnsplashHosted(query: string, count: number): Promise<ImageCandidate[]> {
  const { data, error } = await supabase.functions.invoke<{ results?: UnsplashPhoto[]; error?: string }>('search-unsplash', {
    body: { query, count },
  });
  if (error) throw new Error(await functionErrorMessage(error, 'Gagal mencari foto'));
  const results = data?.results ?? [];
  return results.map((p) => ({
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
  opts: { theme: Pick<ResolvedTheme, 'mode'>; count?: number },
): Promise<{ candidates: ImageCandidate[]; note?: string }> {
  const count = opts.count ?? 6;
  const q = query.trim() || 'abstract';
  try {
    const found = await searchUnsplashHosted(q, count);
    if (found.length) return { candidates: found };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'galat tidak diketahui';
    return { candidates: artCandidates(q, opts.theme, count), note: `${msg} Memakai ilustrasi generatif untuk saat ini.` };
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
  opts: { theme: Pick<ResolvedTheme, 'mode'>; variant: number },
): Promise<Asset> {
  try {
    const [first] = await searchUnsplashHosted(query, 3);
    if (first) return await candidateToAsset(first, opts.theme, query);
  } catch {
    /* belum masuk / gagal → jatuh ke seni generatif */
  }
  const [art] = artCandidates(query, opts.theme, 1, `v${opts.variant}-`);
  return candidateToAsset({ ...art, thumb: '' }, opts.theme, query);
}
