import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

/** Placeholder generik untuk modul yang sudah masuk peta navigasi tapi belum dibangun (Fase 2). */
export function ComingSoonPage({ title, description, icon }: { title: string; description: string; icon: ReactNode }) {
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="glass max-w-md rounded-3xl border border-line p-8 text-center shadow-(--shadow-pop)">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</span>
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-line bg-field px-3 py-1 text-xs font-medium text-muted">
          <Sparkles className="size-3.5 text-accent" /> Segera hadir
        </span>
        <h1 className="mt-3 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
      </div>
    </div>
  );
}
