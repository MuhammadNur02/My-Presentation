/**
 * Katalog paket kredit — SESUAIKAN harga (Rupiah, bilangan bulat) sesuai target pasar Anda.
 * Dipakai bersama oleh `create-xendit-transaction` (saat membuat invoice) dan `xendit-webhook`
 * (saat menambah kredit setelah bayar) — taruh di sini (bukan didefinisikan ulang di kedua fungsi)
 * supaya harga/kredit yang dibayar dan yang diberikan TIDAK PERNAH bisa berbeda.
 *
 * Harga dihitung untuk model hosted `claude-sonnet-5` (lihat `HOSTED_MODEL` di src/services/supabase.ts):
 * estimasi biaya API asli ≈ Rp350 (presentasi 10 slide) – Rp700 (20 slide) per generate, jadi harga
 * di bawah ini sudah memberi ruang margin + biaya Xendit. HARUS diubah bersamaan dengan salinan
 * tampilannya di `src/services/payments.ts` (dan re-deploy `create-xendit-transaction` + `xendit-webhook`).
 */
export const CREDIT_PACKAGES: Record<string, { credits: number; price: number; name: string }> = {
  pack_5: { credits: 5, price: 7_500, name: '5 kredit — coba dulu' },
  pack_25: { credits: 25, price: 30_000, name: '25 kredit — Paket Mahasiswa' },
  pack_60: { credits: 60, price: 60_000, name: '60 kredit — hemat' },
  pack_150: { credits: 150, price: 120_000, name: '150 kredit — Pro/Organisasi' },
};
export type PackageId = keyof typeof CREDIT_PACKAGES;
