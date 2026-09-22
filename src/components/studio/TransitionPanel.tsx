import {
  BookOpen,
  Aperture,
  Barcode,
  Box,
  CircleDot,
  DoorOpen,
  Dices,
  FlipHorizontal2,
  Globe,
  Grid3x3,
  LayoutGrid,
  Layers,
  MoveDiagonal,
  MoveHorizontal,
  Orbit,
  Play,
  Rocket,
  Rows3,
  RotateCw,
  Shapes,
  Sparkles,
  Tv,
  Wand2,
  Waves,
  Wind,
  Zap,
  ZoomIn,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { EASING_OPTIONS, TRANSITION_CATEGORIES, TRANSITION_LIST, defaultTransition } from '../../engine';
import { planTransitions } from '../../services/ai/designEngine';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { Slide, TransitionId } from '../../types';
import { cn } from '../../utils/cn';
import { Button, Field, SectionTitle, Slider, inputClass } from '../common/ui';

const ICON = 'size-[18px]';
const ICONS: Record<TransitionId, ReactNode> = {
  fade: <Sparkles className={ICON} />,
  slide: <MoveHorizontal className={ICON} />,
  wipe: <MoveDiagonal className={ICON} />,
  doors: <DoorOpen className={ICON} />,
  zoom: <ZoomIn className={ICON} />,
  cube: <Box className={ICON} />,
  flip: <FlipHorizontal2 className={ICON} />,
  carousel: <Orbit className={ICON} />,
  toss: <Layers className={ICON} />,
  spin: <RotateCw className={ICON} />,
  roll: <BookOpen className={ICON} />,
  morph: <Globe className={ICON} />,
  ripple: <Waves className={ICON} />,
  swirl: <Wind className={ICON} />,
  tiles: <LayoutGrid className={ICON} />,
  blinds: <Rows3 className={ICON} />,
  shatter: <Zap className={ICON} />,
  halftone: <CircleDot className={ICON} />,
  pixelate: <Grid3x3 className={ICON} />,
  glitch: <Tv className={ICON} />,
  magic: <Shapes className={ICON} />,
  crosszoom: <Rocket className={ICON} />,
  iris: <Aperture className={ICON} />,
  stripes: <Barcode className={ICON} />,
};

/** Pustaka transisi 3D/WebGL + parameter. Setiap perubahan otomatis diputar di Live Monitor. */
export function TransitionPanel({ slide, index }: { slide: Slide; index: number }) {
  const tone = useProjectStore((s) => s.project?.tone ?? 'professional');
  const replay = useUIStore((s) => s.replayPreview);
  const [category, setCategory] = useState<(typeof TRANSITION_CATEGORIES)[number] | 'Semua'>('Semua');
  const t = slide.transition;

  const update = (patch: Partial<typeof t>) => useProjectStore.getState().updateTransition(slide.id, patch);
  const list = category === 'Semua' ? TRANSITION_LIST : TRANSITION_LIST.filter((d) => d.category === category);

  /** Acak: pilih transisi berbeda untuk setiap slide (tanpa mengulang yang sama berurutan). */
  const shuffleAll = () => {
    const { project, setSlides } = useProjectStore.getState();
    if (!project) return;
    let prev: TransitionId | null = null;
    setSlides(
      project.slides.map((s) => {
        let pick: TransitionId;
        do pick = TRANSITION_LIST[Math.floor(Math.random() * TRANSITION_LIST.length)].id;
        while (pick === prev);
        prev = pick;
        return { ...s, transition: defaultTransition(pick) };
      }),
    );
    useUIStore.getState().toast('Setiap slide kini memakai transisi acak yang berbeda.', 'success');
  };

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>{index === 0 ? 'Intro slide pertama' : `Transisi masuk ke slide ${index + 1}`}</SectionTitle>

        <div className="-mx-1 mb-3 flex flex-wrap gap-1.5 px-1" role="tablist" aria-label="Kategori transisi">
          {(['Semua', ...TRANSITION_CATEGORIES] as const).map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                'rounded-full px-3 py-1 text-[12px] font-medium transition',
                category === c ? 'bg-accent text-white' : 'bg-field text-muted hover:text-fg',
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {list.map((def) => {
            const active = t.type === def.id;
            return (
              <button
                key={def.id}
                onClick={() => useProjectStore.getState().updateTransition(slide.id, defaultTransition(def.id))}
                aria-pressed={active}
                className={cn(
                  'group rounded-2xl border p-3 text-left transition',
                  active ? 'border-accent bg-accent-soft' : 'border-transparent bg-field hover:bg-field-hover',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn('grid size-8 place-items-center rounded-lg', active ? 'bg-accent text-white' : 'bg-field-hover text-muted group-hover:text-fg')}>
                    {ICONS[def.id]}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{def.category}</span>
                </div>
                <div className="mt-2 text-[13px] font-semibold">{def.label}</div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">{def.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Parameter</SectionTitle>
        <Slider label="Durasi" min={0.4} max={3.5} step={0.1} value={t.duration} format={(v) => `${v.toFixed(1)} dtk`} onChange={(v) => update({ duration: v })} />
        <Slider label="Intensitas efek" min={0.4} max={2} step={0.05} value={t.intensity} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update({ intensity: v })} />
        <Field label="Kurva percepatan (easing)">
          <select className={inputClass} value={t.easing} onChange={(e) => update({ easing: e.target.value as typeof t.easing })}>
            {EASING_OPTIONS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="grid grid-cols-1 gap-2">
        <Button variant="primary" icon={<Play className="size-4" />} onClick={replay}>
          Putar pratinjau transisi
        </Button>
        <Button icon={<Sparkles className="size-4" />} onClick={() => useProjectStore.getState().applyTransitionToAll(slide.id)}>
          Terapkan ke semua slide
        </Button>
        <Button icon={<Dices className="size-4" />} onClick={shuffleAll}>
          Acak transisi tiap slide
        </Button>
        <Button
          icon={<Wand2 className="size-4" />}
          onClick={() => {
            const { project, setSlides } = useProjectStore.getState();
            if (!project) return;
            setSlides(planTransitions(project.slides, tone, project.motionStyle));
            useUIStore.getState().toast('Transisi direncanakan ulang oleh AI untuk seluruh slide.', 'success');
          }}
        >
          Rencanakan ulang otomatis (AI)
        </Button>
      </section>
    </div>
  );
}
