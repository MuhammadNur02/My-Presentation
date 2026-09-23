import { ArrowRight, FilePlus2, FileUp, FolderOpen, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ACCEPTED_TYPES, importFile } from '../../services/importers';
import { describeLlmError, generateOutlineWithLLM, isInsufficientCreditsError } from '../../services/ai/llm';
import { generateMockOutline } from '../../services/ai/mockGenerator';
import { outlineToSlides, type Outline } from '../../services/ai/outline';
import { useTypewriter } from '../../hooks/useTypewriter';
import { CLAUDE_PROXY_URL, HOSTED_MODEL } from '../../services/supabase';
import { useAuthStore } from '../../store/authStore';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { Language, Tone } from '../../types';
import { cn } from '../../utils/cn';
import { createSlide } from '../../utils/slideFactory';
import { StageShell } from '../common/StageShell';
import { Button, Field, IconButton, Segmented, Slider, inputClass } from '../common/ui';

const TONES: { id: Tone; label: string }[] = [
  { id: 'professional', label: 'Profesional' },
  { id: 'creative', label: 'Kreatif' },
  { id: 'minimal', label: 'Minimalis' },
  { id: 'educational', label: 'Edukatif' },
];

const EXAMPLES = [
  'Strategi pemasaran digital 2026 untuk UMKM kuliner',
  'Pengantar kecerdasan buatan untuk siswa SMA',
  'Laporan kuartal: pertumbuhan produk SaaS dan rencana ekspansi',
  'Pitch deck startup energi surya untuk desa terpencil',
];

const dateFmt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

/** Kartu "lanjutkan proyek lokal" — dipakai di kedua entri (Generate AI / Alat Editor). */
function ContinueProjectCard() {
  const project = useProjectStore((s) => s.project);
  const navigate = useNavigate();
  if (!project) return null;
  return (
    <section className="mx-auto mt-6 w-full max-w-3xl">
      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl border border-line px-4 py-3">
        <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
          <FolderOpen className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">Lanjutkan: {project.name}</div>
          <div className="text-xs text-muted">
            {project.slides.length} slide · diubah {dateFmt.format(project.updatedAt)}
          </div>
        </div>
        <Button variant="primary" size="sm" icon={<ArrowRight className="size-3.5" />} onClick={() => navigate('/dashboard/studio')}>
          Buka studio
        </Button>
        <IconButton
          label="Hapus proyek tersimpan"
          onClick={() => window.confirm('Hapus proyek tersimpan dari perangkat ini?') && useProjectStore.getState().discardProject()}
        >
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </section>
  );
}

/**
 * Dua entri pembuatan presentasi — dipasang di rute terpisah (`/dashboard/generate` &
 * `/dashboard/editor`), bukan lagi tab dalam satu layar: `mode="prompt"` = AI Generate PPT
 * (kredit/AI), `mode="import"` = Alat Editor mode gratis (impor dokumen / kanvas kosong).
 */
export function Onboarding({ mode }: { mode: 'prompt' | 'import' }) {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState<Tone>('professional');
  const [language, setLanguage] = useState<Language>('id');
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState<'ai' | 'import' | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Placeholder "mesin ketik": contoh topik berganti-ganti sendiri; berhenti begitu pengguna mengisi kolom.
  const typedPlaceholder = useTypewriter(EXAMPLES, { active: topic.length === 0 });

  const session = useAuthStore((s) => s.session);
  const credits = useAuthStore((s) => s.credits);
  // Semua pembuatan AI memakai backend hosted (kunci milik aplikasi, dibayar lewat kredit akun) —
  // tanpa kunci API pribadi. Belum masuk Google → mode simulasi offline (tanpa AI sungguhan).
  const usingHosted = !!session;
  const hasLlm = usingHosted;
  // Kredit sudah diketahui (bukan null, artinya sudah selesai dimuat dari server) dan habis — blokir
  // di sini SEBELUM mencoba memanggil AI, supaya pengguna tidak menunggu lalu baru tahu gagal.
  const outOfCredits = usingHosted && credits !== null && credits <= 0;
  const toast = useUIStore.getState().toast;

  const generate = async () => {
    if (topic.trim().length < 3) {
      toast('Tuliskan topik presentasi terlebih dahulu.', 'error');
      return;
    }
    if (outOfCredits) {
      toast('Kredit Anda habis. Isi ulang untuk melanjutkan.', 'error');
      useUIStore.getState().openModal('billing');
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy('ai');
    const req = { topic, tone, language, slideCount: count };
    try {
      let outline: Outline;
      if (hasLlm && session) {
        // Model hosted TETAP (bukan pilihan pengguna) demi kendali biaya API pemilik — lihat HOSTED_MODEL.
        const llmCfg = { apiKey: session.access_token, model: HOSTED_MODEL, baseUrl: CLAUDE_PROXY_URL };
        try {
          outline = await generateOutlineWithLLM(req, llmCfg, ac.signal);
        } catch (err) {
          if (ac.signal.aborted) return;
          if (usingHosted && isInsufficientCreditsError(err)) {
            toast(describeLlmError(err), 'error');
            useUIStore.getState().openModal('billing');
            return;
          }
          toast(`${describeLlmError(err)} Beralih ke mode simulasi.`, 'error');
          outline = await generateMockOutline(req, ac.signal);
        }
      } else {
        outline = await generateMockOutline(req, ac.signal);
      }
      useProjectStore.getState().createProject({ name: outline.title, tone, language, slides: outlineToSlides(outline) });
      useUIStore.getState().setStage('outline');
      navigate('/dashboard/studio');
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) toast(err instanceof Error ? err.message : 'Gagal membuat struktur', 'error');
    } finally {
      setBusy(null);
      abortRef.current = null;
    }
  };

  const onFile = async (file: File) => {
    setBusy('import');
    try {
      const result = await importFile(file);
      if (result.kind === 'project') {
        useProjectStore.getState().loadProject(result.project);
        useUIStore.getState().setStage('studio');
        toast(`Proyek "${result.project.name}" dimuat.`, 'success');
      } else {
        // Impor dokumen = mode gratis: tak memakai AI berbayar, tapi fitur AI/ekspor sumber dibatasi
        // dan presentasinya memakai watermark — lihat `Project.tier`.
        useProjectStore.getState().createProject({ name: result.title, tone, language, slides: result.slides, tier: 'free' });
        Object.values(result.assets).forEach((a) => useProjectStore.getState().addAsset(a));
        useUIStore.getState().setStage('outline');
        const imgNote = Object.keys(result.assets).length ? ` (${Object.keys(result.assets).length} gambar ikut terekstrak)` : '';
        toast(`${result.source}: ${result.slides.length} slide berhasil diimpor${imgNote}. Mode gratis: fitur AI & ekspor sumber dibatasi.`, 'success');
      }
      navigate('/dashboard/studio');
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : 'Gagal mengimpor dokumen', 'error');
    } finally {
      setBusy(null);
    }
  };

  const startBlank = () => {
    // Kanvas kosong = bagian "Alat Editor (mode gratis)", sama seperti impor dokumen.
    useProjectStore.getState().createProject({
      name: 'Presentasi baru',
      tone,
      language,
      slides: [createSlide({ layout: 'title', title: 'Judul presentasi', subtitle: 'Sub-judul' })],
      tier: 'free',
    });
    useUIStore.getState().setStage('outline');
    toast('Kanvas kosong dibuat — tambahkan slide dan isi sendiri.', 'success');
    navigate('/dashboard/studio');
  };

  return (
    <StageShell className="aurora overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col px-6 pb-16 pt-10">
        <section className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-field px-3 py-1 text-xs font-medium text-muted">
            <Sparkles className="size-3.5 text-accent" />
            {mode === 'prompt' ? 'Presentasi berbasis AI · Transisi 3D/WebGL Morph' : 'Alat Editor · Mode gratis'}
          </span>
          {mode === 'prompt' ? (
            <>
              <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
                Presentasi sinematik,
                <br />
                <span className="bg-linear-to-r from-violet-500 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">dirancang oleh AI.</span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-muted">
                Ceritakan topiknya — AI menyusun slide, gambar, dan transisi 3D yang halus, lalu Anda sempurnakan langsung di studio.
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
                Sudah punya materi?
                <br />
                <span className="bg-linear-to-r from-violet-500 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">Impor, atau mulai kosong.</span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-muted">
                Impor PPTX/PDF/DOCX/TXT/MD yang sudah ada, atau mulai dari kanvas kosong — gratis, tanpa kredit. Diproses sepenuhnya di perangkat Anda.
              </p>
            </>
          )}
        </section>

        <section className="glass mx-auto mt-10 w-full max-w-3xl rounded-[28px] border border-line p-5 shadow-(--shadow-pop) sm:p-7">
          {mode === 'prompt' ? (
            <div className="space-y-5">
              <Field label="Topik presentasi">
                <textarea
                  className={cn(inputClass, 'min-h-28 resize-none text-[15px]')}
                  placeholder={`Contoh: ${typedPlaceholder}`}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && void generate()}
                  autoFocus
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => setTopic(ex)} className="rounded-full border border-line bg-field px-3 py-1 text-xs text-muted transition hover:border-accent/50 hover:text-fg">
                    {ex}
                  </button>
                ))}
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Gaya visual & nada">
                  <Segmented<Tone> value={tone} onChange={setTone} options={TONES} className="[&_button]:px-1 [&_button]:text-[12px]" />
                </Field>
                <Field label="Bahasa">
                  <Segmented<Language>
                    value={language}
                    onChange={setLanguage}
                    options={[
                      { id: 'id', label: 'Indonesia' },
                      { id: 'en', label: 'English' },
                    ]}
                  />
                </Field>
              </div>
              <Slider label="Jumlah slide" min={4} max={20} step={1} value={count} format={(v) => `${v} slide`} onChange={setCount} />

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  onClick={() => (usingHosted ? useUIStore.getState().openModal('billing') : navigate('/login'))}
                  className="flex items-center gap-2 text-xs text-muted hover:text-fg"
                >
                  <span className={cn('size-2 rounded-full', hasLlm ? 'bg-emerald-400' : 'bg-amber-400')} />
                  {usingHosted ? `Claude aktif · ${credits ?? '…'} kredit tersisa` : 'Mode simulasi offline · masuk dengan Google untuk AI sungguhan'}
                </button>
                <div className="flex gap-2">
                  {busy === 'ai' && <Button onClick={() => abortRef.current?.abort()}>Batal</Button>}
                  <Button
                    variant="primary"
                    size="lg"
                    loading={busy === 'ai'}
                    icon={<Wand2 className="size-4" />}
                    onClick={() => (outOfCredits ? useUIStore.getState().openModal('billing') : void generate())}
                  >
                    {outOfCredits ? 'Kredit habis — isi ulang' : 'Buat struktur slide'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) void onFile(f);
                }}
                className={cn(
                  'grid place-items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition',
                  dragOver ? 'border-accent bg-accent-soft' : 'border-line bg-field',
                )}
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <FileUp className="size-6" />
                </span>
                <div>
                  <p className="text-[15px] font-medium">Tarik berkas ke sini</p>
                  <p className="mt-1 text-xs text-muted">
                    PPTX · PDF · DOCX · TXT/MD · proyek MorphDeck (.json) — diproses di perangkat Anda, tidak diunggah ke server. Format lawas PPT/DOC
                    juga didukung (dikonversi otomatis lewat layanan online, singkat, sebelum diproses).
                  </p>
                </div>
                <Button variant="primary" loading={busy === 'import'} onClick={() => fileRef.current?.click()}>
                  Pilih berkas
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPTED_TYPES}
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onFile(f);
                    e.target.value = '';
                  }}
                />
              </div>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-line" /> atau <span className="h-px flex-1 bg-line" />
              </div>
              <Button variant="secondary" className="w-full" icon={<FilePlus2 className="size-4" />} onClick={startBlank}>
                Mulai dari kanvas kosong
              </Button>
            </div>
          )}
        </section>

        <ContinueProjectCard />
      </div>
    </StageShell>
  );
}
