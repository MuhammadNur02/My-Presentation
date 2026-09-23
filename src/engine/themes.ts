import type { FontStyle, PatternId, ResolvedTheme, ThemeConfig } from '../types';

/** Kanvas logis slide. Semua koordinat layout memakai ruang 1920×1080. */
export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

const SANS =
  '"SF Pro Display","Segoe UI Variable Display","Segoe UI",Inter,system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif';
const SERIF = '"New York","Iowan Old Style","Palatino Linotype",Georgia,"Times New Roman",serif';
const MONO = '"SF Mono","Cascadia Code",Consolas,"Liberation Mono",Menlo,monospace';
// Empat gaya tambahan disematkan sebagai berkas font asli (base64, offline) — lihat `embeddedFonts.ts`.
const GROTESK = '"Space Grotesk",' + SANS;
const ELEGANT = '"Playfair Display",' + SERIF;
const ROUNDED = '"Poppins",' + SANS;
const CONDENSED = '"Bebas Neue",' + SANS;

export const FONT_STACKS: Record<FontStyle, { heading: string; body: string; label: string }> = {
  sans: { heading: SANS, body: SANS, label: 'Modern Sans' },
  serif: { heading: SERIF, body: SANS, label: 'Editorial Serif' },
  mono: { heading: MONO, body: SANS, label: 'Technical Mono' },
  grotesk: { heading: GROTESK, body: GROTESK, label: 'Geometric Grotesk' },
  elegant: { heading: ELEGANT, body: SANS, label: 'Elegant Display' },
  rounded: { heading: ROUNDED, body: ROUNDED, label: 'Friendly Rounded' },
  condensed: { heading: CONDENSED, body: SANS, label: 'Bold Condensed' },
};

interface ThemePreset {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  bg1: string;
  bg2: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  /** Pola latar bawaan tema (dapat diganti pengguna). */
  pattern: PatternId;
}

export const PATTERN_OPTIONS: { id: PatternId; label: string }[] = [
  { id: 'none', label: 'Polos' },
  { id: 'dots', label: 'Titik' },
  { id: 'grid', label: 'Kisi' },
  { id: 'diagonal', label: 'Diagonal' },
  { id: 'arcs', label: 'Busur' },
  { id: 'waves', label: 'Gelombang' },
];

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    mode: 'dark',
    bg1: '#0b0b1a',
    bg2: '#1a1240',
    surface: 'rgba(255,255,255,0.07)',
    border: 'rgba(255,255,255,0.12)',
    text: '#f5f5f7',
    muted: '#a9a9c2',
    accent: '#8b7cff',
    accent2: '#22d3ee',
    pattern: 'none',
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    mode: 'dark',
    bg1: '#09090b',
    bg2: '#1c1c20',
    surface: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.11)',
    text: '#fafafa',
    muted: '#a1a1aa',
    accent: '#f5b544',
    accent2: '#ff7a59',
    pattern: 'none',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    mode: 'dark',
    bg1: '#03131d',
    bg2: '#0b2e42',
    surface: 'rgba(255,255,255,0.07)',
    border: 'rgba(255,255,255,0.12)',
    text: '#eefaff',
    muted: '#93b8c9',
    accent: '#38bdf8',
    accent2: '#2dd4bf',
    pattern: 'waves',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    mode: 'dark',
    bg1: '#170a13',
    bg2: '#3d1228',
    surface: 'rgba(255,255,255,0.07)',
    border: 'rgba(255,255,255,0.12)',
    text: '#fff5f5',
    muted: '#d0a6b4',
    accent: '#fb7185',
    accent2: '#fbbf24',
    pattern: 'none',
  },
  {
    id: 'paper',
    name: 'Paper',
    mode: 'light',
    bg1: '#fbfbfa',
    bg2: '#ebeae6',
    surface: 'rgba(0,0,0,0.045)',
    border: 'rgba(0,0,0,0.10)',
    text: '#1d1d1f',
    muted: '#6e6e73',
    accent: '#4f46e5',
    accent2: '#0ea5e9',
    pattern: 'none',
  },
  {
    id: 'mint',
    name: 'Mint',
    mode: 'light',
    bg1: '#f3fbf7',
    bg2: '#d5f0e1',
    surface: 'rgba(0,0,0,0.05)',
    border: 'rgba(0,0,0,0.09)',
    text: '#0f2a1f',
    muted: '#4d6b5c',
    accent: '#059669',
    accent2: '#0d9488',
    pattern: 'dots',
  },
  {
    id: 'neon',
    name: 'Neon',
    mode: 'dark',
    bg1: '#07050f',
    bg2: '#1a0b33',
    surface: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.13)',
    text: '#fdf7ff',
    muted: '#b9a6d6',
    accent: '#ff2bd6',
    accent2: '#00e5ff',
    pattern: 'grid',
  },
  {
    id: 'forest',
    name: 'Forest',
    mode: 'dark',
    bg1: '#06120c',
    bg2: '#0f2e1f',
    surface: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.11)',
    text: '#f1fbf4',
    muted: '#9bbca9',
    accent: '#4ade80',
    accent2: '#facc15',
    pattern: 'arcs',
  },
  {
    id: 'royal',
    name: 'Royal',
    mode: 'dark',
    bg1: '#070b1f',
    bg2: '#141c4a',
    surface: 'rgba(255,255,255,0.07)',
    border: 'rgba(255,255,255,0.12)',
    text: '#f6f7ff',
    muted: '#a3abd6',
    accent: '#e9c46a',
    accent2: '#7c9cff',
    pattern: 'diagonal',
  },
  {
    id: 'graphite',
    name: 'Graphite',
    mode: 'dark',
    bg1: '#0d0f12',
    bg2: '#22272e',
    surface: 'rgba(255,255,255,0.055)',
    border: 'rgba(255,255,255,0.10)',
    text: '#eef1f5',
    muted: '#98a1ad',
    accent: '#5eead4',
    accent2: '#a78bfa',
    pattern: 'dots',
  },
  {
    id: 'rose',
    name: 'Rose',
    mode: 'light',
    bg1: '#fff7f8',
    bg2: '#fde2e8',
    surface: 'rgba(0,0,0,0.045)',
    border: 'rgba(0,0,0,0.09)',
    text: '#2a1218',
    muted: '#7d5560',
    accent: '#e11d48',
    accent2: '#f97316',
    pattern: 'waves',
  },
  {
    id: 'sand',
    name: 'Sand',
    mode: 'light',
    bg1: '#fbf7ef',
    bg2: '#efe4cd',
    surface: 'rgba(0,0,0,0.045)',
    border: 'rgba(0,0,0,0.09)',
    text: '#2b2418',
    muted: '#786b55',
    accent: '#b45309',
    accent2: '#0f766e',
    pattern: 'diagonal',
  },
];

export const DEFAULT_THEME: ThemeConfig = {
  presetId: 'aurora',
  fontStyle: 'sans',
  showSlideNumber: true,
};

export function getPreset(id: string): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0];
}

/** Gabungkan preset + override pengguna menjadi tema final untuk renderer. */
export function resolveTheme(config: ThemeConfig): ResolvedTheme {
  const p = getPreset(config.presetId);
  const fonts = FONT_STACKS[config.fontStyle] ?? FONT_STACKS.sans;
  return {
    id: p.id,
    name: p.name,
    mode: p.mode,
    bg1: p.bg1,
    bg2: p.bg2,
    surface: p.surface,
    border: p.border,
    text: p.text,
    muted: p.muted,
    accent: config.accent || p.accent,
    accent2: config.accent2 || p.accent2,
    fontHeading: fonts.heading,
    fontBody: fonts.body,
    showSlideNumber: config.showSlideNumber,
    pattern: config.pattern ?? p.pattern,
  };
}
