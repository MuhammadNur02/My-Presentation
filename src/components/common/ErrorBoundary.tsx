import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui';

interface State {
  error: Error | null;
}

/** Mencegah layar kosong total bila ada galat render; pengguna bisa kembali tanpa kehilangan proyek. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[MorphDeck] Galat render', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="glass max-w-md rounded-3xl border border-line p-7 text-center shadow-(--shadow-pop)">
          <h1 className="text-lg font-semibold">Terjadi kesalahan tak terduga</h1>
          <p className="mt-2 text-sm text-muted">Proyek Anda tersimpan otomatis dan tidak hilang. Coba kembali ke beranda atau muat ulang halaman.</p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-xl bg-field p-3 text-left text-[11px] text-muted">{this.state.error.message}</pre>
          <div className="mt-5 flex justify-center gap-2">
            <Button
              onClick={() => {
                // Navigasi paksa (bukan lewat router — ErrorBoundary harus tetap bekerja meski
                // Router sendiri yang bermasalah) sekaligus me-refresh seluruh state aplikasi.
                window.location.assign('/dashboard/projects');
              }}
            >
              Ke beranda
            </Button>
            <Button variant="primary" onClick={() => location.reload()}>
              Muat ulang
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
