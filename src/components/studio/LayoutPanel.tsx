import {
  AlignEndVertical,
  AlignHorizontalJustifyCenter,
  AlignStartVertical,
  AlignVerticalJustifyCenter,
  MousePointer2,
  RotateCcw,
} from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { LayoutOverride, Slide } from '../../types';
import { cn } from '../../utils/cn';
import { Button, Field, SectionTitle, Slider, inputClass } from '../common/ui';

const W = 1920;
const H = 1080;

const FRAMES: { label: string; radius: number }[] = [
  { label: 'Kotak', radius: 0 },
  { label: 'Halus', radius: 24 },
  { label: 'Membulat', radius: 56 },
  { label: 'Kapsul / bulat', radius: 9999 },
];

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <input
        type="number"
        className={inputClass}
        value={Math.round(value)}
        onChange={(e) => {
          const v = e.target.valueAsNumber;
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </Field>
  );
}

/**
 * Panel Posisi — tata letak manual. Pilih elemen (klik di Live Monitor atau daftar di sini), lalu geser/ubah ukuran
 * langsung di monitor, atau isi angka presisi di sini. Semua tersimpan di `Slide.overrides` dan bisa di-undo.
 */
export function LayoutPanel({ slide }: { slide: Slide }) {
  const layers = useUIStore((s) => s.layerInfos);
  const selectedId = useUIStore((s) => s.selectedLayer);
  const layer = layers.find((l) => l.id === selectedId) ?? null;
  const setOverride = useProjectStore((s) => s.setOverride);
  const overrides = slide.overrides ?? {};
  const ov: LayoutOverride | undefined = layer ? overrides[layer.id] : undefined;
  const changed = Object.keys(overrides).length;

  const patch = (p: Partial<LayoutOverride>) => layer && setOverride(slide.id, layer.id, p);
  const r = layer?.rect;

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle
          action={
            changed > 0 ? (
              <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => useProjectStore.getState().clearOverrides(slide.id)}>
                Reset semua
              </Button>
            ) : undefined
          }
        >
          Elemen pada slide
        </SectionTitle>
        {layers.length === 0 ? (
          <p className="text-[12px] text-muted">Slide ini belum memiliki elemen yang bisa diatur.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-1.5">
            {layers.map((l) => {
              const active = l.id === selectedId;
              return (
                <li key={l.id}>
                  <button
                    onClick={() => {
                      useUIStore.getState().selectLayer(active ? null : l.id);
                      useUIStore.getState().selectRole(active ? null : l.motionRole);
                    }}
                    aria-pressed={active}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[12px] font-medium transition',
                      active ? 'border-accent bg-accent-soft text-accent' : 'border-transparent bg-field text-fg hover:bg-field-hover',
                    )}
                  >
                    <span className="truncate">{l.label}</span>
                    {overrides[l.id] && <span className="size-1.5 shrink-0 rounded-full bg-accent" title="Posisi diubah manual" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!layer || !r ? (
        <section className="flex items-start gap-3 rounded-2xl bg-field p-4 text-[12px] leading-relaxed text-muted">
          <MousePointer2 className="mt-0.5 size-4 shrink-0 text-accent" />
          <div>
            <p className="font-medium text-fg">Pilih elemen untuk mengatur posisinya.</p>
            <p className="mt-1">
              Klik teks, foto, atau logo langsung di Live Monitor, lalu <span className="text-fg">seret</span> untuk menggeser dan tarik
              pegangan di tepinya untuk mengubah ukuran. Garis pemandu muncul otomatis; tahan <span className="text-fg">Alt</span> untuk
              menonaktifkannya. Panah keyboard menggeser 1 px (Shift = 10 px).
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className="space-y-4">
            <SectionTitle
              action={
                ov ? (
                  <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => setOverride(slide.id, layer.id, null)}>
                    Reset elemen
                  </Button>
                ) : undefined
              }
            >
              {layer.label}
            </SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="X" value={r.x} onChange={(v) => patch({ x: v })} />
              <NumField label="Y" value={r.y} onChange={(v) => patch({ y: v })} />
              <NumField label={layer.edit === 'text' ? 'Lebar teks' : 'Lebar'} value={r.w} onChange={(v) => patch(layer.edit === 'lock' ? { w: Math.max(48, v), h: Math.max(48, (v * r.h) / r.w) } : { w: Math.max(48, v) })} />
              {layer.edit !== 'text' && (
                <NumField label="Tinggi" value={r.h} onChange={(v) => patch(layer.edit === 'lock' ? { h: Math.max(48, v), w: Math.max(48, (v * r.w) / r.h) } : { h: Math.max(48, v) })} />
              )}
            </div>

            <div>
              <div className="mb-1.5 text-xs font-medium text-muted">Rata di slide</div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: 'Tengah horizontal', icon: <AlignHorizontalJustifyCenter className="size-4" />, run: () => patch({ x: Math.round((W - r.w) / 2) }) },
                  { label: 'Tengah vertikal', icon: <AlignVerticalJustifyCenter className="size-4" />, run: () => patch({ y: Math.round((H - r.h) / 2) }) },
                  { label: 'Rata kiri (margin)', icon: <AlignStartVertical className="size-4" />, run: () => patch({ x: 120 }) },
                  { label: 'Rata kanan (margin)', icon: <AlignEndVertical className="size-4" />, run: () => patch({ x: Math.round(W - 120 - r.w) }) },
                ].map((a) => (
                  <button
                    key={a.label}
                    title={a.label}
                    aria-label={a.label}
                    onClick={a.run}
                    className="grid h-9 place-items-center rounded-xl bg-field text-muted transition hover:bg-field-hover hover:text-fg"
                  >
                    {a.icon}
                  </button>
                ))}
              </div>
            </div>

            {layer.edit === 'text' && (
              <Slider
                label="Skala teks elemen ini"
                min={0.3}
                max={3}
                step={0.05}
                value={ov?.scale ?? 1}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => patch({ scale: Math.abs(v - 1) < 0.001 ? undefined : v })}
              />
            )}

            {layer.id === 'hero' && (
              <div className="space-y-3">
                <div>
                  <div className="mb-1.5 text-xs font-medium text-muted">Bentuk bingkai foto</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {FRAMES.map((f) => {
                      const cur = Math.round(layer.radius);
                      const active = f.radius >= 9999 ? cur >= Math.floor(Math.min(r.w, r.h) / 2) - 1 : cur === f.radius;
                      return (
                        <button
                          key={f.label}
                          onClick={() => patch({ radius: f.radius })}
                          aria-pressed={active}
                          className={cn(
                            'rounded-xl border px-2 py-2 text-[12px] font-medium transition',
                            active ? 'border-accent bg-accent-soft text-accent' : 'border-transparent bg-field text-muted hover:text-fg',
                          )}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Slider
                  label="Kelengkungan sudut"
                  min={0}
                  max={Math.max(1, Math.floor(Math.min(r.w, r.h) / 2))}
                  step={1}
                  value={Math.min(layer.radius, Math.floor(Math.min(r.w, r.h) / 2))}
                  format={(v) => `${Math.round(v)} px`}
                  onChange={(v) => patch({ radius: v })}
                />
                <p className="text-[11px] leading-snug text-muted">Foto dipangkas otomatis (cover) mengikuti bentuk & ukuran bingkai. Untuk lingkaran, buat lebar = tinggi.</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
