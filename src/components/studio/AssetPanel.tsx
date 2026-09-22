import { ImagePlus, Search, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { resolveTheme } from '../../engine';
import { useAssets } from '../../hooks/useAssets';
import { imageQueryFor } from '../../services/ai/keywords';
import { candidateToAsset, searchImages, type ImageCandidate } from '../../services/ai/imageProvider';
import { useProjectStore } from '../../store/projectStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import type { Slide } from '../../types';
import { cn } from '../../utils/cn';
import { Button, Segmented, SectionTitle, inputClass } from '../common/ui';
import { AnimationPanel } from './AnimationPanel';

/** Pustaka aset: unggah lokal, cari stok/generatif, pakai ulang di slide, kelola logo. */
export function AssetPanel({ slide }: { slide: Slide }) {
  const project = useProjectStore((s) => s.project)!;
  const unsplashKey = useSettingsStore((s) => s.unsplashKey);
  const { busy, uploadImage, uploadLogo } = useAssets();
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ImageCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState('');

  const mode = useUIStore((s) => s.assetMode);
  const images = Object.values(project.assets).filter((a) => a.kind === 'image' && !a.anim);
  const logos = Object.values(project.assets).filter((a) => a.kind === 'logo');
  const theme = resolveTheme(project.theme);

  const search = async () => {
    const q = query.trim() || slide.imageQuery || imageQueryFor(slide.title, slide.subtitle);
    setQuery(q);
    setSearching(true);
    setNote('');
    try {
      const { candidates, note: n } = await searchImages(q, { unsplashKey, theme, count: 6 });
      setResults(candidates);
      setNote(n ?? (unsplashKey ? '' : 'Mode offline: ilustrasi generatif. Tambahkan kunci Unsplash di Pengaturan untuk foto stok.'));
    } finally {
      setSearching(false);
    }
  };

  const useCandidate = async (c: ImageCandidate) => {
    try {
      const asset = await candidateToAsset(c, theme, query || 'gambar');
      const store = useProjectStore.getState();
      store.addAsset(asset);
      store.updateSlide(slide.id, { imageId: asset.id });
    } catch (err) {
      useUIStore.getState().toast(err instanceof Error ? err.message : 'Gagal mengambil gambar', 'error');
    }
  };

  const modeSwitch = (
    <Segmented<'image' | 'animation'>
      value={mode}
      onChange={(m) => useUIStore.getState().setAssetMode(m)}
      options={[
        { id: 'image', label: 'Gambar' },
        { id: 'animation', label: 'Animasi / GIF' },
      ]}
    />
  );

  if (mode === 'animation') {
    return (
      <div className="space-y-5">
        {modeSwitch}
        <AnimationPanel slide={slide} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {modeSwitch}
      <section>
        <SectionTitle>Unggah</SectionTitle>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            Array.from(e.dataTransfer.files).forEach((f) => void uploadImage(f));
          }}
          className={cn(
            'grid place-items-center gap-2 rounded-2xl border border-dashed px-4 py-6 text-center transition',
            dragOver ? 'border-accent bg-accent-soft' : 'border-line bg-field',
          )}
        >
          <Upload className="size-5 text-muted" />
          <p className="text-xs text-muted">Tarik gambar ke sini (GIF/video otomatis jadi animasi), atau</p>
          <div className="flex gap-2">
            <Button size="sm" loading={busy} onClick={() => fileRef.current?.click()} icon={<ImagePlus className="size-3.5" />}>
              Pilih gambar
            </Button>
            <Button size="sm" loading={busy} onClick={() => logoRef.current?.click()}>
              Unggah logo
            </Button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/mp4,video/webm"
          multiple
          hidden
          onChange={(e) => {
            Array.from(e.target.files ?? []).forEach((f) => void uploadImage(f));
            e.target.value = '';
          }}
        />
        <input
          ref={logoRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadLogo(f);
            e.target.value = '';
          }}
        />
      </section>

      {logos.length > 0 && (
        <section>
          <SectionTitle>Logo</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {logos.map((a) => (
              <AssetTile
                key={a.id}
                src={a.dataUrl}
                name={a.name}
                selected={project.logoId === a.id}
                contain
                onPick={() => useProjectStore.getState().setLogo(project.logoId === a.id ? null : a.id)}
                onDelete={() => useProjectStore.getState().removeAsset(a.id)}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Cari gambar kontekstual</SectionTitle>
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={query}
            placeholder={slide.imageQuery || 'kata kunci…'}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void search()}
          />
          <Button loading={searching} onClick={() => void search()} icon={<Search className="size-4" />}>
            Cari
          </Button>
        </div>
        {note && <p className="mt-2 text-[11px] text-muted">{note}</p>}
        {results.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {results.map((c) => (
              <button
                key={c.id}
                onClick={() => void useCandidate(c)}
                title={c.credit}
                className="aspect-video overflow-hidden rounded-lg ring-1 ring-line transition hover:ring-2 hover:ring-accent"
              >
                <img src={c.thumb} alt={c.credit} className="size-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Pustaka gambar ({images.length})</SectionTitle>
        {images.length === 0 ? (
          <p className="text-xs text-muted">Belum ada gambar. Unggah atau buat gambar kontekstual untuk mulai.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {images.map((a) => (
              <AssetTile
                key={a.id}
                src={a.dataUrl}
                name={a.name}
                selected={slide.imageId === a.id}
                onPick={() => useProjectStore.getState().updateSlide(slide.id, { imageId: a.id })}
                onDelete={() => useProjectStore.getState().removeAsset(a.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AssetTile({
  src,
  name,
  selected,
  contain,
  onPick,
  onDelete,
}: {
  src: string;
  name: string;
  selected: boolean;
  contain?: boolean;
  onPick: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative">
      <button
        onClick={onPick}
        title={name}
        aria-pressed={selected}
        className={cn(
          'block aspect-video w-full overflow-hidden rounded-lg bg-field ring-1 transition',
          selected ? 'ring-2 ring-accent' : 'ring-line hover:ring-accent/60',
        )}
      >
        <img src={src} alt={name} className={cn('size-full', contain ? 'object-contain p-1.5' : 'object-cover')} loading="lazy" />
      </button>
      <button
        onClick={onDelete}
        aria-label={`Hapus ${name}`}
        className="absolute right-1 top-1 grid size-5 place-items-center rounded-md bg-black/65 text-white opacity-0 transition group-hover:opacity-100"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}
