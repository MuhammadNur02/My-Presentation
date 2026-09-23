import { Download, ImagePlus, LogIn, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import {
  deleteGeneratedImage,
  fetchAsDataUrl,
  generatedImageBlob,
  generatedImageToAsset,
  listGeneratedImages,
  requestImage,
  RESOLUTION_COST,
  saveGeneratedImage,
  type GeneratedImage,
  type ImageResolution,
} from '../../services/generatedImages';
import { useAuthStore } from '../../store/authStore';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { downloadBlob } from '../../utils/download';
import { Button, Field, inputClass, Segmented } from '../common/ui';

const RESOLUTIONS: { id: ImageResolution; label: string }[] = [
  { id: '1K', label: `1K · ${RESOLUTION_COST['1K']} kredit` },
  { id: '2K', label: `2K · ${RESOLUTION_COST['2K']} kredit` },
  { id: '4K', label: `4K · ${RESOLUTION_COST['4K']} kredit` },
];

/**
 * Tombol ikon KHUSUS untuk overlay galeri di atas foto — sengaja TIDAK memakai `IconButton`
 * (`common/ui.tsx`): warna dasarnya ikut tema (`text-muted`/`hover:text-fg`), jadi menimpanya
 * dengan `text-white` lewat `className` tidak terjamin menang (dua utility class prioritas sama,
 * pemenangnya tergantung urutan Tailwind meng-generate CSS, bukan urutan di JSX) — bisa membuat
 * ikon nyaris hitam di mode terang, di atas overlay gradien hitam yang selalu gelap apa pun
 * temanya. Overlay ini SELALU gelap, jadi ikonnya SELALU putih, tanpa ambiguitas.
 */
function OverlayIconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-white transition hover:bg-white/25"
    >
      {children}
    </button>
  );
}

/** AI Generate Gambar (Fase 2a) — prompt teks → GPT Image 2 (OpenAI), hasil masuk pustaka akun lintas-proyek. */
export function GenerateImagePage() {
  const user = useAuthStore((s) => s.user);
  const credits = useAuthStore((s) => s.credits);
  const hasProject = useProjectStore((s) => !!s.project);
  const [prompt, setPrompt] = useState('');
  const [resolution, setResolution] = useState<ImageResolution>('1K');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ dataUrl: string; width: number; height: number } | null>(null);
  const [gallery, setGallery] = useState<GeneratedImage[] | null>(null);
  const toast = useUIStore.getState().toast;

  const cost = RESOLUTION_COST[resolution];
  const outOfCredits = credits !== null && credits < cost;

  const reloadGallery = async () => {
    try {
      setGallery(await listGeneratedImages());
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memuat pustaka gambar', 'error');
      setGallery([]);
    }
  };

  useEffect(() => {
    if (user) void reloadGallery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) {
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="glass max-w-sm rounded-3xl border border-line p-8 text-center shadow-(--shadow-pop)">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <ImagePlus className="size-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">Masuk untuk membuat gambar AI</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">Fitur ini memakai kredit akun (1-3 kredit per gambar, tergantung resolusi) — masuk dengan Google untuk memulai.</p>
          <Button variant="primary" className="mt-5" icon={<LogIn className="size-4" />} onClick={() => void useAuthStore.getState().signInWithGoogle()}>
            Masuk dengan Google
          </Button>
        </div>
      </div>
    );
  }

  const generate = async () => {
    if (prompt.trim().length < 3) {
      toast('Tuliskan deskripsi gambar terlebih dahulu.', 'error');
      return;
    }
    if (outOfCredits) {
      toast(`Kredit tidak cukup — gambar ${resolution} butuh ${cost} kredit. Isi ulang untuk melanjutkan.`, 'error');
      useUIStore.getState().openModal('billing');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const img = await requestImage(prompt.trim(), resolution);
      setResult(img);
      const saved = await saveGeneratedImage(img.dataUrl, prompt.trim(), img.width, img.height);
      setGallery((g) => [saved, ...(g ?? [])]);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal membuat gambar', 'error');
    } finally {
      setBusy(false);
    }
  };

  const useInProject = (dataUrl: string, promptText: string) => {
    if (!hasProject) {
      toast('Buka atau buat proyek dulu, lalu kembali ke sini untuk memasang gambar ini.', 'error');
      return;
    }
    const asset = generatedImageToAsset({ id: '', prompt: promptText, storagePath: '', width: 0, height: 0, createdAt: '', url: '' }, dataUrl);
    useProjectStore.getState().addAsset(asset);
    toast('Gambar ditambahkan ke pustaka aset proyek aktif — pilih di tab Aset pada slide manapun.', 'success');
  };

  const download = (dataUrl: string, promptText: string) => {
    downloadBlob(generatedImageBlob(dataUrl), `${(promptText || 'gambar-ai').slice(0, 40).replace(/[^a-z0-9]+/gi, '-')}.png`);
  };

  const useGalleryItem = async (g: GeneratedImage) => {
    try {
      const dataUrl = await fetchAsDataUrl(g.url);
      useInProject(dataUrl, g.prompt);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengambil gambar', 'error');
    }
  };

  const downloadGalleryItem = async (g: GeneratedImage) => {
    try {
      const dataUrl = await fetchAsDataUrl(g.url);
      download(dataUrl, g.prompt);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengunduh gambar', 'error');
    }
  };

  const remove = async (g: GeneratedImage) => {
    if (!window.confirm('Hapus gambar ini dari pustaka? Tindakan ini tidak bisa dibatalkan.')) return;
    try {
      await deleteGeneratedImage(g.id, g.storagePath);
      setGallery((list) => (list ?? []).filter((x) => x.id !== g.id));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menghapus gambar', 'error');
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold">AI Generate Gambar</h1>
      <p className="mt-1 text-sm text-muted">Deskripsikan gambar yang Anda mau — hasilnya otomatis tersimpan di pustaka akun ini, siap dipakai di proyek mana pun.</p>

      <section className="glass mt-5 rounded-2xl border border-line p-5">
        <Field label="Deskripsi gambar">
          <textarea
            className={`${inputClass} min-h-24 resize-none text-[15px]`}
            placeholder="mis. ilustrasi flat vector tim kerja berdiskusi di sekitar meja, warna ungu-cyan"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </Field>
        <Field label="Resolusi" className="mt-4">
          <Segmented<ImageResolution> value={resolution} onChange={setResolution} options={RESOLUTIONS} />
        </Field>
        <div className="mt-3 flex items-center justify-between gap-3">
          <button onClick={() => useUIStore.getState().openModal('billing')} className="flex items-center gap-2 text-xs text-muted hover:text-fg">
            <span className={`size-2 rounded-full ${outOfCredits ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            {credits ?? '…'} kredit tersisa · butuh {cost} untuk {resolution}
          </button>
          <Button
            variant="primary"
            loading={busy}
            icon={<Wand2 className="size-4" />}
            onClick={() => (outOfCredits ? useUIStore.getState().openModal('billing') : void generate())}
          >
            {outOfCredits ? 'Kredit tidak cukup — isi ulang' : 'Buat gambar'}
          </Button>
        </div>

        {result && (
          <div className="mt-5 border-t border-line pt-5">
            <img src={result.dataUrl} alt={prompt} className="w-full rounded-xl border border-line" />
            <div className="mt-3 flex gap-2">
              <Button variant="primary" size="sm" icon={<ImagePlus className="size-3.5" />} onClick={() => useInProject(result.dataUrl, prompt)}>
                Gunakan di proyek aktif
              </Button>
              <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => download(result.dataUrl, prompt)}>
                Unduh kualitas tinggi
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-muted">Aset Gambar Saya {gallery ? `(${gallery.length})` : ''}</h2>
        {gallery === null ? (
          <p className="mt-3 text-sm text-muted">Memuat…</p>
        ) : gallery.length === 0 ? (
          <div className="glass mt-3 rounded-2xl border border-line p-6 text-center text-sm text-muted">Belum ada gambar. Buat satu di atas untuk mulai.</div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gallery.map((g) => (
              <div key={g.id} className="group relative overflow-hidden rounded-xl border border-line bg-field">
                <img src={g.url} alt={g.prompt} className="aspect-video w-full object-cover" loading="lazy" />
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-linear-to-t from-black/70 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100">
                  <OverlayIconButton label="Gunakan di proyek aktif" onClick={() => void useGalleryItem(g)}>
                    <ImagePlus className="size-3.5" />
                  </OverlayIconButton>
                  <OverlayIconButton label="Unduh" onClick={() => void downloadGalleryItem(g)}>
                    <Download className="size-3.5" />
                  </OverlayIconButton>
                  <span className="flex-1" />
                  <OverlayIconButton label="Hapus" onClick={() => void remove(g)}>
                    <Trash2 className="size-3.5" />
                  </OverlayIconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-muted">
        <Sparkles className="mt-0.5 size-3.5 shrink-0" />
        Ditenagai GPT Image 2 (OpenAI) — resmi disebut model gambar paling canggih OpenAI saat ini. Resolusi lebih tinggi = biaya asli lebih mahal, jadi kredit yang dipotong ikut menyesuaikan per pilihan di atas.
      </p>
    </div>
  );
}
