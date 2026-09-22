import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { CREDIT_PACKAGES, startCreditCheckout } from '../../services/payments';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { Modal } from '../common/Modal';

const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

/** Modal isi ulang kredit: daftar paket → buat transaksi Xendit → buka invoice di tab baru. */
export function BillingModal() {
  const modal = useUIStore((s) => s.modal);
  const credits = useAuthStore((s) => s.credits);
  const [busyId, setBusyId] = useState<string | null>(null);
  if (modal !== 'billing') return null;

  const close = () => useUIStore.getState().openModal(null);

  const buy = async (packageId: string) => {
    setBusyId(packageId);
    try {
      const url = await startCreditCheckout(packageId);
      window.open(url, '_blank', 'noopener');
      useUIStore.getState().toast('Jendela pembayaran dibuka di tab baru. Kredit bertambah otomatis setelah pembayaran sukses.', 'success');
      close();
    } catch (err) {
      useUIStore.getState().toast(err instanceof Error ? err.message : 'Gagal membuka pembayaran', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal title="Isi ulang kredit" onClose={close}>
      <p className="mb-4 text-sm text-muted">
        Sisa kredit Anda saat ini: <span className="font-semibold text-fg">{credits ?? '…'}</span>. 1 kredit = 1 kali membuat struktur slide dengan AI.
      </p>
      <div className="space-y-2.5">
        {CREDIT_PACKAGES.map((pkg) => (
          <button
            key={pkg.id}
            disabled={busyId !== null}
            onClick={() => void buy(pkg.id)}
            className="flex w-full items-center justify-between rounded-2xl border border-line bg-field p-4 text-left transition hover:border-accent/50 disabled:pointer-events-none disabled:opacity-60"
          >
            <span>
              <span className="block text-sm font-semibold">{pkg.name}</span>
              <span className="block text-xs text-muted">{pkg.credits} kali generate AI</span>
            </span>
            <span className="text-sm font-semibold text-accent">{busyId === pkg.id ? 'Memproses…' : idr.format(pkg.price)}</span>
          </button>
        ))}
      </div>
      <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-muted">
        <Sparkles className="mt-0.5 size-3.5 shrink-0" />
        Pembayaran diproses Xendit (QRIS, e-wallet, transfer bank, kartu). Kredit masuk otomatis begitu pembayaran sukses — kembali ke sini beberapa saat setelahnya untuk melihat saldo terbaru.
      </p>
    </Modal>
  );
}
