import { ChevronLeft, ChevronRight, Gauge, Play, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TRANSITIONS } from '../../engine';
import type { LayerInfo } from '../../engine/layers';
import { useDeckData, useQualityTier } from '../../hooks/useDeckData';
import { useDeckRenderer } from '../../hooks/useDeckRenderer';
import { useUIStore } from '../../store/uiStore';
import type { RendererStats } from '../../types';
import { cn } from '../../utils/cn';
import { Button, IconButton } from '../common/ui';
import { LayerOverlay } from './LayerOverlay';

const BACKEND_LABEL = { webgl2: 'WebGL 2', webgl: 'WebGL 1', '2d': 'Canvas 2D (fallback)' } as const;
const TIER_LABEL = { high: 'Tinggi', medium: 'Sedang', low: 'Hemat' } as const;

const sameLayers = (a: LayerInfo[], b: LayerInfo[]): boolean =>
  a.length === b.length &&
  a.every((l, i) => {
    const o = b[i];
    return l.id === o.id && l.rect.x === o.rect.x && l.rect.y === o.rect.y && l.rect.w === o.rect.w && l.rect.h === o.rect.h && l.radius === o.radius;
  });

/**
 * Panel kanan: Live Monitor. Merender slide + transisi 3D/WebGL secara real-time.
 * Setiap perubahan teks/tema langsung tergambar; setiap perubahan parameter transisi memutar
 * ulang pratinjau otomatis. Slider "scrub" memperlihatkan frame transisi pada progres tertentu.
 */
export function LivePreview() {
  const deck = useDeckData();
  const tier = useQualityTier();
  const selectedId = useUIStore((s) => s.selectedSlideId);
  const select = useUIStore((s) => s.selectSlide);
  const presenting = useUIStore((s) => s.presenting);
  const previewNonce = useUIStore((s) => s.previewNonce);

  const [stats, setStats] = useState<RendererStats | null>(null);
  const { containerRef, renderer } = useDeckRenderer(tier, setStats);
  const [scrub, setScrub] = useState<number | null>(null);
  const skipShow = useRef(false);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const slides = deck?.slides ?? [];
  const index = slides.findIndex((s) => s.id === selectedId);
  const slide = slides[index];

  // 1) Sinkronkan data deck ke engine (tema, teks, gambar) — real-time. Daftar lapisan diambil di efek yang SAMA,
  //    sesudah setData, agar tidak tertinggal satu perubahan (renderer membaca deck dari setData).
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  useEffect(() => {
    if (!renderer || !deck) return;
    renderer.setData(deck);
    const sync = () => {
      const next = index >= 0 ? renderer.getLayers(index) : [];
      setLayers((prev) => (sameLayers(prev, next) ? prev : next));
    };
    sync();
    // Gambar dimuat asinkron dan mengubah tata letak (mis. ada/tidaknya foto) → ambil ulang setelah siap.
    let live = true;
    void renderer.ready().then(() => live && sync());
    return () => {
      live = false;
    };
  }, [renderer, deck, index]);

  // 2) Pindah slide dari daftar → tampil langsung dengan animasi build elemen.
  useEffect(() => {
    if (!renderer || index < 0) return;
    setScrub(null);
    if (skipShow.current) {
      skipShow.current = false;
      return;
    }
    renderer.show(index, { build: true });
  }, [renderer, index]);

  // 3) Jeda render saat mode presentasi aktif (hemat GPU; hanya satu konteks yang bekerja).
  useEffect(() => {
    renderer?.setPaused(presenting);
  }, [renderer, presenting]);

  // 4) Scrubbing manual: tampilkan frame transisi pada progres slider.
  useEffect(() => {
    if (!renderer || scrub === null || !slide) return;
    renderer.scrub(index - 1, index, slide.transition, scrub, 1);
  }, [renderer, scrub, slide, index, deck]);

  const play = useCallback(() => {
    if (!renderer || index < 0) return;
    setScrub(null);
    renderer.show(index - 1); // slide sebelumnya (atau layar kosong untuk slide pertama)
    void renderer.transition(index, { from: index - 1, direction: 1 });
  }, [renderer, index]);
  const playRef = useRef(play);
  playRef.current = play;

  // 5) Permintaan putar ulang dari panel transisi.
  useEffect(() => {
    if (previewNonce > 0) playRef.current();
  }, [previewNonce]);

  // 6) Auto-putar saat parameter transisi slide yang sama berubah (debounce).
  const t = slide?.transition;
  const key = slide && t ? `${slide.id}|${t.type}|${t.duration}|${t.easing}|${t.intensity}` : '';
  const prevKey = useRef(key);
  useEffect(() => {
    const prev = prevKey.current;
    prevKey.current = key;
    if (!renderer || !key || prev === key || prev.split('|')[0] !== key.split('|')[0]) return;
    const id = setTimeout(() => playRef.current(), 380);
    return () => clearTimeout(id);
  }, [key, renderer]);

  // 7) Animasi masuk elemen: putar ulang bila gaya slide yang sama diganti, atau diminta manual.
  const buildNonce = useUIStore((s) => s.buildNonce);
  const buildKey = slide ? `${slide.id}|${slide.build}|${JSON.stringify(slide.motion?.roles ?? null)}` : '';
  const prevBuildKey = useRef(buildKey);
  useEffect(() => {
    const prev = prevBuildKey.current;
    prevBuildKey.current = buildKey;
    if (!renderer || !buildKey || prev === buildKey || prev.split('|')[0] !== buildKey.split('|')[0]) return;
    const id = setTimeout(() => renderer.show(index, { build: true }), 250);
    return () => clearTimeout(id);
  }, [buildKey, renderer, index]);
  useEffect(() => {
    if (buildNonce > 0 && renderer && index >= 0) {
      setScrub(null);
      renderer.show(index, { build: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildNonce]);

  // Klik-pilih elemen: hit-test terhadap lapisan slide aktif (ruang logis 1920×1080).

  // Publikasikan daftar lapisan agar panel Posisi tahu elemen & ukurannya.
  useEffect(() => {
    useUIStore.getState().setLayerInfos(layers);
  }, [layers]);

  const pickLayer = (e: { clientX: number; clientY: number }): LayerInfo | null => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box || !box.width) return null;
    const x = ((e.clientX - box.left) / box.width) * 1920;
    const y = ((e.clientY - box.top) / box.height) * 1080;
    let best: { layer: LayerInfo; area: number } | null = null;
    for (const l of layers) {
      const { rect } = l;
      if (x < rect.x - 6 || x > rect.x + rect.w + 6 || y < rect.y - 6 || y > rect.y + rect.h + 6) continue;
      const area = rect.w * rect.h;
      if (!best || area < best.area) best = { layer: l, area };
    }
    return best?.layer ?? null;
  };

  const go = (delta: 1 | -1) => {
    const to = index + delta;
    if (!renderer || to < 0 || to >= slides.length) return;
    setScrub(null);
    skipShow.current = true;
    select(slides[to].id);
    void renderer.transition(to, { from: index, direction: delta });
  };

  const def = t ? TRANSITIONS[t.type] : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid min-h-0 flex-1 place-items-center px-6 pt-6">
        <div className="relative w-full" style={{ width: 'min(100%, calc((100vh - 56px - 200px) * 16 / 9))' }}>
          <div
            ref={containerRef}
            className={cn(
              'aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-[var(--shadow-pop)] ring-1 ring-line',
              hoverId && 'cursor-pointer',
            )}
            aria-label="Pratinjau langsung WebGL"
            onPointerMove={(e) => {
              const l = pickLayer(e);
              const id = l?.id ?? null;
              if (id !== hoverId) setHoverId(id);
            }}
            onPointerLeave={() => setHoverId(null)}
            onClick={(e) => {
              const l = pickLayer(e);
              const ui = useUIStore.getState();
              ui.selectLayer(l?.id ?? null);
              ui.selectRole(l?.motionRole ?? null);
              // Elemen terpilih → langsung ke panel Posisi (kecuali sedang di panel Gerak).
              if (l && ui.leftTab !== 'motion') ui.setLeftTab('layout');
            }}
          />
          {slide && (
            <LayerOverlay layers={layers} slideId={slide.id} containerRef={containerRef} hoverId={hoverId} pick={pickLayer} />
          )}
          {stats && (
            <div className="glass pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium text-fg">
              <span className={cn('size-1.5 rounded-full', stats.degraded ? 'bg-amber-400' : 'bg-emerald-400')} />
              {BACKEND_LABEL[stats.backend]}
              <span className="tabular-nums opacity-80">{stats.fps} FPS</span>
              <span className="opacity-60">· {TIER_LABEL[stats.tier]} · tekstur {stats.texWidth}px</span>
              {stats.degraded && <span className="text-amber-400">· diturunkan otomatis</span>}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-6 pb-5 pt-4">
        <div className="glass flex flex-wrap items-center gap-2 rounded-2xl border border-line px-3 py-2.5">
          <IconButton label="Slide sebelumnya" onClick={() => go(-1)} disabled={index <= 0}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <IconButton label="Slide berikutnya" onClick={() => go(1)} disabled={index < 0 || index >= slides.length - 1}>
            <ChevronRight className="size-4" />
          </IconButton>
          <span className="w-16 text-center text-xs tabular-nums text-muted">
            {index + 1} / {slides.length}
          </span>
          <Button size="sm" variant="primary" icon={<Play className="size-3.5" />} onClick={play}>
            Putar transisi
          </Button>

          <div className="ml-auto flex min-w-[220px] flex-1 items-center gap-2.5">
            <Gauge className="size-4 shrink-0 text-muted" aria-hidden />
            <input
              type="range"
              className="min-w-0 flex-1"
              min={0}
              max={1}
              step={0.005}
              value={scrub ?? 1}
              aria-label="Scrub progres transisi"
              onChange={(e) => setScrub(Number(e.target.value))}
            />
            {scrub !== null ? (
              <IconButton
                label="Kembali ke slide"
                onClick={() => {
                  setScrub(null);
                  renderer?.show(index);
                }}
              >
                <RotateCcw className="size-3.5" />
              </IconButton>
            ) : (
              <span className="w-8" />
            )}
          </div>
        </div>
        {def && t && (
          <p className="mt-2 text-center text-[11px] text-muted">
            Transisi masuk: <span className="font-medium text-fg">{def.label}</span> · {t.duration.toFixed(1)} dtk · {Math.round(t.intensity * 100)}%
            {scrub !== null && <span className="text-accent"> · scrub {Math.round(scrub * 100)}%</span>}
          </p>
        )}
      </div>
    </div>
  );
}
