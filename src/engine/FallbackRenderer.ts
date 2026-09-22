import { gsap } from 'gsap';
import type { DeckData, RenderBackend, TransitionConfig } from '../types';
import { clamp } from '../utils/color';
import { ImageStore } from './imageStore';
import type { LayerInfo } from './layers';
import { buildLayers, describeLayers, drawBlank, drawSlide, type RenderContext } from './slideRenderer';
import { SLIDE_H, SLIDE_W } from './themes';
import type { DeckRendererOptions, IDeckRenderer, TransitionOptions } from './types';

/**
 * Fallback tanpa WebGL: crossfade Canvas 2D. Dipakai otomatis pada perangkat yang tidak
 * mendukung WebGL sehingga presentasi tetap bisa dijalankan (graceful degradation).
 */
export class Fallback2DRenderer implements IDeckRenderer {
  readonly backend: RenderBackend = '2d';

  private ctx: CanvasRenderingContext2D;
  private images: ImageStore;
  private deck: DeckData | null = null;
  private index = 0;
  private a = document.createElement('canvas');
  private b = document.createElement('canvas');
  private tween: gsap.core.Tween | null = null;
  private resolveTween: (() => void) | null = null;
  private mix = 0;
  private mixing: { from: number; to: number } | null = null;
  private raf = 0;
  private disposed = false;
  private paused = false;
  private reduced: boolean;
  /** Loop media bergerak (GIF/video/generatif) — berjalan hanya selama slide tampil punya media bergerak. */
  private liveRaf = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    opts: DeckRendererOptions,
  ) {
    this.ctx = canvas.getContext('2d')!;
    for (const c of [this.a, this.b]) {
      c.width = 1280;
      c.height = 720;
    }
    this.reduced = !!opts.reducedMotion;
    this.images = new ImageStore(() => this.schedule());
    opts.onStats?.({ fps: 60, tier: 'low', backend: '2d', degraded: true, texWidth: 1280, transition: null });
  }

  setData(data: DeckData): void {
    this.deck = data;
    this.images.sync(data.images, data.anims);
    this.index = clamp(this.index, -1, Math.max(0, data.slides.length - 1));
    this.schedule();
  }

  resize(width: number, height: number, dpr: number): void {
    this.canvas.width = Math.max(2, Math.round(width * Math.min(dpr, 1.5)));
    this.canvas.height = Math.max(2, Math.round(height * Math.min(dpr, 1.5)));
    this.schedule();
  }

  show(index: number): void {
    this.settle();
    this.index = this.deck ? clamp(index, -1, this.deck.slides.length - 1) : 0;
    this.schedule();
  }

  transition(to: number, opts: TransitionOptions = {}): Promise<void> {
    const deck = this.deck;
    if (!deck || !deck.slides[to]) return Promise.resolve();
    this.settle();
    const from = opts.from ?? this.index;
    if (from === to) return Promise.resolve();
    const dir = opts.direction ?? (to >= from ? 1 : -1);
    const cfg = opts.config ?? (dir > 0 || !deck.slides[from] ? deck.slides[to].transition : deck.slides[from].transition);
    return new Promise((resolve) => {
      this.resolveTween = resolve;
      this.mixing = { from, to };
      const s = { v: 0 };
      this.tween = gsap.to(s, {
        v: 1,
        duration: Math.min(cfg.duration, 0.8),
        ease: 'power1.inOut',
        onUpdate: () => {
          this.mix = s.v;
          this.schedule();
        },
        onComplete: () => this.settle(),
      });
    });
  }

  scrub(from: number, to: number, _config: TransitionConfig, progress: number): void {
    this.settle();
    this.mixing = { from, to };
    this.mix = clamp(progress, 0, 1);
    this.schedule();
  }

  setPaused(paused: boolean): void {
    // Render hanya saat dibutuhkan; yang perlu dijeda hanya loop media bergerak.
    this.paused = paused;
    if (paused) this.images.sweep(Number.MAX_SAFE_INTEGER);
    else this.ensureLive();
  }

  ready(): Promise<void> {
    return this.images.ready();
  }

  getIndex(): number {
    return this.index;
  }

  getLayers(index: number): LayerInfo[] {
    const deck = this.deck;
    const slide = deck?.slides[index];
    if (!deck || !slide) return [];
    return describeLayers(slide, this.rc(deck, index));
  }

  // Reveal bertahap butuh animasi per-elemen (jalur adegan WebGL); fallback Canvas 2D menggambar
  // slide utuh sekaligus, jadi fitur ini tidak tersedia di sini — slide ber-`stepReveal` tetap tampil
  // penuh langsung (degradasi anggun, bukan galat).
  stepForward(): boolean {
    return false;
  }

  stepBackward(): boolean {
    return false;
  }

  stepStatus(): { done: number; total: number } {
    return { done: 0, total: 0 };
  }

  private rc(deck: DeckData, index: number): RenderContext {
    return {
      theme: deck.theme,
      getImage: (id) => this.images.get(id),
      isLive: (id) => this.images.isLive(id),
      logoId: deck.logoId,
      index,
      total: deck.slides.length,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.tween?.kill();
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.liveRaf);
    this.images.dispose();
    this.resolveTween?.();
  }

  private settle(): void {
    if (this.tween) {
      this.tween.kill();
      this.tween = null;
    }
    if (this.mixing) {
      this.index = this.mixing.to;
      this.mixing = null;
      this.mix = 0;
    }
    this.resolveTween?.();
    this.resolveTween = null;
  }

  private schedule(): void {
    if (this.raf || this.disposed) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.paint();
    });
  }

  private paintSlide(target: HTMLCanvasElement, index: number): void {
    const deck = this.deck!;
    const ctx = target.getContext('2d')!;
    const k = target.width / SLIDE_W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const slide = index >= 0 ? deck.slides[index] : null;
    if (slide) {
      const rc = this.rc(deck, index);
      // Adegan generatif menempatkan label sesuai area foto yang terlihat.
      for (const l of buildLayers(slide, rc)) if (l.live) this.images.hint(l.live, l.rect.w / l.rect.h);
      drawSlide(ctx, slide, rc);
    } else {
      drawBlank(ctx, deck.theme);
    }
  }

  private paint(): void {
    if (!this.deck) return;
    const { ctx, canvas } = this;
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.deck.theme.bg1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Letterbox 16:9.
    const scale = Math.min(canvas.width / SLIDE_W, canvas.height / SLIDE_H);
    const w = SLIDE_W * scale;
    const h = SLIDE_H * scale;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    if (this.mixing) {
      this.paintSlide(this.a, this.mixing.from);
      this.paintSlide(this.b, this.mixing.to);
      ctx.drawImage(this.a, x, y, w, h);
      ctx.globalAlpha = this.mix;
      ctx.drawImage(this.b, x, y, w, h);
      ctx.globalAlpha = 1;
    } else {
      this.paintSlide(this.a, this.index);
      ctx.drawImage(this.a, x, y, w, h);
    }
    this.ensureLive();
  }

  private ensureLive(): void {
    if (!this.liveRaf && !this.paused && !this.reduced && !this.disposed) this.liveRaf = requestAnimationFrame(this.liveLoop);
  }

  /** Majukan media bergerak slide yang tampil dan lukis ulang bila frame-nya berubah; berhenti bila tak ada media bergerak. */
  private liveLoop = (): void => {
    this.liveRaf = 0;
    const deck = this.deck;
    if (!deck || this.disposed || this.paused || this.reduced || this.mixing || this.index < 0) return;
    const src = this.images.source(deck.slides[this.index]?.imageId);
    if (!src) return; // dimulai lagi oleh paint() berikutnya (ganti slide / media siap)
    const t = performance.now() / 1000;
    this.images.sweep(t);
    if (src.update(t)) this.schedule();
    this.liveRaf = requestAnimationFrame(this.liveLoop);
  };
}
