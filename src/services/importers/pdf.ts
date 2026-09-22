import type { Slide } from '../../types';
import { createSlide } from '../../utils/slideFactory';

interface Line {
  text: string;
  size: number;
}

interface RawItem {
  str?: string;
  transform?: number[];
  height?: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** Kelompokkan item teks PDF menjadi baris (berdasarkan koordinat Y) beserta ukuran fontnya. */
function toLines(items: RawItem[]): Line[] {
  const rows: { y: number; parts: { x: number; s: string }[]; size: number }[] = [];
  for (const it of items) {
    const s = it.str ?? '';
    if (!s.trim() || !it.transform) continue;
    const [, , , , x, y] = it.transform;
    const size = Math.abs(it.height || it.transform[3] || 0);
    let row = rows.find((r) => Math.abs(r.y - y) < Math.max(2, size * 0.35));
    if (!row) rows.push((row = { y, parts: [], size: 0 }));
    row.parts.push({ x, s });
    row.size = Math.max(row.size, size);
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) => ({
      text: r.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.s)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
      size: r.size,
    }))
    .filter((l) => l.text.length > 1);
}

/** Gabungkan baris yang terputus (wrap) menjadi paragraf utuh. */
function mergeWrapped(lines: Line[]): string[] {
  const out: string[] = [];
  let prev: Line | null = null;
  for (const l of lines) {
    if (prev && !/[.!?:;]$/.test(prev.text) && Math.abs(prev.size - l.size) < 1.5 && !/^[-•*\d]/.test(l.text)) {
      out[out.length - 1] += ' ' + l.text;
    } else {
      out.push(l.text.replace(/^[-•*]\s*/, ''));
    }
    prev = l;
  }
  return out;
}

/**
 * PDF → slide (satu halaman = satu slide). Judul dideteksi dari baris berfont terbesar;
 * sisanya menjadi poin. pdf.js & worker dimuat malas agar bundel utama tetap ringan.
 */
export async function parsePdf(file: File): Promise<{ title: string; slides: Slide[] }> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  const pages = Math.min(pdf.numPages, 40);
  const slides: Slide[] = [];

  for (let n = 1; n <= pages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const lines = toLines(content.items as RawItem[]);
    page.cleanup();
    if (!lines.length) continue;

    const body = median(lines.map((l) => l.size));
    const big = lines.slice(0, 4).reduce((a, b) => (b.size > a.size ? b : a), lines[0]);
    const titleLine = big.size >= body * 1.2 && big.text.length <= 110 ? big : lines[0].text.length <= 110 ? lines[0] : null;
    const rest = lines.filter((l) => l !== titleLine);
    const points = mergeWrapped(rest)
      .map((p) => (p.length > 170 ? p.slice(0, 167).replace(/\s+\S*$/, '') + '…' : p))
      .slice(0, 6);

    slides.push(
      createSlide({
        layout: slides.length === 0 && points.length <= 2 ? 'title' : 'auto',
        title: titleLine?.text ?? `Halaman ${n}`,
        subtitle: slides.length === 0 && points.length <= 2 ? points.join(' ') : '',
        bullets: slides.length === 0 && points.length <= 2 ? [] : points,
      }),
    );
  }
  await task.destroy();
  if (!slides.length) throw new Error('Tidak ada teks yang dapat diekstrak dari PDF (mungkin hasil pindaian/gambar).');
  return { title: slides[0].title || file.name.replace(/\.[^.]+$/, ''), slides };
}
