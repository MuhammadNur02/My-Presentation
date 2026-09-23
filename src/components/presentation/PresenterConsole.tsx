import { Redo2, RotateCcw, Undo2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { stripRichText } from '../../engine/richText';
import { Button } from '../common/ui';
import { PRESENTER_CHANNEL, type PresenterCommand, type PresenterMessage, type PresenterState } from './presenterChannel';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Jendela KEDUA (mandiri, terpisah dari jendela presentasi) untuk mode "Layar Ganda": presenter
 * melihat ini di layar sendiri (laptop), sementara jendela presentasi tampil bersih tanpa catatan
 * di layar lain (proyektor). Tidak berbagi state React/Zustand dengan jendela utama sama sekali
 * (dua konteks JS terpisah) — semuanya lewat `BroadcastChannel`, lihat `presenterChannel.ts`.
 */
export function PresenterConsole() {
  const [state, setState] = useState<PresenterState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const bc = new BroadcastChannel(PRESENTER_CHANNEL);
    channelRef.current = bc;
    bc.onmessage = (e: MessageEvent<PresenterMessage>) => {
      if (e.data.type === 'state') setState(e.data.state);
      else if (e.data.type === 'closed') window.close();
    };
    const onBeforeUnload = () => bc.postMessage({ type: 'consoleClosed' } satisfies PresenterMessage);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      channelRef.current = null;
      bc.close();
    };
  }, []);

  const send = useCallback((cmd: PresenterCommand) => channelRef.current?.postMessage({ type: 'cmd', cmd } satisfies PresenterMessage), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') send('next');
      else if (e.key === 'ArrowLeft') send('prev');
      else if (e.key.toLowerCase() === 'r') send('restart');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [send]);

  return (
    <div className="flex h-full flex-col bg-neutral-950 p-5 text-neutral-100">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
        <span>Konsol Presenter</span>
        <div className="flex items-center gap-3">
          <span className="tabular-nums">
            {pad(Math.floor(elapsed / 60))}:{pad(elapsed % 60)}
          </span>
          <button onClick={() => window.close()} aria-label="Tutup" className="text-neutral-500 hover:text-neutral-200">
            <X className="size-4" />
          </button>
        </div>
      </div>

      {!state ? (
        <div className="grid flex-1 place-items-center text-center text-sm text-neutral-500">Menunggu presentasi dimulai di jendela utama…</div>
      ) : (
        <>
          <div className="mt-4 text-xs tabular-nums text-neutral-500">
            Slide {pad(state.index + 1)} / {pad(state.total)}
            {state.step.total > 0 && ` · poin ${state.step.done}/${state.step.total}`}
          </div>
          <h1 className="mt-1 text-2xl font-semibold leading-tight">{stripRichText(state.title)}</h1>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-200">
            {state.notes.trim() || <span className="text-neutral-500">Tidak ada catatan untuk slide ini.</span>}
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-400">
            {state.nextTitle ? (
              <>
                Berikutnya: <span className="text-neutral-200">{stripRichText(state.nextTitle)}</span>
              </>
            ) : (
              'Slide terakhir'
            )}
          </div>
        </>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Button variant="secondary" icon={<Undo2 className="size-4" />} onClick={() => send('prev')}>
          Mundur
        </Button>
        <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => send('restart')}>
          Ulangi
        </Button>
        <Button variant="primary" icon={<Redo2 className="size-4" />} onClick={() => send('next')}>
          Maju
        </Button>
      </div>
    </div>
  );
}
