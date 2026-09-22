import * as crypto from 'crypto';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as midtransClient from 'midtrans-client';
import { addCredits } from './credits';

/**
 * Pembayaran — MODEL "BELI PAKET KREDIT" (bukan langganan auto-renew Midtrans yang butuh kartu
 * tersimpan & API terpisah). Konsumen beli lewat WEB SAJA (dibuka dari browser, termasuk saat dibuka
 * dari dalam aplikasi mobile) — aplikasi iOS/Android tidak pernah menjual apa pun langsung, sehingga
 * TIDAK kena kewajiban Apple In-App Purchase / Google Play Billing untuk pembelian ini.
 */

// Diisi lewat: firebase functions:secrets:set MIDTRANS_SERVER_KEY (lihat functions/.env.example)
const MIDTRANS_SERVER_KEY = defineSecret('MIDTRANS_SERVER_KEY');
const MIDTRANS_CLIENT_KEY = defineSecret('MIDTRANS_CLIENT_KEY');
/** false = sandbox (uji coba, tanpa uang sungguhan) — ganti ke true setelah akun Midtrans production disetujui. */
const MIDTRANS_PRODUCTION = process.env.MIDTRANS_PRODUCTION === 'true';

/** Katalog paket kredit — SESUAIKAN harga (dalam Rupiah, bilangan bulat) sesuai target pasar Anda. */
export const CREDIT_PACKAGES = {
  pack_10: { credits: 10, price: 15_000, name: '10 kredit' },
  pack_50: { credits: 50, price: 60_000, name: '50 kredit (hemat)' },
  pack_150: { credits: 150, price: 150_000, name: '150 kredit (langganan ringan)' },
} as const;
export type PackageId = keyof typeof CREDIT_PACKAGES;

function snap(): midtransClient.Snap {
  return new midtransClient.Snap({
    isProduction: MIDTRANS_PRODUCTION,
    serverKey: MIDTRANS_SERVER_KEY.value(),
    clientKey: MIDTRANS_CLIENT_KEY.value(),
  });
}

/**
 * Dipanggil dari halaman web (setelah pengguna masuk Google) saat memilih paket kredit.
 * Mengembalikan `token` Snap — frontend memakainya membuka jendela pembayaran Midtrans.
 */
export const createMidtransTransaction = onCall({ secrets: [MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Masuk dengan akun Google diperlukan.');
  const rawPackageId = req.data?.packageId as PackageId | undefined;
  if (!rawPackageId || !(rawPackageId in CREDIT_PACKAGES)) throw new HttpsError('invalid-argument', 'Paket tidak dikenal.');
  const packageId: PackageId = rawPackageId;
  const pkg = CREDIT_PACKAGES[packageId];

  // order_id menyisipkan uid + kode paket + waktu — dibaca kembali oleh webhook, TANPA perlu tabel
  // transaksi terpisah untuk memetakan pembayaran ke akun mana.
  const orderId = `${req.auth.uid}__${packageId}__${Date.now()}`;
  const result = await snap().createTransaction({
    transaction_details: { order_id: orderId, gross_amount: pkg.price },
    item_details: [{ id: packageId, price: pkg.price, quantity: 1, name: pkg.name }],
    customer_details: { email: req.auth.token.email, first_name: req.auth.token.name || 'Pengguna' },
  });
  return { token: result.token, redirectUrl: result.redirect_url };
});

/**
 * Webhook resmi Midtrans (daftarkan URL fungsi ini di Midtrans Dashboard → Settings → Configuration →
 * Payment Notification URL). Server-to-server, TIDAK butuh login — keasliannya diverifikasi lewat
 * signature SHA512, bukan lewat token pengguna.
 */
export const midtransNotification = onRequest({ secrets: [MIDTRANS_SERVER_KEY] }, async (req, res) => {
  const body = req.body as {
    order_id?: string;
    status_code?: string;
    gross_amount?: string;
    signature_key?: string;
    transaction_status?: string;
    fraud_status?: string;
  };
  const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status } = body;
  if (!order_id || !status_code || !gross_amount || !signature_key) {
    res.status(400).send('Payload tidak lengkap');
    return;
  }

  // Verifikasi signature: SHA512(order_id + status_code + gross_amount + server_key) — lihat dok Midtrans.
  const expected = crypto
    .createHash('sha512')
    .update(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY.value())
    .digest('hex');
  if (expected !== signature_key) {
    res.status(403).send('Signature tidak valid');
    return;
  }

  const success = (transaction_status === 'settlement' || transaction_status === 'capture') && (fraud_status ?? 'accept') === 'accept';
  if (success) {
    const [uid, packageId] = order_id.split('__') as [string, PackageId];
    const pkg = CREDIT_PACKAGES[packageId];
    if (uid && pkg) await addCredits(uid, pkg.credits, `Pembelian ${pkg.name} (order ${order_id})`);
  }
  // Midtrans hanya perlu tahu notifikasi diterima — status detail transaksi tidak perlu dikembalikan.
  res.status(200).send('OK');
});
