/**
 * Header CORS bersama untuk semua Edge Function publik (dipanggil langsung dari browser/aplikasi).
 *
 * `Access-Control-Allow-Headers` MENGIKUTI apa pun yang diminta browser saat preflight (bukan daftar
 * tetap) — penting karena SDK klien (mis. `@anthropic-ai/sdk` yang dipakai lewat `claude-proxy`)
 * mengirim header khusus (`anthropic-dangerous-direct-browser-access`, `x-stainless-*`, dst.) yang
 * bisa bertambah/berubah antar versi SDK. Daftar tetap gampang basi dan membuat preflight gagal diam-
 * diam — di frontend ini muncul sebagai "Tidak dapat terhubung ke API (jaringan/CORS)", bukan pesan
 * CORS yang jelas, karena browser memblokir permintaan sebelum sampai ke fungsi ini sama sekali.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const requested = req.headers.get('access-control-request-headers');
  return {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
    'Access-Control-Allow-Headers': requested ?? 'authorization, apikey, content-type, x-api-key, anthropic-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

export function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
}
