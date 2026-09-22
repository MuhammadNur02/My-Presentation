import type { MotionRole } from '../types';
import type { Rect } from './sharedElements';

/** Cara elemen diedit manual: teks (geser, lebar bungkus, skala font), bebas (geser + ubah ukuran), kunci rasio (logo/lencana). */
export type LayerEdit = 'text' | 'free' | 'lock';

export type LayerRole = 'bg' | 'glow' | 'title' | 'subtitle' | 'body' | 'media' | 'logo' | 'decor' | 'number';

/**
 * Satu lapisan visual slide. Semua elemen (latar, cahaya, judul, poin, foto, logo, dekorasi)
 * didaftarkan renderer slide sebagai lapisan. Dari daftar yang sama:
 *   - jalur DATAR (transisi, thumbnail)  → digambar berurutan ke satu kanvas 2D;
 *   - jalur ADEGAN (slide diam / animasi elemen) → tiap lapisan jadi tekstur + mesh sendiri,
 *     digerakkan GPU (posisi, skala, rotasi, opasitas, mask) tanpa menggambar ulang.
 * Koordinat: ruang logis slide 1920×1080, origin kiri-atas.
 */
export interface SlideLayer {
  id: string;
  role: LayerRole;
  /** Peran gerak (pengaturan animasi); null = statis. Dekorasi bisa "ikut" peran teks. */
  motionRole: MotionRole | null;
  /** Urutan build: 0 judul, 1 subjudul, 2 media/logo, 3+ poin; -1 statis. */
  order: number;
  /** flat = tekstur biasa; card = kartu SDF (sudut membulat, bayangan, zoom isi). */
  mode: 'flat' | 'card';
  rect: Rect;
  /** Margin tekstur (flat) agar ujung huruf/bayangan tidak terpotong. */
  pad: number;
  radius: number;
  shadow: number;
  border: boolean;
  /** Tag elemen bersama (Magic Move); '' = bukan elemen bersama. */
  tag: string;
  shared?: 'logo' | 'image';
  contentKey: string;
  edit?: LayerEdit;
  /** Id aset animasi bila isi lapisan bergerak (GIF/video/generatif) → tekstur dilukis ulang tiap frame. */
  live?: string | null;
  /** Batas ukuran tekstur (px) untuk lapisan besar bermuatan halus (mis. cahaya latar). */
  maxTex?: number;
  /** Kata dan baris (koordinat lokal terhadap rect) untuk animasi teks per kata/baris. */
  pieces?: Rect[];
  lines?: Rect[];
  /** Isi lokal: (0,0) = pojok kiri-atas rect; ctx sudah diskalakan (dan digeser sebesar pad untuk flat). */
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  /** Penggambaran in-place (koordinat absolut) untuk jalur datar bila berbeda dari paint. */
  flat?: (ctx: CanvasRenderingContext2D) => void;
}

/** Ringkasan lapisan untuk UI (hit-test & sorotan elemen di Live Monitor). */
export interface LayerInfo {
  id: string;
  role: LayerRole;
  motionRole: MotionRole | null;
  rect: Rect;
  mode: 'flat' | 'card';
  /** Nama ramah untuk UI ("Judul", "Poin 2", "Foto"…). */
  label: string;
  edit: LayerEdit;
  /** Radius sudut (px logis) — untuk bingkai foto. */
  radius: number;
  /** Isi lapisan bergerak (animasi/video). */
  live: boolean;
}
