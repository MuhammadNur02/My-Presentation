import { LogIn, LogOut, Save, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { Button, Field, inputClass } from '../common/ui';

interface Transaction {
  id: number;
  type: string;
  amount: number;
  note: string | null;
  created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  grant_free: 'Kredit gratis pendaftaran',
  purchase: 'Pembelian',
  usage: 'Pemakaian AI',
  refund: 'Pengembalian',
};

const fmt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

/** Halaman profil: nama tampilan, saldo kredit, riwayat transaksi, dan keluar. */
export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const credits = useAuthStore((s) => s.credits);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [tx, setTx] = useState<Transaction[] | null>(null);
  const toast = useUIStore.getState().toast;

  useEffect(() => {
    if (!user) return;
    setName((user.user_metadata?.full_name as string | undefined) ?? '');
    void supabase
      .from('credit_transactions')
      .select('id,type,amount,note,created_at')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) toast(error.message, 'error');
        else setTx(data as Transaction[]);
      });
  }, [user, toast]);

  if (!user) {
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="glass max-w-sm rounded-3xl border border-line p-8 text-center shadow-[var(--shadow-pop)]">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <UserRound className="size-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">Masuk untuk melihat profil</h1>
          <p className="mt-2 text-sm text-muted">Profil, saldo kredit, dan riwayat transaksi hanya tersedia untuk akun yang sudah masuk.</p>
          <Button variant="primary" className="mt-5" icon={<LogIn className="size-4" />} onClick={() => void useAuthStore.getState().signInWithGoogle()}>
            Masuk dengan Google
          </Button>
        </div>
      </div>
    );
  }

  const saveName = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('users').update({ display_name: name.trim() }).eq('id', user.id);
      if (error) throw new Error(error.message);
      toast('Nama tersimpan.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan nama', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-xl font-semibold">Profil</h1>

      <section className="glass mt-5 flex items-center gap-4 rounded-2xl border border-line p-5">
        {user.user_metadata?.avatar_url ? (
          <img src={user.user_metadata.avatar_url as string} alt="" referrerPolicy="no-referrer" className="size-14 shrink-0 rounded-full" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent-soft text-lg font-semibold text-accent">
            {(name || user.email || '?').charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{user.email}</div>
          <div className="text-xs text-muted">{credits ?? '…'} kredit tersisa</div>
        </div>
        <Button variant="secondary" icon={<LogOut className="size-4" />} onClick={() => void useAuthStore.getState().signOut()}>
          Keluar
        </Button>
      </section>

      <section className="glass mt-4 space-y-3 rounded-2xl border border-line p-5">
        <Field label="Nama tampilan">
          <div className="flex gap-2">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama Anda" />
            <Button variant="primary" loading={saving} icon={<Save className="size-4" />} onClick={() => void saveName()}>
              Simpan
            </Button>
          </div>
        </Field>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-muted">Riwayat transaksi</h2>
        <div className="glass mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {tx === null ? (
            <p className="p-4 text-sm text-muted">Memuat…</p>
          ) : tx.length === 0 ? (
            <p className="p-4 text-sm text-muted">Belum ada transaksi.</p>
          ) : (
            tx.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">{TYPE_LABEL[t.type] ?? t.type}</div>
                  <div className="text-xs text-muted">
                    {fmt.format(new Date(t.created_at))}
                    {t.note ? ` · ${t.note}` : ''}
                  </div>
                </div>
                <span className={t.amount >= 0 ? 'font-semibold text-emerald-500' : 'font-semibold text-red-500'}>
                  {t.amount >= 0 ? '+' : ''}
                  {t.amount}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
