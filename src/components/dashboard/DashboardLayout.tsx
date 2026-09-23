import { FileUp, Film, FolderOpen, Image, Menu, Settings, Sparkles } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { AccountWidget } from '../common/AccountWidget';
import { BrandName } from '../common/Brand';
import { IconButton } from '../common/ui';
import { useUIStore } from '../../store/uiStore';
import { cn } from '../../utils/cn';

const NAV: { to: string; label: string; icon: ReactNode; soon?: boolean }[] = [
  { to: '/dashboard/projects', label: 'Hasil Proyek', icon: <FolderOpen className="size-4" /> },
  { to: '/dashboard/editor', label: 'Alat Editor', icon: <FileUp className="size-4" /> },
  { to: '/dashboard/generate', label: 'AI Generate PPT', icon: <Sparkles className="size-4" /> },
  { to: '/dashboard/generate-image', label: 'AI Generate Gambar', icon: <Image className="size-4" />, soon: true },
  { to: '/dashboard/generate-gif', label: 'AI Generate Animasi GIF', icon: <Film className="size-4" />, soon: true },
];

function SidebarLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition',
              isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-field hover:text-fg',
            )
          }
        >
          {item.icon}
          <span className="flex-1 truncate">{item.label}</span>
          {item.soon && <span className="shrink-0 rounded-full bg-field px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted">Segera</span>}
        </NavLink>
      ))}
      <span className="my-1.5 h-px bg-line" />
      <NavLink
        to="/dashboard/help"
        onClick={onNavigate}
        className={({ isActive }) =>
          cn('flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition', isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-field hover:text-fg')
        }
      >
        Panduan Penggunaan
      </NavLink>
    </nav>
  );
}

/**
 * Kerangka dashboard: Navbar atas persisten + Sidebar kiri + `<Outlet/>` untuk halaman aktif.
 * Membungkus semua rute `/dashboard/*` KECUALI `/dashboard/studio` (lihat `workspace/CreateWorkspace.tsx`
 * — Studio sudah punya TopBar sendiri yang padat, menumpuk chrome dashboard di atasnya hanya
 * memakan ruang). Login TIDAK diwajibkan untuk memakai dashboard ini — lihat catatan di `AccountWidget`.
 */
export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <header className="glass relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <IconButton label="Menu" className="lg:hidden" onClick={() => setMobileOpen((v) => !v)}>
          <Menu className="size-4" />
        </IconButton>
        <NavLink to="/dashboard/projects">
          <BrandName />
        </NavLink>
        <div className="ml-auto flex items-center gap-2">
          <AccountWidget />
          <IconButton label="Pengaturan" onClick={() => useUIStore.getState().openModal('settings')}>
            <Settings className="size-4" />
          </IconButton>
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[220px_1fr]">
        <aside className="glass hidden min-h-0 overflow-y-auto border-r border-line lg:block">
          <SidebarLinks />
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
            <aside className="glass pop-in absolute inset-y-0 left-0 w-64 overflow-y-auto border-r border-line">
              <SidebarLinks onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        <main className="min-h-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
