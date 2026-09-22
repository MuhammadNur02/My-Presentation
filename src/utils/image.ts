import type { Asset } from '../types';
import { uid } from './id';

const MAX_SIDE = 2000;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Gagal membaca berkas'));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Berkas bukan gambar yang valid'));
    img.src = src;
  });
}

/**
 * Ubah berkas gambar menjadi Asset: diperkecil (sisi terpanjang ≤ 2000px) agar
 * penyimpanan lokal & tekstur GPU tetap ringan. Logo/PNG transparan tetap PNG.
 */
export async function fileToAsset(file: File, kind: Asset['kind']): Promise<Asset> {
  const original = await readAsDataUrl(file);
  const img = await loadImage(original);
  const naturalW = img.naturalWidth || 1024;
  const naturalH = img.naturalHeight || 1024;
  const scale = Math.min(1, MAX_SIDE / Math.max(naturalW, naturalH));
  const w = Math.max(1, Math.round(naturalW * scale));
  const h = Math.max(1, Math.round(naturalH * scale));

  let dataUrl = original;
  const keepPng = kind === 'logo' || file.type === 'image/png' || file.type === 'image/svg+xml';
  if (scale < 1 || file.type === 'image/svg+xml') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    dataUrl = keepPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
  }

  return {
    id: uid('as'),
    name: file.name.replace(/\.[^.]+$/, ''),
    kind,
    dataUrl,
    width: w,
    height: h,
    source: 'upload',
  };
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return readAsDataUrl(blob);
}

export async function measureImage(dataUrl: string): Promise<{ width: number; height: number }> {
  const img = await loadImage(dataUrl);
  return { width: img.naturalWidth, height: img.naturalHeight };
}
