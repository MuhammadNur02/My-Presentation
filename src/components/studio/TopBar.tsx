import { CheckCircle2, Clock, FilePlus2, Loader2, Moon, Play, Redo2, Settings, Sun, TriangleAlert, Undo2, Wand2 } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { BrandName } from '../common/Brand';
import { Button, IconButton } from '../common/ui';
import { ExportMenu } from './ExportMenu';

const timeFmt = new Intl.DateTimeFormat('id-ID', { timeStyle: 'short' });

function SaveIndicator() {
  const s = useUIStore((st) => st.saveStatus);
  if (s.state === 'saving')
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Loader2 className="size-3 animate-spin" /> Menyimpan…
      </span>
    );
  if (s.state === 'error')
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-500">
        <TriangleAlert className="size-3" /> Gagal menyimpan
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted">
      <CheckCircle2 className="size-3 text-emerald-500" />
      {s.at ? `Tersimpan ${timeFmt.format(s.at)}` : 'Tersimpan otomatis'}
    </span>
  );
}

export function TopBar() {
  const name = useProjectStore((s) => s.project?.name ?? '');
  const setName = useProjectStore((s) => s.setName);
  const uiTheme = useSettingsStore((s) => s.uiTheme);
  const setSettings = useSettingsStore((s) => s.set);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const dark = uiTheme === 'dark' || (uiTheme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);

  const newProject = () => {
    if (!window.confirm('Mulai proyek baru? Proyek saat ini akan dihapus dari perangkat ini. Unduh cadangan terlebih dahulu bila perlu.')) return;
    useProjectStore.getState().discardProject();
    useUIStore.getState().setStage('onboarding');
  };

  return (
    <header className="glass relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 max-md:gap-2 max-md:px-2.5">
      <BrandName />
      <span className="h-5 w-px bg-line" />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Nama proyek"
        className="w-56 min-w-0 shrink rounded-lg bg-transparent px-2 py-1 text-sm font-medium transition hover:bg-field focus:bg-field focus:outline-none max-xl:w-40 max-lg:w-28"
      />
      <span className="max-xl:hidden">
        <SaveIndicator />
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 max-md:gap-1">
        <IconButton label="Urungkan (Ctrl+Z)" disabled={!canUndo} onClick={() => useProjectStore.getState().undo()}>
          <Undo2 className="size-4" />
        </IconButton>
        <span className="contents max-md:hidden">
          <IconButton label="Ulangi (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => useProjectStore.getState().redo()}>
            <Redo2 className="size-4" />
          </IconButton>
          <span className="mx-1 h-5 w-px bg-line" />
          <IconButton label="Tinjau struktur & Generate ulang" onClick={() => useUIStore.getState().setStage('outline')}>
            <Wand2 className="size-4" />
          </IconButton>
          <IconButton label="Riwayat versi" onClick={() => useUIStore.getState().openModal('history')}>
            <Clock className="size-4" />
          </IconButton>
        </span>
        <IconButton label="Pengaturan" onClick={() => useUIStore.getState().openModal('settings')}>
          <Settings className="size-4" />
        </IconButton>
        <span className="contents max-md:hidden">
          <IconButton label={dark ? 'Mode terang' : 'Mode gelap'} onClick={() => setSettings({ uiTheme: dark ? 'light' : 'dark' })}>
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </IconButton>
          <IconButton label="Proyek baru" onClick={newProject}>
            <FilePlus2 className="size-4" />
          </IconButton>
        </span>
        <span className="mx-1 h-5 w-px bg-line max-md:hidden" />
        <ExportMenu />
        <Button
          size="sm"
          variant="primary"
          aria-label="Mulai Presentasi"
          icon={<Play className="size-3.5 fill-current" />}
          onClick={() => useUIStore.getState().startPresenting()}
        >
          <span className="max-lg:hidden">Mulai Presentasi</span>
        </Button>
      </div>
    </header>
  );
}
