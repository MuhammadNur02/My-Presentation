import { History, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { Modal } from '../common/Modal';
import { Button, IconButton, inputClass } from '../common/ui';

const fmt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

/** Riwayat versi: simpan titik pemulihan manual dan pulihkan kapan saja. */
export function VersionHistory() {
  const open = useUIStore((s) => s.modal === 'history');
  const close = () => useUIStore.getState().openModal(null);
  const history = useProjectStore((s) => s.history);
  const [label, setLabel] = useState('');

  if (!open) return null;

  return (
    <Modal title="Riwayat versi" onClose={close}>
      <div className="flex gap-2">
        <input className={inputClass} placeholder="Nama versi (opsional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button
          variant="primary"
          icon={<Save className="size-4" />}
          onClick={() => {
            useProjectStore.getState().saveSnapshot(label.trim() || 'Versi manual');
            setLabel('');
            useUIStore.getState().toast('Versi disimpan.', 'success');
          }}
        >
          Simpan
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted">
        Perubahan tersimpan otomatis di perangkat ini. Versi dibuat otomatis setelah Generate dan berkala saat mengedit (maks. 15).
      </p>

      <ul className="mt-4 space-y-2">
        {history.length === 0 && (
          <li className="grid place-items-center gap-2 rounded-2xl bg-field py-10 text-sm text-muted">
            <History className="size-5" />
            Belum ada versi tersimpan.
          </li>
        )}
        {history.map((h) => (
          <li key={h.id} className="flex items-center gap-3 rounded-2xl bg-field px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{h.label}</div>
              <div className="text-[11px] text-muted">
                {fmt.format(h.createdAt)} · {h.slides.length} slide
              </div>
            </div>
            <Button
              size="sm"
              icon={<RotateCcw className="size-3.5" />}
              onClick={() => {
                useProjectStore.getState().restoreSnapshot(h.id);
                useUIStore.getState().toast(`Versi "${h.label}" dipulihkan.`, 'success');
                close();
              }}
            >
              Pulihkan
            </Button>
            <IconButton label="Hapus versi" onClick={() => useProjectStore.getState().deleteSnapshot(h.id)}>
              <Trash2 className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
