import type { PDFPageProxy } from 'pdfjs-dist';
import type { Asset, Slide } from '../../types';
import { uid } from '../../utils/id';
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
 * Ambil gambar UTAMA (pertama yang berhasil) dari sebuah halaman PDF lewat operator list —
 * pola terdokumentasi komunitas pdf.js (`getOperatorList` → cari operasi lukis gambar → ambil
 * datanya lewat `page.objs`). Best-effort menyeluruh: PDF menyimpan gambar dalam banyak bentuk
 * internal berbeda (bitmap sudah didekode, atau buffer piksel mentah RGB/RGBA/grayscale) — bentuk
 * yang tak dikenali/gagal dilewati diam-diam, bukan membatalkan impor (degradasi anggun, sama
 * seperti dekoder GIF di aplikasi ini).
 */
async function extractPageImage(pdfjs: typeof import('pdfjs-dist'), page: PDFPageProxy): Promise<Asset | null> {
  try {
    const opList = await page.getOperatorList();
    const paintOps = new Set([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintImageXObjectRepeat, pdfjs.OPS.paintInlineImageXObject]);
    for (let i = 0; i < opList.fnArray.length; i++) {
      if (!paintOps.has(opList.fnArray[i])) continue;
      const name = opList.argsArray[i]?.[0] as string | undefined;
      if (!name) continue;

      let img: unknown;
      try {
        img = page.objs.get(name);
      } catch {
        continue; // objek belum siap/tak ditemukan — lewati
      }
      if (!img) continue;

      const canvas = document.createElement('canvas');
      if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) {
        // Sudah berupa bitmap terdekode (umum untuk gambar JPEG) — gambar langsung.
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
      } else {
        // Buffer piksel mentah: { data, width, height, kind }. Hanya tangani RGBA/RGB
        // (kasus paling umum untuk foto); bentuk lain (mis. grayscale 1-bit) dilewati.
        const raw = img as { data?: Uint8ClampedArray; width?: number; height?: number; kind?: number };
        if (!raw.data || !raw.width || !raw.height) continue;
        canvas.width = raw.width;
        canvas.height = raw.height;
        const ctx = canvas.getContext('2d')!;
        const RGBA = pdfjs.ImageKind?.RGBA_32BPP ?? 3;
        const RGB = pdfjs.ImageKind?.RGB_24BPP ?? 2;
        let rgba: Uint8ClampedArray;
        if (raw.kind === RGBA) {
          rgba = raw.data;
        } else if (raw.kind === RGB) {
          rgba = new Uint8ClampedArray(raw.width * raw.height * 4);
          for (let p = 0, q = 0; p < raw.data.length; p += 3, q += 4) {
            rgba[q] = raw.data[p];
            rgba[q + 1] = raw.data[p + 1];
            rgba[q + 2] = raw.data[p + 2];
            rgba[q + 3] = 255;
          }
        } else {
          continue; // format piksel tak ditangani (mis. grayscale 1bpp) — lewati
        }
        // `.from()` menjamin buffer ArrayBuffer polos (bukan SharedArrayBuffer) sesuai tipe ImageData.
        ctx.putImageData(new ImageData(Uint8ClampedArray.from(rgba), raw.width, raw.height), 0, 0);
      }

      if (canvas.width < 24 || canvas.height < 24) continue; // ikon/dekorasi kecil, bukan konten
      const dataUrl = canvas.toDataURL('image/png');
      return { id: uid('as'), name: 'gambar-pdf', kind: 'image', dataUrl, width: canvas.width, height: canvas.height, source: 'upload' };
    }
  } catch {
    /* halaman tanpa operator list terbaca (jarang) — lewati, teks tetap terekstrak seperti biasa */
  }
  return null;
}

/**
 * PDF → slide (satu halaman = satu slide). Judul dideteksi dari baris berfont terbesar;
 * sisanya menjadi poin; gambar utama tiap halaman (bila ada) ikut diekstrak. pdf.js & worker
 * dimuat malas agar bundel utama tetap ringan.
 */
export async function parsePdf(file: File): Promise<{ title: string; slides: Slide[]; assets: Record<string, Asset> }> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  const pages = Math.min(pdf.numPages, 40);
  const slides: Slide[] = [];
  const assets: Record<string, Asset> = {};

  for (let n = 1; n <= pages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const lines = toLines(content.items as RawItem[]);
    const image = await extractPageImage(pdfjs, page);
    page.cleanup();
    if (!lines.length && !image) continue;
    if (image) assets[image.id] = image;

    const body = median(lines.map((l) => l.size));
    const big = lines.slice(0, 4).reduce((a, b) => (b.size > a.size ? b : a), lines[0]);
    const titleLine = lines.length ? (big.size >= body * 1.2 && big.text.length <= 110 ? big : lines[0].text.length <= 110 ? lines[0] : null) : null;
    const rest = lines.filter((l) => l !== titleLine);
    const points = mergeWrapped(rest)
      .map((p) => (p.length > 170 ? p.slice(0, 167).replace(/\s+\S*$/, '') + '…' : p))
      .slice(0, 6);
    const asTitle = slides.length === 0 && points.length <= 2;

    slides.push(
      createSlide({
        layout: asTitle ? 'title' : 'auto',
        title: titleLine?.text ?? `Halaman ${n}`,
        subtitle: asTitle ? points.join(' ') : '',
        bullets: asTitle ? [] : points,
        imageId: image?.id ?? null,
      }),
    );
  }
  await task.destroy();
  if (!slides.length) throw new Error('Tidak ada teks yang dapat diekstrak dari PDF (mungkin hasil pindaian/gambar).');
  return { title: slides[0].title || file.name.replace(/\.[^.]+$/, ''), slides, assets };
}
