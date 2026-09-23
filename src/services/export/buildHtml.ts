import { EMBEDDED_FONTS_CSS } from '../../engine/embeddedFonts';
import { resolveTheme } from '../../engine/themes';
import type { AssetAnim, DeckData, Project } from '../../types';
// Bundel IIFE hasil `npm run build:runtime` (engine WebGL + player), di-embed apa adanya.
import runtimeSource from './generated/runtime.js?raw';
import { RUNTIME_CSS } from './runtimeCss';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Id aset (foto + logo) yang benar-benar dipakai project ini — dasar untuk mengecilkan ukuran berkas ekspor. */
function usedAssetIds(project: Project): Set<string> {
  const used = new Set<string>();
  project.slides.forEach((s) => s.imageId && used.add(s.imageId));
  if (project.logoId) used.add(project.logoId);
  return used;
}

/** Data URL gambar (poster diam) tiap aset yang dipakai — dibagikan oleh `collectDeckData` (HTML/ZIP) dan `buildPdf`. */
export function collectUsedImageUrls(project: Project): Record<string, string> {
  const images: Record<string, string> = {};
  usedAssetIds(project).forEach((id) => {
    const a = project.assets[id];
    if (a) images[id] = a.dataUrl;
  });
  return images;
}

/** Data deck untuk ekspor: hanya aset yang benar-benar dipakai (mengecilkan ukuran berkas). */
export function collectDeckData(project: Project): DeckData {
  const images = collectUsedImageUrls(project);
  const anims: Record<string, AssetAnim> = {};
  usedAssetIds(project).forEach((id) => {
    const a = project.assets[id];
    if (a?.anim) anims[id] = a.anim;
  });
  return {
    slides: project.slides,
    theme: resolveTheme(project.theme),
    images,
    anims,
    logoId: project.logoId && images[project.logoId] ? project.logoId : null,
    watermark: project.tier === 'free',
  };
}

/** Serialisasi JSON aman untuk disisipkan di dalam <script> (cegah penutupan tag & U+2028/2029). */
function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), String.fromCharCode(92) + 'u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), String.fromCharCode(92) + 'u2029');
}

/**
 * Bangun satu berkas HTML mandiri: CSS + data deck (gambar sebagai data-URI) + runtime WebGL.
 * Gambar sengaja di-embed sebagai data-URI: tekstur WebGL dari berkas terpisah gagal pada
 * `file://` (canvas dianggap cross-origin), sedangkan data-URI selalu aman.
 */
export function buildStandaloneHtml(project: Project): string {
  const payload = { title: project.name, deck: collectDeckData(project) };
  const script = runtimeSource.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="${project.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="generator" content="MorphDeck">
<title>${escapeHtml(project.name)}</title>
<style>${RUNTIME_CSS}${EMBEDDED_FONTS_CSS}</style>
</head>
<body>
<div id="app"></div>
<script id="deck-data" type="application/json">${safeJson(payload)}</script>
<script>${script}</script>
</body>
</html>
`;
}
