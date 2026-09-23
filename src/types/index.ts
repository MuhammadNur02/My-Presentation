/** Tipe domain bersama — dipakai oleh engine, store, service, dan UI. */

export type TransitionId =
  | 'fade'
  | 'slide'
  | 'zoom'
  | 'cube'
  | 'flip'
  | 'carousel'
  | 'morph'
  | 'ripple'
  | 'pixelate'
  | 'wipe'
  | 'doors'
  | 'toss'
  | 'spin'
  | 'roll'
  | 'swirl'
  | 'tiles'
  | 'blinds'
  | 'shatter'
  | 'halftone'
  | 'glitch'
  | 'magic'
  | 'crosszoom'
  | 'iris'
  | 'stripes';

/** Nama ease GSAP yang tidak overshoot (aman untuk shader). */
export type EasingId =
  | 'power2.inOut'
  | 'power3.inOut'
  | 'expo.inOut'
  | 'sine.inOut'
  | 'circ.inOut'
  | 'power4.out';

export interface TransitionConfig {
  type: TransitionId;
  /** Detik. */
  duration: number;
  easing: EasingId;
  /** Pengali kekuatan efek (0.4 – 2). */
  intensity: number;
}

/** `auto` = biarkan AI memilih saat tahap Generate. */
export type LayoutId =
  | 'auto'
  | 'title'
  | 'content'
  | 'split'
  | 'image-full'
  | 'quote'
  | 'stats'
  | 'numbered'
  | 'timeline'
  | 'compare'
  | 'statement'
  | 'chart';

/** Animasi masuk elemen. `mix` = variasi otomatis per elemen (tiap elemen memakai gaya berbeda). */
export type BuildAnimation =
  | 'fade-up'
  | 'fade'
  | 'scale'
  | 'slide-left'
  | 'slide-right'
  | 'drop'
  | 'zoom-out'
  | 'rotate-in'
  | 'flip-in'
  | 'bounce'
  | 'wipe'
  | 'blur-in'
  | 'rise'
  | 'zoom-in'
  | 'elastic'
  | 'flip-x'
  | 'tilt-up'
  | 'spiral'
  | 'wipe-down'
  | 'wipe-up'
  | 'typewriter'
  | 'glitch-in'
  | 'mix'
  | 'none';

/** Peran elemen untuk animasi: tiap peran punya pengaturan gerak sendiri. `body` = semua poin/kartu. */
export type MotionRole = 'title' | 'subtitle' | 'body' | 'media' | 'logo';
/** Pemecahan teks saat animasi masuk: satu blok, per baris, atau per kata. */
export type TextSplit = 'block' | 'lines' | 'words';
/** Gerak ambient (terus-menerus) pada media/foto. */
export type AmbientMedia = 'none' | 'kenburns' | 'drift' | 'float' | 'pulse' | 'sway' | 'tilt3d';

export interface ElementMotion {
  /** Gaya masuk; kosong = ikut gaya slide (Slide.build). */
  enter?: BuildAnimation;
  split?: TextSplit;
  /** Detik, ditambahkan ke jeda bawaan urutan elemen. */
  delay?: number;
  duration?: number;
  /** Jeda antar potongan (kata/baris) atau antar poin. */
  stagger?: number;
}

export interface SlideMotion {
  roles?: Partial<Record<MotionRole, ElementMotion>>;
  ambientMedia?: AmbientMedia;
  /** Cahaya latar bergerak perlahan (aurora). */
  aurora?: boolean;
  /** Partikel cahaya melayang di latar. */
  particles?: boolean;
}

/** Bahasa gerak proyek: menyelaraskan transisi halaman, animasi elemen, dan gerak ambient. */
export type MotionStyle = 'elegant' | 'cinematic' | 'energetic' | 'minimal';

/**
 * Penempatan MANUAL sebuah elemen (px logis 1920×1080). Kosong = ikut tata letak otomatis.
 * Teks: x, y, w (lebar bungkus), scale (pengali ukuran font). Foto/logo: x, y, w, h, radius.
 */
export interface LayoutOverride {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  scale?: number;
  radius?: number;
}

export interface Slide {
  id: string;
  layout: LayoutId;
  title: string;
  subtitle: string;
  /** Dukung markup ringan: **tebal**, *miring*, ==sorot==. Layout `stats` memakai "nilai | label". */
  bullets: string[];
  notes: string;
  imageId: string | null;
  /** Kata kunci pencarian gambar kontekstual. */
  imageQuery: string;
  /**
   * Tag elemen utama slide (foto / lencana logo) untuk Magic Move: elemen ber-tag SAMA di dua slide
   * berurutan bergerak mulus lalu bermorfosis. Kosong = nonaktif. Default "hero".
   */
  heroTag?: string;
  /** Penyetelan gerak per elemen (judul, subjudul, poin, media, logo) + gerak ambient. */
  motion?: SlideMotion;
  /** Penempatan manual per elemen, kunci = id lapisan (title, subtitle, bullet-0, hero, badge, logo, card-1, …). */
  overrides?: Record<string, LayoutOverride>;
  /**
   * Reveal bertahap: saat presentasi, poin/kartu (peran "body") diungkap SATU PER SATU setiap kali
   * maju/mundur — pindah ke slide berikutnya baru terjadi setelah poin terakhir diungkap. Tak berlaku
   * di studio (Live Monitor selalu menampilkan slide utuh agar mudah diedit).
   */
  stepReveal?: boolean;
  showLogo: boolean;
  /** Pengali ukuran teks (0.7 – 1.4). */
  textScale: number;
  build: BuildAnimation;
  /** Transisi MASUK ke slide ini (slide pertama: intro dari layar kosong). */
  transition: TransitionConfig;
}

/**
 * Media BERGERAK sebuah aset. `Asset.dataUrl` selalu berisi gambar diam (poster) agar semua tempat yang hanya
 * butuh gambar (thumbnail, pustaka, renderer 2D) tetap bekerja; animasinya dimainkan engine dari sini.
 *  - gif   : `src` = data URL berkas GIF asli (didekode sendiri, tanpa pustaka).
 *  - video : `src` = data URL MP4/WebM (diputar berulang, tanpa suara).
 *  - scene : animasi generatif (kode, bukan berkas) — `scene` = id adegan, digambar ulang tiap frame.
 */
export interface AssetAnim {
  kind: 'gif' | 'video' | 'scene';
  src?: string;
  scene?: string;
  /** Bahasa label pada adegan generatif. */
  lang?: Language;
}

export interface Asset {
  id: string;
  name: string;
  kind: 'image' | 'logo';
  dataUrl: string;
  width: number;
  height: number;
  source: 'upload' | 'art' | 'stock' | 'ai';
  credit?: string;
  /** Ada = aset ini animasi/video (lihat AssetAnim). */
  anim?: AssetAnim;
}

export type Tone = 'professional' | 'creative' | 'minimal' | 'educational';
export type Language = 'id' | 'en';
export type FontStyle = 'sans' | 'serif' | 'mono' | 'grotesk' | 'elegant' | 'rounded' | 'condensed';
export type PatternId = 'none' | 'dots' | 'grid' | 'diagonal' | 'arcs' | 'waves';

export interface ThemeConfig {
  presetId: string;
  accent?: string;
  accent2?: string;
  fontStyle: FontStyle;
  showSlideNumber: boolean;
  /** Pola dekoratif tipis pada latar semua slide. */
  pattern?: PatternId;
}

/** Tema final (preset + override) yang dipakai renderer. */
export interface ResolvedTheme {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  bg1: string;
  bg2: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  fontHeading: string;
  fontBody: string;
  showSlideNumber: boolean;
  pattern: PatternId;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tone: Tone;
  language: Language;
  slides: Slide[];
  assets: Record<string, Asset>;
  logoId: string | null;
  theme: ThemeConfig;
  motionStyle?: MotionStyle;
  /**
   * 'free' = dibuat lewat impor dokumen tanpa AI berbayar (kredit) — fitur AI & ekspor sumber
   * dibatasi, dan presentasinya memakai watermark. Tak diisi (undefined) atau 'full' = tanpa batasan
   * (dibuat dari prompt AI, baik lewat kredit hosted, kunci sendiri, maupun mode simulasi).
   */
  tier?: 'free' | 'full';
}

export interface Snapshot {
  id: string;
  label: string;
  createdAt: number;
  name: string;
  slides: Slide[];
  theme: ThemeConfig;
  logoId: string | null;
  motionStyle?: MotionStyle;
}

/** Masukan lengkap untuk engine WebGL — tidak bergantung pada React/Zustand. */
export interface DeckData {
  slides: Slide[];
  theme: ResolvedTheme;
  /** assetId -> data URL */
  images: Record<string, string>;
  /** Aset (id) yang bergerak: GIF, video, atau adegan generatif. */
  anims?: Record<string, AssetAnim>;
  logoId: string | null;
  /** Proyek `tier: 'free'` — tampilkan lencana watermark kecil saat presentasi (live & hasil ekspor). */
  watermark?: boolean;
}

export type QualityTier = 'low' | 'medium' | 'high';
export type RenderBackend = 'webgl2' | 'webgl' | '2d';

export interface RendererStats {
  fps: number;
  tier: QualityTier;
  backend: RenderBackend;
  /** True bila kualitas diturunkan otomatis karena frame-rate rendah. */
  degraded: boolean;
  /** Lebar tekstur slide aktual (px) — makin dekat ke lebar layar, makin tajam. */
  texWidth: number;
  /** Transisi yang sedang berjalan (null saat diam). */
  transition: TransitionId | null;
}
