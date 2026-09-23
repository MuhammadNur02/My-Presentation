import { Check, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { resolveTheme } from '../../engine';
import { GENERATION_STEPS, runGeneration } from '../../services/ai/designEngine';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { cn } from '../../utils/cn';
import { StageShell } from '../common/StageShell';
import { Button } from '../common/ui';

/** Tahap 2 — Mesin AI "Generate": layout cerdas, animasi elemen, gambar kontekstual, matriks morph. */
export function GeneratingStage() {
  const [step, setStep] = useState(0);
  const [fraction, setFraction] = useState(0);
  // Selector harus mengembalikan referensi stabil; turunkan judul di luar selector.
  const slides = useProjectStore((s) => s.project?.slides);
  const titles = useMemo(() => (slides ?? []).slice(0, 8).map((sl) => sl.title), [slides]);

  useEffect(() => {
    const ac = new AbortController();
    const { project } = useProjectStore.getState();
    const ui = useUIStore.getState();
    if (!project) {
      ui.setStage('onboarding');
      return;
    }

    (async () => {
      try {
        const result = await runGeneration({
          project,
          theme: resolveTheme(project.theme),
          onProgress: (s, f) => {
            setStep(s);
            setFraction(f);
          },
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        const store = useProjectStore.getState();
        result.assets.forEach((a) => store.addAsset(a));
        store.setSlides(result.slides);
        store.saveSnapshot('Hasil Generate AI');
        ui.selectSlide(result.slides[0]?.id ?? null);
        ui.setLeftTab('slide');
        ui.setStage('studio');
        ui.toast('Deck siap! Sempurnakan di studio atau langsung mulai presentasi.', 'success');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error(err);
        ui.toast(err instanceof Error ? `Generate gagal: ${err.message}` : 'Generate gagal', 'error');
        ui.setStage('outline');
      }
    })();

    return () => ac.abort();
  }, []);

  const overall = Math.min(1, (step + fraction) / GENERATION_STEPS.length);

  return (
    <StageShell className="aurora relative grid place-items-center overflow-hidden px-6">
      {/* Orb latar */}
      <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden>
        <div className="absolute left-[12%] top-[18%] size-[36vmax] rounded-full bg-violet-500/25 blur-3xl" style={{ animation: 'orb 14s ease-in-out infinite' }} />
        <div className="absolute bottom-[8%] right-[10%] size-[32vmax] rounded-full bg-cyan-400/20 blur-3xl" style={{ animation: 'orb 18s ease-in-out infinite reverse' }} />
        <div className="absolute left-[40%] top-[52%] size-[26vmax] rounded-full bg-rose-400/15 blur-3xl" style={{ animation: 'orb 22s ease-in-out infinite' }} />
      </div>

      <div className="glass relative w-full max-w-xl rounded-[28px] border border-line p-8 shadow-(--shadow-pop)" role="status" aria-live="polite">
        <h1 className="text-2xl font-semibold tracking-tight">AI sedang merancang presentasi Anda</h1>
        <p className="mt-1.5 text-sm text-muted">Beberapa detik saja — menyusun tata letak, animasi, gambar, dan transisi 3D.</p>

        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-field-hover">
          <div
            className="h-full rounded-full bg-linear-to-r from-violet-500 via-fuchsia-400 to-cyan-400 transition-[width] duration-500"
            style={{ width: `${overall * 100}%` }}
          />
        </div>

        <ol className="mt-6 space-y-3.5">
          {GENERATION_STEPS.map((s, i) => {
            const done = i < step || (i === step && fraction >= 1);
            const active = i === step && !done;
            return (
              <li key={s.id} className={cn('flex items-center gap-3 text-sm transition', !done && !active && 'opacity-40')}>
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full text-white',
                    done ? 'bg-emerald-500' : active ? 'bg-accent' : 'bg-field-hover text-muted',
                  )}
                >
                  {done ? <Check className="size-3.5" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : <span className="text-[11px]">{i + 1}</span>}
                </span>
                <span className="flex-1">{s.label}</span>
                {active && fraction > 0 && <span className="text-xs tabular-nums text-muted">{Math.round(fraction * 100)}%</span>}
              </li>
            );
          })}
        </ol>

        {titles.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-1.5" aria-hidden>
            {titles.map((t, i) => (
              <span key={i} className="max-w-40 truncate rounded-full bg-field px-2.5 py-1 text-[11px] text-muted">
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => useUIStore.getState().setStage('outline')}>
            Batal
          </Button>
        </div>
      </div>
    </StageShell>
  );
}
