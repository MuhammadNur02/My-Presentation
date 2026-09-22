import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { CREDIT_PACKAGES } from '../_shared/packages.ts';

/**
 * Dipanggil dari halaman web (setelah pengguna masuk Google) saat memilih paket kredit.
 * Membuat Invoice Xendit lalu mengembalikan `invoiceUrl` — frontend membuka URL itu (tab/jendela baru)
 * untuk pembayaran. Pembelian SELALU lewat web (dibuka dari aplikasi mobile lewat pranala eksternal,
 * bukan dijual di dalam aplikasi) — lihat catatan "web-only purchase" di README.
 */

const XENDIT_SECRET_KEY = Deno.env.get('XENDIT_SECRET_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') ?? '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!accessToken) return json({ error: 'Masuk dengan akun Google diperlukan.' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData.user) return json({ error: 'Sesi masuk tidak valid — silakan masuk ulang.' }, 401);

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const packageId = String(body.packageId ?? '');
  const pkg = CREDIT_PACKAGES[packageId];
  if (!pkg) return json({ error: 'Paket tidak dikenal.' }, 400);

  // external_id menyisipkan uid + kode paket + waktu — dibaca kembali oleh webhook, TANPA perlu tabel
  // transaksi terpisah untuk memetakan pembayaran ke akun mana.
  const externalId = `${userData.user.id}__${packageId}__${Date.now()}`;

  const res = await fetch('https://api.xendit.co/v2/invoices', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Xendit memakai HTTP Basic Auth: secret key sebagai username, password kosong.
      authorization: `Basic ${btoa(`${XENDIT_SECRET_KEY}:`)}`,
    },
    body: JSON.stringify({
      external_id: externalId,
      amount: pkg.price,
      currency: 'IDR',
      description: `MorphDeck — ${pkg.name}`,
      payer_email: userData.user.email ?? undefined,
      success_redirect_url: Deno.env.get('PAYMENT_SUCCESS_URL') || undefined,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    return json({ error: `Xendit gagal membuat invoice (${res.status}): ${detail}` }, 502);
  }
  const invoice = (await res.json()) as { invoice_url: string };
  return json({ invoiceUrl: invoice.invoice_url }, 200);
});
