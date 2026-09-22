/** Header CORS bersama untuk semua Edge Function publik (dipanggil langsung dari browser/aplikasi). */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-api-key, anthropic-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}
