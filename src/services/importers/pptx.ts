import JSZip from 'jszip';
import type { Slide } from '../../types';
import { createSlide } from '../../utils/slideFactory';

const paragraphsOf = (node: Element): string[] =>
  Array.from(node.getElementsByTagName('a:p'))
    .map((p) =>
      Array.from(p.getElementsByTagName('a:t'))
        .map((t) => t.textContent ?? '')
        .join('')
        .trim(),
    )
    .filter(Boolean);

const numberOf = (path: string) => Number(/(\d+)\.xml$/.exec(path)?.[1] ?? 0);

/**
 * PPTX (OOXML zip) → slide. Placeholder judul/subjudul dipetakan langsung; teks lain menjadi
 * poin; tabel diringkas per baris; catatan pembicara dibaca dari notesSlide bila ada.
 */
export async function parsePptx(file: File): Promise<{ title: string; slides: Slide[] }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const parse = async (path: string) => {
    const f = zip.file(path);
    return f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null;
  };

  const slidePaths = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => numberOf(a) - numberOf(b))
    .slice(0, 40);
  if (!slidePaths.length) throw new Error('Berkas PPTX tidak berisi slide yang dapat dibaca.');

  const slides: Slide[] = [];
  for (const path of slidePaths) {
    const doc = await parse(path);
    if (!doc) continue;

    let title = '';
    let subtitle = '';
    const bullets: string[] = [];

    for (const sp of Array.from(doc.getElementsByTagName('p:sp'))) {
      const type = sp.getElementsByTagName('p:ph')[0]?.getAttribute('type') ?? '';
      const paras = paragraphsOf(sp);
      if (!paras.length) continue;
      if (type === 'title' || type === 'ctrTitle') title = paras.join(' ');
      else if (type === 'subTitle') subtitle = paras.join(' ');
      else if (!['sldNum', 'dt', 'ftr'].includes(type)) bullets.push(...paras);
    }
    for (const tr of Array.from(doc.getElementsByTagName('a:tr'))) {
      const row = Array.from(tr.getElementsByTagName('a:tc'))
        .map((tc) => paragraphsOf(tc).join(' '))
        .filter(Boolean)
        .join(' | ');
      if (row) bullets.push(row);
    }
    if (!title && bullets.length) title = bullets.shift()!;

    let notes = '';
    const notesDoc = await parse(`ppt/notesSlides/notesSlide${numberOf(path)}.xml`);
    if (notesDoc) {
      notes = Array.from(notesDoc.getElementsByTagName('p:sp'))
        .filter((sp) => sp.getElementsByTagName('p:ph')[0]?.getAttribute('type') === 'body')
        .flatMap(paragraphsOf)
        .join('\n');
    }

    slides.push(
      createSlide({
        layout: slides.length === 0 && (subtitle || !bullets.length) ? 'title' : 'auto',
        title: title || `Slide ${slides.length + 1}`,
        subtitle,
        bullets: bullets.slice(0, 8),
        notes,
      }),
    );
  }
  return { title: slides[0]?.title || file.name.replace(/\.[^.]+$/, ''), slides };
}
