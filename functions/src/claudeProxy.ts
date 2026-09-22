import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { CREDIT_COST_PER_CALL, InsufficientCreditsError, spendCredits } from './credits';

/**
 * Proxy Claude — MENIRU bentuk API Anthropic asli (`POST /v1/messages`) sehingga `@anthropic-ai/sdk`
 * di frontend bisa dipakai APA ADANYA, cukup diarahkan ke sini lewat `baseUrl`:
 *
 *   new Anthropic({ apiKey: <ID TOKEN FIREBASE PENGGUNA>, baseURL: 'https://.../claudeProxy' })
 *
 * SDK Anthropic selalu mengirim `apiKey` lewat header `x-api-key` — di sinilah triknya: untuk proxy
 * ini, isi header itu bukan kunci Anthropic, melainkan ID TOKEN hasil login Google (Firebase Auth) milik
 * pengguna. Proxy yang memverifikasinya, mengecek & memotong kredit di Firestore, BARU meneruskan body
 * permintaan APA ADANYA ke Anthropic memakai kunci ASLI yang tersimpan aman sebagai secret di server.
 * Kunci asli TIDAK PERNAH terkirim ke client dalam bentuk apa pun.
 *
 * Kenapa satu fungsi untuk semua: `generateOutlineWithLLM` maupun `suggestSceneWithLLM` di frontend
 * sama-sama berujung memanggil `client.messages.create(...)` — jadi cukup satu proxy generik.
 */

// Diisi lewat: firebase functions:secrets:set ANTHROPIC_API_KEY (lihat functions/.env.example)
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/** Origin yang boleh memanggil proxy ini — isi domain web Anda begitu sudah punya; `*` untuk mulai. */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

export const claudeProxy = onRequest({ secrets: [ANTHROPIC_API_KEY], cors: false, timeoutSeconds: 120 }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ type: 'error', error: { type: 'invalid_request_error', message: 'Method not allowed' } });
    return;
  }

  // 1) "x-api-key" di sini adalah ID TOKEN FIREBASE pengguna, bukan kunci Anthropic — lihat komentar atas.
  const idToken = String(req.header('x-api-key') || '');
  if (!idToken) {
    res.status(401).json({ type: 'error', error: { type: 'authentication_error', message: 'Masuk dengan akun Google diperlukan.' } });
    return;
  }
  let uid: string;
  let email: string | null;
  let displayName: string | null;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    uid = decoded.uid;
    email = decoded.email ?? null;
    displayName = (decoded.name as string | undefined) ?? null;
  } catch {
    res.status(401).json({ type: 'error', error: { type: 'authentication_error', message: 'Sesi masuk tidak valid — silakan masuk ulang.' } });
    return;
  }

  // 2) Potong kredit SEBELUM memanggil Anthropic (transaksi atomik) — kalau habis, tolak di sini
  //    tanpa membebani biaya API sama sekali.
  try {
    await spendCredits(uid, { email, displayName }, CREDIT_COST_PER_CALL);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      res.status(402).json({
        type: 'error',
        error: { type: 'insufficient_credits', message: 'Kredit Anda habis. Isi ulang untuk melanjutkan.' },
      });
      return;
    }
    res.status(500).json({ type: 'error', error: { type: 'internal_error', message: err instanceof Error ? err.message : 'Galat tak dikenal' } });
    return;
  }

  // 3) Teruskan body APA ADANYA ke Anthropic dengan kunci ASLI (server-only secret).
  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY.value(),
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(req.body),
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.set('content-type', upstream.headers.get('content-type') || 'application/json');
    res.send(text);
    // Catatan: kredit yang sudah dipotong di langkah 2 TIDAK dikembalikan otomatis bila Anthropic
    // mengembalikan galat (mis. topik ditolak) — ini trade-off kesederhanaan MVP. Kalau refund-per-galat
    // penting, tambahkan `addCredits(uid, CREDIT_COST_PER_CALL, 'refund')` saat `upstream.status >= 400`.
  } catch (err) {
    res.status(502).json({
      type: 'error',
      error: { type: 'api_error', message: `Tidak dapat menghubungi Anthropic: ${err instanceof Error ? err.message : 'galat jaringan'}` },
    });
  }
});
