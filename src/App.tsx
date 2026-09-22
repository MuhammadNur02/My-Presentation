import { gsap } from 'gsap';
import { useEffect, useRef } from 'react';
import { Toaster } from './components/common/Toaster';
import { GeneratingStage } from './components/generating/GeneratingStage';
import { Onboarding } from './components/onboarding/Onboarding';
import { OutlineStage } from './components/outline/OutlineStage';
import { PresentationMode } from './components/presentation/PresentationMode';
import { BillingModal } from './components/studio/BillingModal';
import { SettingsModal } from './components/studio/SettingsModal';
import { Studio } from './components/studio/Studio';
import { VersionHistory } from './components/studio/VersionHistory';
import { useProjectStore } from './store/projectStore';
// Memasang langganan status sesi Supabase sekali di seluruh aplikasi (efek samping level modul).
import './store/authStore';
import { applyUiTheme, useSettingsStore } from './store/settingsStore';
import { useUIStore } from './store/uiStore';

const AUTO_SNAPSHOT_MS = 3 * 60 * 1000;

export default function App() {
  const stage = useUIStore((s) => s.stage);
  const hydrated = useUIStore((s) => s.hydrated);
  const presenting = useUIStore((s) => s.presenting);
  const uiTheme = useSettingsStore((s) => s.uiTheme);

  // Tema UI (gelap/terang/sistem) — juga mengikuti perubahan preferensi OS.
  useEffect(() => {
    applyUiTheme(uiTheme);
    if (uiTheme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyUiTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [uiTheme]);

  // Riwayat versi otomatis: snapshot berkala bila ada perubahan sejak snapshot terakhir.
  useEffect(() => {
    if (stage !== 'studio') return;
    const id = setInterval(() => {
      const { project, history, saveSnapshot } = useProjectStore.getState();
      if (!project) return;
      const last = history[0]?.createdAt ?? 0;
      if (project.updatedAt > last && Date.now() - last > AUTO_SNAPSHOT_MS) saveSnapshot('Otomatis');
    }, 60_000);
    return () => clearInterval(id);
  }, [stage]);

  // Dorong pengguna ke tahap yang valid bila proyek tidak ada.
  const hasProject = useProjectStore((s) => !!s.project);
  useEffect(() => {
    if (hydrated && !hasProject && stage !== 'onboarding') useUIStore.getState().setStage('onboarding');
  }, [hydrated, hasProject, stage]);

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
        {stage === 'onboarding' && <Onboarding />}
        {stage === 'outline' && hasProject && <OutlineStage />}
        {stage === 'generating' && hasProject && <GeneratingStage />}
        {stage === 'studio' && hasProject && <Studio />}
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
