import type { IDeckRenderer } from './types';

/**
 * State-machine navigasi presentasi. Dipakai bersama oleh Presentation Mode (React)
 * dan runtime standalone hasil ekspor, sehingga perilakunya identik.
 *
 * Reveal bertahap: sebelum pindah slide, `next()`/`prev()` selalu menawarkan dulu ke renderer untuk
 * mengungkap/menyembunyikan satu langkah (lihat `Slide.stepReveal`) — pindah slide baru terjadi
 * setelah renderer bilang tidak ada langkah lagi ke arah itu.
 */
export class DeckPlayer {
  private index = -1;

  constructor(
    private renderer: IDeckRenderer,
    private count: () => number,
    private hooks: { onChange?: (index: number) => void; onStep?: (done: number, total: number) => void; onEnd?: () => void } = {},
  ) {}

  get current(): number {
    return this.index;
  }

  /** Mulai dari layar kosong → intro sinematik ke slide pertama. */
  async start(): Promise<void> {
    this.renderer.show(-1);
    await this.renderer.ready();
    this.index = 0;
    this.hooks.onChange?.(0);
    await this.renderer.transition(0, { from: -1, direction: 1 });
    this.emitStep();
  }

  next(): void {
    if (this.renderer.stepForward()) {
      this.emitStep();
      return;
    }
    if (this.index >= this.count() - 1) {
      this.hooks.onEnd?.();
      return;
    }
    this.go(this.index + 1);
  }

  prev(): void {
    if (this.renderer.stepBackward()) {
      this.emitStep();
      return;
    }
    if (this.index <= 0) return;
    this.go(this.index - 1);
  }

  goTo(target: number): void {
    const t = Math.max(0, Math.min(this.count() - 1, target));
    if (t !== this.index) this.go(t);
  }

  /** Reset ke slide pertama tanpa transisi (animasi build tetap diputar). */
  restart(): void {
    this.index = 0;
    this.renderer.show(0, { build: true });
    this.hooks.onChange?.(0);
    this.emitStep();
  }

  private go(target: number): void {
    const from = this.index;
    this.index = target;
    this.hooks.onChange?.(target);
    void this.renderer.transition(target, { from, direction: target > from ? 1 : -1 }).then(() => this.emitStep());
  }

  private emitStep(): void {
    if (!this.hooks.onStep) return;
    const { done, total } = this.renderer.stepStatus();
    this.hooks.onStep(done, total);
  }
}
