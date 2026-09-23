import { dataUrlToBlob } from '../utils/download';
import { uid } from '../utils/id';
import { functionErrorMessage } from './functionError';
import { supabase } from './supabase';
import type { Asset } from '../types';

/**
 * AI Generate Gambar — pustaka akun lintas-proyek (Fase 2a), ditenagai **GPT Image 2** (OpenAI).
 * Pola sama seperti `cloudProjects.ts`: bagian yang perlu dilindungi (memanggil OpenAI, memotong
 * kredit) lewat Edge Function `generate-image`; upload hasilnya ke Storage & catat metadatanya
 * dilakukan langsung dari klien (dilindungi RLS folder-per-akun, bukan operasi yang berisiko
 * dicurangi untuk keuntungan).
 */

export type ImageResolution = '1K' | '2K' | '4K';

/** HARUS SAMA dengan `RESOLUTION_COST` di `supabase/functions/generate-image/index.ts`. */
export const RESOLUTION_COST: Record<ImageResolution, number> = { '1K': 1, '2K': 2, '4K': 3 };

export interface GeneratedImage {
  id: string;
  prompt: string;
  storagePath: string;
  width: number;
  height: number;
  createdAt: string;
  /** URL bertanda-tangan sementara (bucket privat) — dipakai untuk menampilkan thumbnail. */
  url: string;
}

const BUCKET = 'generated-images';
const SIGNED_URL_TTL = 60 * 60; // 1 jam — cukup untuk satu sesi menjelajah galeri.

function pathFor(uid_: string, imageId: string): string {
  return `${uid_}/${imageId}.png`;
}

/** Minta OpenAI (GPT Image 2) membuat gambar (lewat proxy — kredit dipotong di server sesuai resolusi). */
export async function requestImage(prompt: string, resolution: ImageResolution): Promise<{ dataUrl: string; width: number; height: number }> {
  const { data, error } = await supabase.functions.invoke<{ image?: string; width?: number; height?: number; error?: string }>('generate-image', {
    body: { prompt, resolution },
  });
  if (error) throw new Error(await functionErrorMessage(error, 'Gagal membuat gambar'));
  if (!data?.image) throw new Error(data?.error || 'Respons tidak berisi gambar');
  return { dataUrl: `data:image/png;base64,${data.image}`, width: data.width ?? 1344, height: data.height ?? 768 };
}

/** Simpan gambar yang baru dibuat ke pustaka akun (Storage + metadata). */
export async function saveGeneratedImage(dataUrl: string, prompt: string, width: number, height: number): Promise<GeneratedImage> {
  const { data: userData } = await supabase.auth.getUser();
  const uidAccount = userData.user?.id;
  if (!uidAccount) throw new Error('Masuk dengan akun Google diperlukan.');

  const id = uid('img');
  const path = pathFor(uidAccount, id);
  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, dataUrlToBlob(dataUrl), { contentType: 'image/png' });
  if (uploadErr) throw new Error(`Gagal menyimpan gambar: ${uploadErr.message}`);

  const { error: dbErr } = await supabase.from('generated_images').insert({ id, user_id: uidAccount, prompt, storage_path: path, width, height });
  if (dbErr) throw new Error(`Gagal mencatat gambar: ${dbErr.message}`);

  return { id, prompt, storagePath: path, width, height, createdAt: new Date().toISOString(), url: dataUrl };
}

/** Daftar "Aset Gambar" milik akun, terbaru dulu, dengan URL sementara untuk thumbnail. */
export async function listGeneratedImages(): Promise<GeneratedImage[]> {
  const { data, error } = await supabase.from('generated_images').select('id,prompt,storage_path,width,height,created_at').order('created_at', { ascending: false });
  if (error) throw new Error(`Gagal memuat pustaka gambar: ${error.message}`);
  const rows = data ?? [];
  const signed = await Promise.all(
    rows.map((r) => supabase.storage.from(BUCKET).createSignedUrl(r.storage_path, SIGNED_URL_TTL)),
  );
  return rows.map((r, i) => ({
    id: r.id,
    prompt: r.prompt,
    storagePath: r.storage_path,
    width: r.width,
    height: r.height,
    createdAt: r.created_at,
    url: signed[i].data?.signedUrl ?? '',
  }));
}

/** Hapus gambar dari pustaka (berkas Storage + baris metadata). */
export async function deleteGeneratedImage(id: string, storagePath: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([storagePath]);
  const { error } = await supabase.from('generated_images').delete().eq('id', id);
  if (error) throw new Error(`Gagal menghapus gambar: ${error.message}`);
}

/** Unduh data URL gambar lalu ubah jadi Blob berkualitas asli (untuk tombol "Unduh"). */
export function generatedImageBlob(dataUrl: string): Blob {
  return dataUrlToBlob(dataUrl);
}

/**
 * Ambil gambar dari URL bertanda-tangan (item lama di galeri) lalu ubah jadi data URL utuh —
 * proyek MorphDeck menyimpan aset ter-embed penuh (offline/mandiri), bukan tautan sementara yang
 * bisa kedaluwarsa, jadi item galeri HARUS diubah dulu sebelum dipasang ke slide atau diunduh.
 */
export async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengambil gambar (${res.status})`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Gagal membaca gambar'));
    r.readAsDataURL(blob);
  });
}

/** Ubah gambar dari pustaka jadi `Asset` siap dipasang ke slide proyek aktif (`addAsset`). */
export function generatedImageToAsset(image: GeneratedImage, dataUrl: string): Asset {
  return {
    id: uid('as'),
    name: image.prompt.slice(0, 60) || 'Gambar AI',
    kind: 'image',
    dataUrl,
    width: image.width,
    height: image.height,
    source: 'ai',
    credit: 'Dibuat dengan AI (GPT Image 2)',
  };
}
