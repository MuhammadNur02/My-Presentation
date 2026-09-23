import JSZip from 'jszip';
import type { Asset, Slide } from '../../types';
import { measureImage } from '../../utils/image';
import { uid } from '../../utils/id';
import { createSlide } from '../../utils/slideFactory';

const paragraphsOf = (node: Element): string[] =>
  Array.from(node.getElementsByTagName('a:p'))
    .map((p) =>
      Array.from(p.getElementsByTagName('a:t'))
        .map((t) => t.textContent ?? '')
        .join('')
        .trim(),
    )
    .filter(Boolean);

const numberOf = (path: string) => Number(/(\d+)\.xml$/.exec(path)?.[1] ?? 0);

const IMG_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' };

/** Selesaikan target relatif sebuah relationship (mis. "../media/image1.png") terhadap path XML sumbernya. */
function resolveRelPath(basePath: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = basePath.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/**
 * Ambil gambar UTAMA sebuah slide (gambar pertama yang berhasil dibaca) dari arsip PPTX yang sama.
 * PPTX adalah ZIP OOXML: relasi id→berkas ada di `_rels/slideN.xml.rels`, dirujuk oleh `<a:blip
 * r:embed="rIdX">` di XML slide. Best-effort — gambar yang gagal dibaca/format tak didukung
 * (mis. WMF/EMF vektor lawas) dilewati diam-diam, bukan membatalkan seluruh impor.
 */
async function extractSlideImage(zip: JSZip, slideXmlPath: string, slideDoc: Document): Promise<Asset | null> {
  const relsPath = resolveRelPath(slideXmlPath, `_rels/${slideXmlPath.split('/').pop()}.rels`);
  const relsFile = zip.file(relsPath);
  if (!relsFile) return null;

  const relsDoc = new DOMParser().parseFromString(await relsFile.async('string'), 'application/xml');
  const targetOf = new Map<string, string>();
  for (const rel of Array.from(relsDoc.getElementsByTagName('Relationship'))) {
    if (!/\/image$/.test(rel.getAttribute('Type') ?? '')) continue;
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target) targetOf.set(id, target);
  }
  if (!targetOf.size) return null;

  for (const blip of Array.from(slideDoc.getElementsByTagName('a:blip'))) {
    const rId = blip.getAttribute('r:embed');
    const target = rId && targetOf.get(rId);
    if (!target) continue;
    const mediaPath = resolveRelPath(slideXmlPath, target);
    const ext = mediaPath.split('.').pop()?.toLowerCase() ?? '';
    const mime = IMG_MIME[ext];
    const mediaFile = zip.file(mediaPath);
    if (!mime || !mediaFile) continue; // format tak didukung browser (mis. WMF/EMF) — coba blip berikutnya

    try {
      const base64 = await mediaFile.async('base64');
      const dataUrl = `data:${mime};base64,${base64}`;
      const { width, height } = await measureImage(dataUrl);
      if (width < 24 || height < 24) continue; // ikon dekoratif kecil, bukan gambar konten
      return { id: uid('as'), name: mediaPath.split('/').pop() ?? 'gambar', kind: 'image', dataUrl, width, height, source: 'upload' };
    } catch {
      continue; // berkas rusak/tak terbaca — lewati, bukan membatalkan impor
    }
  }
  return null;
}

/**
 * PPTX (OOXML zip) → slide. Placeholder judul/subjudul dipetakan langsung; teks lain menjadi
 * poin; tabel diringkas per baris; catatan pembicara dibaca dari notesSlide bila ada; gambar
 * utama tiap slide (bila ada) ikut diekstrak dari arsip yang sama.
 */
export async function parsePptx(file: File): Promise<{ title: string; slides: Slide[]; assets: Record<string, Asset> }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const parse = async (path: string) => {
    const f = zip.file(path);
    return f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null;
  };

  const slidePaths = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => numberOf(a) - numberOf(b))
    .slice(0, 40);
  if (!slidePaths.length) throw new Error('Berkas PPTX tidak berisi slide yang dapat dibaca.');

  const slides: Slide[] = [];
  const assets: Record<string, Asset> = {};
  for (const path of slidePaths) {
    const doc = await parse(path);
    if (!doc) continue;

    let title = '';
    let subtitle = '';
    const bullets: string[] = [];

    for (const sp of Array.from(doc.getElementsByTagName('p:sp'))) {
      const type = sp.getElementsByTagName('p:ph')[0]?.getAttribute('type') ?? '';
      const paras = paragraphsOf(sp);
      if (!paras.length) continue;
      if (type === 'title' || type === 'ctrTitle') title = paras.join(' ');
      else if (type === 'subTitle') subtitle = paras.join(' ');
      else if (!['sldNum', 'dt', 'ftr'].includes(type)) bullets.push(...paras);
    }
    for (const tr of Array.from(doc.getElementsByTagName('a:tr'))) {
      const row = Array.from(tr.getElementsByTagName('a:tc'))
        .map((tc) => paragraphsOf(tc).join(' '))
        .filter(Boolean)
        .join(' | ');
      if (row) bullets.push(row);
    }
    if (!title && bullets.length) title = bullets.shift()!;

    let notes = '';
    const notesDoc = await parse(`ppt/notesSlides/notesSlide${numberOf(path)}.xml`);
    if (notesDoc) {
      notes = Array.from(notesDoc.getElementsByTagName('p:sp'))
        .filter((sp) => sp.getElementsByTagName('p:ph')[0]?.getAttribute('type') === 'body')
        .flatMap(paragraphsOf)
        .join('\n');
    }

    const image = await extractSlideImage(zip, path, doc);
    if (image) assets[image.id] = image;

    slides.push(
      createSlide({
        layout: slides.length === 0 && (subtitle || !bullets.length) ? 'title' : 'auto',
        title: title || `Slide ${slides.length + 1}`,
        subtitle,
        bullets: bullets.slice(0, 8),
        notes,
        imageId: image?.id ?? null,
      }),
    );
  }
  return { title: slides[0]?.title || file.name.replace(/\.[^.]+$/, ''), slides, assets };
}
