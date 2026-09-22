import type { AmbientMedia, BuildAnimation, TextSplit } from '../../types';

export const BUILD_OPTIONS: { id: BuildAnimation; label: string }[] = [
  { id: 'mix', label: '✨ Campur — gaya berbeda tiap elemen' },
  { id: 'fade-up', label: 'Naik & pudar' },
  { id: 'fade', label: 'Pudar' },
  { id: 'rise', label: 'Terbit dari garis (teks)' },
  { id: 'slide-left', label: 'Geser dari kiri' },
  { id: 'slide-right', label: 'Geser dari kanan' },
  { id: 'drop', label: 'Jatuh memantul' },
  { id: 'bounce', label: 'Pop memantul' },
  { id: 'scale', label: 'Membesar halus' },
  { id: 'zoom-out', label: 'Zoom mengecil' },
  { id: 'rotate-in', label: 'Putar masuk' },
  { id: 'flip-in', label: 'Balik 3D' },
  { id: 'wipe', label: 'Sapuan kiri → kanan' },
  { id: 'blur-in', label: 'Blur ke fokus' },
  { id: 'zoom-in', label: 'Zoom membesar cepat' },
  { id: 'elastic', label: 'Kenyal (elastis)' },
  { id: 'flip-x', label: 'Balik vertikal 3D' },
  { id: 'tilt-up', label: 'Miring naik' },
  { id: 'spiral', label: 'Spiral masuk' },
  { id: 'wipe-down', label: 'Sapuan atas → bawah' },
  { id: 'wipe-up', label: 'Sapuan bawah → atas' },
  { id: 'typewriter', label: 'Mesin ketik (teks)' },
  { id: 'glitch-in', label: 'Glitch digital' },
  { id: 'none', label: 'Tanpa animasi' },
];

export const SPLIT_OPTIONS: { id: TextSplit; label: string }[] = [
  { id: 'block', label: 'Satu blok' },
  { id: 'lines', label: 'Per baris' },
  { id: 'words', label: 'Per kata' },
];

export const AMBIENT_OPTIONS: { id: AmbientMedia; label: string }[] = [
  { id: 'none', label: 'Diam' },
  { id: 'kenburns', label: 'Ken Burns (zoom pelan)' },
  { id: 'drift', label: 'Geser panorama' },
  { id: 'float', label: 'Melayang' },
  { id: 'pulse', label: 'Denyut halus' },
  { id: 'sway', label: 'Mengayun' },
  { id: 'tilt3d', label: 'Miring 3D' },
];

export const buildLabel = (id: BuildAnimation): string => BUILD_OPTIONS.find((b) => b.id === id)?.label ?? id;
