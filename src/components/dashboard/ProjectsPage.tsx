import { Download, FolderOpen, LogIn, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteCloudProject, listCloudProjects, pullProjectFromCloud, renameCloudProject, type CloudProjectSummary } from '../../services/cloudProjects';
import { projectToJson } from '../../services/export/projectJson';
import { downloadBlob, slugify } from '../../utils/download';
import { useAuthStore } from '../../store/authStore';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { Button, IconButton } from '../common/ui';

const fmt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

/** Galeri "Hasil Proyek" — daftar proyek yang tersinkron ke cloud, bisa dibuka dari perangkat mana pun. */
export function ProjectsPage() {
  const user = useAuthStore((s) => s.user);
  const [projects, setProjects] = useState<CloudProjectSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const navigate = useNavigate();
  const toast = useUIStore.getState().toast;

  const reload = async () => {
    try {
      setProjects(await listCloudProjects());
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memuat proyek', 'error');
      setProjects([]);
    }
  };

  useEffect(() => {
    if (user) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) {
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="glass max-w-sm rounded-3xl border border-line p-8 text-center shadow-(--shadow-pop)">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <FolderOpen className="size-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">Masuk untuk melihat proyek cloud</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Proyek yang dibuat di perangkat ini tetap tersimpan lokal tanpa perlu akun. Masuk dengan Google untuk menyalinnya ke cloud dan membukanya dari perangkat lain.
          </p>
          <Button variant="primary" className="mt-5" icon={<LogIn className="size-4" />} onClick={() => void useAuthStore.getState().signInWithGoogle()}>
            Masuk dengan Google
          </Button>
        </div>
      </div>
    );
  }

  const openProject = async (p: CloudProjectSummary) => {
    setBusyId(p.id);
    try {
      const project = await pullProjectFromCloud(p.storagePath);
      useProjectStore.getState().loadProject(project);
      navigate('/dashboard/studio');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal membuka proyek', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const rename = async (p: CloudProjectSummary) => {
    const name = window.prompt('Nama baru proyek:', p.name)?.trim();
    if (!name || name === p.name) return;
    try {
      await renameCloudProject(p.id, name);
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengganti nama', 'error');
    }
  };

  const remove = async (p: CloudProjectSummary) => {
    if (!window.confirm(`Hapus "${p.name}" dari cloud? Salinan lokal (bila ada) tidak ikut terhapus.`)) return;
    try {
      await deleteCloudProject(p.id, p.storagePath);
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menghapus proyek', 'error');
    }
  };

  const download = async (p: CloudProjectSummary) => {
    setBusyId(p.id);
    try {
      const project = await pullProjectFromCloud(p.storagePath);
      downloadBlob(new Blob([projectToJson(project)], { type: 'application/json' }), `${slugify(p.name)}.morphdeck.json`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengunduh proyek', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-xl font-semibold">Hasil Proyek</h1>
      <p className="mt-1 text-sm text-muted">Proyek yang tersinkron ke cloud dari perangkat mana pun Anda masuk dengan akun ini.</p>

      {projects === null ? (
        <p className="mt-8 text-sm text-muted">Memuat…</p>
      ) : projects.length === 0 ? (
        <div className="glass mt-6 rounded-2xl border border-line p-8 text-center text-sm text-muted">
          Belum ada proyek di cloud. Buka proyek di Studio lalu klik ikon "Simpan ke cloud" di bilah atas untuk menyalinnya ke sini.
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div key={p.id} className="glass flex flex-col justify-between rounded-2xl border border-line p-4">
              <div>
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="mt-1 text-xs text-muted">
                  {p.slideCount} slide · {fmt.format(new Date(p.updatedAt))}
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1.5">
                <Button size="sm" variant="primary" loading={busyId === p.id} className="flex-1" onClick={() => void openProject(p)}>
                  Lanjut Edit
                </Button>
                <IconButton label="Ganti nama" onClick={() => void rename(p)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton label="Unduh .json" onClick={() => void download(p)}>
                  <Download className="size-4" />
                </IconButton>
                <IconButton label="Hapus" onClick={() => void remove(p)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
