import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { QualityTier } from '../types';

export type UiTheme = 'dark' | 'light' | 'system';

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5 (kualitas terbaik)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (seimbang)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (tercepat)' },
] as const;

interface SettingsState {
  uiTheme: UiTheme;
  /** Kunci API disimpan HANYA di browser ini (localStorage). Gunakan proxy untuk produksi. */
  anthropicKey: string;
  anthropicModel: string;
  /** Opsional: base URL proxy backend agar kunci tidak berada di browser. */
  anthropicBaseUrl: string;
  unsplashKey: string;
  /** Kunci API GIPHY untuk pencarian GIF (opsional). */
  giphyKey: string;
  quality: 'auto' | QualityTier;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      uiTheme: 'dark',
      anthropicKey: '',
      anthropicModel: 'claude-opus-5',
      anthropicBaseUrl: '',
      unsplashKey: '',
      giphyKey: '',
      quality: 'auto',
      set: (patch) => set(patch),
    }),
    { name: 'morphdeck-settings', version: 1 },
  ),
);

/** Terapkan kelas `dark` pada <html> sesuai preferensi UI. */
export function applyUiTheme(theme: UiTheme): void {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}
