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
/**
 * HARUS sama dengan `HOSTED_MODEL` di `src/services/supabase.ts`. Biaya kredit dihitung berasumsi
 * model ini — tanpa dipaksakan di sini, siapa pun yang memanggil endpoint ini langsung (bukan lewat
 * UI) bisa minta model lain yang lebih mahal atau `max_tokens` raksasa, tetap cuma bayar 1 kredit flat.
 */
const HOSTED_MODEL = 'claude-sonnet-5';
/** Pemakaian sah terbesar saat ini (outline lengkap) minta 12000 — beri sedikit ruang, bukan tak terbatas. */
const MAX_TOKENS_CEILING = 16000;

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') {
    return json({ type: 'error', error: { type: 'invalid_request_error', message: 'Method not allowed' } }, 405, cors);
  }

  // 1) "x-api-key" di sini adalah ACCESS TOKEN SUPABASE pengguna, bukan kunci Anthropic — lihat komentar atas.
  const accessToken = req.headers.get('x-api-key') ?? '';
  if (!accessToken) {
    return json({ type: 'error', error: { type: 'authentication_error', message: 'Masuk dengan akun Google diperlukan.' } }, 401, cors);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData.user) {
    return json({ type: 'error', error: { type: 'authentication_error', message: 'Sesi masuk tidak valid — silakan masuk ulang.' } }, 401, cors);
  }
  const uid = userData.user.id;

  // 2) Baca & kunci field yang mempengaruhi biaya SEBELUM memotong kredit — badan permintaan boleh
  //    membawa apa pun (messages, system, tools, dst.), tapi model & batas token WAJIB dikendalikan
  //    di sini, supaya biaya Anthropic asli tidak pernah bisa melebihi yang sudah diperhitungkan di
  //    harga kredit (tanpa ini, siapa pun yang memanggil endpoint ini langsung — bukan lewat UI —
  //    bisa minta model lain yang lebih mahal atau `max_tokens` raksasa, tetap cuma bayar 1 kredit).
  const rawBody = await req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ type: 'error', error: { type: 'invalid_request_error', message: 'Badan permintaan bukan JSON yang valid.' } }, 400, cors);
  }
  payload.model = HOSTED_MODEL;
  if (typeof payload.max_tokens !== 'number' || !Number.isFinite(payload.max_tokens) || payload.max_tokens < 1 || payload.max_tokens > MAX_TOKENS_CEILING) {
    payload.max_tokens = MAX_TOKENS_CEILING;
  }
  const body = JSON.stringify(payload);

  // 3) Potong kredit SEBELUM memanggil Anthropic (fungsi SQL atomik) — kalau habis, tolak di sini
  //    tanpa membebani biaya API sama sekali.
  const { error: spendErr } = await supabase.rpc('spend_credits', { p_uid: uid, p_amount: CREDIT_COST_PER_CALL });
  if (spendErr) {
    if (spendErr.message.includes('INSUFFICIENT_CREDITS')) {
      return json({ type: 'error', error: { type: 'insufficient_credits', message: 'Kredit Anda habis. Isi ulang untuk melanjutkan.' } }, 402, cors);
    }
    return json({ type: 'error', error: { type: 'internal_error', message: spendErr.message } }, 500, cors);
  }

  const refund = async (note: string) => {
    const { error } = await supabase.rpc('add_credits', { p_uid: uid, p_amount: CREDIT_COST_PER_CALL, p_note: note });
    if (error) console.error('Gagal mengembalikan kredit:', error.message);
  };

  // 4) Teruskan ke Anthropic dengan kunci ASLI (server-only secret).
  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': ANTHROPIC_VERSION },
      body,
    });
    const text = await upstream.text();
    if (upstream.status >= 400) {
      // Anthropic menolak permintaan (mis. saldo API akun ini habis, topik ditolak, dll.) — kembalikan
      // kredit yang sudah dipotong di langkah 3 supaya pengguna tidak membayar untuk permintaan gagal.
      await refund(`Pengembalian otomatis — Anthropic mengembalikan galat ${upstream.status}`);
    }
    return new Response(text, {
      status: upstream.status,
      headers: { ...cors, 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    // Anthropic sama sekali tidak terhubungi (bukan sekadar menolak) — kembalikan kredit juga.
    await refund('Pengembalian otomatis — tidak dapat menghubungi Anthropic');
    return json(
      { type: 'error', error: { type: 'api_error', message: `Tidak dapat menghubungi Anthropic: ${err instanceof Error ? err.message : 'galat jaringan'}` } },
      502,
      cors,
    );
  }
});
