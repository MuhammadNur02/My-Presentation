import { Archive, Download, FileCode2, FileJson, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { downloadBlob, slugify } from '../../utils/download';
import { Button } from '../common/ui';

type Kind = 'zip' | 'html' | 'json';

const ITEMS: { id: Kind; title: string; desc: string; icon: ReactNode }[] = [
  { id: 'zip', title: 'Paket ZIP (disarankan)', desc: 'index.html mandiri + aset + berkas proyek + README', icon: <Archive className="size-4" /> },
  { id: 'html', title: 'Satu berkas HTML', desc: 'Semua tertanam — buka offline di browser mana pun', icon: <FileCode2 className="size-4" /> },
  { id: 'json', title: 'Berkas proyek (.json)', desc: 'Cadangan untuk diimpor kembali dan disunting', icon: <FileJson className="size-4" /> },
];

/** Tombol Download: mengekspor proyek menjadi website statis mandiri (ZIP / HTML) atau cadangan JSON. */
export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Kind | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  // Mode gratis (proyek hasil impor dokumen): sumber yang bisa diedit ulang (.json) tidak diunduh —
  // hasil akhir (ZIP/HTML, keduanya sudah memakai watermark) tetap boleh.
  const isFreeTier = useProjectStore((s) => s.project?.tier === 'free');
  const items = isFreeTier ? ITEMS.filter((it) => it.id !== 'json') : ITEMS;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = async (kind: Kind) => {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const toast = useUIStore.getState().toast;
    setBusy(kind);
    try {
      await new Promise((r) => setTimeout(r, 40)); // beri UI kesempatan menampilkan status
      // Dimuat malas: modul ekspor membawa bundel runtime WebGL (~640 kB) yang tak perlu di muat awal.
      const { buildStandaloneHtml, buildZip, projectToJson } = await import('../../services/export');
      const slug = slugify(project.name);
      let blob: Blob;
      let name: string;
      if (kind === 'zip') {
        blob = await buildZip(project);
        name = `${slug}.zip`;
      } else if (kind === 'html') {
        blob = new Blob([buildStandaloneHtml(project)], { type: 'text/html;charset=utf-8' });
        name = `${slug}.html`;
      } else {
        blob = new Blob([projectToJson(project)], { type: 'application/json' });
        name = `${slug}.morphdeck.json`;
      }
      downloadBlob(blob, name);
      toast(`${name} diunduh (${(blob.size / 1024 / 1024).toFixed(1)} MB).`, 'success');
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? `Ekspor gagal: ${err.message}` : 'Ekspor gagal', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={ref} className="relative">
      <Button size="sm" aria-label="Download" icon={<Download className="size-3.5" />} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="max-lg:hidden">Download</span>
      </Button>
      {open && (
        <div className="pop-in absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-2xl border border-line bg-solid p-1.5 shadow-[var(--shadow-pop)]">
          {items.map((it) => (
            <button
              key={it.id}
              disabled={busy !== null}
              onClick={() => void run(it.id)}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-field disabled:opacity-60"
            >
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-field text-muted">
                {busy === it.id ? <Loader2 className="size-4 animate-spin" /> : it.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">{it.title}</span>
                <span className="block text-[11px] leading-snug text-muted">{it.desc}</span>
              </span>
            </button>
          ))}
          {isFreeTier && (
            <p className="px-3 pb-1.5 pt-1 text-[10.5px] leading-relaxed text-muted">
              Mode gratis: berkas proyek (.json) tidak tersedia & hasil unduhan memakai watermark. Buat presentasi baru dari prompt AI untuk ekspor penuh.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
