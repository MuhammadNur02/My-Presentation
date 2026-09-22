/**
 * Dekoder GIF mandiri (tanpa pustaka): header, palet global/lokal, ekstensi kontrol grafis (jeda, transparansi,
 * disposal), LZW, interlace. Setiap frame dikomposit penuh ke kanvas GIF sehingga pemutar cukup `putImageData`.
 * Bila total memori melebihi batas, frame diperjarang (jeda digabung) agar animasi tetap utuh durasinya.
 */

export interface GifData {
  width: number;
  height: number;
  frames: ImageData[];
  /** Jeda tiap frame (ms) — sejajar dengan `frames`. */
  delays: number[];
  /** Total durasi satu putaran (ms). */
  duration: number;
}

interface RawFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  interlaced: boolean;
  palette: Uint8Array | null;
  dataStart: number;
  delay: number;
  disposal: number;
  transparent: number;
}

const MAX_BYTES = 88 * 1024 * 1024;
/** Batas wajar (berkas rusak/berbahaya bisa mengklaim dimensi raksasa → alokasi memori tak terkendali). */
const MAX_PIXELS = 9_000_000;
const MAX_FRAMES = 3000;
/** Total piksel semua frame yang boleh diklaim berkas (mencegah ribuan frame "raksasa" berdata kosong). */
const MAX_TOTAL_PIXELS = 250_000_000;

function lzwDecode(b: Uint8Array, start: number, pixelCount: number): Uint8Array {
  let p = start;
  const minCode = b[p++];
  // Gabungkan sub-blok data.
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (p < b.length && b[p] !== 0) {
    const n = b[p++];
    chunks.push(b.subarray(p, p + n));
    total += n;
    p += n;
  }
  const data = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    data.set(c, off);
    off += c.length;
  }

  const clear = 1 << minCode;
  const eoi = clear + 1;
  let codeSize = minCode + 1;
  let next = eoi + 1;
  const prefix = new Uint16Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4097);
  for (let i = 0; i < clear; i++) suffix[i] = i;
  const out = new Uint8Array(pixelCount);
  let o = 0;
  let bits = 0;
  let nbits = 0;
  let pos = 0;
  let old = -1;
  let first = 0;
  while (o < pixelCount) {
    while (nbits < codeSize) {
      if (pos >= data.length) return out;
      bits |= data[pos++] << nbits;
      nbits += 8;
    }
    let code = bits & ((1 << codeSize) - 1);
    bits >>= codeSize;
    nbits -= codeSize;
    if (code === clear) {
      codeSize = minCode + 1;
      next = eoi + 1;
      old = -1;
      continue;
    }
    if (code === eoi) break;
    // Data rusak: kode pertama setelah clear harus literal, dan kode tak boleh melompati entri kamus berikutnya.
    if ((old === -1 && code >= clear) || code > next) return out;
    if (old === -1) {
      out[o++] = suffix[code];
      old = code;
      first = code;
      continue;
    }
    const inCode = code;
    let sp = 0;
    if (code >= next) {
      stack[sp++] = first;
      code = old;
    }
    // Batas `sp`: kamus yang rusak dapat membentuk siklus prefiks → tanpa batas ini loop tak pernah berakhir.
    while (code >= clear && sp < 4096) {
      stack[sp++] = suffix[code];
      code = prefix[code];
    }
    if (code >= clear) return out;
    first = suffix[code];
    stack[sp++] = first;
    if (next < 4096) {
      prefix[next] = old;
      suffix[next] = first;
      next++;
      if (next === 1 << codeSize && codeSize < 12) codeSize++;
    }
    old = inCode;
    while (sp > 0 && o < pixelCount) out[o++] = stack[--sp];
  }
  return out;
}

export function decodeGif(buf: ArrayBuffer): GifData {
  const b = new Uint8Array(buf);
  if (b.length < 14 || String.fromCharCode(b[0], b[1], b[2]) !== 'GIF') throw new Error('Berkas bukan GIF yang valid');
  let p = 6;
  const W = b[p] | (b[p + 1] << 8);
  const H = b[p + 2] | (b[p + 3] << 8);
  p += 4;
  const flags = b[p++];
  p += 2; // indeks warna latar + rasio aspek
  let gct: Uint8Array | null = null;
  if (flags & 0x80) {
    const n = 3 * (1 << ((flags & 7) + 1));
    gct = b.subarray(p, p + n);
    p += n;
  }
  if (!W || !H) throw new Error('Ukuran GIF tidak valid');
  if (W * H > MAX_PIXELS) throw new Error('Dimensi GIF terlalu besar');

  // Lintasan 1: kumpulkan deskriptor frame (tanpa LZW).
  const raws: RawFrame[] = [];
  let claimed = 0;
  let gce = { delay: 100, disposal: 0, transparent: -1 };
  while (p < b.length) {
    const c = b[p++];
    if (c === 0x3b) break;
    if (c === 0x21) {
      const label = b[p++];
      if (label === 0xf9) {
        p++; // ukuran blok (4)
        const f = b[p++];
        const d = (b[p] | (b[p + 1] << 8)) * 10;
        p += 2;
        const t = b[p++];
        p++; // terminator
        gce = { delay: d < 20 ? 100 : d, disposal: (f >> 2) & 7, transparent: f & 1 ? t : -1 };
      } else {
        while (p < b.length && b[p] !== 0) p += b[p] + 1;
        p++;
      }
    } else if (c === 0x2c) {
      const x = b[p] | (b[p + 1] << 8);
      const y = b[p + 2] | (b[p + 3] << 8);
      const w = b[p + 4] | (b[p + 5] << 8);
      const h = b[p + 6] | (b[p + 7] << 8);
      const pk = b[p + 8];
      p += 9;
      let palette: Uint8Array | null = null;
      if (pk & 0x80) {
        const n = 3 * (1 << ((pk & 7) + 1));
        palette = b.subarray(p, p + n);
        p += n;
      }
      if (w * h > MAX_PIXELS || (claimed += w * h) > MAX_TOTAL_PIXELS) throw new Error('Frame GIF terlalu besar');
      if (raws.length >= MAX_FRAMES) break;
      raws.push({ x, y, w, h, interlaced: !!(pk & 0x40), palette, dataStart: p, delay: gce.delay, disposal: gce.disposal, transparent: gce.transparent });
      p++; // ukuran kode LZW minimum
      while (p < b.length && b[p] !== 0) p += b[p] + 1;
      p++;
      gce = { delay: 100, disposal: 0, transparent: -1 };
    } else {
      break;
    }
  }
  if (!raws.length) throw new Error('GIF tidak berisi frame');

  // Perjarang frame bila memori terlalu besar.
  const frameBytes = W * H * 4;
  const step = Math.max(1, Math.ceil((raws.length * frameBytes) / MAX_BYTES));

  const cur = new Uint8ClampedArray(frameBytes);
  const frames: ImageData[] = [];
  const delays: number[] = [];
  raws.forEach((f, i) => {
    const pal = f.palette ?? gct;
    const restore = f.disposal === 3 ? cur.slice() : null;
    if (pal) {
      const idx = lzwDecode(b, f.dataStart, f.w * f.h);
      // Peta baris interlace.
      const rowOf = (r: number): number => {
        if (!f.interlaced) return r;
        const pass1 = Math.ceil(f.h / 8);
        const pass2 = Math.ceil((f.h - 4) / 8);
        const pass3 = Math.ceil((f.h - 2) / 4);
        if (r < pass1) return r * 8;
        if (r < pass1 + Math.max(0, pass2)) return (r - pass1) * 8 + 4;
        if (r < pass1 + Math.max(0, pass2) + Math.max(0, pass3)) return (r - pass1 - Math.max(0, pass2)) * 4 + 2;
        return (r - pass1 - Math.max(0, pass2) - Math.max(0, pass3)) * 2 + 1;
      };
      for (let r = 0; r < f.h; r++) {
        const dy = f.y + rowOf(r);
        if (dy < 0 || dy >= H) continue;
        for (let c = 0; c < f.w; c++) {
          const dx = f.x + c;
          if (dx >= W) break;
          const ci = idx[r * f.w + c];
          if (ci === f.transparent) continue;
          const o = (dy * W + dx) * 4;
          cur[o] = pal[ci * 3];
          cur[o + 1] = pal[ci * 3 + 1];
          cur[o + 2] = pal[ci * 3 + 2];
          cur[o + 3] = 255;
        }
      }
    }
    if (i % step === 0) {
      frames.push(new ImageData(cur.slice(), W, H));
      delays.push(0);
    }
    delays[delays.length - 1] += f.delay;
    // Disposal untuk frame berikutnya.
    if (f.disposal === 2) {
      for (let r = 0; r < f.h; r++) {
        const dy = f.y + r;
        if (dy >= H) break;
        const from = (dy * W + f.x) * 4;
        cur.fill(0, from, Math.min(from + f.w * 4, (dy + 1) * W * 4));
      }
    } else if (restore) {
      cur.set(restore);
    }
  });
  return { width: W, height: H, frames, delays, duration: delays.reduce((a, d) => a + d, 0) };
}
