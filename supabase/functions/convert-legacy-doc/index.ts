import { corsHeaders, json } from '../_shared/cors.ts';

/**
 * Konversi format lawas `.ppt`/`.doc` → `.pptx`/`.docx` lewat CloudConvert, supaya bisa langsung
 * dibaca `parsePptx`/`parseDocx` yang sudah ada di klien — tanpa duplikasi logika parsing.
 *
 * BEDA dengan `claude-proxy`/`generate-image`: fungsi ini TIDAK memotong kredit & TIDAK mewajibkan
 * login — impor dokumen memang gratis/tanpa akun di aplikasi ini, jadi konversi formatnya pun
 * begitu (memakai jatah gratis CloudConvert; jadikan berbayar lewat kredit kalau pemakaian membesar).
 *
 * Alur CloudConvert (job 3 tugas): `import/upload` (unggah berkas mentah) → `convert` → `export/url`,
 * lalu `GET` ke subdomain `sync.api.cloudconvert.com` yang MEMBLOKIR sampai job selesai (bukan polling
 * manual) — dokumentasi resmi CloudConvert, Quickstart Guide.
 */

const CLOUDCONVERT_API_KEY = Deno.env.get('CLOUDCONVERT_API_KEY') ?? '';
const MAX_BYTES = 20 * 1024 * 1024; // batas lebih kecil dari impor biasa — badan permintaan/respons Edge Function ikut membesar ~33% karena base64.

interface CcTask {
  name: string;
  operation: string;
  status: string;
  result?: {
    form?: { url: string; parameters: Record<string, string> };
    files?: { filename: string; url: string }[];
  };
  message?: string;
}
interface CcJob {
  id: string;
  status: string;
  tasks: CcTask[];
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  if (!CLOUDCONVERT_API_KEY) return json({ error: 'Fitur ini belum dikonfigurasi di server (kunci CloudConvert belum diatur).' }, 503, cors);

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const fileBase64 = String(body.fileBase64 ?? '');
  const fileName = String(body.fileName ?? 'berkas');
  const targetFormat = body.targetFormat === 'docx' ? 'docx' : 'pptx';
  if (!fileBase64) return json({ error: 'Berkas kosong.' }, 400, cors);

  const bytes = fromBase64(fileBase64);
  if (bytes.byteLength > MAX_BYTES) return json({ error: `Berkas terlalu besar untuk dikonversi (maks. ${MAX_BYTES / 1024 / 1024} MB).` }, 400, cors);

  try {
    // 1) Buat job: impor (unggah) → konversi → ekspor.
    const jobRes = await fetch('https://api.cloudconvert.com/v2/jobs', {
      method: 'POST',
      headers: { authorization: `Bearer ${CLOUDCONVERT_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        tasks: {
          'import-file': { operation: 'import/upload' },
          'convert-file': { operation: 'convert', input: 'import-file', output_format: targetFormat },
          'export-file': { operation: 'export/url', input: 'convert-file' },
        },
      }),
    });
    if (!jobRes.ok) return json({ error: `CloudConvert gagal membuat tugas (${jobRes.status}): ${(await jobRes.text()).slice(0, 300)}` }, 502, cors);
    const job = ((await jobRes.json()) as { data: CcJob }).data;

    // 2) Unggah berkas mentah ke form yang diberikan tugas import/upload (parameter dulu, "file" WAJIB terakhir).
    const importTask = job.tasks.find((t) => t.name === 'import-file');
    const form = importTask?.result?.form;
    if (!form) return json({ error: 'CloudConvert tidak mengembalikan form unggah.' }, 502, cors);
    const fd = new FormData();
    for (const [k, v] of Object.entries(form.parameters)) fd.append(k, v);
    fd.append('file', new Blob([bytes.buffer as ArrayBuffer]), fileName);
    const uploadRes = await fetch(form.url, { method: 'POST', body: fd });
    if (!uploadRes.ok) return json({ error: `Gagal mengunggah berkas ke CloudConvert (${uploadRes.status}).` }, 502, cors);

    // 3) Tunggu sinkron sampai job selesai (subdomain sync, BUKAN polling manual).
    const doneRes = await fetch(`https://sync.api.cloudconvert.com/v2/jobs/${job.id}`, {
      headers: { authorization: `Bearer ${CLOUDCONVERT_API_KEY}` },
    });
    if (!doneRes.ok) return json({ error: `CloudConvert gagal menyelesaikan konversi (${doneRes.status}).` }, 502, cors);
    const done = ((await doneRes.json()) as { data: CcJob }).data;
    if (done.status !== 'finished') {
      const failed = done.tasks.find((t) => t.status === 'error');
      return json({ error: `Konversi gagal: ${failed?.message ?? 'berkas mungkin rusak atau format tidak didukung.'}` }, 422, cors);
    }

    // 4) Ambil URL hasil ekspor, unduh, kembalikan ke klien sebagai base64.
    const exportTask = done.tasks.find((t) => t.name === 'export-file');
    const fileUrl = exportTask?.result?.files?.[0]?.url;
    if (!fileUrl) return json({ error: 'CloudConvert tidak mengembalikan berkas hasil.' }, 502, cors);
    const fileRes = await fetch(fileUrl);
    const outBytes = new Uint8Array(await fileRes.arrayBuffer());
    return json({ fileBase64: toBase64(outBytes) }, 200, cors);
  } catch (err) {
    return json({ error: `Gagal menghubungi CloudConvert: ${err instanceof Error ? err.message : 'galat jaringan'}` }, 502, cors);
  }
});
