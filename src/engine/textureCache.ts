import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter } from 'three';
import type { DeckData, ResolvedTheme, Slide } from '../types';
import type { ImageStore } from './imageStore';
import { drawBlank, drawSlide } from './slideRenderer';
import { SLIDE_H, SLIDE_W } from './themes';

export const BLANK_KEY = '__blank__';

export interface TexEntry {
  key: string;
  /** Elemen yang TIDAK digambar: tag elemen bersama dan/atau "@text" (varian layer dasar). */
  omit: string[];
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
  lastUsed: number;
  sig: {
    slide: Slide | null;
    theme: ResolvedTheme | null;
    index: number;
    total: number;
    imgVersion: number;
    logoId: string | null;
  };
}

/**
 * Cache LRU tekstur DATAR (seluruh slide dalam satu gambar) — dipakai sebagai sumber transisi
 * halaman. Slide diam & animasi elemen memakai jalur adegan (SceneView), bukan cache ini.
 */
export class TextureCache {
  private entries = new Map<string, TexEntry>();
  private pinned = new Set<string>();
  private tick = 0;
  private texH: number;

  get width(): number {
    return this.texW;
  }

  /** `texW` = lebar tekstur (tinggi mengikuti 16:9). Ukuran diubah lewat setTexWidth. */
  constructor(
    private texW: number,
    private capacity = 6,
  ) {
    this.texH = Math.round((texW * 9) / 16);
  }

  /**
   * Ubah resolusi tekstur agar sepadan dengan ukuran piksel slide di layar.
   * Mengembalikan true bila berubah — seluruh tekstur lama dibuang dan digambar ulang secara lazy.
   */
  setTexWidth(width: number): boolean {
    if (width === this.texW) return false;
    this.texW = width;
    this.texH = Math.round((width * 9) / 16);
    this.disposeAll();
    return true;
  }

  pin(keys: string[]): void {
    this.pinned = new Set(keys);
  }

  /** Kunci cache: varian "tanpa elemen" (layer dasar) memiliki kunci sendiri. */
  keyFor(deck: DeckData, index: number, omit: readonly string[] = []): string {
    const base = index < 0 ? BLANK_KEY : deck.slides[index]?.id ?? BLANK_KEY;
    return omit.length ? `${base}#-${[...omit].sort().join('+')}` : base;
  }

  get(index: number, deck: DeckData, images: ImageStore, omit: readonly string[] = []): TexEntry {
    const slide = index >= 0 ? deck.slides[index] ?? null : null;
    const key = this.keyFor(deck, index, omit);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = this.create(key, [...omit]);
      this.entries.set(key, entry);
    }
    entry.lastUsed = ++this.tick;

    const s = entry.sig;
    const stale =
      s.slide !== slide ||
      s.theme !== deck.theme ||
      s.index !== index ||
      s.total !== deck.slides.length ||
      s.imgVersion !== images.version ||
      s.logoId !== deck.logoId;
    if (stale) this.paint(entry, slide, index, deck, images);

    this.evict();
    return entry;
  }

  markAllStale(): void {
    // Dipakai setelah context WebGL dipulihkan: unggah ulang semua tekstur.
    this.entries.forEach((e) => {
      e.texture.needsUpdate = true;
    });
  }

  private create(key: string, omit: string[]): TexEntry {
    const canvas = document.createElement('canvas');
    canvas.width = this.texW;
    canvas.height = this.texH;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const texture = new CanvasTexture(canvas);
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = 4;
    return {
      key,
      omit,
      canvas,
      ctx,
      texture,
      lastUsed: 0,
      sig: { slide: null, theme: null, index: -2, total: -1, imgVersion: -1, logoId: null },
    };
  }

  private paint(entry: TexEntry, slide: Slide | null, index: number, deck: DeckData, images: ImageStore): void {
    const { ctx, canvas } = entry;
    const k = canvas.width / SLIDE_W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, SLIDE_W, SLIDE_H);
    if (slide) {
      drawSlide(
        ctx,
        slide,
        { theme: deck.theme, getImage: (id) => images.get(id), isLive: (id) => images.isLive(id), logoId: deck.logoId, index, total: deck.slides.length },
        { omitTags: entry.omit },
      );
    } else {
      drawBlank(ctx, deck.theme);
    }
    entry.texture.needsUpdate = true;
    entry.sig = {
      slide,
      theme: deck.theme,
      index,
      total: deck.slides.length,
      imgVersion: images.version,
      logoId: deck.logoId,
    };
  }

  private evict(): void {
    if (this.entries.size <= this.capacity) return;
    const candidates = [...this.entries.values()]
      .filter((e) => !this.pinned.has(e.key))
      .sort((a, b) => a.lastUsed - b.lastUsed);
    while (this.entries.size > this.capacity && candidates.length) {
      this.disposeEntry(candidates.shift()!);
    }
  }

  private disposeEntry(e: TexEntry): void {
    e.texture.dispose();
    e.canvas.width = 1; // lepas memori backing store canvas
    e.canvas.height = 1;
    this.entries.delete(e.key);
  }

  disposeAll(): void {
    [...this.entries.values()].forEach((e) => this.disposeEntry(e));
  }
}
