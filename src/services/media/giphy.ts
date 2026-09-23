import { functionErrorMessage } from '../functionError';
import { supabase } from '../supabase';
import type { Asset } from '../../types';
import { gifToAsset } from './assets';

/**
 * Pencarian GIF lewat proxy hosted `search-giphy` (kunci GIPHY milik aplikasi — gratis untuk
 * pengguna yang sudah masuk Google, tanpa memotong kredit). GIF diunduh lalu disimpan di proyek
 * (offline & ikut ekspor).
 */
export interface GifCandidate {
  id: string;
  title: string;
  thumb: string;
  full: string;
  width: number;
  height: number;
}

interface GiphyItem {
  id: string;
  title?: string;
  images: Record<string, { url?: string; width?: string; height?: string } | undefined>;
}

export async function searchGifs(query: string, limit = 12, lang = 'id'): Promise<GifCandidate[]> {
  const { data, error } = await supabase.functions.invoke<{ data?: GiphyItem[]; error?: string }>('search-giphy', {
    body: { query: query.trim(), limit, lang },
  });
  if (error) throw new Error(await functionErrorMessage(error, 'Pencarian GIF gagal'));
  const items = data?.data ?? [];
  return items
    .map((g) => {
      const thumb = g.images.fixed_width_small?.url ?? g.images.fixed_width?.url ?? g.images.downsized?.url;
      // `downsized` dijamin ≤ ~2 MB; `fixed_height` sebagai cadangan.
      const full = g.images.downsized?.url ?? g.images.fixed_height?.url ?? g.images.original?.url;
      const dim = g.images.downsized ?? g.images.fixed_height;
      return thumb && full
        ? { id: g.id, title: g.title?.trim() || 'GIF', thumb, full, width: Number(dim?.width) || 480, height: Number(dim?.height) || 270 }
        : null;
    })
    .filter((x): x is GifCandidate => !!x);
}

export async function gifCandidateToAsset(c: GifCandidate): Promise<Asset> {
  const res = await fetch(c.full);
  if (!res.ok) throw new Error(`Gagal mengunduh GIF (${res.status})`);
  return gifToAsset(await res.blob(), c.title, { credit: 'GIF via GIPHY', source: 'stock' });
}
