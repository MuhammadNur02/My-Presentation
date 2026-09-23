import { LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandMark } from '../common/Brand';
import { StageShell } from '../common/StageShell';
import { Button } from '../common/ui';
import { supabaseConfigured } from '../../services/supabase';
import { useAuthStore } from '../../store/authStore';

/** Halaman login terdedikasi (`/login`) — latar animasi (kelas `.aurora` yang sudah ada), satu tombol. */
export function LoginPage() {
  const user = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  // Sudah masuk (mis. buka /login lagi setelah sesi tersimpan) → langsung ke dashboard.
  useEffect(() => {
    if (user) navigate('/dashboard/projects', { replace: true });
  }, [user, navigate]);

  return (
    <StageShell className="aurora grid h-full place-items-center px-6">
      <div className="glass w-full max-w-sm rounded-[28px] border border-line p-8 text-center shadow-[var(--shadow-pop)]">
        <BrandMark size={40} />
        <h1 className="mt-4 text-xl font-semibold">Masuk ke MorphDeck</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Masuk dengan Google untuk mendapat kredit AI gratis, menyimpan proyek ke cloud, dan membukanya dari perangkat mana pun.
        </p>

        {supabaseConfigured ? (
          <Button
            variant="primary"
            size="lg"
            className="mt-6 w-full"
            loading={busy}
            icon={<LogIn className="size-4" />}
            onClick={async () => {
              setBusy(true);
              try {
                await useAuthStore.getState().signInWithGoogle();
              } finally {
                setBusy(false);
              }
            }}
          >
            Masuk dengan Google
          </Button>
        ) : (
          <p className="mt-6 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">Login belum dikonfigurasi di lingkungan ini.</p>
        )}

        <p className="mt-5 text-xs text-muted">
          Cuma mau coba dulu?{' '}
          <Link to="/dashboard/generate" className="font-medium text-accent hover:underline">
            Lanjut tanpa akun
          </Link>
        </p>
      </div>
    </StageShell>
  );
}
