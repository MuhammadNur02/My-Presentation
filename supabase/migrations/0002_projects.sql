-- Penyimpanan proyek di cloud (Fase 1 restrukturisasi Dashboard SaaS).
--
-- Model: HIBRIDA. IndexedDB di perangkat tetap sumber utama saat mengedit (instan, tidak berubah).
-- Tabel ini hanya metadata untuk galeri "Hasil Proyek" + menunjuk ke isi proyek (.json, format sama
-- persis dengan ekspor/impor proyek yang sudah ada) yang disimpan di Storage bucket 'projects'.
--
-- Beda dengan tabel `users`/`credit_transactions` (data finansial, dikunci total): tabel ini BOLEH
-- dibaca & ditulis langsung oleh pemiliknya lewat RLS biasa — bukan data yang bisa dicurangi untuk
-- mendapat keuntungan (bukan uang/kredit).

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  slide_count integer not null default 0,
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_user_id_idx on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;

create policy "Kelola proyek sendiri" on public.projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Bucket privat untuk isi proyek (.json). Path wajib diawali id pengguna sendiri
-- ({auth.uid()}/...) — diberlakukan oleh kebijakan Storage di bawah, bukan sekadar konvensi.
insert into storage.buckets (id, name, public)
values ('projects', 'projects', false)
on conflict (id) do nothing;

create policy "Baca berkas proyek sendiri" on storage.objects
  for select using (bucket_id = 'projects' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Tulis berkas proyek sendiri" on storage.objects
  for insert with check (bucket_id = 'projects' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Perbarui berkas proyek sendiri" on storage.objects
  for update using (bucket_id = 'projects' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Hapus berkas proyek sendiri" on storage.objects
  for delete using (bucket_id = 'projects' and (storage.foldername(name))[1] = auth.uid()::text);
