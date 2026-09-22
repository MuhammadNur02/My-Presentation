import { DeckRenderer } from './DeckRenderer';
import { Fallback2DRenderer } from './FallbackRenderer';
import { detectWebGL } from './quality';
import type { DeckRendererOptions, IDeckRenderer } from './types';

export { DeckPlayer } from './DeckPlayer';
export { bindPresentationInput, type InputHandlers } from './input';
export { detectQuality, prefersReducedMotion, TIER_CONFIG } from './quality';
export { SCENES, SCENE_BY_ID, SCENE_W, SCENE_H, drawScene, suggestScenes, sceneToDataUrl } from './media/scenes';
export { resolveTheme, THEME_PRESETS, PATTERN_OPTIONS, FONT_STACKS, DEFAULT_THEME, SLIDE_W, SLIDE_H } from './themes';
export { TRANSITIONS, TRANSITION_LIST, TRANSITION_CATEGORIES, EASING_OPTIONS, defaultTransition } from './transitions/definitions';
export { drawSlide, drawBlank } from './slideRenderer';
export type { IDeckRenderer, DeckRendererOptions } from './types';

/**
 * Buat renderer terbaik yang tersedia: WebGL bila didukung, jika tidak fallback 2D.
 * Canvas dibuat oleh pemanggil (lihat useDeckRenderer) agar aman terhadap StrictMode.
 */
export function createDeckRenderer(canvas: HTMLCanvasElement, opts: DeckRendererOptions): IDeckRenderer {
  if (detectWebGL()) {
    try {
      return new DeckRenderer(canvas, opts);
    } catch (err) {
      console.warn('[MorphDeck] WebGL gagal diinisialisasi, memakai fallback 2D.', err);
    }
  }
  return new Fallback2DRenderer(canvas, opts);
}
