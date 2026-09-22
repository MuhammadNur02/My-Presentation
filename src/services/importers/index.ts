import type { Project, Slide } from '../../types';
import { parseDocx } from './docx';
import { parsePdf } from './pdf';
import { parsePptx } from './pptx';
import { sectionsToSlides } from './sections';
import { parseText } from './text';

export type ImportResult =
  | { kind: 'outline'; title: string; slides: Slide[]; source: string }
  | { kind: 'project'; project: Project };

export const ACCEPTED_TYPES = '.pptx,.pdf,.docx,.txt,.md,.json';

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
      return { kind: 'outline', title: r.title, slides: r.slides, source: 'PPTX' };
    }
    case 'pdf': {
      const r = await parsePdf(file);
      return { kind: 'outline', title: r.title, slides: r.slides, source: 'PDF' };
    }
    case 'docx': {
      const doc = await parseDocx(file);
      return { kind: 'outline', title: doc.title, slides: sectionsToSlides(doc, baseName), source: 'DOCX' };
    }
    case 'txt':
    case 'md': {
      const doc = parseText(await file.text(), baseName);
      return { kind: 'outline', title: doc.title, slides: sectionsToSlides(doc, baseName), source: ext.toUpperCase() };
    }
    case 'json': {
      const data = JSON.parse(await file.text()) as { format?: string; project?: Project };
      if (data.format !== 'morphdeck-project' || !data.project?.slides) {
        throw new Error('Berkas JSON bukan proyek MorphDeck yang valid.');
      }
      return { kind: 'project', project: data.project };
    }
    case 'ppt':
    case 'doc':
      throw new Error(`Format .${ext} lawas belum didukung. Simpan ulang sebagai .${ext}x lalu impor kembali.`);
    default:
      throw new Error('Format tidak didukung. Gunakan PPTX, PDF, DOCX, TXT, MD, atau proyek .json MorphDeck.');
  }
}
