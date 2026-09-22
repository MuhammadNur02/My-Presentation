import { Film, Search, Sparkles, Trash2, Upload, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SCENES, SCENE_H, SCENE_W, drawScene, suggestScenes } from '../../engine';
import { useAssets } from '../../hooks/useAssets';
import { llmConfigured, suggestSceneWithLLM } from '../../services/ai/llm';
import { searchGifs, type GifCandidate } from '../../services/media/giphy';
import { MAX_GIF_BYTES, MAX_VIDEO_BYTES } from '../../services/media/assets';
import { useProjectStore } from '../../store/projectStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import type { Asset, Language, Slide } from '../../types';
import { cn } from '../../utils/cn';
import { Button, SectionTitle, inputClass } from '../common/ui';

/* ---- pratinjau mini animasi generatif: satu loop rAF bersama untuk semua kartu ---- */
interface Preview {
  ctx: CanvasRenderingContext2D;
  scene: string;
  lang: Language;
  t0: number;
  last: number;
}
const previews = new Set<Preview>();
let loopId = 0;
function loop(now: number): void {
  for (const p of previews) {
    if (now - p.last < 85) continue; // ±12 fps cukup untuk kartu kecil
    p.last = now;
    drawScene(p.ctx, p.scene, (now - p.t0) / 1000 + 0.6, { lang: p.lang }, p.ctx.canvas.width / SCENE_W);
  }
  loopId = previews.size ? requestAnimationFrame(loop) : 0;
}

function ScenePreview({ scene, lang }: { scene: string; lang: Language }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const p: Preview = { ctx, scene, lang, t0: performance.now(), last: -1e9 };
    previews.add(p);
    if (!loopId) loopId = requestAnimationFrame(loop);
    return () => {
      previews.delete(p);
    };
  }, [scene, lang]);
  return <canvas ref={ref} width={240} height={Math.round((240 * SCENE_H) / SCENE_W)} className="block aspect-video w-full" />;
}

const animKindLabel = (a: Asset): string => (a.anim?.kind === 'gif' ? 'GIF' : a.anim?.kind === 'video' ? 'Video' : 'Generatif');

/**
 * Animasi & media bergerak untuk menjelaskan isi slide (mis. slide tentang sel darah → animasi sel darah mengalir):
 *  1) Animasi generatif bawaan — dipilih otomatis dari isi slide, atau dipilih AI (bila kunci Claude diisi);
 *  2) Cari GIF (GIPHY);
 *  3) Unggah GIF / MP4 / WebM sendiri.
 */
export function AnimationPanel({ slide }: { slide: Slide }) {
  const project = useProjectStore((s) => s.project)!;
  const giphyKey = useSettingsStore((s) => s.giphyKey);
  const anthropicKey = useSettingsStore((s) => s.anthropicKey);
  const anthropicBaseUrl = useSettingsStore((s) => s.anthropicBaseUrl);
  const anthropicModel = useSettingsStore((s) => s.anthropicModel);
  const { busy, uploadMotion, applyScene, applyGif, applyMotion } = useAssets();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [gifNote, setGifNote] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');

  const lang = project.language;
  const suggestions = useMemo(
    () => suggestScenes(slide).slice(0, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slide.title, slide.subtitle, slide.bullets, slide.imageQuery],
  );
  const suggested = new Set(suggestions.map((s) => s.scene.id));
  const currentScene = slide.imageId ? project.assets[slide.imageId]?.anim?.scene : undefined;
  const library = Object.values(project.assets).filter((a) => a.anim);
  const llmOn = llmConfigured({ apiKey: anthropicKey, model: anthropicModel, baseUrl: anthropicBaseUrl });

  const askAi = async () => {
    setAiBusy(true);
    setAiNote('');
    try {
      const r = await suggestSceneWithLLM(
        slide,
        SCENES.map((s) => ({ id: s.id, label: s.label, description: s.description })),
        { apiKey: anthropicKey, model: anthropicModel, baseUrl: anthropicBaseUrl },
      );
      if (r.scene) {
        applyScene(slide.id, r.scene);
        setAiNote(`AI memilih “${SCENES.find((s) => s.id === r.scene)?.label}”. ${r.reason}`);
      } else {
        setAiNote(`AI menilai tidak ada animasi bawaan yang cocok. ${r.reason}`);
      }
    } catch (err) {
      setAiNote(err instanceof Error ? err.message : 'Gagal meminta AI');
    } finally {
      setAiBusy(false);
    }
  };

  const searchGif = async () => {
    if (!giphyKey.trim()) return;
    setSearching(true);
    setGifNote('');
    try {
      const list = await searchGifs(query, giphyKey, 12, lang);
      setGifs(list);
      if (!list.length) setGifNote('Tidak ada GIF yang cocok. Coba kata kunci lain (bahasa Inggris biasanya lebih banyak hasil).');
    } catch (err) {
      setGifs([]);
      setGifNote(err instanceof Error ? err.message : 'Pencarian GIF gagal');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Animasi generatif</SectionTitle>
        <p className="mb-3 text-[11.5px] leading-relaxed text-muted">
          Ilustrasi bergerak yang digambar oleh kode — tajam di layar berapa pun, tanpa berkas, dan ikut terekspor. Berlabel sesuai bahasa
          proyek.
        </p>
        {suggestions.length > 0 ? (
          <div className="mb-3 flex items-start gap-2 rounded-xl bg-accent-soft p-3 text-[12px] text-accent">
            <Sparkles className="mt-0.5 size-4 shrink-0" />
            <p>
              Cocok untuk slide ini: <span className="font-semibold">{suggestions.map((s) => s.scene.label).join(', ')}</span>
            </p>
          </div>
        ) : (
          <p className="mb-3 text-[11.5px] text-muted">Belum ada topik slide yang cocok dengan animasi bawaan — pilih manual di bawah.</p>
        )}
        {llmOn && (
          <Button size="sm" className="mb-3 w-full" loading={aiBusy} icon={<Wand2 className="size-3.5" />} onClick={() => void askAi()}>
            Minta AI memilih animasi untuk slide ini
          </Button>
        )}
        {aiNote && <p className="mb-3 text-[11.5px] leading-relaxed text-muted">{aiNote}</p>}
        <div className="grid grid-cols-2 gap-2.5">
          {SCENES.map((s) => {
            const active = currentScene === s.id;
            return (
              <button
                key={s.id}
                onClick={() => applyScene(slide.id, s.id)}
                aria-pressed={active}
                title={s.description}
                className={cn(
                  'group relative overflow-hidden rounded-xl border text-left transition',
                  active ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-accent/60',
                )}
              >
                <ScenePreview scene={s.id} lang={lang} />
                <div className="flex items-center justify-between gap-1 px-2.5 py-1.5 text-[12px] font-medium">
                  <span className="truncate">{s.label}</span>
                  {suggested.has(s.id) && <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold text-white">cocok</span>}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle>Cari GIF</SectionTitle>
        {!giphyKey.trim() ? (
          <div className="rounded-xl bg-field p-3 text-[12px] leading-relaxed text-muted">
            Pencarian GIF memakai <span className="font-medium text-fg">GIPHY</span> dan butuh API key gratis.{' '}
            <button className="font-medium text-accent hover:underline" onClick={() => useUIStore.getState().openModal('settings')}>
              Isi di Pengaturan
            </button>
            . Sementara itu, Anda bisa mengunggah GIF sendiri atau memakai animasi generatif di atas.
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={query}
                placeholder="mis. blood cells, heartbeat, dna…"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void searchGif()}
              />
              <Button loading={searching} onClick={() => void searchGif()} icon={<Search className="size-4" />}>
                Cari
              </Button>
            </div>
            {gifNote && <p className="mt-2 text-[11px] text-muted">{gifNote}</p>}
            {gifs.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {gifs.map((g) => (
                  <button
                    key={g.id}
                    disabled={busy}
                    onClick={() => void applyGif(slide.id, g)}
                    title={g.title}
                    className="aspect-video overflow-hidden rounded-lg bg-field ring-1 ring-line transition hover:ring-2 hover:ring-accent disabled:opacity-60"
                  >
                    <img src={g.thumb} alt={g.title} className="size-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-[10.5px] uppercase tracking-wider text-muted">Powered by GIPHY</p>
          </>
        )}
      </section>

      <section>
        <SectionTitle>Unggah GIF / video</SectionTitle>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = Array.from(e.dataTransfer.files)[0];
            if (f) void uploadMotion(f, slide.id);
          }}
          className={cn(
            'grid place-items-center gap-2 rounded-2xl border border-dashed px-4 py-6 text-center transition',
            dragOver ? 'border-accent bg-accent-soft' : 'border-line bg-field',
          )}
        >
          <Upload className="size-5 text-muted" />
          <p className="text-xs text-muted">Tarik GIF, MP4, atau WebM ke sini, atau</p>
          <Button size="sm" loading={busy} icon={<Film className="size-3.5" />} onClick={() => fileRef.current?.click()}>
            Pilih berkas
          </Button>
          <p className="text-[10.5px] text-muted">
            Maks. {Math.round(MAX_GIF_BYTES / 1048576)} MB (GIF) · {Math.round(MAX_VIDEO_BYTES / 1048576)} MB (video). Video diputar berulang tanpa suara.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/gif,video/mp4,video/webm,.gif,.mp4,.webm"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadMotion(f, slide.id);
            e.target.value = '';
          }}
        />
      </section>

      {library.length > 0 && (
        <section>
          <SectionTitle>Pustaka animasi ({library.length})</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {library.map((a) => (
              <div key={a.id} className="group relative">
                <button
                  onClick={() => applyMotion(slide.id, a)}
                  title={a.name}
                  aria-pressed={slide.imageId === a.id}
                  className={cn(
                    'relative block aspect-video w-full overflow-hidden rounded-lg bg-field ring-1 transition',
                    slide.imageId === a.id ? 'ring-2 ring-accent' : 'ring-line hover:ring-accent/60',
                  )}
                >
                  <img src={a.anim?.kind === 'gif' ? a.anim.src : a.dataUrl} alt={a.name} className="size-full object-cover" loading="lazy" />
                  <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold text-white">{animKindLabel(a)}</span>
                </button>
                <button
                  onClick={() => useProjectStore.getState().removeAsset(a.id)}
                  aria-label={`Hapus ${a.name}`}
                  className="absolute right-1 top-1 grid size-5 place-items-center rounded-md bg-black/65 text-white opacity-0 transition group-hover:opacity-100"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
