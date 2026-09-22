export interface InputHandlers {
  next(): void;
  prev(): void;
  first?(): void;
  last?(): void;
  exit?(): void;
  restart?(): void;
  toggleNotes?(): void;
  toggleFullscreen?(): void;
}

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'Spacebar']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']);

/**
 * Navigasi keyboard + gesture sentuh/klik untuk presentasi.
 *  - Arrow Right / Space / PageDown / Enter → maju;  Arrow Left / PageUp → mundur
 *  - Home / End, R (ulang), N (catatan), F (layar penuh), Esc (keluar)
 *  - Swipe horizontal, tap kiri (25%) = mundur, tap lainnya = maju
 * Elemen dengan atribut `data-no-nav` (mis. HUD) tidak memicu navigasi tap.
 * Mengembalikan fungsi pembersih.
 */
export function bindPresentationInput(surface: HTMLElement, h: InputHandlers): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    if (NEXT_KEYS.has(e.key)) {
      e.preventDefault();
      h.next();
    } else if (PREV_KEYS.has(e.key)) {
      e.preventDefault();
      h.prev();
    } else if (e.key === 'Home') {
      e.preventDefault();
      h.first?.();
    } else if (e.key === 'End') {
      e.preventDefault();
      h.last?.();
    } else if (e.key === 'Escape') {
      h.exit?.();
    } else if (e.key === 'r' || e.key === 'R') {
      h.restart?.();
    } else if (e.key === 'n' || e.key === 'N') {
      h.toggleNotes?.();
    } else if (e.key === 'f' || e.key === 'F') {
      h.toggleFullscreen?.();
    }
  };

  let start: { x: number; y: number; t: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-nav]')) return;
    start = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onUp = (e: PointerEvent) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dt = performance.now() - start.t;
    start = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) h.next();
      else h.prev();
    } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 500) {
      const rect = surface.getBoundingClientRect();
      if (e.clientX - rect.left < rect.width * 0.25) h.prev();
      else h.next();
    }
  };
  const onCancel = () => {
    start = null;
  };

  window.addEventListener('keydown', onKey);
  surface.addEventListener('pointerdown', onDown);
  surface.addEventListener('pointerup', onUp);
  surface.addEventListener('pointercancel', onCancel);
  return () => {
    window.removeEventListener('keydown', onKey);
    surface.removeEventListener('pointerdown', onDown);
    surface.removeEventListener('pointerup', onUp);
    surface.removeEventListener('pointercancel', onCancel);
  };
}
