import { create } from 'zustand';
import type { LayerInfo } from '../engine/layers';
import type { MotionRole } from '../types';
import { uid } from '../utils/id';

export type Stage = 'onboarding' | 'outline' | 'generating' | 'studio';
export type LeftTab = 'slide' | 'layout' | 'motion' | 'transition' | 'assets' | 'theme';
export type ModalId = 'settings' | 'history' | null;

export interface Toast {
  id: string;
  message: string;
  kind: 'info' | 'success' | 'error';
  action?: { label: string; run: () => void };
}

export interface SaveStatus {
  state: 'idle' | 'saving' | 'saved' | 'error';
  at: number | null;
}

interface UIState {
  stage: Stage;
  selectedSlideId: string | null;
  leftTab: LeftTab;
  /** Elemen yang dipilih di Live Monitor (klik) — menjadi fokus panel Gerak. */
  selectedRole: MotionRole | null;
  selectRole: (r: MotionRole | null) => void;
  /** Mode panel Aset: gambar atau animasi/media bergerak. */
  assetMode: 'image' | 'animation';
  setAssetMode: (m: 'image' | 'animation') => void;
  /** Id lapisan yang dipilih (tata letak manual: geser / ubah ukuran). */
  selectedLayer: string | null;
  selectLayer: (id: string | null) => void;
  /** Lapisan slide aktif — dipublikasikan Live Monitor agar panel Posisi tahu daftar & ukurannya. */
  layerInfos: LayerInfo[];
  setLayerInfos: (l: LayerInfo[]) => void;
  presenting: boolean;
  modal: ModalId;
  toasts: Toast[];
  saveStatus: SaveStatus;
  /** True setelah proyek tersimpan selesai dimuat dari IndexedDB. */
  hydrated: boolean;
  /** Naik setiap kali pengguna meminta pratinjau transisi diputar ulang. */
  previewNonce: number;
  /** Naik setiap kali animasi masuk elemen slide aktif diminta diputar ulang. */
  buildNonce: number;
  replayBuild: () => void;
  replayPreview: () => void;

  setStage: (s: Stage) => void;
  selectSlide: (id: string | null) => void;
  setLeftTab: (t: LeftTab) => void;
  startPresenting: () => void;
  stopPresenting: () => void;
  openModal: (m: ModalId) => void;
  toast: (message: string, kind?: Toast['kind'], action?: Toast['action']) => void;
  dismissToast: (id: string) => void;
  setSaveStatus: (s: SaveStatus) => void;
  setHydrated: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  stage: 'onboarding',
  selectedSlideId: null,
  leftTab: 'slide',
  selectedRole: null,
  selectRole: (selectedRole) => set({ selectedRole }),
  assetMode: 'image',
  setAssetMode: (assetMode) => set({ assetMode }),
  selectedLayer: null,
  selectLayer: (selectedLayer) => set({ selectedLayer }),
  layerInfos: [],
  setLayerInfos: (layerInfos) => set({ layerInfos }),
  presenting: false,
  modal: null,
  toasts: [],
  saveStatus: { state: 'idle', at: null },
  hydrated: false,
  previewNonce: 0,
  buildNonce: 0,
  replayBuild: () => set((s) => ({ buildNonce: s.buildNonce + 1 })),
  replayPreview: () => set((s) => ({ previewNonce: s.previewNonce + 1 })),

  setStage: (stage) => set({ stage }),
  selectSlide: (selectedSlideId) => set({ selectedSlideId, selectedRole: null, selectedLayer: null }),
  setLeftTab: (leftTab) => set({ leftTab }),
  // Layar penuh harus diminta langsung dari gestur pengguna (klik / F5), bukan dari efek React —
  // itu sebabnya dipanggil di sini, sebelum overlay dipasang.
  startPresenting: () => {
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    set({ presenting: true, modal: null });
  },
  stopPresenting: () => set({ presenting: false }),
  openModal: (modal) => set({ modal }),
  toast: (message, kind = 'info', action) => {
    const id = uid('t');
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, kind, action }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), action ? 9000 : 4500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setHydrated: () => set({ hydrated: true }),
}));
