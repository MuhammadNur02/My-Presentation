import { Copy, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { stripRichText } from '../../engine/richText';
import { useDeckData } from '../../hooks/useDeckData';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { cn } from '../../utils/cn';
import { Button } from '../common/ui';
import { SlideThumbnail } from './SlideThumbnail';

/** Manajemen urutan slide: pilih, drag-and-drop untuk mengurutkan, duplikat, hapus, tambah. */
export function SlideList({ className }: { className?: string }) {
  const deck = useDeckData();
  const slides = useProjectStore((s) => s.project?.slides);
  const { moveSlide, addSlide, duplicateSlide, removeSlide } = useProjectStore.getState();
  const selectedId = useUIStore((s) => s.selectedSlideId);
  const select = useUIStore((s) => s.selectSlide);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  if (!deck || !slides) return null;
  const { theme, images, logoId } = deck;

  const drop = (to: number) => {
    if (dragFrom !== null && dragFrom !== to) moveSlide(dragFrom, to);
    setDragFrom(null);
    setOverIndex(null);
  };

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <ol className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3" aria-label="Daftar slide">
        {slides.map((slide, i) => {
          const selected = slide.id === selectedId;
          return (
            <li
              key={slide.id}
              draggable
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(i));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (overIndex !== i) setOverIndex(i);
              }}
              onDragLeave={() => setOverIndex((o) => (o === i ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                drop(i);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setOverIndex(null);
              }}
              className={cn('group relative flex gap-2', dragFrom === i && 'opacity-40')}
            >
              {overIndex === i && dragFrom !== null && dragFrom !== i && (
                <span
                  className={cn('pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded bg-accent', dragFrom < i ? '-bottom-1.5' : '-top-1.5')}
                />
              )}
              <span className="w-4 shrink-0 pt-1 text-right text-[11px] font-medium tabular-nums text-muted">{i + 1}</span>
              <button
                onClick={() => select(slide.id)}
                aria-current={selected}
                aria-label={`Slide ${i + 1}: ${stripRichText(slide.title)}`}
                className={cn(
                  'relative min-w-0 flex-1 overflow-hidden rounded-lg ring-1 transition',
                  selected ? 'ring-2 ring-accent' : 'ring-line hover:ring-accent/50',
                )}
              >
                <SlideThumbnail
                  slide={slide}
                  index={i}
                  total={slides.length}
                  theme={theme}
                  imageUrl={slide.imageId ? images[slide.imageId] : undefined}
                  logoId={logoId}
                  logoUrl={logoId ? images[logoId] : undefined}
                  width={288}
                />
              </button>
              <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <MiniAction label="Duplikat" onClick={() => duplicateSlide(slide.id)}>
                  <Copy className="size-3" />
                </MiniAction>
                <MiniAction
                  label="Hapus"
                  disabled={slides.length <= 1}
                  onClick={() => {
                    if (slide.id === selectedId) select((slides[i + 1] ?? slides[i - 1])?.id ?? null);
                    removeSlide(slide.id);
                  }}
                >
                  <Trash2 className="size-3" />
                </MiniAction>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="border-t border-line p-3">
        <Button
          size="sm"
          className="w-full"
          icon={<Plus className="size-3.5" />}
          onClick={() => select(addSlide(selectedId).id)}
        >
          Slide
        </Button>
      </div>
    </div>
  );
}

function MiniAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="grid size-6 place-items-center rounded-md bg-black/60 text-white backdrop-blur hover:bg-black/80 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
