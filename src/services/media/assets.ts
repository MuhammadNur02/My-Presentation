import { decodeGif } from '../../engine/media/gifDecoder';
import { SCENE_BY_ID, sceneToDataUrl } from '../../engine/media/scenes';
import type { Asset, Language, Project } from '../../types';
import { uid } from '../../utils/id';
import { blobToDataUrl } from '../../utils/image';

/** Batas ukuran berkas media bergerak — disimpan di IndexedDB dan (saat ekspor) di-embed sebagai data-URI. */
export const MAX_GIF_BYTES = 12 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 24 * 1024 * 1024;

const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

export const isMotionFile = (f: Blob & { name?: string }): boolean =>
  f.type === 'image/gif' || f.type === 'video/mp4' || f.type === 'video/webm' || /\.(gif|mp4|webm)$/i.test(f.name ?? '');

/** Perkecil gambar ke kanvas ≤ `max` px sisi terpanjang → data URL (poster). */
function posterOf(source: CanvasImageSource, w: number, h: number, max = 960, type: 'image/png' | 'image/jpeg' = 'image/png'): string {
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL(type, 0.88);
}

export async function gifToAsset(blob: Blob, name: string, opts: { credit?: string; source?: Asset['source'] } = {}): Promise<Asset> {
  if (blob.size > MAX_GIF_BYTES) throw new Error(`GIF terlalu besar (${mb(blob.size)}). Maksimal ${mb(MAX_GIF_BYTES)}.`);
  let gif;
  try {
    gif = decodeGif(await blob.arrayBuffer());
  } catch {
    throw new Error('Berkas GIF tidak valid atau rusak.');
  }
  const first = document.createElement('canvas');
  first.width = gif.width;
  first.height = gif.height;
  first.getContext('2d')!.putImageData(gif.frames[0], 0, 0);
  return {
    id: uid('as'),
    name: name.replace(/\.[^.]+$/, '') || 'Animasi GIF',
    kind: 'image',
    dataUrl: posterOf(first, gif.width, gif.height),
    width: gif.width,
    height: gif.height,
    source: opts.source ?? 'upload',
    credit: opts.credit,
    anim: { kind: 'gif', src: await blobToDataUrl(blob) },
  };
}

export async function videoToAsset(blob: Blob, name: string): Promise<Asset> {
  if (blob.size > MAX_VIDEO_BYTES) throw new Error(`Video terlalu besar (${mb(blob.size)}). Maksimal ${mb(MAX_VIDEO_BYTES)}.`);
  const src = await blobToDataUrl(blob);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  await new Promise<void>((resolve, reject) => {
    v.onloadeddata = () => resolve();
    v.onerror = () => reject(new Error('Video tidak dapat dibuka (gunakan MP4 H.264 atau WebM).'));
    v.src = src;
  });
  // Ambil frame poster sedikit setelah awal (hindari frame hitam pertama).
  await new Promise<void>((resolve) => {
    v.onseeked = () => resolve();
    v.currentTime = Math.min(0.15, (v.duration || 1) / 2);
    setTimeout(resolve, 1500);
  });
  const w = v.videoWidth || 640;
  const h = v.videoHeight || 360;
  const poster = posterOf(v, w, h, 960, 'image/jpeg');
  v.removeAttribute('src');
  v.load();
  return {
    id: uid('as'),
    name: name.replace(/\.[^.]+$/, '') || 'Video',
    kind: 'image',
    dataUrl: poster,
    width: w,
    height: h,
    source: 'upload',
    anim: { kind: 'video', src },
  };
}

/** Aset dari berkas GIF / MP4 / WebM. */
export async function motionFileToAsset(file: File): Promise<Asset> {
  if (file.type === 'image/gif' || /\.gif$/i.test(file.name)) return gifToAsset(file, file.name);
  return videoToAsset(file, file.name);
}

/** Aset animasi generatif (kode, bukan berkas). Memakai ulang aset yang sudah ada untuk adegan+bahasa yang sama. */
export function sceneAsset(sceneId: string, lang: Language, existing?: Project['assets']): Asset {
  const hit = existing && Object.values(existing).find((a) => a.anim?.kind === 'scene' && a.anim.scene === sceneId && a.anim.lang === lang);
  if (hit) return hit;
  const def = SCENE_BY_ID[sceneId];
  return {
    id: uid('as'),
    name: def?.label ?? 'Animasi',
    kind: 'image',
    dataUrl: sceneToDataUrl(sceneId, { lang }),
    width: 960,
    height: 540,
    source: 'art',
    credit: 'Animasi generatif',
    anim: { kind: 'scene', scene: sceneId, lang },
  };
}
