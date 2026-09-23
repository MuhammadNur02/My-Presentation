import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

/**
 * Proxy pencarian GIF GIPHY — pola SAMA seperti `search-unsplash`: wajib login (cegah
 * penyalahgunaan kuota bersama), TIDAK memotong kredit (API GIPHY gratis dipakai developer).
 * Kunci asli (`GIPHY_API_KEY`) hanya hidup di server, tidak pernah terkirim ke klien.
 */

const GIPHY_SEARCH_URL = 'https://api.giphy.com/v1/gifs/search';
const GIPHY_TRENDING_URL = 'https://api.giphy.com/v1/gifs/trending';
const GIPHY_API_KEY = Deno.env.get('GIPHY_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MAX_QUERY_LENGTH = 200;

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (!GIPHY_API_KEY) return json({ error: 'Fitur ini belum dikonfigurasi di server (kunci GIPHY belum diatur).' }, 503, cors);

  const authHeader = req.headers.get('authorization') ?? '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!accessToken) return json({ error: 'Masuk dengan akun Google diperlukan.' }, 401, cors);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData.user) return json({ error: 'Sesi masuk tidak valid — silakan masuk ulang.' }, 401, cors);

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const query = String(body.query ?? '').trim().slice(0, MAX_QUERY_LENGTH);
  const limit = Math.min(24, Math.max(1, Number(body.limit) || 12));
  const lang = body.lang === 'en' ? 'en' : 'id';

  try {
    const base = query ? GIPHY_SEARCH_URL : GIPHY_TRENDING_URL;
    const params = new URLSearchParams({ api_key: GIPHY_API_KEY, limit: String(limit), rating: 'g', lang });
    if (query) params.set('q', query);
    const upstream = await fetch(`${base}?${params}`);
    if (upstream.status === 429) return json({ error: 'Batas permintaan GIPHY tercapai. Coba lagi beberapa saat.' }, 429, cors);
    if (!upstream.ok) return json({ error: `GIPHY mengembalikan galat ${upstream.status}` }, 502, cors);
    const data = (await upstream.json()) as { data: unknown[] };
    return json({ data: data.data }, 200, cors);
  } catch (err) {
    return json({ error: `Tidak dapat menghubungi GIPHY: ${err instanceof Error ? err.message : 'galat jaringan'}` }, 502, cors);
  }
});
