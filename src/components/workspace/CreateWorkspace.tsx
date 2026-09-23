import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GeneratingStage } from '../generating/GeneratingStage';
import { OutlineStage } from '../outline/OutlineStage';
import { useProjectStore } from '../../store/projectStore';
import { Studio } from '../studio/Studio';
import { useUIStore } from '../../store/uiStore';

/**
 * Rute `/dashboard/studio` — ruang kerja full-bleed (TANPA navbar/sidebar dashboard di sekitarnya):
 * menampung pipeline pembuatan-presentasi yang sudah ada (`outline` → `generating` → `studio`),
 * tidak berubah secara internal, hanya dipindahkan ke sini dari App.tsx lama.
 *
 * Dijangkau lewat navigasi eksplisit dari `/dashboard/generate` atau `/dashboard/editor` setelah
 * proyek dibuat/dimuat — bukan lewat URL langsung. Kalau tidak ada proyek aktif (mis. dibuka
 * langsung lewat address bar, atau proyek dihapus), kembali ke galeri "Hasil Proyek".
 */
export function CreateWorkspace() {
  const stage = useUIStore((s) => s.stage);
  const hasProject = useProjectStore((s) => !!s.project);
  const navigate = useNavigate();

  useEffect(() => {
    if (!hasProject) navigate('/dashboard/projects', { replace: true });
  }, [hasProject, navigate]);

  if (!hasProject) return null;
  if (stage === 'outline') return <OutlineStage />;
  if (stage === 'generating') return <GeneratingStage />;
  return <Studio />;
}
