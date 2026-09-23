import { jsPDF } from 'jspdf';
import { drawSlide } from '../../engine/slideRenderer';
import { resolveTheme, SLIDE_H, SLIDE_W } from '../../engine/themes';
import type { Project, ResolvedTheme } from '../../types';
import { collectUsedImageUrls } from './buildHtml';

/** Ukuran halaman PDF (pt), rasio 16:9 — sama dengan ukuran "Widescreen" standar PowerPoint. */
const PAGE_W = 960;
const PAGE_H = 540;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar'));
    img.src = url;
  });
}

/** Lencana watermark "Dibuat dengan MorphDeck" dibakar langsung ke kanvas (halaman PDF = gambar statis, bukan DOM). */
function paintWatermark(ctx: CanvasRenderingContext2D, theme: ResolvedTheme): void {
  const text = 'Dibuat dengan MorphDeck';
  ctx.save();
  ctx.font = `600 26px ${theme.fontBody}`;
  const textW = ctx.measureText(text).width;
  const w = textW + 56;
  const h = 54;
  const x = SLIDE_W - w - 44;
  const y = SLIDE_H - h - 44;
  ctx.fillStyle = 'rgba(18,18,24,0.72)';
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, w, h);
  }
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, x + 28, y + h / 2 + 1);
  ctx.restore();
}

/**
 * Ekspor PDF: satu halaman per slide, format widescreen (960×540pt / rasio 16:9). Memakai jalur render
 * DATAR yang sama dengan thumbnail studio (`drawSlide`) — hasil gambar diam berkualitas tinggi, tanpa
 * menyentuh WebGL/animasi. Proyek `tier:'free'` (hasil impor dokumen) mendapat lencana watermark yang
 * dibakar langsung ke tiap halaman (tidak bisa jadi overlay DOM seperti saat presentasi live).
 */
export async function buildPdf(project: Project): Promise<Blob> {
  const theme = resolveTheme(project.theme);
  const urls = collectUsedImageUrls(project);
  const entries = await Promise.all(
    Object.entries(urls).map(async ([id, url]) => {
      try {
        return [id, await loadImage(url)] as const;
      } catch {
        return [id, null] as const;
      }
    }),
  );
  const images = new Map(entries);

  const canvas = document.createElement('canvas');
  canvas.width = SLIDE_W;
  canvas.height = SLIDE_H;
  const ctx = canvas.getContext('2d')!;

  const total = project.slides.length;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [PAGE_W, PAGE_H] });

  project.slides.forEach((slide, index) => {
    if (index > 0) doc.addPage([PAGE_W, PAGE_H], 'landscape');
    ctx.clearRect(0, 0, SLIDE_W, SLIDE_H);
    drawSlide(ctx, slide, {
      theme,
      getImage: (id) => (id ? images.get(id) ?? null : null),
      logoId: project.logoId,
      index,
      total,
    });
    if (project.tier === 'free') paintWatermark(ctx, theme);
    const data = canvas.toDataURL('image/jpeg', 0.92);
    doc.addImage(data, 'JPEG', 0, 0, PAGE_W, PAGE_H);
  });

  return doc.output('blob');
}
