import { supabase } from './supabase';

export interface CreditPackage {
  id: string;
  credits: number;
  price: number;
  name: string;
}

/**
 * HARUS SELALU SAMA dengan `supabase/functions/_shared/packages.ts` — daftar ini hanya untuk
 * TAMPILAN (harga/kredit sungguhan yang diproses & dipercaya tetap dihitung ulang di server).
 * Ubah keduanya bersamaan bila paket berubah.
 */
export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: 'pack_10', credits: 10, price: 15_000, name: '10 kredit' },
  { id: 'pack_50', credits: 50, price: 60_000, name: '50 kredit (hemat)' },
  { id: 'pack_150', credits: 150, price: 150_000, name: '150 kredit (langganan ringan)' },
];

/** Buat transaksi Xendit untuk paket terpilih; mengembalikan URL invoice untuk dibuka pengguna. */
export async function startCreditCheckout(packageId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ invoiceUrl: string }>('create-xendit-transaction', {
    body: { packageId },
  });
  if (error) throw new Error(error.message || 'Gagal membuat transaksi pembayaran');
  if (!data?.invoiceUrl) throw new Error('Respons pembayaran tidak lengkap');
  return data.invoiceUrl;
}
