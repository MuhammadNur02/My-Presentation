import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

/** True bila proyek ini punya backend hosted (Supabase) terpasang — dipakai untuk menyembunyikan UI akun/kredit bila belum diatur. */
export const supabaseConfigured = !!url && !!anonKey;

// `createClient` tidak melakukan koneksi jaringan apa pun sampai dipakai, jadi aman dipanggil
// dengan nilai kosong/placeholder saat backend belum dikonfigurasi (mis. clone lokal tanpa .env).
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'public-anon-placeholder');

/** URL Edge Function proxy Claude — mengikuti pola baku Supabase (`<SUPABASE_URL>/functions/v1/<nama>`). */
export const CLAUDE_PROXY_URL = url ? `${url}/functions/v1/claude-proxy` : '';
