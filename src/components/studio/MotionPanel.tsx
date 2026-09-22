import { Clapperboard, Play, RotateCcw, Shuffle } from 'lucide-react';
import { useState } from 'react';
import { ROLE_LABEL, isTextRole } from '../../engine/motion';
import { MOTION_STYLE_LIST, styleForTone } from '../../services/ai/motionPresets';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { AmbientMedia, BuildAnimation, ElementMotion, MotionRole, Slide, SlideMotion, TextSplit } from '../../types';
import { cn } from '../../utils/cn';
import { Button, Field, SectionTitle, Slider, Switch, inputClass } from '../common/ui';
import { AMBIENT_OPTIONS, BUILD_OPTIONS, SPLIT_OPTIONS, buildLabel } from './motionLabels';

const ROLES: MotionRole[] = ['title', 'subtitle', 'body', 'media', 'logo'];

/**
 * Panel Gerak — koreografi tiga tingkat:
 *  1) Gaya gerak proyek (preset yang menyelaraskan halaman + elemen + ambient),
 *  2) Gaya & ambient slide ini,
 *  3) Pengaturan per elemen (judul, subjudul, poin, media, logo) — bisa dipilih dengan klik di Live Monitor.
 */
export function MotionPanel({ slide }: { slide: Slide }) {
  const project = useProjectStore((s) => s.project)!;
  const selectedRole = useUIStore((s) => s.selectedRole);
  const selectRole = useUIStore((s) => s.selectRole);
  const [withTransitions, setWithTransitions] = useState(true);
  const style = project.motionStyle ?? styleForTone(project.tone);
  const update = useProjectStore.getState().updateSlide;

  const patchMotion = (patch: Partial<SlideMotion>) => update(slide.id, { motion: { ...slide.motion, ...patch } });
  const patchRole = (role: MotionRole, patch: Partial<ElementMotion>) => {
    const cur = slide.motion?.roles?.[role] ?? {};
    const next: ElementMotion = { ...cur, ...patch };
    (Object.keys(next) as (keyof ElementMotion)[]).forEach((k) => next[k] === undefined && delete next[k]);
    patchMotion({ roles: { ...slide.motion?.roles, [role]: next } });
  };
  const resetRole = (role: MotionRole) => {
    const roles = { ...slide.motion?.roles };
    delete roles[role];
    patchMotion({ roles });
  };

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Gaya gerak proyek</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {MOTION_STYLE_LIST.map((p) => {
            const active = style === p.id;
            return (
              <button
                key={p.id}
                aria-pressed={active}
                onClick={() => {
                  useProjectStore.getState().applyMotionStyle(p.id, withTransitions);
                  useUIStore.getState().toast(`Gaya "${p.label}" diterapkan ke seluruh slide. Ctrl+Z untuk membatalkan.`, 'success');
                }}
                className={cn(
                  'rounded-2xl border p-3 text-left transition',
                  active ? 'border-accent bg-accent-soft' : 'border-transparent bg-field hover:bg-field-hover',
                )}
              >
                <div className="text-[13px] font-semibold">{p.label}</div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">{p.tagline}</p>
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <Switch label="Ikut merencanakan ulang transisi halaman" checked={withTransitions} onChange={setWithTransitions} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Menyelaraskan tiga tingkat gerak sekaligus: transisi halaman (palet kecil yang konsisten), animasi masuk tiap elemen,
          dan gerak ambient. Setelah itu tetap bisa disetel per slide dan per elemen.
        </p>
      </section>

      <section className="space-y-3">
        <SectionTitle
          action={
            <Button size="sm" variant="ghost" icon={<Play className="size-3.5" />} onClick={() => useUIStore.getState().replayBuild()}>
              Putar
            </Button>
          }
        >
          Slide ini
        </SectionTitle>
        <Field label="Gaya dasar animasi masuk">
          <select className={inputClass} value={slide.build} onChange={(e) => update(slide.id, { build: e.target.value as BuildAnimation })}>
            {BUILD_OPTIONS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Gerak ambient foto">
          <select
            className={inputClass}
            value={slide.motion?.ambientMedia ?? 'none'}
            onChange={(e) => patchMotion({ ambientMedia: e.target.value as AmbientMedia })}
          >
            {AMBIENT_OPTIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>
        <Switch label="Cahaya latar bergerak (aurora)" checked={!!slide.motion?.aurora} onChange={(v) => patchMotion({ aurora: v })} />
        <Switch label="Partikel cahaya melayang" checked={!!slide.motion?.particles} onChange={(v) => patchMotion({ particles: v })} />
        <div>
          <Switch
            label="Ungkap poin satu per satu saat presentasi"
            checked={!!slide.stepReveal}
            onChange={(v) => update(slide.id, { stepReveal: v })}
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            Tiap poin/kartu muncul satu per satu setiap menekan lanjut; pindah ke slide berikutnya baru terjadi setelah poin
            terakhir diungkap. Hanya berlaku saat presentasi (Live Monitor tetap menampilkan slide utuh).
          </p>
        </div>
        <Button
          size="sm"
          className="w-full"
          icon={<Shuffle className="size-3.5" />}
          onClick={() => {
            const { project: p, setSlides } = useProjectStore.getState();
            if (!p) return;
            const pool = BUILD_OPTIONS.filter((b) => b.id !== 'none' && b.id !== 'mix');
            let prev: BuildAnimation | null = null;
            setSlides(
              p.slides.map((s) => {
                let pick: BuildAnimation;
                do pick = pool[Math.floor(Math.random() * pool.length)].id;
                while (pick === prev);
                prev = pick;
                return { ...s, build: pick };
              }),
            );
            useUIStore.getState().toast('Gaya dasar animasi diacak untuk semua slide.', 'success');
          }}
        >
          Acak gaya dasar semua slide
        </Button>
      </section>

      <section>
        <SectionTitle>Elemen</SectionTitle>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          Klik elemen langsung di Live Monitor untuk memilihnya, atau pilih di bawah. Tiap elemen bisa punya gaya, jeda, durasi, dan
          pemecahan teks sendiri.
        </p>
        <ul className="space-y-2">
          {ROLES.map((role) => {
            const o = slide.motion?.roles?.[role];
            const open = selectedRole === role;
            const overridden = !!o && Object.keys(o).length > 0;
            const enter = o?.enter ?? slide.build;
            return (
              <li key={role} className={cn('rounded-2xl border transition', open ? 'border-accent bg-accent-soft/40' : 'border-transparent bg-field')}>
                <button
                  onClick={() => {
                    // Peran dipilih dari panel → lepas pilihan elemen tunggal agar sorotan seluruh peran yang tampil.
                    useUIStore.getState().selectLayer(null);
                    selectRole(open ? null : role);
                  }}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                >
                  <span className={cn('grid size-7 place-items-center rounded-lg text-[11px] font-bold', open ? 'bg-accent text-white' : 'bg-field-hover text-muted')}>
                    {ROLE_LABEL[role][0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">{ROLE_LABEL[role]}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {buildLabel(enter)}
                      {o?.split && o.split !== 'block' ? ` · ${SPLIT_OPTIONS.find((s) => s.id === o.split)?.label.toLowerCase()}` : ''}
                    </span>
                  </span>
                  {overridden && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white">kustom</span>}
                </button>

                {open && (
                  <div className="space-y-4 border-t border-line/60 px-3 pb-3 pt-3">
                    <Field label="Gaya masuk">
                      <select
                        className={inputClass}
                        value={o?.enter ?? ''}
                        onChange={(e) => patchRole(role, { enter: (e.target.value || undefined) as BuildAnimation | undefined })}
                      >
                        <option value="">Ikut gaya slide ({buildLabel(slide.build)})</option>
                        {BUILD_OPTIONS.filter((b) => b.id !== 'mix').map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {isTextRole(role) && (
                      <Field label="Pemecahan teks">
                        <select
                          className={inputClass}
                          value={o?.split ?? 'block'}
                          onChange={(e) => patchRole(role, { split: e.target.value === 'block' ? undefined : (e.target.value as TextSplit) })}
                        >
                          {SPLIT_OPTIONS.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    <Slider label="Jeda tambahan" min={0} max={2} step={0.05} value={o?.delay ?? 0} format={(v) => `${v.toFixed(2)} dtk`} onChange={(v) => patchRole(role, { delay: v || undefined })} />
                    <Slider label="Durasi" min={0.2} max={2.5} step={0.05} value={o?.duration ?? 0.85} format={(v) => `${v.toFixed(2)} dtk`} onChange={(v) => patchRole(role, { duration: v })} />
                    {(isTextRole(role) || role === 'body') && (
                      <Slider
                        label={role === 'body' ? 'Jeda antar poin' : 'Jeda antar kata/baris'}
                        min={0}
                        max={0.4}
                        step={0.01}
                        value={o?.stagger ?? (role === 'body' ? 0.13 : 0.055)}
                        format={(v) => `${v.toFixed(2)} dtk`}
                        onChange={(v) => patchRole(role, { stagger: v })}
                      />
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" icon={<Clapperboard className="size-3.5" />} onClick={() => useUIStore.getState().replayBuild()}>
                        Putar ulang
                      </Button>
                      {overridden && (
                        <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => resetRole(role)}>
                          Reset elemen
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
