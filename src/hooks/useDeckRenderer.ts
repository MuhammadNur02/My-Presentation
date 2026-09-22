import { useEffect, useRef, useState } from 'react';
import { createDeckRenderer, prefersReducedMotion, type IDeckRenderer } from '../engine';
import type { QualityTier, RendererStats } from '../types';

/**
 * Siklus hidup renderer WebGL untuk sebuah container.
 *
 * - Canvas dibuat secara imperatif di dalam efek (bukan di JSX) sehingga tiap mount memakai
 *   canvas BARU. Ini penting: konteks WebGL yang sudah di-`forceContextLoss` tidak bisa dipakai
 *   ulang pada elemen yang sama (mis. saat React StrictMode me-remount efek di mode dev).
 * - Cleanup memanggil `dispose()` → melepas tekstur, geometri, material, renderer, dan konteks GPU.
 */
export function useDeckRenderer(tier: QualityTier, onStats?: (s: RendererStats) => void, presenting?: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<IDeckRenderer | null>(null);
  const statsRef = useRef(onStats);
  statsRef.current = onStats;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    container.appendChild(canvas);

    const r = createDeckRenderer(canvas, {
      tier,
      reducedMotion: prefersReducedMotion(),
      presenting,
      onStats: (s) => statsRef.current?.(s),
    });
    const fit = () => r.resize(container.clientWidth, container.clientHeight, window.devicePixelRatio || 1);
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    fit();
    setRenderer(r);

    return () => {
      ro.disconnect();
      setRenderer(null);
      r.dispose();
      canvas.remove();
    };
  }, [tier, presenting]);

  return { containerRef, renderer };
}
