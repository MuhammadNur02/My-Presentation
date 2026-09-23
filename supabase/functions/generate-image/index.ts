import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

/**
 * Proxy AI Generate Gambar — pola SAMA seperti `claude-proxy`: verifikasi sesi pengguna, potong
 * kredit ATOMIK sebelum memanggil API pihak ketiga, baru panggil API memakai kunci ASLI yang
 * hanya hidup di server (secret `OPENAI_API_KEY`). Kunci asli TIDAK PERNAH terkirim ke klien.
 *
 * Model: **GPT Image 2** (OpenAI) — dipakai KEMBALI setelah opsi Google (Nano Banana Pro lalu
 * Nano Banana 2) gagal terus dengan 401 "Expected OAuth 2 access token": ternyata Google sedang
 * migrasi format kunci API (lama "AIzaSy..." → baru "AQ...") dan format barunya TERBUKTI belum
 * konsisten dipakai lewat REST API biasa — masalah luas & belum ada solusi resmi dari Google
 * sendiri (dikonfirmasi banyak developer lain di forum resminya). OpenAI memakai pola autentikasi
 * `Authorization: Bearer sk-...` yang jauh lebih matang & stabil.
 *
 * Penyimpanan hasil (Storage bucket `generated-images` + tabel `generated_images`) dilakukan oleh
 * KLIEN setelah menerima gambar dari sini (lihat `src/services/generatedImages.ts`).
 */

const OPENAI_URL = 'https://api.openai.com/v1/images/generations';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MAX_PROMPT_LENGTH = 600;

type Resolution = '1K' | '2K' | '4K';
// Biaya asli GPT Image 2: 1K ≈ $0.03/gambar (≈Rp480), 2K ≈ $0.05 (≈Rp800), 4K ≈ $0.08 (≈Rp1.280).
// Kredit disetel supaya tetap untung di semua paket harga (lihat services/payments.ts).
const RESOLUTION_COST: Record<Resolution, number> = { '1K': 1, '2K': 2, '4K': 3 };
// Ukuran lanskap per tingkat — 4K di atas 2560x1440 ditandai "eksperimental" oleh OpenAI sendiri
// (tetap didukung, hanya belum sepenuhnya divalidasi mereka).
const RESOLUTION_SIZE: Record<Resolution, string> = { '1K': '1536x1024', '2K': '2560x1440', '4K': '3840x2160' };

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  const authHeader = req.headers.get('authorization') ?? '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!accessToken) return json({ error: 'Masuk dengan akun Google diperlukan.' }, 401, cors);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData.user) return json({ error: 'Sesi masuk tidak valid — silakan masuk ulang.' }, 401, cors);
  const uid = userData.user.id;

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const prompt = String(body.prompt ?? '').trim();
  const resolution = (['1K', '2K', '4K'] as const).includes(body.resolution as Resolution) ? (body.resolution as Resolution) : '1K';
  if (!prompt) return json({ error: 'Tuliskan deskripsi gambar terlebih dahulu.' }, 400, cors);
  if (prompt.length > MAX_PROMPT_LENGTH) return json({ error: `Deskripsi maksimal ${MAX_PROMPT_LENGTH} karakter.` }, 400, cors);
  if (!OPENAI_API_KEY) return json({ error: 'Fitur ini belum dikonfigurasi di server (kunci OpenAI belum diatur).' }, 503, cors);

  const cost = RESOLUTION_COST[resolution];
  const { error: spendErr } = await supabase.rpc('spend_credits', { p_uid: uid, p_amount: cost });
  if (spendErr) {
    if (spendErr.message.includes('INSUFFICIENT_CREDITS')) {
      return json({ error: `Kredit tidak cukup — gambar ${resolution} butuh ${cost} kredit. Isi ulang untuk melanjutkan.`, code: 'insufficient_credits' }, 402, cors);
    }
    return json({ error: spendErr.message }, 500, cors);
  }

  const refund = async (note: string) => {
    const { error } = await supabase.rpc('add_credits', { p_uid: uid, p_amount: cost, p_note: note });
    if (error) console.error('Gagal mengembalikan kredit:', error.message);
  };

  try {
    const size = RESOLUTION_SIZE[resolution];
    const upstream = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'gpt-image-2', prompt, size, n: 1 }),
    });

    if (!upstream.ok) {
      await refund(`Pengembalian otomatis — OpenAI mengembalikan galat ${upstream.status}`);
      const detail = await upstream.text();
      return json({ error: `Gagal membuat gambar (${upstream.status}): ${detail.slice(0, 300)}` }, 502, cors);
    }

    const result = (await upstream.json()) as { data?: { b64_json?: string; url?: string }[] };
    const first = result.data?.[0];
    let b64 = first?.b64_json;
    if (!b64 && first?.url) {
      // Jaga-jaga bila API mengembalikan URL, bukan base64 — unduh & ubah sendiri.
      const imgRes = await fetch(first.url);
      const buf = new Uint8Array(await imgRes.arrayBuffer());
      let bin = '';
      buf.forEach((b) => (bin += String.fromCharCode(b)));
      b64 = btoa(bin);
    }
    if (!b64) {
      await refund('Pengembalian otomatis — respons OpenAI tidak berisi gambar');
      return json({ error: 'OpenAI tidak mengembalikan gambar.' }, 502, cors);
    }

    const [w, h] = size.split('x').map(Number);
    return json({ image: b64, width: w, height: h, cost }, 200, cors);
  } catch (err) {
    await refund('Pengembalian otomatis — tidak dapat menghubungi OpenAI');
    return json({ error: `Tidak dapat menghubungi OpenAI: ${err instanceof Error ? err.message : 'galat jaringan'}` }, 502, cors);
  }
});
