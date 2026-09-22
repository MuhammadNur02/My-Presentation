import { ShieldAlert } from 'lucide-react';
import { TIER_CONFIG } from '../../engine';
import { CLAUDE_MODELS, useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import type { QualityTier } from '../../types';
import { Modal } from '../common/Modal';
import { Field, Segmented, inputClass } from '../common/ui';

const TIER_LABEL: Record<QualityTier, string> = { high: 'Tinggi', medium: 'Sedang', low: 'Hemat' };

/** Pengaturan integrasi AI/gambar dan kualitas grafis. */
export function SettingsModal() {
  const open = useUIStore((s) => s.modal === 'settings');
  const s = useSettingsStore();
  if (!open) return null;

  return (
    <Modal title="Pengaturan" onClose={() => useUIStore.getState().openModal(null)}>
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">AI — Anthropic Claude</h3>
          <Field label="API key" hint={s.anthropicKey ? 'aktif' : 'kosong = mode simulasi offline'}>
            <input
              className={inputClass}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              value={s.anthropicKey}
              onChange={(e) => s.set({ anthropicKey: e.target.value })}
            />
          </Field>
          <Field label="Model">
            <select className={inputClass} value={s.anthropicModel} onChange={(e) => s.set({ anthropicModel: e.target.value })}>
              {CLAUDE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Base URL proxy (opsional)" hint="disarankan untuk produksi">
            <input
              className={inputClass}
              placeholder="https://proxy-anda.example.com"
              value={s.anthropicBaseUrl}
              onChange={(e) => s.set({ anthropicBaseUrl: e.target.value })}
            />
          </Field>
          <div className="flex gap-2.5 rounded-xl bg-amber-500/10 p-3 text-[11.5px] leading-relaxed text-amber-600 dark:text-amber-400">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              Kunci disimpan hanya di browser ini dan dikirim langsung dari browser ke API. Cocok untuk pemakaian pribadi;
              untuk aplikasi publik, arahkan Base URL ke backend proxy Anda sehingga kunci tidak pernah berada di klien.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Gambar stok — Unsplash</h3>
          <Field label="Access key" hint="kosong = ilustrasi generatif offline">
            <input
              className={inputClass}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={s.unsplashKey}
              onChange={(e) => s.set({ unsplashKey: e.target.value })}
            />
          </Field>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Pencarian GIF — GIPHY</h3>
          <Field label="API key" hint="kosong = pencarian GIF nonaktif">
            <input
              className={inputClass}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="dari developers.giphy.com (gratis)"
              value={s.giphyKey}
              onChange={(e) => s.set({ giphyKey: e.target.value })}
            />
          </Field>
          <p className="text-[11.5px] leading-relaxed text-muted">
            GIF yang dipilih diunduh dan disimpan di proyek, jadi tetap tampil offline dan ikut terekspor. Tanpa kunci, Anda tetap bisa
            mengunggah GIF/video sendiri atau memakai animasi generatif bawaan.
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Kualitas grafis</h3>
          <Segmented<'auto' | QualityTier>
            value={s.quality}
            onChange={(quality) => s.set({ quality })}
            options={[
              { id: 'auto', label: 'Otomatis' },
              { id: 'high', label: 'Tinggi' },
              { id: 'medium', label: 'Sedang' },
              { id: 'low', label: 'Hemat' },
            ]}
          />
          <p className="text-[11.5px] leading-relaxed text-muted">
            Otomatis menyesuaikan dengan perangkat dan menurunkan kualitas bila frame-rate terukur rendah. Saat ini:{' '}
            {(['high', 'medium', 'low'] as QualityTier[]).map((t) => `${TIER_LABEL[t]} (${TIER_CONFIG[t].texW}×${TIER_CONFIG[t].texH})`).join(' · ')}.
            Perubahan berlaku saat panel pratinjau dimuat ulang.
          </p>
        </section>
      </div>
    </Modal>
  );
}
