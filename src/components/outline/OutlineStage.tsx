import { ArrowLeft, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { BrandName } from '../common/Brand';
import { StageShell } from '../common/StageShell';
import { Button, IconButton } from '../common/ui';
import { SlideEditor } from '../studio/SlideEditor';
import { SlideList } from '../studio/SlideList';
import { ThemePanel } from '../studio/ThemePanel';

/**
 * Tahap 1 — Tinjau struktur & atur dasar: koreksi teks, unggah gambar/logo, pilih tema global,
 * lalu tekan "Generate" untuk menjalankan mesin AI (layout, animasi, gambar, transisi morph).
 */
export function OutlineStage() {
  const project = useProjectStore((s) => s.project);
  const setName = useProjectStore((s) => s.setName);
  const selectedId = useUIStore((s) => s.selectedSlideId);

  useEffect(() => {
    if (project?.slides.length && !project.slides.some((s) => s.id === selectedId)) {
      useUIStore.getState().selectSlide(project.slides[0].id);
    }
  }, [project, selectedId]);

  if (!project) return null;
  const slide = project.slides.find((s) => s.id === selectedId) ?? project.slides[0];

  const generate = () => {
    useProjectStore.getState().saveSnapshot('Sebelum Generate');
    useUIStore.getState().setStage('generating');
  };

  return (
    <StageShell className="flex flex-col">
      <header className="glass flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <IconButton label="Kembali" onClick={() => useUIStore.getState().setStage('onboarding')}>
          <ArrowLeft className="size-4" />
        </IconButton>
        <BrandName />
        <span className="h-5 w-px bg-line" />
        <div className="hidden text-xs text-muted sm:block">
          <span className="font-semibold text-fg">Tahap 1</span> · Tinjau struktur & tema global
        </div>
        <input
          value={project.name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nama proyek"
          className="ml-auto w-56 min-w-0 rounded-lg bg-transparent px-2 py-1 text-sm font-medium transition hover:bg-field focus:bg-field focus:outline-none"
        />
        <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={generate}>
          Generate
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_340px]">
        <aside className="glass flex min-h-0 border-r border-line max-md:hidden">
          <SlideList className="w-full" />
        </aside>
        <main className="min-h-0 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-6 py-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold tracking-tight">Slide {project.slides.indexOf(slide) + 1}</h2>
              <p className="text-sm text-muted">
                Periksa teks tiap slide dan tambahkan gambar atau logo Anda. Tata letak, animasi, dan transisi akan dirancang AI saat Generate.
              </p>
            </div>
            {slide && <SlideEditor key={slide.id} slide={slide} basic />}
          </div>
        </main>
        <aside className="glass hidden min-h-0 overflow-y-auto border-l border-line p-5 xl:block">
          <ThemePanel />
        </aside>
      </div>
    </StageShell>
  );
}
