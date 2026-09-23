import type { Asset, Project, Slide } from '../../types';
import { functionErrorMessage } from '../functionError';
import { supabase } from '../supabase';
import { blobToDataUrl } from '../../utils/image';
import { parseDocx } from './docx';
import { parsePdf } from './pdf';
import { parsePptx } from './pptx';
import { sectionsToSlides } from './sections';
import { parseText } from './text';

/**
 * Konversi `.ppt`/`.doc` lawas → `.pptx`/`.docx` lewat Edge Function `convert-legacy-doc`
 * (CloudConvert) — gratis/tanpa login, sama seperti impor lainnya. Hasilnya diumpankan balik ke
 * `parsePptx`/`parseDocx` yang sudah ada, tanpa duplikasi logika parsing.
 */
async function convertLegacyFile(file: File, targetFormat: 'pptx' | 'docx'): Promise<File> {
  const dataUrl = await blobToDataUrl(file);
  const fileBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const { data, error } = await supabase.functions.invoke<{ fileBase64?: string; error?: string }>('convert-legacy-doc', {
    body: { fileBase64, fileName: file.name, targetFormat },
  });
  if (error) throw new Error(await functionErrorMessage(error, `Gagal mengonversi format lawas. Coba simpan ulang manual sebagai .${targetFormat} lalu impor lagi.`));
  if (!data?.fileBase64) throw new Error(data?.error || 'Konversi tidak mengembalikan berkas.');
  const bin = atob(data.fileBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const mime = targetFormat === 'pptx' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return new File([bytes], file.name.replace(/\.[^.]+$/, `.${targetFormat}`), { type: mime });
}

export type ImportResult =
  | { kind: 'outline'; title: string; slides: Slide[]; assets: Record<string, Asset>; source: string }
  | { kind: 'project'; project: Project };

export const ACCEPTED_TYPES = '.pptx,.pdf,.docx,.ppt,.doc,.txt,.md,.json';

const MAX_BYTES = 60 * 1024 * 1024;

/**
 * Titik masuk impor. Pemrosesan sepenuhnya di sisi klien (tidak ada berkas yang diunggah
 * ke server), sehingga dokumen sensitif tidak meninggalkan perangkat pengguna.
 */
export async function importFile(file: File): Promise<ImportResult> {
  if (file.size > MAX_BYTES) throw new Error('Berkas terlalu besar (maks. 60 MB).');
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const baseName = file.name.replace(/\.[^.]+$/, '');

  switch (ext) {
    case 'pptx': {
      const r = await parsePptx(file);
      return { kind: 'outline', title: r.title, slides: r.slides, assets: r.assets, source: 'PPTX' };
    }
    case 'pdf': {
      const r = await parsePdf(file);
      return { kind: 'outline', title: r.title, slides: r.slides, assets: r.assets, source: 'PDF' };
    }
    case 'docx': {
      const doc = await parseDocx(file);
      const r = await sectionsToSlides(doc, baseName);
      return { kind: 'outline', title: doc.title, slides: r.slides, assets: r.assets, source: 'DOCX' };
    }
    case 'txt':
    case 'md': {
      const doc = parseText(await file.text(), baseName);
      const r = await sectionsToSlides(doc, baseName);
      return { kind: 'outline', title: doc.title, slides: r.slides, assets: r.assets, source: ext.toUpperCase() };
    }
    case 'json': {
      const data = JSON.parse(await file.text()) as { format?: string; project?: Project };
      if (data.format !== 'morphdeck-project' || !data.project?.slides) {
        throw new Error('Berkas JSON bukan proyek MorphDeck yang valid.');
      }
      return { kind: 'project', project: data.project };
    }
    case 'ppt': {
      const converted = await convertLegacyFile(file, 'pptx');
      const r = await parsePptx(converted);
      return { kind: 'outline', title: r.title, slides: r.slides, assets: r.assets, source: 'PPT (dikonversi)' };
    }
    case 'doc': {
      const converted = await convertLegacyFile(file, 'docx');
      const doc = await parseDocx(converted);
      const r = await sectionsToSlides(doc, baseName);
      return { kind: 'outline', title: doc.title, slides: r.slides, assets: r.assets, source: 'DOC (dikonversi)' };
    }
    default:
      throw new Error('Format tidak didukung. Gunakan PPTX, PDF, DOCX, TXT, MD, atau proyek .json MorphDeck.');
  }
}
