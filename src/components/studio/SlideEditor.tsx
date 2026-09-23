import {
  AlignLeft,
  BarChart3,
  ChartColumn,
  Columns2,
  Film,
  GitCompare,
  Image as ImageIcon,
  ImagePlus,
  ListOrdered,
  Megaphone,
  Milestone,
  Move,
  Quote,
  Sparkles,
  Trash2,
  Type,
  Wand2,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAssets } from '../../hooks/useAssets';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { LayoutId, Slide } from '../../types';
import { cn } from '../../utils/cn';
import { Button, Field, Slider, SectionTitle, Switch, inputClass } from '../common/ui';
import { RichTextArea } from './RichTextArea';

const LAYOUTS: { id: LayoutId; label: string; icon: ReactNode }[] = [
  { id: 'auto', label: 'Otomatis', icon: <Wand2 className="size-4" /> },
  { id: 'title', label: 'Sampul', icon: <Type className="size-4" /> },
  { id: 'content', label: 'Konten', icon: <AlignLeft className="size-4" /> },
  { id: 'split', label: 'Split', icon: <Columns2 className="size-4" /> },
  { id: 'image-full', label: 'Gambar penuh', icon: <ImageIcon className="size-4" /> },
  { id: 'quote', label: 'Kutipan', icon: <Quote className="size-4" /> },
  { id: 'stats', label: 'Statistik', icon: <BarChart3 className="size-4" /> },
  { id: 'chart', label: 'Grafik', icon: <ChartColumn className="size-4" /> },
  { id: 'numbered', label: 'Bernomor', icon: <ListOrdered className="size-4" /> },
  { id: 'timeline', label: 'Linimasa', icon: <Milestone className="size-4" /> },
  { id: 'compare', label: 'Bandingkan', icon: <GitCompare className="size-4" /> },
  { id: 'statement', label: 'Pernyataan', icon: <Megaphone className="size-4" /> },
];

/** Petunjuk format poin per layout. */
const BULLET_HINT: Partial<Record<LayoutId, string>> = {
  stats: 'format: nilai | label',
  chart: 'format: nilai | label (mis. "82% | Kepuasan pelanggan")',
  timeline: 'format: tahun | keterangan',
  compare: 'pisahkan dua sisi dengan baris ---',
  numbered: 'maks. 5 poin',
  statement: 'maks. 3 baris kecil',
};


/**
 * Editor konten satu slide. `basic` (tahap tinjau sebelum Generate) hanya menampilkan teks, gambar,
 * dan logo; mode penuh (studio) menambah tata letak, ukuran teks, dan animasi elemen.
 */
export function SlideEditor({ slide, basic = false }: { slide: Slide; basic?: boolean }) {
  const update = useProjectStore((s) => s.updateSlide);
  const assets = useProjectStore((s) => s.project?.assets);
  const logoId = useProjectStore((s) => s.project?.logoId ?? null);
  const { busy, uploadImage, uploadLogo, generateForSlide } = useAssets();
  const imgInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  // Poin diedit sebagai teks bebas (satu per baris); simpan hanya baris tidak kosong.
  const [bulletText, setBulletText] = useState(slide.bullets.join('\n'));
  useEffect(() => {
    const cur = bulletText.split('\n').map((s) => s.trim()).filter(Boolean).join('\n');
    if (cur !== slide.bullets.join('\n')) setBulletText(slide.bullets.join('\n'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.bullets, slide.id]);

  const image = slide.imageId ? assets?.[slide.imageId] : undefined;
  const logo = logoId ? assets?.[logoId] : undefined;
  const set = (patch: Partial<Slide>) => update(slide.id, patch);

  return (
    <div className="space-y-5">
      {!basic && (
        <section>
          <SectionTitle>Tata letak</SectionTitle>
          <div className="grid grid-cols-4 gap-1.5">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                onClick={() => set(slide.layout === l.id ? {} : { layout: l.id, overrides: undefined })}
                aria-pressed={slide.layout === l.id}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-medium transition',
                  slide.layout === l.id ? 'border-accent bg-accent-soft text-accent' : 'border-transparent bg-field text-muted hover:text-fg',
                )}
              >
                {l.icon}
                <span className="leading-tight">{l.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <SectionTitle>Teks</SectionTitle>
        <Field label="Judul">
          <RichTextArea value={slide.title} rows={2} placeholder="Judul slide" onChange={(v) => set({ title: v.replace(/\n/g, ' ') })} />
        </Field>
        <Field label="Subjudul">
          <input className={inputClass} value={slide.subtitle} placeholder="Opsional" onChange={(e) => set({ subtitle: e.target.value })} />
        </Field>
        <Field label="Poin-poin" hint={BULLET_HINT[slide.layout] ?? 'satu poin per baris'}>
          <RichTextArea
            value={bulletText}
            rows={6}
            placeholder={'Poin pertama\nPoin kedua'}
            onChange={(v) => {
              setBulletText(v);
              set({ bullets: v.split('\n').map((s) => s.trim()).filter(Boolean) });
            }}
          />
        </Field>
      </section>

      <section>
        <SectionTitle>Gambar</SectionTitle>
        <div className="flex gap-3">
          <div className="grid aspect-video w-32 shrink-0 place-items-center overflow-hidden rounded-xl bg-field text-muted">
            {image ? (
              <span className="relative block size-full">
                <img src={image.anim?.kind === 'gif' ? image.anim.src : image.dataUrl} alt={image.name} className="size-full object-cover" />
                {image.anim && (
                  <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                    <Film className="size-2.5" />
                    {image.anim.kind === 'gif' ? 'GIF' : image.anim.kind === 'video' ? 'VIDEO' : 'ANIMASI'}
                  </span>
                )}
              </span>
            ) : (
              <ImageIcon className="size-5 opacity-60" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Button size="sm" icon={<ImagePlus className="size-3.5" />} loading={busy} onClick={() => imgInput.current?.click()}>
              Unggah gambar
            </Button>
            <Button size="sm" icon={<Sparkles className="size-3.5" />} loading={busy} onClick={() => void generateForSlide(slide.id)}>
              Gambar kontekstual
            </Button>
            {!basic && (
              <Button
                size="sm"
                icon={<Film className="size-3.5" />}
                onClick={() => {
                  const ui = useUIStore.getState();
                  ui.setAssetMode('animation');
                  ui.setLeftTab('assets');
                }}
              >
                Animasi / GIF
              </Button>
            )}
            {image && (
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => set({ imageId: null })}>
                Hapus gambar
              </Button>
            )}
          </div>
        </div>
        <input
          ref={imgInput}
          type="file"
          accept="image/*,video/mp4,video/webm"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadImage(f, slide.id);
            e.target.value = '';
          }}
        />
        <Field label="Kata kunci gambar" className="mt-3" hint="dipakai untuk pencarian">
          <input className={inputClass} value={slide.imageQuery} placeholder="mis. city skyline sunrise" onChange={(e) => set({ imageQuery: e.target.value })} />
        </Field>
        <Field label="ID elemen (Magic Move)" className="mt-3" hint="samakan antar slide">
          <input
            className={inputClass}
            value={slide.heroTag ?? 'hero'}
            placeholder="hero"
            spellCheck={false}
            onChange={(e) => set({ heroTag: e.target.value.trim().replace(/\s+/g, '-').toLowerCase() })}
          />
        </Field>
        <p className="mt-1.5 text-[11px] leading-snug text-muted">
          Foto/logo utama dengan ID yang sama di dua slide berurutan akan bergeser mulus dan mekar menjadi elemen baru saat memakai
          transisi <span className="font-medium text-fg">Magic Move</span>. Kosongkan untuk menonaktifkan pada slide ini.
        </p>
        {image?.credit && <p className="mt-2 text-[11px] text-muted">{image.credit}</p>}
      </section>

      <section className="space-y-3">
        <SectionTitle>Logo</SectionTitle>
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-field">
            {logo ? <img src={logo.dataUrl} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-[11px] text-muted">Belum ada</span>}
          </div>
          <Button size="sm" loading={busy} onClick={() => logoInput.current?.click()}>
            {logo ? 'Ganti logo' : 'Unggah logo'}
          </Button>
          <input
            ref={logoInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadLogo(f);
              e.target.value = '';
            }}
          />
        </div>
        <Switch label="Tampilkan logo di slide ini" checked={slide.showLogo} onChange={(v) => set({ showLogo: v })} />
      </section>

      {!basic && (
        <section className="space-y-4">
          <SectionTitle>Tampilan</SectionTitle>
          <Slider label="Ukuran teks" min={0.7} max={1.4} step={0.05} value={slide.textScale} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ textScale: v })} />
          <button
            onClick={() => {
              useUIStore.getState().setLeftTab('layout');
            }}
            className="flex w-full items-center gap-2 rounded-xl bg-field px-3 py-2.5 text-left text-[12px] font-medium text-fg transition hover:bg-field-hover"
          >
            <Move className="size-4 shrink-0 text-accent" />
            Geser &amp; ubah ukuran teks/foto secara manual di tab Posisi
          </button>
          <button
            onClick={() => {
              useUIStore.getState().setLeftTab('motion');
            }}
            className="flex w-full items-center gap-2 rounded-xl bg-accent-soft px-3 py-2.5 text-left text-[12px] font-medium text-accent transition hover:brightness-110"
          >
            <Zap className="size-4 shrink-0" />
            Atur animasi, gerak ambient, dan gaya gerak di tab Gerak
          </button>
        </section>
      )}

      <section>
        <SectionTitle>Catatan pembicara</SectionTitle>
        <textarea
          className={cn(inputClass, 'resize-none')}
          rows={4}
          value={slide.notes}
          placeholder="Catatan tersembunyi — tampil di panel presenter (tekan N saat presentasi)"
          onChange={(e) => set({ notes: e.target.value })}
        />
      </section>
    </div>
  );
}
