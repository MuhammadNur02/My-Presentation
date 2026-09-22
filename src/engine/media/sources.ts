import type { AssetAnim } from '../../types';
import { decodeGif, type GifData } from './gifDecoder';
import { SCENE_H, SCENE_W, drawScene } from './scenes';

/**
 * Sumber gambar BERGERAK. Setiap sumber memiliki satu kanvas yang selalu berisi frame terkini; renderer cukup
 * memanggil `update(t)` tiap tick (t = jam global, detik) dan menggambar ulang lapisan bila hasilnya `true`.
 * Sumber yang lama tidak disentuh dimulai lagi dari awal saat slide ditampilkan kembali.
 */
export interface AnimSource {
  readonly canvas: HTMLCanvasElement;
  /** Frame pertama sudah tergambar di kanvas (aman dipakai sebagai gambar). */
  ready: boolean;
  /** Majukan ke waktu `t`; true bila isi kanvas berubah. */
  update(t: number): boolean;
  /** Dipanggil berkala: sumber yang tak dipakai boleh berhenti (jeda video). */
  idle(t: number): void;
  /** Rasio (lebar/tinggi) area tempat media ditampilkan — adegan generatif menyesuaikan penempatan label. */
  hint?(aspect: number): void;
  dispose(): void;
}

/** Jeda tanpa dipanggil `update` yang dianggap "slide sedang tidak tampil". */
const IDLE_S = 0.6;

function dataUrlToBytes(src: string): ArrayBuffer {
  const comma = src.indexOf(',');
  const meta = src.slice(0, comma);
  const body = src.slice(comma + 1);
  if (!/;base64/i.test(meta)) return new TextEncoder().encode(decodeURIComponent(body)).buffer as ArrayBuffer;
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

abstract class Base implements AnimSource {
  readonly canvas = document.createElement('canvas');
  ready = false;
  protected dead = false;
  protected lastT = -1e9;
  protected t0 = 0;
  abstract update(t: number): boolean;
  idle(_t: number): void {
    /* default: tidak ada yang perlu dijeda */
  }
  /** Perbarui jam lokal; true bila sumber baru "hidup kembali" (mulai dari awal). */
  protected tick(t: number): boolean {
    const fresh = t - this.lastT > IDLE_S;
    if (fresh) this.t0 = t;
    this.lastT = t;
    return fresh;
  }
  dispose(): void {
    this.dead = true;
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}

class GifSource extends Base {
  private gif: GifData | null = null;
  private starts: number[] = [];
  private cur = -1;
  private ctx = this.canvas.getContext('2d')!;

  constructor(src: string, onReady: () => void) {
    super();
    // Dekode setelah frame berikutnya agar tidak menahan render pertama.
    setTimeout(() => {
      if (this.dead) return;
      try {
        const gif = decodeGif(dataUrlToBytes(src));
        this.gif = gif;
        let acc = 0;
        this.starts = gif.delays.map((d) => {
          const s = acc;
          acc += d;
          return s;
        });
        this.canvas.width = gif.width;
        this.canvas.height = gif.height;
        this.draw(0);
        this.ready = true;
        onReady();
      } catch (err) {
        console.warn('GIF gagal didekode:', err);
      }
    }, 0);
  }

  private draw(i: number): void {
    if (!this.gif || i === this.cur) return;
    this.cur = i;
    this.ctx.putImageData(this.gif.frames[i], 0, 0);
  }

  update(t: number): boolean {
    if (!this.gif) return false;
    this.tick(t);
    const ms = ((t - this.t0) * 1000) % Math.max(1, this.gif.duration);
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= ms) lo = mid;
      else hi = mid - 1;
    }
    if (lo === this.cur) return false;
    this.draw(lo);
    return true;
  }

  dispose(): void {
    super.dispose();
    this.gif = null;
  }
}

class VideoSource extends Base {
  private video = document.createElement('video');
  private ctx = this.canvas.getContext('2d')!;
  private lastVT = -1;

  constructor(src: string, onReady: () => void) {
    super();
    const v = this.video;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.setAttribute('aria-hidden', 'true');
    // Beberapa browser hanya memutar video yang ada di DOM.
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    v.addEventListener('loadeddata', () => {
      if (this.dead) return;
      const vw = v.videoWidth || 640;
      const vh = v.videoHeight || 360;
      const s = Math.min(1, 1280 / vw);
      this.canvas.width = Math.max(2, Math.round(vw * s));
      this.canvas.height = Math.max(2, Math.round(vh * s));
      this.ctx.drawImage(v, 0, 0, this.canvas.width, this.canvas.height);
      this.ready = true;
      onReady();
    });
    v.src = src;
    document.body.appendChild(v);
    v.load();
  }

  update(t: number): boolean {
    if (!this.ready) return false;
    const fresh = this.tick(t);
    const v = this.video;
    if (fresh) v.currentTime = 0;
    if (v.paused) void v.play().catch(() => undefined);
    if (v.readyState >= 2 && v.currentTime !== this.lastVT) {
      this.lastVT = v.currentTime;
      this.ctx.drawImage(v, 0, 0, this.canvas.width, this.canvas.height);
      return true;
    }
    return false;
  }

  idle(t: number): void {
    if (!this.video.paused && t - this.lastT > IDLE_S) this.video.pause();
  }

  dispose(): void {
    super.dispose();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.video.remove();
  }
}

class SceneSource extends Base {
  private ctx = this.canvas.getContext('2d')!;
  private last = -1;
  private safe: [number, number] = [0, SCENE_W];

  hint(aspect: number): void {
    const vis = Math.min(SCENE_W, SCENE_H * aspect); // lebar adegan yang tampil setelah dipangkas (cover)
    const s0 = Math.round((SCENE_W - vis) / 2);
    if (s0 === this.safe[0]) return;
    this.safe = [s0, SCENE_W - s0];
    this.last = -1; // gambar ulang segera dengan penempatan label baru
  }

  constructor(
    private scene: string,
    private lang: 'id' | 'en',
    onReady: () => void,
  ) {
    super();
    this.canvas.width = SCENE_W;
    this.canvas.height = SCENE_H;
    drawScene(this.ctx, scene, 0.6, { lang, safe: this.safe });
    this.ready = true;
    queueMicrotask(onReady);
  }

  update(t: number): boolean {
    if (this.tick(t)) this.last = -1; // dimulai dari awal saat slide tampil lagi
    const local = t - this.t0 + 0.6;
    if (local - this.last < 1 / 30) return false;
    this.last = local;
    drawScene(this.ctx, this.scene, local, { lang: this.lang, safe: this.safe });
    return true;
  }
}

export function createSource(anim: AssetAnim, onReady: () => void): AnimSource | null {
  if (anim.kind === 'gif' && anim.src) return new GifSource(anim.src, onReady);
  if (anim.kind === 'video' && anim.src) return new VideoSource(anim.src, onReady);
  if (anim.kind === 'scene' && anim.scene) return new SceneSource(anim.scene, anim.lang ?? 'id', onReady);
  return null;
}
