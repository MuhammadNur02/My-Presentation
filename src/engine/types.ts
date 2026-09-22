import type { DeckData, QualityTier, RendererStats, RenderBackend, TransitionConfig } from '../types';
import type { LayerInfo } from './layers';

export interface DeckRendererOptions {
  tier: QualityTier;
  /** Hormati `prefers-reduced-motion`: semua transisi diganti fade singkat. */
  reducedMotion?: boolean;
  /**
   * true = renderer ini dipakai untuk PRESENTASI sungguhan (mode presentasi / runtime ekspor), bukan
   * pratinjau studio. Hanya berpengaruh pada slide ber-`stepReveal`: reveal bertahap per klik hanya
   * aktif saat presenting; di studio slide tetap tampil utuh agar mudah diedit.
   */
  presenting?: boolean;
  onStats?: (stats: RendererStats) => void;
}

export interface TransitionOptions {
  /** Indeks asal (default: slide yang sedang tampil; -1 = layar kosong). */
  from?: number;
  direction?: 1 | -1;
  /** Timpa konfigurasi transisi (default: milik slide terkait). */
  config?: TransitionConfig;
}

/** Kontrak renderer — dipenuhi oleh WebGL (DeckRenderer) dan fallback 2D. */
export interface IDeckRenderer {
  readonly backend: RenderBackend;
  setData(data: DeckData): void;
  resize(width: number, height: number, dpr: number): void;
  /** Tampilkan slide langsung (-1 = layar kosong). `build` memutar animasi masuk elemen. */
  show(index: number, opts?: { build?: boolean }): void;
  transition(to: number, opts?: TransitionOptions): Promise<void>;
  /** Tampilkan satu frame transisi pada progres tertentu (0..1) — untuk scrubbing manual. */
  scrub(from: number, to: number, config: TransitionConfig, progress: number, direction?: 1 | -1): void;
  setPaused(paused: boolean): void;
  /** Resolve saat semua gambar deck selesai dimuat. */
  ready(): Promise<void>;
  getIndex(): number;
  /** Lapisan beranimasi sebuah slide (judul, subjudul, poin, media, logo) — untuk klik-pilih di UI. */
  getLayers(index: number): LayerInfo[];
  /**
   * Reveal bertahap (lihat `DeckRendererOptions.presenting` & `Slide.stepReveal`). Ungkap/sembunyikan
   * poin berikutnya/terakhir pada slide yang sedang tampil; mengembalikan true bila menangani langkah
   * tersebut (pemanggil TIDAK perlu pindah slide), false bila tak ada langkah lagi ke arah itu.
   */
  stepForward(): boolean;
  stepBackward(): boolean;
  /** Status reveal bertahap slide yang sedang tampil; `total` 0 = stepReveal tidak aktif untuk slide ini. */
  stepStatus(): { done: number; total: number };
  dispose(): void;
}
