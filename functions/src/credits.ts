import * as admin from 'firebase-admin';

/**
 * Kredit & langganan pengguna, disimpan di Firestore `users/{uid}`.
 *
 * Model MVP: "beli paket kredit" (bukan langganan berkala) — paling sederhana untuk diimplementasikan
 * dengan Midtrans Snap (transaksi sekali bayar). Kredit gratis diberikan sekali saat akun dibuat
 * (lihat `onUserCreate.ts`); tiap panggilan AI (buat outline / pilih animasi) memotong 1 kredit.
 *
 * Migrasi ke langganan berkala sungguhan (auto-renew) nanti bisa dilakukan dengan menambah field
 * `subscriptionRenewsAt` + memakai Midtrans Subscription API (API terpisah, perlu kartu tersimpan) —
 * belum diimplementasikan di sini agar MVP tetap sederhana.
 */
export interface UserDoc {
  email: string | null;
  displayName: string | null;
  /** Sisa kredit (1 kredit = 1 panggilan AI). */
  credits: number;
  /** Total kredit yang pernah dibeli (untuk statistik/dukungan pelanggan, bukan logika). */
  totalPurchased: number;
  createdAt: admin.firestore.FieldValue | admin.firestore.Timestamp;
  updatedAt: admin.firestore.FieldValue | admin.firestore.Timestamp;
}

/** Jumlah kredit gratis saat akun baru dibuat (sign-in Google pertama kali). */
export const FREE_CREDITS_ON_SIGNUP = 5;

/** Biaya (kredit) satu panggilan AI — flat untuk MVP; bisa dibedakan per jenis panggilan nanti. */
export const CREDIT_COST_PER_CALL = 1;

const db = () => admin.firestore();
const userRef = (uid: string) => db().collection('users').doc(uid);

export async function ensureUserDoc(uid: string, email: string | null, displayName: string | null): Promise<void> {
  const ref = userRef(uid);
  const snap = await ref.get();
  if (snap.exists) return;
  const doc: UserDoc = {
    email,
    displayName,
    credits: FREE_CREDITS_ON_SIGNUP,
    totalPurchased: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(doc);
  await ref.collection('transactions').add({
    type: 'grant_free',
    amount: FREE_CREDITS_ON_SIGNUP,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export class InsufficientCreditsError extends Error {
  constructor() {
    super('Kredit habis');
    this.name = 'InsufficientCreditsError';
  }
}

/**
 * Potong `amount` kredit secara ATOMIK (transaksi Firestore) — mencegah kondisi balapan dari klik ganda
 * atau dua tab terbuka bersamaan yang bisa membuat kredit minus / terpotong dobel.
 * Melempar `InsufficientCreditsError` bila kredit tidak cukup (tidak memotong apa pun).
 */
export async function spendCredits(
  uid: string,
  identity: { email: string | null; displayName: string | null },
  amount = CREDIT_COST_PER_CALL,
): Promise<{ remaining: number }> {
  const ref = userRef(uid);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    // Akun baru (mis. trigger onCreate belum sempat jalan): buat dokumennya di sini juga (idempoten,
    // tidak bergantung urutan) — begitu ada, langsung dipakai transaksi kredit yang sama, tanpa jeda.
    const current = snap.exists ? ((snap.data() as UserDoc).credits ?? 0) : FREE_CREDITS_ON_SIGNUP;
    if (current < amount) throw new InsufficientCreditsError();
    const remaining = current - amount;
    if (snap.exists) {
      tx.update(ref, { credits: remaining, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    } else {
      const doc: UserDoc = {
        email: identity.email,
        displayName: identity.displayName,
        credits: remaining,
        totalPurchased: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      tx.set(ref, doc);
    }
    return { remaining };
  });
}

/** Tambah kredit (setelah pembayaran Midtrans sukses) — dipanggil dari webhook, bukan dari klien. */
export async function addCredits(uid: string, amount: number, note: string): Promise<void> {
  const ref = userRef(uid);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? ((snap.data() as UserDoc).credits ?? 0) : 0;
    const totalPurchased = snap.exists ? ((snap.data() as UserDoc).totalPurchased ?? 0) : 0;
    tx.set(
      ref,
      {
        credits: current + amount,
        totalPurchased: totalPurchased + amount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
  await ref.collection('transactions').add({
    type: 'purchase',
    amount,
    note,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function getCredits(uid: string): Promise<number> {
  const snap = await userRef(uid).get();
  return snap.exists ? ((snap.data() as UserDoc).credits ?? 0) : 0;
}
