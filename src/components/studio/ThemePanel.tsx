import { RotateCcw } from 'lucide-react';
import { FONT_STACKS, PATTERN_OPTIONS, THEME_PRESETS, resolveTheme } from '../../engine';
import { useProjectStore } from '../../store/projectStore';
import type { FontStyle, PatternId, Tone } from '../../types';
import { cn } from '../../utils/cn';
import { IconButton, SectionTitle, Segmented, Switch } from '../common/ui';

const TONES: { id: Tone; label: string }[] = [
  { id: 'professional', label: 'Profesional' },
  { id: 'creative', label: 'Kreatif' },
  { id: 'minimal', label: 'Minimalis' },
  { id: 'educational', label: 'Edukatif' },
];

/** Sistem desain global: satu klik mengubah palet, tipografi, dan mood seluruh slide. */
export function ThemePanel() {
  const project = useProjectStore((s) => s.project)!;
  const setTheme = useProjectStore((s) => s.setTheme);
  const setTone = useProjectStore((s) => s.setTone);
  const resolved = resolveTheme(project.theme);
  const cfg = project.theme;

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Tema</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5">
          {THEME_PRESETS.map((p) => {
            const active = cfg.presetId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setTheme({ presetId: p.id, accent: undefined, accent2: undefined, pattern: undefined })}
                aria-pressed={active}
                className={cn('overflow-hidden rounded-2xl border text-left transition', active ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-accent/50')}
              >
                <div className="relative h-16" style={{ background: `linear-gradient(135deg, ${p.bg1}, ${p.bg2})` }}>
                  <span className="absolute left-3 top-3 h-1.5 w-8 rounded-full" style={{ background: `linear-gradient(90deg, ${p.accent}, ${p.accent2})` }} />
                  <span className="absolute left-3 top-7 h-2 w-14 rounded" style={{ background: p.text, opacity: 0.85 }} />
                  <span className="absolute left-3 top-11 h-1.5 w-10 rounded" style={{ background: p.muted, opacity: 0.8 }} />
                  <span className="absolute bottom-2 right-3 flex gap-1">
                    <i className="size-2.5 rounded-full" style={{ background: p.accent }} />
                    <i className="size-2.5 rounded-full" style={{ background: p.accent2 }} />
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-xs font-medium">
                  {p.name}
                  <span className="text-[10px] uppercase tracking-wider text-muted">{p.mode === 'dark' ? 'Gelap' : 'Terang'}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle
          action={
            (cfg.accent || cfg.accent2) && (
              <IconButton label="Reset warna" onClick={() => setTheme({ accent: undefined, accent2: undefined })}>
                <RotateCcw className="size-3.5" />
              </IconButton>
            )
          }
        >
          Warna merek
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <ColorField label="Aksen utama" value={resolved.accent} onChange={(v) => setTheme({ accent: v })} />
          <ColorField label="Aksen kedua" value={resolved.accent2} onChange={(v) => setTheme({ accent2: v })} />
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Pola latar</SectionTitle>
        <div className="grid grid-cols-3 gap-1.5">
          {PATTERN_OPTIONS.map((o) => {
            const active = resolved.pattern === o.id;
            return (
              <button
                key={o.id}
                onClick={() => setTheme({ pattern: o.id as PatternId })}
                aria-pressed={active}
                className={cn(
                  'rounded-xl border px-2 py-2 text-[12px] font-medium transition',
                  active ? 'border-accent bg-accent-soft text-accent' : 'border-transparent bg-field text-muted hover:text-fg',
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-muted">Pola tipis di latar semua slide; memudar di tengah agar teks tetap terbaca.</p>
      </section>

      <section className="space-y-3">
        <SectionTitle>Tipografi</SectionTitle>
        <Segmented<FontStyle>
          value={cfg.fontStyle}
          onChange={(fontStyle) => setTheme({ fontStyle })}
          options={(Object.keys(FONT_STACKS) as FontStyle[]).map((k) => ({ id: k, label: FONT_STACKS[k].label.split(' ')[0] }))}
        />
        <Switch label="Nomor slide" checked={cfg.showSlideNumber} onChange={(v) => setTheme({ showSlideNumber: v })} />
      </section>

      <section className="space-y-3">
        <SectionTitle>Gaya AI</SectionTitle>
        <Segmented<Tone> value={project.tone} onChange={setTone} options={TONES} className="[&_button]:px-1.5 [&_button]:text-[12px]" />
        <p className="text-[11px] leading-relaxed text-muted">
          Gaya memengaruhi pilihan transisi, animasi elemen, dan gambar saat AI merencanakan ulang deck.
        </p>
      </section>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2.5 rounded-xl bg-field p-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-8 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
      />
      <span className="min-w-0 text-xs">
        <span className="block font-medium">{label}</span>
        <span className="block uppercase text-muted">{value}</span>
      </span>
    </label>
  );
}
