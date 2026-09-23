import { FunctionsHttpError } from '@supabase/supabase-js';

/**
 * Ambil pesan galat SEBENARNYA dari body JSON Edge Function.
 *
 * `error.message` bawaan supabase-js untuk `FunctionsHttpError` SELALU teks generik
 * ("Edge Function returned a non-2xx status code") — tidak peduli apa isi JSON yang benar-benar
 * dikembalikan server (mis. `{ error: "Kredit Anda habis..." }`). Isi aslinya ada di `error.context`,
 * yang merupakan objek `Response` mentah dari panggilan itu.
 */
export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string };
      if (typeof body?.error === 'string' && body.error) return body.error;
    } catch {
      /* body bukan JSON (mis. HTML galat gateway) — pakai fallback di bawah */
    }
  }
  return error instanceof Error ? error.message : fallback;
}
