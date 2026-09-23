import type { DocSection, ParsedDoc } from './sections';

/** DOCX → HTML (mammoth, dimuat malas) → bagian per heading. */
export async function parseDocx(file: File): Promise<ParsedDoc> {
  const mod = (await import('mammoth/mammoth.browser')) as unknown as { default?: typeof import('mammoth/mammoth.browser').default };
  const mammoth = (mod.default ?? mod) as { convertToHtml: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const dom = new DOMParser().parseFromString(value, 'text/html');

  const sections: DocSection[] = [];
  let title = '';
  let cur: DocSection | null = null;
  const ensure = (): DocSection => (cur ??= (sections.push({ heading: '', paragraphs: [], bullets: [] }), sections[sections.length - 1]));
  const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

  for (const el of Array.from(dom.body.children)) {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const t = text(el);
      if (!t) continue;
      if (tag === 'h1' && !title && !sections.length) {
        title = t;
        continue;
      }
      cur = { heading: t, paragraphs: [], bullets: [] };
      sections.push(cur);
    } else if (tag === 'ul' || tag === 'ol') {
      el.querySelectorAll('li').forEach((li) => {
        const t = text(li);
        if (t) ensure().bullets.push(t);
      });
    } else if (tag === 'table') {
      el.querySelectorAll('tr').forEach((tr) => {
        const row = Array.from(tr.querySelectorAll('th,td')).map(text).filter(Boolean).join(' | ');
        if (row) ensure().bullets.push(row);
      });
    } else {
      // `mammoth` menyisipkan gambar sebagai <img src="data:..."> langsung di HTML (bawaan,
      // tanpa konfigurasi tambahan) — ambil yang pertama per bagian sebelum diabaikan sebagai teks kosong.
      const img = el.querySelector('img[src^="data:"]') ?? (el.tagName.toLowerCase() === 'img' ? el : null);
      const src = img?.getAttribute('src');
      if (src && !ensure().imageDataUrl) ensure().imageDataUrl = src;
      const t = text(el);
      if (t) ensure().paragraphs.push(t);
    }
  }
  return { title: title || file.name.replace(/\.[^.]+$/, ''), sections };
}
