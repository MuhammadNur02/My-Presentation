/**
 * Elemen bersama (shared elements) untuk Magic Move.
 *
 * Renderer slide mendaftarkan elemen utamanya (foto hero, lencana logo, logo pojok) dengan sebuah
 * TAG. Dua slide berurutan yang memiliki tag sama → elemennya "dipasangkan": engine menerbangkan
 * satu elemen dari posisi/bentuk lama ke posisi/bentuk baru (dan meleburkan isinya) alih-alih
 * memotong keras. Semua koordinat memakai ruang logis slide 1920×1080 (origin kiri-atas).
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SharedElement {
  tag: string;
  kind: 'logo' | 'image';
  /** Identitas isi: isi sama + rect sama → tak perlu dianimasikan. */
  contentKey: string;
  rect: Rect;
  /** Radius sudut (px logis). Lingkaran = w/2. */
  radius: number;
  /** Intensitas bayangan 0..1 (kartu foto = 1). */
  shadow: number;
  /** Gambar isi ke kanvas lokal (0,0,w,h); ctx sudah diskalakan oleh pemanggil. */
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

export interface DrawOptions {
  /**
   * Elemen yang TIDAK digambar: tag elemen bersama (diterbangkan terpisah oleh Magic Move) dan/atau
   * token "@text" (seluruh judul/subjudul/poin — dianimasikan masuk setelah slide mendarat).
   */
  omitTags?: readonly string[];
}

export interface SharedPair {
  from: SharedElement;
  to: SharedElement;
  /** Isi identik → cukup berpindah tempat/bentuk, tanpa peleburan isi. */
  sameContent: boolean;
}

const near = (a: number, b: number, eps = 1.5) => Math.abs(a - b) <= eps;

function identical(a: SharedElement, b: SharedElement): boolean {
  return (
    a.contentKey === b.contentKey &&
    near(a.rect.x, b.rect.x) &&
    near(a.rect.y, b.rect.y) &&
    near(a.rect.w, b.rect.w) &&
    near(a.rect.h, b.rect.h) &&
    near(a.radius, b.radius, 1)
  );
}

/**
 * Pasangkan elemen dua slide:
 *  1) tag yang sama (hero↔hero, logo↔logo);
 *  2) sisa: lencana/logo di slide asal → tag "logo" di slide tujuan (logo mengecil ke pojok).
 * Pasangan yang identik dibuang (tidak ada yang perlu dianimasikan).
 */
export function pairSharedElements(from: SharedElement[], to: SharedElement[]): SharedPair[] {
  const a = from.filter((e) => e.tag);
  const b = to.filter((e) => e.tag);
  const pairs: SharedPair[] = [];

  for (const ea of [...a]) {
    const j = b.findIndex((eb) => eb.tag === ea.tag);
    if (j < 0) continue;
    pairs.push({ from: ea, to: b[j], sameContent: ea.contentKey === b[j].contentKey });
    a.splice(a.indexOf(ea), 1);
    b.splice(j, 1);
  }
  for (const ea of [...a]) {
    if (ea.kind !== 'logo') continue;
    const j = b.findIndex((eb) => eb.tag === 'logo');
    if (j < 0) continue;
    pairs.push({ from: ea, to: b[j], sameContent: ea.contentKey === b[j].contentKey });
    a.splice(a.indexOf(ea), 1);
    b.splice(j, 1);
  }
  return pairs.filter((p) => !identical(p.from, p.to));
}
