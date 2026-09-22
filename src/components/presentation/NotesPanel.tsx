import { StickyNote } from 'lucide-react';
import { useEffect, useState } from 'react';
import { stripRichText } from '../../engine/richText';
import type { Slide } from '../../types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Panel catatan pembicara untuk presenter: catatan slide, judul berikutnya, dan timer. */
export function NotesPanel({ slide, next }: { slide: Slide | undefined; next: Slide | undefined }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <aside
      data-no-nav
      className="pop-in absolute bottom-24 right-5 flex max-h-[46vh] w-[min(420px,calc(100vw-2.5rem))] flex-col rounded-2xl border border-white/10 bg-neutral-900/85 p-4 text-neutral-100 shadow-2xl backdrop-blur-xl"
    >
      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
        <span className="flex items-center gap-1.5">
          <StickyNote className="size-3.5" /> Catatan pembicara
        </span>
        <span className="tabular-nums">
          {pad(Math.floor(elapsed / 60))}:{pad(elapsed % 60)}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-[15px] leading-relaxed">
        {slide?.notes.trim() || <span className="text-neutral-500">Tidak ada catatan untuk slide ini.</span>}
      </div>
      <div className="mt-3 border-t border-white/10 pt-2 text-xs text-neutral-400">
        {next ? <>Berikutnya: <span className="text-neutral-200">{stripRichText(next.title)}</span></> : 'Slide terakhir'}
      </div>
    </aside>
  );
}
