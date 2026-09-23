import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { QualityTier } from '../types';

export type UiTheme = 'dark' | 'light' | 'system';

interface SettingsState {
  uiTheme: UiTheme;
  quality: 'auto' | QualityTier;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      uiTheme: 'dark',
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
