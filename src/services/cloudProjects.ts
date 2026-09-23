import type { Project } from '../types';
// Modul ringan (BUKAN `./export` — barrel itu menyeret bundel runtime WebGL ~640 kB lewat
// `buildHtml.ts`; lihat komentar di `export/projectJson.ts`).
import { projectToJson } from './export/projectJson';
import { supabase } from './supabase';

/**
 * Sinkronisasi proyek ke cloud (Supabase) — HIBRIDA, bukan pengganti penyimpanan lokal.
 * IndexedDB (`store/idbStorage.ts`) tetap satu-satunya sumber saat mengedit (instan, teruji).
 * Modul ini hanya menyalin proyek yang sudah ada ke Storage + mencatat metadatanya di tabel
 * `projects`, supaya bisa ditarik kembali dari perangkat lain lewat halaman "Hasil Proyek".
 *
 * Format berkas di Storage SAMA PERSIS dengan ekspor `.json` proyek yang sudah ada
 * (`projectToJson` — lihat `services/export/index.ts`), jadi berkas hasil sinkron bisa juga
 * diunduh & diimpor manual seperti cadangan biasa.
 */

export interface CloudProjectSummary {
  id: string;
  name: string;
  slideCount: number;
  updatedAt: string;
  storagePath: string;
}

function pathFor(uid: string, projectId: string): string {
  return `${uid}/${projectId}.json`;
}

/** Unggah/perbarui proyek di cloud. Dipanggil hanya saat pengguna sudah masuk. */
export async function pushProjectToCloud(project: Project): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return;

  const path = pathFor(uid, project.id);
  const json = projectToJson(project);
  const { error: uploadErr } = await supabase.storage.from('projects').upload(path, new Blob([json], { type: 'application/json' }), {
    upsert: true,
    contentType: 'application/json',
  });
  if (uploadErr) throw new Error(`Gagal mengunggah proyek ke cloud: ${uploadErr.message}`);

  const { error: dbErr } = await supabase.from('projects').upsert(
    {
      id: project.id,
      user_id: uid,
      name: project.name,
      slide_count: project.slides.length,
      storage_path: path,
      updated_at: new Date(project.updatedAt).toISOString(),
    },
    { onConflict: 'id' },
  );
  if (dbErr) throw new Error(`Gagal menyimpan metadata proyek: ${dbErr.message}`);
}

/** Daftar proyek cloud milik pengguna saat ini, terbaru dulu — untuk galeri "Hasil Proyek". */
export async function listCloudProjects(): Promise<CloudProjectSummary[]> {
  const { data, error } = await supabase.from('projects').select('id,name,slide_count,updated_at,storage_path').order('updated_at', { ascending: false });
  if (error) throw new Error(`Gagal memuat daftar proyek: ${error.message}`);
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, slideCount: r.slide_count, updatedAt: r.updated_at, storagePath: r.storage_path }));
}

/** Unduh isi proyek dari Storage lalu ubah jadi `Project` siap pakai (`loadProject()`). */
export async function pullProjectFromCloud(storagePath: string): Promise<Project> {
  const { data, error } = await supabase.storage.from('projects').download(storagePath);
  if (error || !data) throw new Error(`Gagal mengambil proyek dari cloud: ${error?.message ?? 'tidak ditemukan'}`);
  const text = await data.text();
  const parsed = JSON.parse(text) as { format?: string; project?: Project };
  if (parsed.format !== 'morphdeck-project' || !parsed.project) throw new Error('Berkas proyek di cloud tidak valid.');
  return parsed.project;
}

/** Ganti nama proyek di cloud (metadata saja — nama di dalam berkas JSON menyusul saat sinkron berikutnya). */
export async function renameCloudProject(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('projects').update({ name }).eq('id', id);
  if (error) throw new Error(`Gagal mengganti nama: ${error.message}`);
}

/** Hapus proyek dari cloud (baris metadata + berkas Storage). Tidak menyentuh salinan lokal. */
export async function deleteCloudProject(id: string, storagePath: string): Promise<void> {
  await supabase.storage.from('projects').remove([storagePath]);
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw new Error(`Gagal menghapus proyek: ${error.message}`);
}
