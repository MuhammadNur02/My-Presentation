import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { cn } from '../../utils/cn';

const ICON = { info: Info, success: CheckCircle2, error: AlertTriangle };
const TONE = { info: 'text-accent', success: 'text-emerald-500', error: 'text-red-500' };

export function Toaster() {
  const toasts = useUIStore((s) => s.toasts);
  const dismiss = useUIStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[80] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className="pop-in glass pointer-events-auto flex max-w-xl items-center gap-3 rounded-2xl border border-line px-4 py-3 text-sm shadow-[var(--shadow-pop)]"
          >
            <Icon className={cn('size-4 shrink-0', TONE[t.kind])} />
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.action && (
              <button
                className="shrink-0 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-white hover:brightness-110"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="shrink-0 text-muted hover:text-fg" aria-label="Tutup" onClick={() => dismiss(t.id)}>
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
