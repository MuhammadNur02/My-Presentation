import JSZip from 'jszip';
import type { Project } from '../../types';
import { dataUrlToBlob, slugify } from '../../utils/download';
import { buildStandaloneHtml } from './buildHtml';

export { buildStandaloneHtml } from './buildHtml';

const README = (name: string) => `${name}
${'='.repeat(name.length)}

Presentasi interaktif dengan transisi 3D/WebGL Morph (dibuat dengan MorphDeck).

CARA MENJALANKAN
  1. Ekstrak arsip ini.
  2. Buka "index.html" di Chrome, Edge, Brave, Firefox, atau Safari — tidak perlu server, internet, maupun plugin.
  3. Klik "Mulai Presentasi".

KONTROL
  Space / Panah Kanan / PageDown ... slide berikutnya
  Panah Kiri / PageUp ............... slide sebelumnya
  Home / End ........................ slide pertama / terakhir
  N ................................. tampilkan catatan pembicara
  F ................................. layar penuh
  R ................................. ulangi dari awal
  Esc ............................... keluar dari layar penuh & reset presentasi
  Geser (swipe) di layar sentuh ..... navigasi

ISI ARSIP
  index.html ............. presentasi mandiri (semua skrip, gambar, dan konfigurasi tertanam)
  project.morphdeck.json . berkas proyek — impor kembali ke MorphDeck untuk menyunting
  assets/ ................ salinan gambar/logo/GIF/video asli untuk dipakai ulang
`;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export function projectToJson(project: Project): string {
  return JSON.stringify({ format: 'morphdeck-project', version: 1, project }, null, 2);
}

/** Arsip ZIP: index.html mandiri + README + berkas proyek + salinan aset. */
export async function buildZip(project: Project): Promise<Blob> {
  const zip = new JSZip();
  zip.file('index.html', buildStandaloneHtml(project));
  zip.file('README.txt', README(project.name));
  zip.file('project.morphdeck.json', projectToJson(project));

  const assets = zip.folder('assets')!;
  const used = new Set<string>();
  project.slides.forEach((s) => s.imageId && used.add(s.imageId));
  if (project.logoId) used.add(project.logoId);
  used.forEach((id) => {
    const a = project.assets[id];
    if (!a) return;
    const base = `${slugify(a.name)}-${id.slice(-5)}`;
    // Aset bergerak: simpan berkas aslinya (GIF/MP4/WebM); gambar poster-nya disimpan terpisah.
    if (a.anim?.src) {
      const media = dataUrlToBlob(a.anim.src);
      assets.file(`${base}.${EXT[media.type] ?? (a.anim.kind === 'gif' ? 'gif' : 'mp4')}`, media);
      assets.file(`${base}-poster.jpg`, dataUrlToBlob(a.dataUrl));
      return;
    }
    const blob = dataUrlToBlob(a.dataUrl);
    assets.file(`${base}.${EXT[blob.type] ?? 'bin'}`, blob);
  });

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
