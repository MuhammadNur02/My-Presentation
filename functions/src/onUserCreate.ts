import * as functionsV1 from 'firebase-functions/v1';
import { ensureUserDoc } from './credits';

/**
 * Dipicu setelah akun Firebase Auth baru berhasil dibuat (login Google pertama kali) — membuat
 * dokumen `users/{uid}` berisi kredit gratis, supaya tampilan saldo kredit langsung benar tanpa jeda.
 * Sengaja pakai trigger v1 klasik (`functions.auth.user().onCreate`), BUKAN blocking function v2 —
 * itu perlu upgrade proyek ke Identity Platform (biaya & langkah setup tambahan) yang tidak dibutuhkan
 * di sini. `spendCredits` (lihat credits.ts) juga membuat dokumen ini kalau belum ada, jadi trigger ini
 * murni untuk kenyamanan tampilan, bukan syarat agar generate AI berfungsi.
 */
export const grantFreeCreditsOnSignup = functionsV1.auth.user().onCreate(async (user) => {
  await ensureUserDoc(user.uid, user.email ?? null, user.displayName ?? null);
});
