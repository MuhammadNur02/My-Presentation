-- Skema akun + kredit MorphDeck.
--
-- Model MVP: "beli paket kredit" (bukan langganan berkala) — pembelian sekali bayar via Xendit Invoice,
-- bukan langganan auto-renew (yang butuh kartu tersimpan & API terpisah). 1 kredit = 1 panggilan AI.
--
-- Keamanan: RLS (Row Level Security) menyalakan default-tolak-semua-tulis untuk klien biasa. Kredit
-- HANYA bisa diubah lewat fungsi SQL `spend_credits`/`add_credits` (SECURITY DEFINER, dipanggil dari
-- Edge Function memakai service_role key) — pengguna tidak pernah bisa mengubah saldonya sendiri lewat
-- konsol browser, hanya membaca (select) baris miliknya sendiri.

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  credits integer not null default 0,
  total_purchased integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.credit_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null check (type in ('grant_free', 'purchase', 'usage', 'refund')),
  amount integer not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.credit_transactions enable row level security;

-- Pengguna hanya boleh MEMBACA baris miliknya sendiri — tidak ada policy insert/update/delete untuk
-- role "authenticated"/"anon" sama sekali, jadi otomatis DITOLAK (default Postgres RLS: tanpa policy = tolak).
create policy "Baca profil sendiri" on public.users for select using (auth.uid() = id);
create policy "Baca riwayat sendiri" on public.credit_transactions for select using (auth.uid() = user_id);

-- Jumlah kredit gratis untuk akun baru. Ubah angka ini kalau mau menyesuaikan.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  free_credits constant integer := 5;
begin
  insert into public.users (id, email, display_name, credits)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), free_credits)
  on conflict (id) do nothing;

  insert into public.credit_transactions (user_id, type, amount, note)
  values (new.id, 'grant_free', free_credits, 'Kredit gratis pendaftaran');

  return new;
end;
$$;

-- Dipicu otomatis oleh Supabase setiap ada akun baru (termasuk lewat login Google) — pola resmi Supabase
-- untuk membuat baris "profil" begitu auth.users bertambah.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Potong kredit secara ATOMIK: UPDATE...WHERE...RETURNING dalam satu pernyataan sudah otomatis aman dari
-- kondisi balapan (dua klik/tab sekaligus) berkat penguncian baris bawaan Postgres — tidak perlu transaksi
-- eksplisit tambahan. Melempar galat 'INSUFFICIENT_CREDITS' bila saldo tidak cukup (tidak memotong apa pun).
create or replace function public.spend_credits(p_uid uuid, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  update public.users
  set credits = credits - p_amount, updated_at = now()
  where id = p_uid and credits >= p_amount
  returning credits into v_remaining;

  if v_remaining is null then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  insert into public.credit_transactions (user_id, type, amount)
  values (p_uid, 'usage', -p_amount);

  return v_remaining;
end;
$$;

-- Tambah kredit setelah pembayaran Xendit sukses — dipanggil dari webhook (service_role), bukan dari klien.
create or replace function public.add_credits(p_uid uuid, p_amount integer, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set credits = credits + p_amount,
      total_purchased = total_purchased + p_amount,
      updated_at = now()
  where id = p_uid;

  insert into public.credit_transactions (user_id, type, amount, note)
  values (p_uid, 'purchase', p_amount, p_note);
end;
$$;
