import { Activity, Clapperboard, FileText, Images, Move, Palette } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore, type LeftTab } from '../../store/uiStore';
import { cn } from '../../utils/cn';
import { StageShell } from '../common/StageShell';
import { AssetPanel } from './AssetPanel';
import { LayoutPanel } from './LayoutPanel';
import { LivePreview } from './LivePreview';
import { MotionPanel } from './MotionPanel';
import { SlideEditor } from './SlideEditor';
import { SlideList } from './SlideList';
import { ThemePanel } from './ThemePanel';
import { TopBar } from './TopBar';
import { TransitionPanel } from './TransitionPanel';

const TABS: { id: LeftTab; label: string; icon: ReactNode }[] = [
  { id: 'slide', label: 'Slide', icon: <FileText className="size-4" /> },
  { id: 'layout', label: 'Posisi', icon: <Move className="size-4" /> },
  { id: 'motion', label: 'Gerak', icon: <Activity className="size-4" /> },
  { id: 'transition', label: 'Transisi', icon: <Clapperboard className="size-4" /> },
  { id: 'assets', label: 'Aset', icon: <Images className="size-4" /> },
  { id: 'theme', label: 'Tema', icon: <Palette className="size-4" /> },
];

/**
 * Studio editing manual — antarmuka dual-panel (split-screen).
 *  Kiri : urutan slide + tab Slide / Posisi / Gerak / Transisi / Aset / Tema.
 *  Kanan: Live Monitor WebGL.
 */
export function Studio() {
  const slides = useProjectStore((s) => s.project?.slides);
  const selectedId = useUIStore((s) => s.selectedSlideId);
  const tab = useUIStore((s) => s.leftTab);
  const setTab = useUIStore((s) => s.setLeftTab);

  // Pastikan selalu ada slide terpilih yang valid (mis. setelah hapus/pulihkan versi).
  useEffect(() => {
    if (!slides?.length) return;
    if (!slides.some((s) => s.id === selectedId)) useUIStore.getState().selectSlide(slides[0].id);
  }, [slides, selectedId]);

  // Pintasan: F5 = mulai presentasi; Ctrl/Cmd+Z = urungkan; Ctrl/Cmd+Shift+Z atau Ctrl+Y = ulangi.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F5') {
        e.preventDefault();
        useUIStore.getState().startPresenting();
        return;
      }
      if (useUIStore.getState().presenting || useUIStore.getState().modal) return; // presentasi/dialog: tak ada undo/redo
      const t = e.target as HTMLElement | null;
      // Di kolom teks, undo/redo bawaan browser yang berlaku.
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        useProjectStore.getState().undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        useProjectStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const index = slides?.findIndex((s) => s.id === selectedId) ?? -1;
  const slide = slides?.[index];

  return (
    <StageShell className="flex flex-col">
      <TopBar />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(500px,42%)_1fr]">
        <aside className="glass order-2 flex min-h-0 border-line max-lg:border-t lg:order-1 lg:border-r">
          <SlideList className="w-44 shrink-0 border-r border-line" />
          <div className="flex min-w-0 flex-1 flex-col">
            <nav className="flex gap-1 border-b border-line p-2" role="tablist" aria-label="Panel editor">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12px] font-medium transition',
                    tab === t.id ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-field hover:text-fg',
                  )}
                >
                  {t.icon}
                  <span className="max-xl:hidden">{t.label}</span>
                </button>
              ))}
            </nav>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {slide ? (
                <div key={tab === 'theme' ? 'theme' : `${tab}-${slide.id}`}>
                  {tab === 'slide' && <SlideEditor slide={slide} />}
                  {tab === 'layout' && <LayoutPanel slide={slide} />}
                  {tab === 'motion' && <MotionPanel slide={slide} />}
                  {tab === 'transition' && <TransitionPanel slide={slide} index={index} />}
                  {tab === 'assets' && <AssetPanel slide={slide} />}
                  {tab === 'theme' && <ThemePanel />}
                </div>
              ) : null}
            </div>
          </div>
        </aside>
        <main className="order-1 min-h-0 max-lg:h-[46vh] lg:order-2">
          <LivePreview />
        </main>
      </div>
    </StageShell>
  );
}
