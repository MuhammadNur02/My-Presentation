import { LogIn, LogOut, Wallet } from 'lucide-react';
import { useState } from 'react';
import { supabaseConfigured } from '../../services/supabase';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { cn } from '../../utils/cn';
import { Button, IconButton } from './ui';

/**
 * Widget akun: tombol "Masuk dengan Google" saat belum masuk; badge sisa kredit + avatar saat
 * sudah masuk. Tidak menampilkan apa pun bila backend Supabase belum dikonfigurasi (`.env.local`),
 * supaya clone lokal tanpa backend tetap bersih dari elemen yang pasti gagal.
 */
export function AccountWidget({ className }: { className?: string }) {
  const { user, credits, loading, signInWithGoogle, signOut } = useAuthStore();
  const [busy, setBusy] = useState(false);

  if (!supabaseConfigured || loading) return null;

  if (!user) {
    return (
      <Button
        size="sm"
        variant="secondary"
        icon={<LogIn className="size-3.5" />}
        loading={busy}
        className={className}
        onClick={async () => {
          setBusy(true);
          try {
            await signInWithGoogle();
          } finally {
            setBusy(false);
          }
        }}
      >
        Masuk dengan Google
      </Button>
    );
  }

  const name = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? '?';
  const avatar = user.user_metadata?.avatar_url as string | undefined;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <button
        onClick={() => useUIStore.getState().openModal('billing')}
        title="Isi ulang kredit"
        className="flex items-center gap-1.5 rounded-full border border-line bg-field px-3 py-1.5 text-xs font-medium transition hover:bg-field-hover"
      >
        <Wallet className="size-3.5 text-accent" />
        {credits ?? '…'} kredit
      </button>
      {avatar ? (
        <img src={avatar} alt={name} referrerPolicy="no-referrer" className="size-7 shrink-0 rounded-full" />
      ) : (
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <IconButton label="Keluar" onClick={() => void signOut()}>
        <LogOut className="size-3.5" />
      </IconButton>
    </div>
  );
}
