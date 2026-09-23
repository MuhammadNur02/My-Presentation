import { supabase } from './supabase';

/**
 * Kendali dari HP presenter: kanal Supabase Realtime PUBLIK, disepakati lewat kode sesi acak — satu-
 * satunya cara jendela presentasi (laptop) dan ponsel presenter (perangkat TERPISAH) bisa saling
 * bicara tanpa server/Edge Function tambahan. Beda dari mode Layar Ganda (`presenterChannel.ts`),
 * yang memakai `BroadcastChannel` bawaan browser — itu hanya jalan antar-JENDELA di browser yang
 * SAMA, tidak lintas perangkat. Status slide dikirim lewat tipe `PresenterState` yang sudah ada di
 * `presenterChannel.ts` (dipakai ulang apa adanya — bentuknya sama persis untuk kedua kanal).
 *
 * Tanpa otentikasi tambahan (sengaja, demi kesederhanaan pemakaian tatap muka langsung — pola sama
 * seperti kode PIN di Slido/PowerPoint "Present with phone"): siapa pun yang tahu 6 digit kode bisa
 * mengirim perintah navigasi selama sesi itu berlangsung. Tidak ada data sensitif yang mengalir di
 * kanal ini (hanya indeks/judul slide).
 */

export type RemoteCommand = 'next' | 'prev' | 'restart';

/** Kode sesi 6 digit acak — cukup unik untuk masa hidup satu presentasi, mudah diketik manual di HP. */
export function makeSessionCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function remoteChannelName(code: string): string {
  return `morphdeck-remote-${code}`;
}

/** Buka (belum `.subscribe()`) kanal Realtime untuk kode sesi ini — dipakai sisi presenter & sisi HP. */
export function openRemoteChannel(code: string) {
  return supabase.channel(remoteChannelName(code), { config: { broadcast: { self: false } } });
}
