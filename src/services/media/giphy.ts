import type { Asset } from '../../types';
import { gifToAsset } from './assets';

/**
 * Pencarian GIF lewat API GIPHY (mendukung CORS, jadi bisa dipanggil langsung dari browser). Butuh API key
 * (gratis di developers.giphy.com) yang diisi di Pengaturan. GIF diunduh lalu disimpan di proyek (offline & ikut ekspor).
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

export async function searchGifs(query: string, apiKey: string, limit = 12, lang = 'id'): Promise<GifCandidate[]> {
  const q = query.trim();
  const base = q ? 'https://api.giphy.com/v1/gifs/search' : 'https://api.giphy.com/v1/gifs/trending';
  const params = new URLSearchParams({ api_key: apiKey.trim(), limit: String(limit), rating: 'g', lang });
  if (q) params.set('q', q);
  const res = await fetch(`${base}?${params}`);
  if (res.status === 401 || res.status === 403) throw new Error('API key GIPHY tidak valid atau ditolak. Periksa di Pengaturan.');
  if (res.status === 429) throw new Error('Batas permintaan GIPHY tercapai. Coba lagi beberapa saat.');
  if (!res.ok) throw new Error(`GIPHY mengembalikan galat ${res.status}`);
  const json = (await res.json()) as { data: GiphyItem[] };
  return json.data
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
