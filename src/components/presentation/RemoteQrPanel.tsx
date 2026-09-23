import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * Panel mengambang di layar presenter saat "Kendali HP" aktif: kode 6 digit + QR yang mengarah ke
 * `/remote?code=…`. Memindai/mengetik kode ini di ponsel lain menghubungkannya lewat kanal Realtime
 * (lihat `services/remoteControl.ts`) — sepenuhnya terpisah dari mode Layar Ganda.
 */
export function RemoteQrPanel({ code, onClose }: { code: string; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const url = `${location.origin}/remote?code=${code}`;
    QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: '#0a0a0f', light: '#ffffff' } })
      .then((data) => alive && setQr(data))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <aside
      data-no-nav
      className="pop-in absolute bottom-24 left-5 flex w-[min(280px,calc(100vw-2.5rem))] flex-col items-center gap-3 rounded-2xl border border-white/10 bg-neutral-900/85 p-4 text-center text-neutral-100 shadow-2xl backdrop-blur-xl"
    >
      <div className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
        <span>Kendali HP aktif</span>
        <button onClick={onClose} aria-label="Nonaktifkan Kendali HP" className="text-neutral-500 hover:text-neutral-200">
          <X className="size-3.5" />
        </button>
      </div>
      {qr ? (
        <img src={qr} alt="Kode QR Kendali HP" className="size-40 rounded-lg bg-white p-2" />
      ) : (
        <div className="grid size-40 place-items-center text-xs text-neutral-500">Memuat QR…</div>
      )}
      <div className="text-2xl font-bold tabular-nums tracking-[0.25em]">{code}</div>
      <p className="text-[11px] leading-relaxed text-neutral-400">
        Pindai kode ini, atau buka <span className="text-neutral-200">{location.host}/remote</span> di HP lalu masukkan kodenya.
      </p>
    </aside>
  );
}
