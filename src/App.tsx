import { gsap } from 'gsap';
import { Film, Image } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './components/auth/LoginPage';
import { Toaster } from './components/common/Toaster';
import { ComingSoonPage } from './components/dashboard/ComingSoonPage';
import { DashboardLayout } from './components/dashboard/DashboardLayout';
import { HelpPage } from './components/dashboard/HelpPage';
import { ProfilePage } from './components/dashboard/ProfilePage';
import { ProjectsPage } from './components/dashboard/ProjectsPage';
import { LandingPage } from './components/marketing/LandingPage';
import { Onboarding } from './components/onboarding/Onboarding';
import { PresentationMode } from './components/presentation/PresentationMode';
import { BillingModal } from './components/studio/BillingModal';
import { SettingsModal } from './components/studio/SettingsModal';
import { VersionHistory } from './components/studio/VersionHistory';
import { CreateWorkspace } from './components/workspace/CreateWorkspace';
import { pushProjectToCloud } from './services/cloudProjects';
// Mengimpor authStore di sini juga memasang langganan status sesi Supabase-nya sekali di seluruh
// aplikasi (efek samping level modul di dalam berkas itu sendiri).
import { useAuthStore } from './store/authStore';
import { useProjectStore } from './store/projectStore';
import { applyUiTheme, useSettingsStore } from './store/settingsStore';
import { useUIStore } from './store/uiStore';

const AUTO_SNAPSHOT_MS = 3 * 60 * 1000;

export default function App() {
  const hydrated = useUIStore((s) => s.hydrated);
  const presenting = useUIStore((s) => s.presenting);
  const uiTheme = useSettingsStore((s) => s.uiTheme);
  const stage = useUIStore((s) => s.stage);
  const hasProject = useProjectStore((s) => !!s.project);

  // Tema UI (gelap/terang/sistem) — juga mengikuti perubahan preferensi OS.
  useEffect(() => {
    applyUiTheme(uiTheme);
    if (uiTheme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyUiTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [uiTheme]);

  // Riwayat versi otomatis + sinkron cloud (bila masuk) berkala saat ada perubahan sejak titik terakhir.
  useEffect(() => {
    if (stage !== 'studio') return;
    const id = setInterval(() => {
      const { project, history, saveSnapshot } = useProjectStore.getState();
      if (!project) return;
      const last = history[0]?.createdAt ?? 0;
      if (project.updatedAt > last && Date.now() - last > AUTO_SNAPSHOT_MS) {
        saveSnapshot('Otomatis');
        if (useAuthStore.getState().user) void pushProjectToCloud(project).catch(() => undefined);
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [stage]);

  // Saat presentasi berakhir, editor memudar masuk (bukan muncul mendadak).
  const appRef = useRef<HTMLDivElement>(null);
  const wasPresenting = useRef(false);
  useEffect(() => {
    if (wasPresenting.current && !presenting && appRef.current) {
      gsap.fromTo(appRef.current, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out', clearProps: 'opacity' });
    }
    wasPresenting.current = presenting;
  }, [presenting]);

  if (!hydrated) {
    return <div className="grid h-full place-items-center text-sm text-muted">Memuat proyek…</div>;
  }

  return (
    <div className="h-full">
      {/*
        Selama presentasi, seluruh UI editor disembunyikan (visibility) dan dinonaktifkan (inert):
        tidak ada bagian editor yang bisa terlihat, terfokus, atau menerima tombol di belakang slide.
      */}
      <div ref={appRef} className="h-full" style={{ visibility: presenting ? 'hidden' : 'visible' }} aria-hidden={presenting} inert={presenting}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<Navigate to="projects" replace />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="editor" element={<Onboarding mode="import" />} />
            <Route path="generate" element={<Onboarding mode="prompt" />} />
            <Route
              path="generate-image"
              element={<ComingSoonPage title="AI Generate Gambar" description="Buat ilustrasi pendukung dari prompt teks — menyusul di fase berikutnya." icon={<Image className="size-6" />} />}
            />
            <Route
              path="generate-gif"
              element={<ComingSoonPage title="AI Generate Animasi GIF" description="Render animasi bergerak singkat dari prompt teks — menyusul di fase berikutnya." icon={<Film className="size-6" />} />}
            />
            <Route path="help" element={<HelpPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          <Route path="/dashboard/studio" element={<CreateWorkspace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {presenting && hasProject && <PresentationMode />}
      {!presenting && (
        <>
          <SettingsModal />
          <VersionHistory />
          <BillingModal />
          <Toaster />
        </>
      )}
    </div>
  );
}
