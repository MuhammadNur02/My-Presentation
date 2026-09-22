/**
 * Rich text mini untuk kanvas: **tebal**, *miring*, ==sorot==.
 * Dipilih markup ringan agar data slide tetap berupa string biasa (mudah di-AI-kan, mudah diekspor).
 */

export interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  hl: boolean;
}

export function parseRichText(src: string): Run[] {
  const parts = src.split(/(\*\*|==|\*)/);
  let bold = false;
  let italic = false;
  let hl = false;
  const runs: Run[] = [];
  for (const p of parts) {
    if (p === '**') bold = !bold;
    else if (p === '*') italic = !italic;
    else if (p === '==') hl = !hl;
    else if (p) runs.push({ text: p, bold, italic, hl });
  }
  return runs;
}

export function stripRichText(src: string): string {
  return src.replace(/\*\*|==|\*/g, '');
}

export interface FontSpec {
  family: string;
  size: number;
  weight: number;
  /** Warna dasar; run `hl` memakai warna sorot. */
  color: string;
  highlight: string;
  italicBase?: boolean;
}

export function fontString(spec: FontSpec, run?: Run): string {
  const italic = run?.italic || spec.italicBase ? 'italic ' : '';
  const weight = run?.bold ? Math.min(900, Math.max(spec.weight + 200, 700)) : spec.weight;
  return `${italic}${weight} ${spec.size}px ${spec.family}`;
}

interface PlacedWord {
  text: string;
  x: number;
  w: number;
  run: Run;
}

interface PlacedLine {
  words: PlacedWord[];
  width: number;
}

export interface TextBlock {
  lines: PlacedLine[];
  lineHeight: number;
  height: number;
  /** Lebar baris terpanjang. */
  width: number;
  spec: FontSpec;
  /** Sumber & parameter tata letak — dipakai menyusun ulang blok (tata letak manual). */
  src: string;
  ratio: number;
  wrap: number;
}

/** Bungkus teks (dengan gaya per-run) menjadi baris-baris ≤ maxWidth. */
export function layoutRichText(
  ctx: CanvasRenderingContext2D,
  src: string,
  spec: FontSpec,
  maxWidth: number,
  lineHeightRatio = 1.28,
): TextBlock {
  const tokens: { text: string; run: Run; space: boolean; w: number }[] = [];
  for (const run of parseRichText(src)) {
    ctx.font = fontString(spec, run);
    for (const piece of run.text.split(/(\s+)/)) {
      if (!piece) continue;
      const space = /^\s+$/.test(piece);
      const text = space ? ' ' : piece;
      tokens.push({ text, run, space, w: ctx.measureText(text).width });
    }
  }

  const lines: PlacedLine[] = [{ words: [], width: 0 }];
  let x = 0;
  for (const t of tokens) {
    let line = lines[lines.length - 1];
    const hasContent = line.words.some((w) => w.text !== ' ');
    if (!t.space && x + t.w > maxWidth && hasContent) {
      finishLine(line);
      line = { words: [], width: 0 };
      lines.push(line);
      x = 0;
    }
    if (t.space && line.words.length === 0) continue; // spasi di awal baris
    line.words.push({ text: t.text, x, w: t.w, run: t.run });
    x += t.w;
  }
  finishLine(lines[lines.length - 1]);
  while (lines.length > 1 && lines[lines.length - 1].words.length === 0) lines.pop();

  const lineHeight = spec.size * lineHeightRatio;
  const width = lines.reduce((m, l) => Math.max(m, l.width), 0);
  return { lines, lineHeight, height: lines.length * lineHeight, width, spec, src, ratio: lineHeightRatio, wrap: maxWidth };
}

/** Susun ulang blok dengan lebar bungkus baru dan pengali ukuran font `k`. */
export function relayoutBlock(ctx: CanvasRenderingContext2D, block: TextBlock, wrap: number, k: number): TextBlock {
  const size = Math.max(12, Math.round(block.spec.size * k));
  return layoutRichText(ctx, block.src, { ...block.spec, size }, wrap, block.ratio);
}

function finishLine(line: PlacedLine): void {
  while (line.words.length && line.words[line.words.length - 1].text === ' ') line.words.pop();
  const last = line.words[line.words.length - 1];
  line.width = last ? last.x + last.w : 0;
}

/** Kecilkan font sampai teks muat dalam kotak (tinggi maks) — atau sampai ukuran minimum. */
export function fitRichText(
  ctx: CanvasRenderingContext2D,
  src: string,
  spec: FontSpec,
  maxWidth: number,
  maxHeight: number,
  minSize: number,
  lineHeightRatio = 1.28,
): TextBlock {
  let s = { ...spec };
  let block = layoutRichText(ctx, src, s, maxWidth, lineHeightRatio);
  let guard = 0;
  while (block.height > maxHeight && s.size > minSize && guard++ < 16) {
    s = { ...s, size: Math.max(minSize, Math.floor(s.size * 0.93)) };
    block = layoutRichText(ctx, src, s, maxWidth, lineHeightRatio);
  }
  return block;
}

export type TextAlign = 'left' | 'center' | 'right';

/** Gambar blok teks; (x, y) = pojok kiri-atas kotak, `boxWidth` dipakai untuk perataan. */
export function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  x: number,
  y: number,
  boxWidth: number,
  align: TextAlign = 'left',
): void {
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  block.lines.forEach((line, i) => {
    const offset =
      align === 'center' ? (boxWidth - line.width) / 2 : align === 'right' ? boxWidth - line.width : 0;
    const top = y + i * block.lineHeight + (block.lineHeight - block.spec.size) / 2;
    for (const w of line.words) {
      ctx.font = fontString(block.spec, w.run);
      ctx.fillStyle = w.run.hl ? block.spec.highlight : block.spec.color;
      ctx.fillText(w.text, x + offset + w.x, top);
    }
  });
}
