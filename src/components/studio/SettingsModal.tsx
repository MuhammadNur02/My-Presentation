import { TIER_CONFIG } from '../../engine';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import type { QualityTier } from '../../types';
import { Modal } from '../common/Modal';
import { Segmented } from '../common/ui';

const TIER_LABEL: Record<QualityTier, string> = { high: 'Tinggi', medium: 'Sedang', low: 'Hemat' };

/**
 * Pengaturan kualitas grafis. Integrasi AI/gambar (Anthropic, Unsplash, GIPHY) TIDAK lagi bisa diatur
 * di sini secara sengaja — semua fitur AI memakai kunci milik aplikasi ini (dikelola pemilik lewat
 * Supabase, dibayar pengguna lewat kredit). Lihat `services/supabase.ts` (HOSTED_MODEL) dan Edge
 * Function `claude-proxy`/`generate-image`.
 */
export function SettingsModal() {
  const open = useUIStore((s) => s.modal === 'settings');
  const s = useSettingsStore();
  if (!open) return null;

  return (
    <Modal title="Pengaturan" onClose={() => useUIStore.getState().openModal(null)}>
      <div className="space-y-6">
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
