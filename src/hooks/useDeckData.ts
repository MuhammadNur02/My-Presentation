import { useMemo } from 'react';
import { detectQuality, resolveTheme } from '../engine';
import { useProjectStore } from '../store/projectStore';
import { useSettingsStore } from '../store/settingsStore';
import type { AssetAnim, DeckData, QualityTier } from '../types';

/** Proyek aktif → DeckData siap pakai untuk engine (tema ter-resolve, hanya aset terpakai). */
export function useDeckData(): DeckData | null {
  const project = useProjectStore((s) => s.project);
  const themeConfig = project?.theme;
  const slides = project?.slides;
  const assets = project?.assets;
  const logoId = project?.logoId ?? null;

  const theme = useMemo(() => (themeConfig ? resolveTheme(themeConfig) : null), [themeConfig]);

  return useMemo(() => {
    if (!theme || !slides || !assets) return null;
    const images: Record<string, string> = {};
    const anims: Record<string, AssetAnim> = {};
    const add = (id: string | null) => {
      if (!id || !assets[id]) return;
      images[id] = assets[id].dataUrl;
      const a = assets[id].anim;
      if (a) anims[id] = a;
    };
    slides.forEach((s) => add(s.imageId));
    add(logoId);
    return { slides, theme, images, anims, logoId: logoId && images[logoId] ? logoId : null };
  }, [theme, slides, assets, logoId]);
}

/** Tier kualitas grafis: preferensi pengguna, atau deteksi otomatis perangkat. */
export function useQualityTier(): QualityTier {
  const pref = useSettingsStore((s) => s.quality);
  return useMemo(() => (pref === 'auto' ? detectQuality() : pref), [pref]);
}

/**
 * Tier untuk mode presentasi: kejernihan didahulukan. "Otomatis" memakai tier tinggi
 * (kecuali perangkat terdeteksi lemah → sedang); pilihan manual pengguna tetap dihormati.
 */
export function usePresentationTier(): QualityTier {
  const pref = useSettingsStore((s) => s.quality);
  return useMemo(() => {
    if (pref !== 'auto') return pref;
    return detectQuality() === 'low' ? 'medium' : 'high';
  }, [pref]);
}
