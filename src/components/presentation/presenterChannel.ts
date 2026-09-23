/**
 * Kontrak pesan `BroadcastChannel` antara jendela presentasi (audiens) dan konsol presenter
 * (`PresenterConsole.tsx`) pada mode "Layar Ganda" — dua jendela browser terpisah (dua konteks JS
 * berbeda, TIDAK berbagi state React/Zustand), disinkronkan lewat API standar ini saja, tanpa server.
 */
export const PRESENTER_CHANNEL = 'morphdeck-presenter';

export interface PresenterState {
  index: number;
  total: number;
  title: string;
  notes: string;
  nextTitle: string | null;
  step: { done: number; total: number };
}

export type PresenterCommand = 'next' | 'prev' | 'restart';

export type PresenterMessage =
  | { type: 'state'; state: PresenterState }
  | { type: 'closed' } // dikirim jendela presentasi saat presentasi berakhir → konsol menutup diri
  | { type: 'cmd'; cmd: PresenterCommand } // dikirim konsol → jendela presentasi menjalankan navigasi
  | { type: 'consoleClosed' }; // dikirim konsol saat ditutup manual → jendela presentasi tahu koneksi putus
