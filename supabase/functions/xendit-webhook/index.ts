import { createClient } from 'npm:@supabase/supabase-js@2';
import { CREDIT_PACKAGES, type PackageId } from '../_shared/packages.ts';

/**
 * Webhook resmi Xendit ("Callback" — daftarkan URL fungsi ini di Xendit Dashboard → Settings →
 * Developers → Callbacks → Invoice Paid). Server-ke-server, TIDAK butuh login pengguna — keasliannya
 * diverifikasi lewat header `x-callback-token` yang harus cocok dengan Verification Token dari
 * dashboard yang sama (BUKAN Secret API Key), bukan lewat token pengguna.
 */

const XENDIT_CALLBACK_TOKEN = Deno.env.get('XENDIT_CALLBACK_TOKEN') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface XenditInvoiceCallback {
  external_id?: string;
  status?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const token = req.headers.get('x-callback-token');
  if (!XENDIT_CALLBACK_TOKEN || token !== XENDIT_CALLBACK_TOKEN) {
    return new Response('Token tidak valid', { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as XenditInvoiceCallback;
  const paid = body.status === 'PAID' || body.status === 'SETTLED';
  if (paid && body.external_id) {
    const [uid, packageId] = body.external_id.split('__') as [string, PackageId];
    const pkg = CREDIT_PACKAGES[packageId];
    if (uid && pkg) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { error } = await supabase.rpc('add_credits', {
        p_uid: uid,
        p_amount: pkg.credits,
        p_note: `Pembelian ${pkg.name} (external_id ${body.external_id})`,
      });
      if (error) {
        // Kembalikan 500 supaya Xendit MENGULANG kiriman webhook ini nanti (bukan dianggap selesai).
        return new Response(`Gagal menambah kredit: ${error.message}`, { status: 500 });
      }
    }
  }
  // Xendit hanya perlu tahu notifikasi diterima — respons 200 apa pun isinya cukup.
  return new Response('OK', { status: 200 });
});
