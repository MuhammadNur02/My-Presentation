import type { RealtimeChannel } from '@supabase/supabase-js';
import { Redo2, RotateCcw, Undo2, Wifi } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { stripRichText } from '../../engine/richText';
import { openRemoteChannel, type RemoteCommand } from '../../services/remoteControl';
import { supabase, supabaseConfigured } from '../../services/supabase';
import { BrandName } from '../common/Brand';
import { Button, inputClass } from '../common/ui';
import type { PresenterState } from './presenterChannel';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Halaman PUBLIK (tanpa login) untuk mengendalikan presentasi dari ponsel — dibuka dari HP lewat
 * pemindaian QR atau mengetik kode 6 digit yang tampil di layar presenter (lihat `RemoteQrPanel.tsx`).
 * Beda dari mode Layar Ganda (`PresenterConsole.tsx`, `BroadcastChannel`, satu komputer dua layar):
 * ini lewat Supabase Realtime, jadi bekerja dari PERANGKAT lain sama sekali.
 */
export function RemoteControlPage() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(() => (params.get('code') ?? '').replace(/\D/g, '').slice(0, 6));
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [state, setState] = useState<PresenterState | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const disconnect = useCallback(() => {
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setStatus('idle');
    setState(null);
  }, []);

  const connect = useCallback(
    (c: string) => {
      if (c.length !== 6) return;
      disconnect();
      setStatus('connecting');
      const ch = openRemoteChannel(c);
      ch.on('broadcast', { event: 'state' }, ({ payload }: { payload: PresenterState }) => setState(payload));
      ch.subscribe((s) => {
        if (s === 'SUBSCRIBED') setStatus('connected');
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setStatus('error');
      });
      channelRef.current = ch;
    },
    [disconnect],
  );

  // Kode sudah ada di URL (hasil pindai QR) → langsung hubungkan begitu halaman dibuka.
  useEffect(() => {
    if (code.length === 6) connect(code);
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = (cmd: RemoteCommand) => void channelRef.current?.send({ type: 'broadcast', event: 'cmd', payload: { cmd } });

  if (!supabaseConfigured) {
    return (
      <div className="grid h-dvh place-items-center bg-neutral-950 p-6 text-center text-sm text-neutral-400">
        Fitur Kendali HP membutuhkan backend yang belum diatur di aplikasi ini.
      </div>
    );
  }

  if (status !== 'connected') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-neutral-950 px-6 text-neutral-100">
        <BrandName />
        <p className="text-center text-sm text-neutral-400">Masukkan kode 6 digit yang tampil di layar presenter.</p>
        <input
          inputMode="numeric"
          autoFocus
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => e.key === 'Enter' && connect(code)}
          placeholder="123456"
          className={`${inputClass} w-48 text-center text-2xl tracking-[0.3em]`}
        />
        <Button variant="primary" disabled={code.length !== 6} onClick={() => connect(code)}>
          {status === 'connecting' ? 'Menghubungkan…' : 'Hubungkan'}
        </Button>
        {status === 'error' && <p className="text-sm text-red-400">Gagal terhubung — periksa kode atau koneksi internet.</p>}
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-neutral-950 p-5 text-neutral-100">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
        <span className="flex items-center gap-1.5 text-emerald-400">
          <Wifi className="size-3.5" /> Terhubung
        </span>
        <button onClick={disconnect} className="text-neutral-500 hover:text-neutral-200">
          Putuskan
        </button>
      </div>

      {!state ? (
        <div className="grid flex-1 place-items-center text-center text-sm text-neutral-500">Menunggu presentasi dimulai di layar utama…</div>
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

      <div className="mt-4 grid grid-cols-3 gap-2 pb-[env(safe-area-inset-bottom)]">
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
