-- Pustaka "Aset Gambar" — AI Generate Gambar (Fase 2a).
--
-- Sama seperti tabel `projects` (bukan seperti `users`/`credit_transactions`): ini BOLEH ditulis
-- langsung oleh pemiliknya lewat RLS biasa, karena bukan data finansial. Yang dilindungi ketat
-- adalah pemotongan kredit saat PEMBUATANNYA (lihat Edge Function `generate-image`, memakai
-- `spend_credits` yang sudah ada) — begitu gambar jadi, menyimpan/menghapusnya di pustaka sendiri
-- tidak berisiko dicurangi untuk keuntungan.

create table public.generated_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  prompt text not null,
  storage_path text not null,
  width integer not null,
  height integer not null,
  created_at timestamptz not null default now()
);

create index generated_images_user_id_idx on public.generated_images (user_id, created_at desc);

alter table public.generated_images enable row level security;

create policy "Kelola gambar sendiri" on public.generated_images
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Bucket privat, path wajib diawali id pengguna sendiri ({auth.uid()}/...) — sama seperti bucket 'projects'.
insert into storage.buckets (id, name, public)
values ('generated-images', 'generated-images', false)
on conflict (id) do nothing;

create policy "Baca gambar sendiri" on storage.objects
  for select using (bucket_id = 'generated-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Tulis gambar sendiri" on storage.objects
  for insert with check (bucket_id = 'generated-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Hapus gambar sendiri" on storage.objects
  for delete using (bucket_id = 'generated-images' and (storage.foldername(name))[1] = auth.uid()::text);
