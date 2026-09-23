import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_THEME } from '../engine/themes';
import { applyMotionStyle, styleForTone } from '../services/ai/motionPresets';
import { planTransitions } from '../services/ai/designEngine';
import type {
  Asset,
  Language,
  LayoutOverride,
  MotionStyle,
  Project,
  Slide,
  Snapshot,
  ThemeConfig,
  Tone,
  TransitionConfig,
} from '../types';
import { uid } from '../utils/id';
import { cloneSlide, createSlide } from '../utils/slideFactory';
import { createIdbStorage } from './idbStorage';
import { useUIStore } from './uiStore';

const MAX_SNAPSHOTS = 15;

interface CreateInput {
  name: string;
  tone: Tone;
  language: Language;
  slides: Slide[];
  theme?: ThemeConfig;
  /** 'free' = dibuat lewat impor dokumen (tanpa AI berbayar) — lihat catatan di `Project.tier`. */
  tier?: 'free' | 'full';
}

interface ProjectState {
  project: Project | null;
  history: Snapshot[];
  /** Undo/redo (tidak disimpan ke IndexedDB): keadaan proyek sebelum/sesudah perubahan. */
  past: Project[];
  future: Project[];
  undo: () => void;
  redo: () => void;
  /** Terapkan gaya gerak ke seluruh slide (animasi elemen + ambient) dan, opsional, rencanakan ulang transisi. */
  applyMotionStyle: (style: MotionStyle, includeTransitions: boolean) => void;

  createProject: (input: CreateInput) => void;
  loadProject: (project: Project) => void;
  discardProject: () => void;
  setName: (name: string) => void;
  setTone: (tone: Tone) => void;

  setSlides: (slides: Slide[]) => void;
  updateSlide: (id: string, patch: Partial<Slide>) => void;
  /** Tata letak manual: gabungkan `patch` ke penimpaan elemen (nilai undefined menghapus kunci); `null` menghapus seluruh penimpaan elemen. */
  setOverride: (slideId: string, layerId: string, patch: Partial<LayoutOverride> | null) => void;
  clearOverrides: (slideId: string) => void;
  updateTransition: (id: string, patch: Partial<TransitionConfig>) => void;
  applyTransitionToAll: (id: string) => void;
  addSlide: (afterId?: string | null) => Slide;
  duplicateSlide: (id: string) => void;
  removeSlide: (id: string) => void;
  moveSlide: (from: number, to: number) => void;

  setTheme: (patch: Partial<ThemeConfig>) => void;

  addAsset: (asset: Asset) => void;
  removeAsset: (id: string) => void;
  setLogo: (id: string | null) => void;

  saveSnapshot: (label: string) => void;
  restoreSnapshot: (id: string) => void;
  deleteSnapshot: (id: string) => void;
}

const MAX_UNDO = 80;
let lastKey = '';
let lastAt = 0;

/**
 * Terapkan perubahan proyek imut (immutable) + perbarui `updatedAt` + catat untuk undo.
 * Perubahan beruntun dengan `key` sama dalam <900 ms (mis. mengetik) digabung menjadi satu langkah undo.
 */
function mutate(state: ProjectState, fn: (p: Project) => Project, key = ''): Partial<ProjectState> {
  if (!state.project) return {};
  const now = Date.now();
  const merge = !!key && key === lastKey && now - lastAt < 900;
  lastKey = key;
  lastAt = now;
  return {
    project: { ...fn(state.project), updatedAt: now },
    past: merge ? state.past : [...state.past, state.project].slice(-MAX_UNDO),
    future: [],
  };
}

function snapshotOf(p: Project, label: string): Snapshot {
  return {
    id: uid('v'),
    label,
    createdAt: Date.now(),
    name: p.name,
    slides: p.slides,
    theme: p.theme,
    logoId: p.logoId,
    motionStyle: p.motionStyle,
  };
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      project: null,
      history: [],
      past: [],
      future: [],

      undo: () => {
        const { project, past, future } = get();
        if (!project || !past.length) return;
        lastKey = '';
        set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future].slice(0, MAX_UNDO) });
      },
      redo: () => {
        const { project, past, future } = get();
        if (!project || !future.length) return;
        lastKey = '';
        set({ project: future[0], past: [...past, project].slice(-MAX_UNDO), future: future.slice(1) });
      },

      applyMotionStyle: (style, includeTransitions) =>
        set((s) =>
          mutate(s, (p) => {
            let slides = applyMotionStyle(p.slides, style);
            if (includeTransitions) slides = planTransitions(slides, p.tone, style);
            return { ...p, motionStyle: style, slides };
          }),
        ),

      createProject: ({ name, tone, language, slides, theme, tier }) => {
        const project: Project = {
          id: uid('p'),
          name,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tone,
          language,
          slides,
          assets: {},
          logoId: null,
          theme: theme ?? DEFAULT_THEME,
          motionStyle: styleForTone(tone),
          tier: tier ?? 'full',
        };
        set({ project, history: [], past: [], future: [] });
        useUIStore.getState().selectSlide(slides[0]?.id ?? null);
      },

      loadProject: (project) => {
        set({ project: { ...project, updatedAt: Date.now() }, history: [], past: [], future: [] });
        useUIStore.getState().selectSlide(project.slides[0]?.id ?? null);
      },

      discardProject: () => {
        set({ project: null, history: [], past: [], future: [] });
        useUIStore.getState().selectSlide(null);
      },

      setName: (name) => set((s) => mutate(s, (p) => ({ ...p, name }), 'name')),
      setTone: (tone) => set((s) => mutate(s, (p) => ({ ...p, tone }))),

      setSlides: (slides) => set((s) => mutate(s, (p) => ({ ...p, slides }))),

      setOverride: (slideId, layerId, patch) =>
        set((s) =>
          mutate(
            s,
            (p) => ({
              ...p,
              slides: p.slides.map((sl) => {
                if (sl.id !== slideId) return sl;
                const overrides = { ...sl.overrides };
                if (patch === null) {
                  delete overrides[layerId];
                } else {
                  const next: LayoutOverride = { ...overrides[layerId], ...patch };
                  (Object.keys(next) as (keyof LayoutOverride)[]).forEach((k) => next[k] === undefined && delete next[k]);
                  if (Object.keys(next).length) overrides[layerId] = next;
                  else delete overrides[layerId];
                }
                return { ...sl, overrides: Object.keys(overrides).length ? overrides : undefined };
              }),
            }),
            `ov:${slideId}:${layerId}`,
          ),
        ),
      clearOverrides: (slideId) =>
        set((s) => mutate(s, (p) => ({ ...p, slides: p.slides.map((sl) => (sl.id === slideId ? { ...sl, overrides: undefined } : sl)) }))),
      updateSlide: (id, patch) =>
        set((s) =>
          mutate(s, (p) => ({ ...p, slides: p.slides.map((sl) => (sl.id === id ? { ...sl, ...patch } : sl)) }), `slide:${id}:${Object.keys(patch).join(',')}`),
        ),

      updateTransition: (id, patch) =>
        set((s) =>
          mutate(s, (p) => ({
            ...p,
            slides: p.slides.map((sl) => (sl.id === id ? { ...sl, transition: { ...sl.transition, ...patch } } : sl)),
          }), `tr:${id}:${Object.keys(patch).join(',')}`),
        ),

      applyTransitionToAll: (id) =>
        set((s) =>
          mutate(s, (p) => {
            const src = p.slides.find((sl) => sl.id === id);
            if (!src) return p;
            return { ...p, slides: p.slides.map((sl) => ({ ...sl, transition: { ...src.transition } })) };
          }),
        ),

      addSlide: (afterId) => {
        const slide = createSlide({ title: 'Slide baru', layout: 'content', bullets: ['Poin pertama'] });
        set((s) =>
          mutate(s, (p) => {
            const idx = afterId ? p.slides.findIndex((x) => x.id === afterId) : p.slides.length - 1;
            const slides = [...p.slides];
            slides.splice(idx + 1, 0, slide);
            return { ...p, slides };
          }),
        );
        return slide;
      },

      duplicateSlide: (id) =>
        set((s) =>
          mutate(s, (p) => {
            const idx = p.slides.findIndex((x) => x.id === id);
            if (idx < 0) return p;
            const slides = [...p.slides];
            slides.splice(idx + 1, 0, cloneSlide(p.slides[idx]));
            return { ...p, slides };
          }),
        ),

      removeSlide: (id) =>
        set((s) =>
          mutate(s, (p) => (p.slides.length <= 1 ? p : { ...p, slides: p.slides.filter((x) => x.id !== id) })),
        ),

      moveSlide: (from, to) =>
        set((s) =>
          mutate(s, (p) => {
            if (from === to || from < 0 || to < 0 || from >= p.slides.length || to >= p.slides.length) return p;
            const slides = [...p.slides];
            const [moved] = slides.splice(from, 1);
            slides.splice(to, 0, moved);
            return { ...p, slides };
          }),
        ),

      setTheme: (patch) => set((s) => mutate(s, (p) => ({ ...p, theme: { ...p.theme, ...patch } }), `theme:${Object.keys(patch).join(',')}`)),

      addAsset: (asset) => set((s) => mutate(s, (p) => ({ ...p, assets: { ...p.assets, [asset.id]: asset } }))),

      removeAsset: (id) =>
        set((s) =>
          mutate(s, (p) => {
            const { [id]: _removed, ...rest } = p.assets;
            void _removed;
            return {
              ...p,
              assets: rest,
              logoId: p.logoId === id ? null : p.logoId,
              slides: p.slides.map((sl) => (sl.imageId === id ? { ...sl, imageId: null } : sl)),
            };
          }),
        ),

      setLogo: (logoId) => set((s) => mutate(s, (p) => ({ ...p, logoId }))),

      saveSnapshot: (label) => {
        const p = get().project;
        if (!p) return;
        set((s) => ({ history: [snapshotOf(p, label), ...s.history].slice(0, MAX_SNAPSHOTS) }));
      },

      restoreSnapshot: (id) => {
        const { project, history, past } = get();
        const snap = history.find((h) => h.id === id);
        if (!project || !snap) return;
        // Simpan kondisi saat ini terlebih dahulu agar pemulihan bisa dibatalkan.
        set({
          history: [snapshotOf(project, 'Sebelum pemulihan'), ...history].slice(0, MAX_SNAPSHOTS),
          past: [...past, project].slice(-MAX_UNDO),
          future: [],
          project: {
            ...project,
            name: snap.name,
            slides: snap.slides,
            theme: snap.theme,
            logoId: snap.logoId,
            motionStyle: snap.motionStyle ?? project.motionStyle,
            updatedAt: Date.now(),
          },
        });
        useUIStore.getState().selectSlide(snap.slides[0]?.id ?? null);
      },

      deleteSnapshot: (id) => set((s) => ({ history: s.history.filter((h) => h.id !== id) })),
    }),
    {
      name: 'morphdeck-project',
      version: 1,
      storage: createIdbStorage<Pick<ProjectState, 'project' | 'history'>>(),
      partialize: (s) => ({ project: s.project, history: s.history }),
      onRehydrateStorage: () => () => {
        useUIStore.getState().setHydrated();
      },
    },
  ),
);
