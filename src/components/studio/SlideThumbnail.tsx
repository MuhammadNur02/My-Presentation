import { memo, useEffect, useRef, useState } from 'react';
import { drawSlide, SLIDE_W } from '../../engine';
import type { ResolvedTheme, Slide } from '../../types';

/** Cache gambar bersama untuk semua thumbnail (kunci: id aset + panjang data-URL). */
const imageCache = new Map<string, HTMLImageElement | 'loading'>();

function useThumbImage(id: string | null, url: string | undefined): HTMLImageElement | null {
  const [, force] = useState(0);
  const key = id && url ? `${id}:${url.length}` : '';
  useEffect(() => {
    if (!key || !url || imageCache.has(key)) return;
    imageCache.set(key, 'loading');
    const img = new Image();
    img.onload = () => {
      imageCache.set(key, img);
      force((n) => n + 1);
    };
    img.onerror = () => imageCache.delete(key);
    img.src = url;
  }, [key, url]);
  const hit = key ? imageCache.get(key) : null;
  return hit && hit !== 'loading' ? hit : null;
}

interface Props {
  slide: Slide;
  index: number;
  total: number;
  theme: ResolvedTheme;
  imageUrl?: string;
  logoId: string | null;
  logoUrl?: string;
  width?: number;
}

/** Thumbnail slide via Canvas 2D (bukan WebGL) — ringan dan tidak memakan konteks GPU. */
export const SlideThumbnail = memo(function SlideThumbnail({ slide, index, total, theme, imageUrl, logoId, logoUrl, width = 320 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const img = useThumbImage(slide.imageId, imageUrl);
  const logo = useThumbImage(logoId, logoUrl);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const raf = requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const k = canvas.width / SLIDE_W;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      drawSlide(ctx, slide, {
        theme,
        getImage: (id) => (id === slide.imageId ? img : id === logoId ? logo : null),
        logoId,
        index,
        total,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [slide, index, total, theme, img, logo, logoId]);

  return <canvas ref={ref} width={width} height={Math.round((width * 9) / 16)} className="block aspect-video w-full rounded-[inherit]" />;
});
