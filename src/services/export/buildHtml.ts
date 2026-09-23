import { resolveTheme } from '../../engine/themes';
import type { AssetAnim, DeckData, Project } from '../../types';
// Bundel IIFE hasil `npm run build:runtime` (engine WebGL + player), di-embed apa adanya.
import runtimeSource from './generated/runtime.js?raw';
import { RUNTIME_CSS } from './runtimeCss';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Data deck untuk ekspor: hanya aset yang benar-benar dipakai (mengecilkan ukuran berkas). */
export function collectDeckData(project: Project): DeckData {
  const used = new Set<string>();
  project.slides.forEach((s) => s.imageId && used.add(s.imageId));
  if (project.logoId) used.add(project.logoId);
  const images: Record<string, string> = {};
  const anims: Record<string, AssetAnim> = {};
  used.forEach((id) => {
    const a = project.assets[id];
    if (!a) return;
    images[id] = a.dataUrl;
    if (a.anim) anims[id] = a.anim;
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
<style>${RUNTIME_CSS}</style>
</head>
<body>
<div id="app"></div>
<script id="deck-data" type="application/json">${safeJson(payload)}</script>
<script>${script}</script>
</body>
</html>
`;
}
