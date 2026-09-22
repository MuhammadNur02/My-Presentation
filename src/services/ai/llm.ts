import Anthropic from '@anthropic-ai/sdk';
import { normalizeOutline, type Outline, type OutlineRequest } from './outline';

export interface LlmConfig {
  apiKey: string;
  model: string;
  /** Base URL proxy (opsional) — disarankan agar kunci API tidak berada di browser. */
  baseUrl?: string;
}

export function llmConfigured(cfg: LlmConfig): boolean {
  return !!cfg.apiKey.trim() || !!cfg.baseUrl?.trim();
}

const TONE_GUIDE: Record<OutlineRequest['tone'], string> = {
  professional: 'profesional, ringkas, berbasis bukti; cocok untuk rapat dan presentasi bisnis',
  creative: 'kreatif, berani, penuh metafora dan energi; boleh memakai kutipan dan pernyataan kuat',
  minimal: 'sangat minimalis: kalimat pendek, maksimal 3 poin per slide, banyak ruang kosong',
  educational: 'edukatif: bertahap, jelas, memakai contoh dan tujuan pembelajaran',
};

const SYSTEM_PROMPT = `Anda adalah desainer presentasi senior. Tugas: susun struktur presentasi lengkap sebagai JSON murni.

Aturan konten:
- Slide pertama SELALU layout "title" (judul + subjudul). Slide terakhir: penutup/ajakan bertindak (layout "title" atau "image-full").
- Pilih layout per slide dari: "title", "content", "split", "image-full", "quote", "stats", "numbered", "timeline", "compare", "statement".
  * "content"/"split": 3–5 poin, tiap poin ≤ 14 kata, fokus pada satu gagasan per slide.
  * "stats": 3–4 elemen bullets berformat "nilai | label" (mis. "3 langkah | Proses inti"). Jangan mengarang angka statistik faktual; gunakan hanya bila diketahui pasti, selain itu gunakan langkah/urutan.
  * "quote": title = kutipan (tanpa tanda kutip), subtitle = atribusi.
  * "image-full": title kuat + subtitle singkat, tanpa bullets panjang.
  * "numbered": 3–5 langkah/urutan berurutan (bullets), tiap poin ≤ 12 kata; cocok untuk proses, cara, prioritas.
  * "timeline": 3–5 tahapan berformat "waktu atau tahap | keterangan" (mis. "Q1 | Riset pasar", "Fase 2 | Pilot"); cocok untuk peta jalan dan riwayat.
  * "compare": dua sisi berhadapan (sebelum/sesudah, opsi A/B). bullets = [judul sisi A, poin A..., "---", judul sisi B, poin B...], tiap sisi 2–4 poin.
  * "statement": title = SATU pernyataan besar yang kuat (≤ 14 kata), subtitle opsional, bullets kosong; untuk momen penekanan.
- Variasikan layout agar ritme visual enak; jangan memakai layout yang sama lebih dari 2 kali berturut-turut.
- Boleh memakai markup ringan: **tebal**, *miring*, ==sorot== pada beberapa kata kunci (jangan berlebihan).
- "notes": catatan pembicara 2–3 kalimat yang membantu presenter.
- "image_query": 2–4 kata kunci bahasa Inggris untuk gambar pendukung yang relevan secara visual (tanpa nama merek/orang).
- Jangan menambahkan penjelasan di luar JSON.`;

const OUTLINE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    slides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          layout: { type: 'string', enum: ['title', 'content', 'split', 'image-full', 'quote', 'stats', 'numbered', 'timeline', 'compare', 'statement'] },
          title: { type: 'string' },
          subtitle: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' },
          image_query: { type: 'string' },
        },
        required: ['layout', 'title', 'subtitle', 'bullets', 'notes', 'image_query'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'slides'],
  additionalProperties: false,
} as const;

/** Ambil objek JSON dari teks yang mungkin dibungkus code-fence / prosa. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('Respons AI bukan JSON yang valid');
  }
}

/**
 * Minta Claude memilih animasi generatif yang paling membantu menjelaskan sebuah slide.
 * Mengembalikan id adegan, atau null bila tidak ada yang cocok.
 */
export async function suggestSceneWithLLM(
  slide: { title: string; subtitle: string; bullets: string[] },
  catalog: { id: string; label: string; description: string }[],
  cfg: LlmConfig,
  signal?: AbortSignal,
): Promise<{ scene: string | null; reason: string }> {
  const client = new Anthropic({
    apiKey: cfg.apiKey.trim() || 'proxy',
    baseURL: cfg.baseUrl?.trim() || undefined,
    dangerouslyAllowBrowser: true,
  });
  const ids = [...catalog.map((c) => c.id), 'none'];
  const schema = {
    type: 'object',
    properties: { scene: { type: 'string', enum: ids }, reason: { type: 'string' } },
    required: ['scene', 'reason'],
    additionalProperties: false,
  };
  const list = catalog.map((c) => `- ${c.id}: ${c.label} — ${c.description}`).join('\n');
  const message = await client.messages.create(
    {
      model: cfg.model,
      max_tokens: 400,
      system:
        'Anda membantu presenter memilih ilustrasi bergerak untuk menjelaskan isi sebuah slide. Pilih SATU animasi dari katalog yang paling membantu audiens memahami topik slide; pilih "none" bila tidak ada yang benar-benar relevan. Jawab dalam JSON, alasan singkat satu kalimat berbahasa Indonesia.',
      messages: [
        {
          role: 'user',
          content: `Katalog animasi:\n${list}\n\nSlide:\nJudul: ${slide.title}\nSubjudul: ${slide.subtitle}\nPoin:\n${slide.bullets.map((b) => '- ' + b).join('\n')}`,
        },
      ],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema as unknown as Record<string, unknown> } },
    },
    { signal },
  );
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const out = extractJson(text) as { scene?: string; reason?: string };
  const scene = out.scene && out.scene !== 'none' && ids.includes(out.scene) ? out.scene : null;
  return { scene, reason: out.reason ?? '' };
}

/**
 * True bila galat berasal dari proxy hosted (`claude-proxy`) menolak permintaan karena kredit
 * akun pengguna habis (HTTP 402 — lihat `supabase/functions/claude-proxy/index.ts`). Beda dari
 * galat lain: di sini pemanggil sebaiknya membuka modal isi-ulang, bukan jatuh ke mode simulasi.
 */
export function isInsufficientCreditsError(err: unknown): boolean {
  return err instanceof Anthropic.APIError && err.status === 402;
}

/** Ubah galat SDK menjadi pesan yang dapat dipahami pengguna. */
export function describeLlmError(err: unknown): string {
  if (isInsufficientCreditsError(err)) return 'Kredit Anda habis. Isi ulang untuk melanjutkan.';
  if (err instanceof Anthropic.AuthenticationError) return 'Kunci API Anthropic tidak valid. Periksa di Pengaturan.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'Kunci API tidak memiliki izin untuk model ini.';
  if (err instanceof Anthropic.NotFoundError) return 'Model tidak ditemukan. Pilih model lain di Pengaturan.';
  if (err instanceof Anthropic.RateLimitError) return 'Batas laju API tercapai. Coba lagi beberapa saat.';
  if (err instanceof Anthropic.APIConnectionError) return 'Tidak dapat terhubung ke API (jaringan/CORS). Coba proxy atau mode simulasi.';
  if (err instanceof Anthropic.APIError) return `API mengembalikan galat ${err.status ?? ''}: ${err.message}`;
  return err instanceof Error ? err.message : 'Galat tak dikenal saat memanggil AI';
}

/**
 * Hasilkan struktur slide dengan Claude lewat SDK resmi (dipanggil langsung dari browser
 * dengan `dangerouslyAllowBrowser` — kunci berada di perangkat pengguna; lihat catatan keamanan di README).
 */
export async function generateOutlineWithLLM(
  req: OutlineRequest,
  cfg: LlmConfig,
  signal?: AbortSignal,
): Promise<Outline> {
  const client = new Anthropic({
    apiKey: cfg.apiKey.trim() || 'proxy',
    baseURL: cfg.baseUrl?.trim() || undefined,
    dangerouslyAllowBrowser: true,
  });

  const langName = req.language === 'id' ? 'Bahasa Indonesia' : 'English';
  const userPrompt = `Topik presentasi:
"""
${req.topic.trim()}
"""

Bahasa keluaran: ${langName}
Gaya (tone): ${TONE_GUIDE[req.tone]}
Jumlah slide: tepat ${req.slideCount}

Keluarkan JSON dengan bentuk {"title": string, "slides": [{"layout","title","subtitle","bullets","notes","image_query"}]}.`;

  const message = await client.messages.create(
    {
      model: cfg.model,
      max_tokens: 12000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: OUTLINE_SCHEMA as unknown as Record<string, unknown> },
      },
    },
    { signal },
  );

  if (message.stop_reason === 'refusal') throw new Error('AI menolak permintaan ini. Ubah topik lalu coba lagi.');
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const outline = normalizeOutline(extractJson(text), req.topic.slice(0, 80));
  if (!outline.slides.length) throw new Error('AI tidak menghasilkan slide. Coba perjelas topik.');
  return outline;
}
