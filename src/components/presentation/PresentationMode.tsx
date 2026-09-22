import { gsap } from 'gsap';
import { Expand, LogOut, RotateCcw, StickyNote } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { DeckPlayer, bindPresentationInput } from '../../engine';
import { useDeckData, usePresentationTier } from '../../hooks/useDeckData';
import { useDeckRenderer } from '../../hooks/useDeckRenderer';
import { useUIStore } from '../../store/uiStore';
import { cn } from '../../utils/cn';
import { Kbd } from '../common/ui';
import { NotesPanel } from './NotesPanel';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Mode presentasi sinematik layar penuh.
 *  - Navigasi: Arrow Right / Space (maju), Arrow Left (mundur), swipe/tap di layar sentuh.
 *  - Esc (atau keluar dari layar penuh) → menutup overlay, kembali ke studio, dan mereset presentasi.
 * Renderer WebGL khusus dibuat saat mount & dibuang penuh saat unmount, jadi "reset" otomatis bersih.
 */
export function PresentationMode() {
  const deck = useDeckData();
  const tier = usePresentationTier();
  const { containerRef, renderer } = useDeckRenderer(tier, undefined, true);

  const rootRef = useRef<HTMLDivElement>(null);
  const curtainRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<DeckPlayer | null>(null);
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const closing = useRef(false);
  const gotFullscreen = useRef(false);

  const [index, setIndex] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [hud, setHud] = useState(true);
  const [endHint, setEndHint] = useState(false);
  /** Reveal bertahap: progres poin/kartu slide aktif; total 0 = slide ini tidak memakainya. */
  const [step, setStep] = useState({ done: 0, total: 0 });
  const hudTimer = useRef<number>(0);

  const wakeHud = useCallback(() => {
    setHud(true);
    window.clearTimeout(hudTimer.current);
    hudTimer.current = window.setTimeout(() => setHud(false), 2600);
  }, []);

  /**
   * Keluar: tirai hitam menutup → overlay ditutup → toast dengan opsi mulai ulang.
   * Yang dianimasikan adalah TIRAI, bukan overlay itu sendiri: overlay harus selalu 100% buram
   * agar editor di belakangnya tidak pernah tembus pandang.
   */
  const exit = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setHud(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    gsap.to(curtainRef.current, {
      opacity: 1,
      duration: 0.35,
      ease: 'power2.out',
      onComplete: () => {
        const ui = useUIStore.getState();
        ui.stopPresenting();
        ui.toast('Presentasi direset ke slide pertama.', 'info', { label: 'Mulai lagi', run: () => useUIStore.getState().startPresenting() });
      },
    });
  }, []);

  // Masuk: tirai hitam memudar. fromTo dengan nilai eksplisit + gsap.context → aman terhadap
  // StrictMode (gsap.from yang dijalankan dua kali menangkap opasitas tengah-animasi dan membuat
  // overlay macet setengah transparan).
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(curtainRef.current, { opacity: 1 }, { opacity: 0, duration: 0.55, delay: 0.1, ease: 'power2.out' });
    });
    return () => ctx.revert();
  }, []);

  // Deteksi keluar dari layar penuh (Esc ditangani browser dan tidak selalu memicu keydown).
  // Layar penuh sendiri diminta oleh `startPresenting` di dalam gestur klik.
  useEffect(() => {
    if (document.fullscreenElement) gotFullscreen.current = true;
    const onFs = () => {
      if (document.fullscreenElement) gotFullscreen.current = true;
      else if (gotFullscreen.current) exit();
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [exit]);

  // Hubungkan renderer ↔ player begitu WebGL siap; mulai dengan intro sinematik.
  useEffect(() => {
    const data = deckRef.current;
    if (!renderer || !data) return;
    renderer.setData(data);
    const player = new DeckPlayer(renderer, () => deckRef.current?.slides.length ?? 0, {
      onChange: (i) => {
        setIndex(i);
        setEndHint(false);
        setStep({ done: 0, total: 0 }); // diperbarui lagi oleh onStep begitu slide selesai mendarat
      },
      onStep: (done, total) => setStep({ done, total }),
      onEnd: () => setEndHint(true),
    });
    playerRef.current = player;
    void player.start();
    return () => {
      playerRef.current = null;
    };
  }, [renderer]);

  // Input: keyboard + gesture.
  useEffect(() => {
    const root = rootRef.current!;
    return bindPresentationInput(root, {
      next: () => playerRef.current?.next(),
      prev: () => playerRef.current?.prev(),
      first: () => playerRef.current?.goTo(0),
      last: () => playerRef.current?.goTo((deckRef.current?.slides.length ?? 1) - 1),
      restart: () => playerRef.current?.restart(),
      exit,
      toggleNotes: () => setNotesOpen((v) => !v),
      toggleFullscreen: () => {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        else void root.requestFullscreen?.().catch(() => undefined);
      },
    });
  }, [exit]);

  useEffect(() => {
    wakeHud();
    return () => window.clearTimeout(hudTimer.current);
  }, [wakeHud]);

  const slides = deck?.slides ?? [];
  const total = slides.length;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 select-none bg-black"
      style={{ cursor: hud ? 'default' : 'none', touchAction: 'pan-y' }}
      onPointerMove={wakeHud}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* Tirai hitam untuk transisi masuk/keluar (overlay itu sendiri selalu buram penuh). */}
      <div ref={curtainRef} className="pointer-events-none absolute inset-0 z-30 bg-black" style={{ opacity: 1 }} aria-hidden />

      {endHint && (
        <div
          data-no-nav
          className="pop-in absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-neutral-900/85 px-4 py-2 text-sm text-neutral-100 backdrop-blur-xl"
        >
          Akhir presentasi — <Kbd>R</Kbd> ulangi · <Kbd>Esc</Kbd> keluar
        </div>
      )}

      {/* Reveal bertahap: petunjuk sekali saat mendarat di slide yang poinnya belum diungkap sama sekali. */}
      {!endHint && step.total > 0 && step.done === 0 && (
        <div
          data-no-nav
          className="pop-in absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-neutral-900/85 px-4 py-2 text-sm text-neutral-100 backdrop-blur-xl"
        >
          Tekan <Kbd>→</Kbd> untuk mengungkap poin berikutnya
        </div>
      )}

      {notesOpen && <NotesPanel slide={slides[index]} next={slides[index + 1]} />}

      <div
        data-no-nav
        className={cn(
          'absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent px-5 pb-4 pt-12 transition-opacity duration-300',
          hud ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <div className="h-[3px] overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-linear-to-r from-violet-400 to-cyan-300 transition-[width] duration-500"
            style={{ width: `${total ? ((index + 1) / total) * 100 : 0}%` }}
          />
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-white">
          <span className="tabular-nums opacity-80">
            {pad(index + 1)} / {pad(total)}
          </span>
          {step.total > 0 && (
            <span className="flex items-center gap-1" aria-label={`Poin ${step.done} dari ${step.total} terungkap`}>
              {Array.from({ length: step.total }, (_, i) => (
                <span key={i} className={cn('size-1.5 rounded-full transition-colors', i < step.done ? 'bg-white' : 'bg-white/25')} />
              ))}
            </span>
          )}
          <span className="flex-1" />
          <HudButton label="Catatan (N)" active={notesOpen} onClick={() => setNotesOpen((v) => !v)}>
            <StickyNote className="size-3.5" /> Catatan
          </HudButton>
          <HudButton label="Ulangi (R)" onClick={() => playerRef.current?.restart()}>
            <RotateCcw className="size-3.5" /> Ulangi
          </HudButton>
          <HudButton
            label="Layar penuh (F)"
            onClick={() =>
              document.fullscreenElement ? void document.exitFullscreen().catch(() => undefined) : void rootRef.current?.requestFullscreen?.().catch(() => undefined)
            }
          >
            <Expand className="size-3.5" />
          </HudButton>
          <HudButton label="Keluar (Esc)" onClick={exit}>
            <LogOut className="size-3.5" /> Keluar
          </HudButton>
        </div>
      </div>
    </div>
  );
}

function HudButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border border-white/20 px-3 text-xs backdrop-blur-md transition hover:bg-white/20',
        active ? 'bg-white/25' : 'bg-white/10',
      )}
    >
      {children}
    </button>
  );
}
