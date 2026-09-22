/**
 * Katalog paket kredit — SESUAIKAN harga (Rupiah, bilangan bulat) sesuai target pasar Anda.
 * Dipakai bersama oleh `create-xendit-transaction` (saat membuat invoice) dan `xendit-webhook`
 * (saat menambah kredit setelah bayar) — taruh di sini (bukan didefinisikan ulang di kedua fungsi)
 * supaya harga/kredit yang dibayar dan yang diberikan TIDAK PERNAH bisa berbeda.
 */
export const CREDIT_PACKAGES: Record<string, { credits: number; price: number; name: string }> = {
  pack_10: { credits: 10, price: 15_000, name: '10 kredit' },
  pack_50: { credits: 50, price: 60_000, name: '50 kredit (hemat)' },
  pack_150: { credits: 150, price: 150_000, name: '150 kredit (langganan ringan)' },
};
export type PackageId = keyof typeof CREDIT_PACKAGES;
