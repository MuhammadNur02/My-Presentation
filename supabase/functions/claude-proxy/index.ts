import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

/**
 * Proxy Claude — MENIRU bentuk API Anthropic asli (`POST /v1/messages`) sehingga `@anthropic-ai/sdk`
 * di frontend bisa dipakai APA ADANYA, cukup diarahkan ke sini lewat `baseUrl`:
 *
 *   new Anthropic({ apiKey: <ACCESS TOKEN SUPABASE PENGGUNA>, baseURL: '.../functions/v1/claude-proxy' })
 *
 * SDK Anthropic selalu mengirim `apiKey` lewat header `x-api-key` — di sinilah triknya: untuk proxy
 * ini, isi header itu bukan kunci Anthropic, melainkan ACCESS TOKEN hasil login Google (Supabase Auth)
 * milik pengguna. Proxy yang memverifikasinya, mengecek & memotong kredit di Postgres (fungsi
 * `spend_credits`, atomik), BARU meneruskan body permintaan APA ADANYA ke Anthropic memakai kunci ASLI
 * yang tersimpan sebagai secret server (`supabase secrets set ANTHROPIC_API_KEY`). Kunci asli TIDAK
 * PERNAH terkirim ke client dalam bentuk apa pun.
 *
 * Kenapa satu fungsi untuk semua: `generateOutlineWithLLM` maupun `suggestSceneWithLLM` di frontend
 * sama-sama berujung memanggil `client.messages.create(...)` — jadi cukup satu proxy generik.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
/** 1 kredit = 1 panggilan AI (flat, untuk MVP — bisa dibedakan per jenis panggilan nanti). */
const CREDIT_COST_PER_CALL = 1;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return json({ type: 'error', error: { type: 'invalid_request_error', message: 'Method not allowed' } }, 405);
  }

  // 1) "x-api-key" di sini adalah ACCESS TOKEN SUPABASE pengguna, bukan kunci Anthropic — lihat komentar atas.
  const accessToken = req.headers.get('x-api-key') ?? '';
  if (!accessToken) {
    return json({ type: 'error', error: { type: 'authentication_error', message: 'Masuk dengan akun Google diperlukan.' } }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData.user) {
    return json({ type: 'error', error: { type: 'authentication_error', message: 'Sesi masuk tidak valid — silakan masuk ulang.' } }, 401);
  }
  const uid = userData.user.id;

  // 2) Potong kredit SEBELUM memanggil Anthropic (fungsi SQL atomik) — kalau habis, tolak di sini
  //    tanpa membebani biaya API sama sekali.
  const { error: spendErr } = await supabase.rpc('spend_credits', { p_uid: uid, p_amount: CREDIT_COST_PER_CALL });
  if (spendErr) {
    if (spendErr.message.includes('INSUFFICIENT_CREDITS')) {
      return json({ type: 'error', error: { type: 'insufficient_credits', message: 'Kredit Anda habis. Isi ulang untuk melanjutkan.' } }, 402);
    }
    return json({ type: 'error', error: { type: 'internal_error', message: spendErr.message } }, 500);
  }

  // 3) Teruskan body APA ADANYA ke Anthropic dengan kunci ASLI (server-only secret).
  try {
    const body = await req.text();
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': ANTHROPIC_VERSION },
      body,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders, 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
    // Catatan: kredit yang sudah dipotong di langkah 2 TIDAK dikembalikan otomatis bila Anthropic
    // mengembalikan galat (mis. topik ditolak) — trade-off kesederhanaan MVP. Kalau refund-per-galat
    // penting, panggil `supabase.rpc('add_credits', { p_uid: uid, p_amount: CREDIT_COST_PER_CALL, p_note: 'refund' })`
    // saat `upstream.status >= 400`.
  } catch (err) {
    return json(
      { type: 'error', error: { type: 'api_error', message: `Tidak dapat menghubungi Anthropic: ${err instanceof Error ? err.message : 'galat jaringan'}` } },
      502,
    );
  }
});
