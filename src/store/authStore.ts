import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase, supabaseConfigured } from '../services/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  /** null = belum diketahui/sedang dimuat; angka = saldo kredit tersinkron dari server. */
  credits: number | null;
  /** True selagi status sesi awal belum diketahui (mencegah kedipan UI saat memuat halaman). */
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshCredits: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  credits: null,
  loading: supabaseConfigured,

  signInWithGoogle: async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, credits: null });
  },
  refreshCredits: async () => {
    const uid = get().user?.id;
    if (!uid) return;
    const { data } = await supabase.from('users').select('credits').eq('id', uid).single();
    if (data) set({ credits: data.credits as number });
  },
}));

if (supabaseConfigured) {
  // Satu-satunya langganan status sesi untuk seluruh aplikasi — dipasang sekali saat modul ini
  // pertama kali diimpor (bukan di dalam komponen, supaya tidak terpasang berkali-kali / terlepas saat unmount).
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.setState({ session, user: session?.user ?? null, loading: false });
    if (session?.user) void useAuthStore.getState().refreshCredits();
  });

  // Kredit bisa berubah di tab lain (mis. setelah menyelesaikan pembayaran Xendit di tab baru) —
  // sinkronkan ulang setiap kali pengguna kembali fokus ke tab ini.
  window.addEventListener('focus', () => {
    if (useAuthStore.getState().user) void useAuthStore.getState().refreshCredits();
  });
}
