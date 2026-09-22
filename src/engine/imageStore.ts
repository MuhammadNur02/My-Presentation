import type { AssetAnim } from '../types';
import { createSource, type AnimSource } from './media/sources';

/** Gambar yang bisa digambar ke kanvas: gambar diam, atau kanvas berisi frame terkini sebuah animasi. */
export type DrawableImage = HTMLImageElement | HTMLCanvasElement;

export const imgW = (img: DrawableImage): number => (img instanceof HTMLImageElement ? img.naturalWidth : img.width);
export const imgH = (img: DrawableImage): number => (img instanceof HTMLImageElement ? img.naturalHeight : img.height);

interface Entry {
  url: string;
  animKey: string;
  img: HTMLImageElement | null;
  anim: AnimSource | null;
}

const keyOf = (a: AssetAnim | undefined): string => (a ? `${a.kind}:${a.scene ?? ''}:${a.lang ?? ''}:${a.src?.length ?? 0}` : '');

/**
 * Cache gambar yang di-decode secara async dari data URL aset (+ sumber animasi untuk aset bergerak).
 * `version` naik setiap ada gambar baru/berubah → TextureCache tahu kapan harus menggambar ulang.
 * Aset bergerak: `get()` mengembalikan poster sampai animasinya siap, lalu kanvas frame-terkini.
 */
export class ImageStore {
  version = 0;
  private map = new Map<string, Entry>();
  private pending = 0;
  private waiters: Array<() => void> = [];

  constructor(private onChange: () => void) {}

  sync(images: Record<string, string>, anims: Record<string, AssetAnim> = {}): void {
    let changed = false;
    for (const [id, url] of Object.entries(images)) {
      const animKey = keyOf(anims[id]);
      const cur = this.map.get(id);
      if (cur && cur.url === url && cur.animKey === animKey) continue;
      cur?.anim?.dispose();
      const entry: Entry = { url, animKey, img: cur && cur.url === url ? cur.img : null, anim: null };
      this.map.set(id, entry);
      changed = true;
      if (anims[id]) {
        entry.anim = createSource(anims[id], () => {
          if (this.map.get(id) === entry) {
            this.version++;
            this.onChange();
          }
        });
      }
      if (entry.img) continue; // gambar poster sama → tidak perlu decode ulang
      this.pending++;
      const img = new Image();
      img.decoding = 'async';
      const settle = (ok: boolean) => {
        if (this.map.get(id) === entry && ok) {
          entry.img = img;
          this.version++;
          this.onChange();
        }
        if (--this.pending <= 0) this.flush();
      };
      img.onload = () => settle(true);
      img.onerror = () => settle(false);
      img.src = url;
    }
    for (const [id, e] of [...this.map]) {
      if (!(id in images)) {
        e.anim?.dispose();
        this.map.delete(id);
        changed = true;
      }
    }
    if (changed) this.version++;
  }

  get(id: string | null | undefined): DrawableImage | null {
    const e = id ? this.map.get(id) : null;
    if (!e) return null;
    return e.anim?.ready ? e.anim.canvas : e.img;
  }

  /** Sumber animasi yang siap untuk aset ini (null bila aset diam / belum siap). */
  source(id: string | null | undefined): AnimSource | null {
    const a = id ? this.map.get(id)?.anim : null;
    return a?.ready ? a : null;
  }

  /** Beri tahu sumber animasi rasio area tampilnya (lihat AnimSource.hint). */
  hint(id: string, aspect: number): void {
    this.map.get(id)?.anim?.hint?.(aspect);
  }

  isLive(id: string | null | undefined): boolean {
    return !!this.source(id);
  }

  /** Beri kesempatan sumber yang tak terpakai untuk berhenti (hemat CPU/baterai). */
  sweep(t: number): void {
    for (const e of this.map.values()) e.anim?.idle(t);
  }

  /** Resolve saat semua gambar yang sedang dimuat selesai (berhasil maupun gagal). */
  ready(): Promise<void> {
    if (this.pending <= 0) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private flush(): void {
    this.pending = 0;
    const w = this.waiters.splice(0);
    w.forEach((fn) => fn());
  }

  dispose(): void {
    for (const e of this.map.values()) e.anim?.dispose();
    this.map.clear();
    this.flush();
  }
}
