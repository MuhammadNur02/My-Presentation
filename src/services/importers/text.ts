import type { DocSection, ParsedDoc } from './sections';

/** TXT / Markdown: `#` = judul dokumen/bagian, `-`/`*`/`1.` = poin, sisanya paragraf. */
export function parseText(raw: string, fallbackTitle: string): ParsedDoc {
  const sections: DocSection[] = [];
  let title = '';
  let cur: DocSection | null = null;
  const ensure = (): DocSection => (cur ??= (sections.push({ heading: '', paragraphs: [], bullets: [] }), sections[sections.length - 1]));

  for (const line of raw.replace(/\r/g, '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      if (h[1].length === 1 && !title && !sections.length) {
        title = h[2].trim();
        continue;
      }
      cur = { heading: h[2].trim(), paragraphs: [], bullets: [] };
      sections.push(cur);
      continue;
    }
    const b = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(t);
    if (b) ensure().bullets.push(b[1].trim());
    else ensure().paragraphs.push(t);
  }
  return { title: title || fallbackTitle, sections };
}
