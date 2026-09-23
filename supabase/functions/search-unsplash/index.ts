import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

/**
 * Proxy pencarian foto Unsplash — pola SAMA seperti `claude-proxy`/`generate-image` (verifikasi
 * sesi pengguna dulu), TAPI TIDAK memotong kredit: Unsplash sendiri gratis dipakai developer (bukan
 * API berbayar seperti Anthropic/OpenAI) — wajib login di sini murni untuk mencegah penyalahgunaan/
 * kuota BERSAMA (satu kunci dipakai semua pengguna) habis, bukan untuk menagih pengguna.
 *
 * Kunci asli (`UNSPLASH_ACCESS_KEY`) hanya hidup di server, tidak pernah terkirim ke klien.
 */

const UNSPLASH_URL = 'https://api.unsplash.com/search/photos';
const UNSPLASH_ACCESS_KEY = Deno.env.get('UNSPLASH_ACCESS_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MAX_QUERY_LENGTH = 200;

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (!UNSPLASH_ACCESS_KEY) return json({ error: 'Fitur ini belum dikonfigurasi di server (kunci Unsplash belum diatur).' }, 503, cors);

  const authHeader = req.headers.get('authorization') ?? '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!accessToken) return json({ error: 'Masuk dengan akun Google diperlukan.' }, 401, cors);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData.user) return json({ error: 'Sesi masuk tidak valid — silakan masuk ulang.' }, 401, cors);

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const query = String(body.query ?? '').trim().slice(0, MAX_QUERY_LENGTH);
  const count = Math.min(10, Math.max(1, Number(body.count) || 6));
  if (!query) return json({ error: 'Kata kunci pencarian kosong.' }, 400, cors);

  try {
    const url = `${UNSPLASH_URL}?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape&content_filter=high`;
    const upstream = await fetch(url, { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } });
    if (!upstream.ok) return json({ error: `Unsplash mengembalikan galat ${upstream.status}` }, 502, cors);
    const data = (await upstream.json()) as { results: unknown[] };
    return json({ results: data.results }, 200, cors);
  } catch (err) {
    return json({ error: `Tidak dapat menghubungi Unsplash: ${err instanceof Error ? err.message : 'galat jaringan'}` }, 502, cors);
  }
});
