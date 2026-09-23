-- PERBAIKAN KEAMANAN KRITIS: kunci hak eksekusi fungsi kredit.
--
-- `spend_credits`/`add_credits` (0001_init.sql) dibuat SECURITY DEFINER tapi TIDAK PERNAH di-REVOKE
-- dari PUBLIC — di PostgreSQL, fungsi baru otomatis bisa dieksekusi oleh PUBLIC, yang di Supabase
-- berarti role `anon` DAN `authenticated` ikut kebagian. Akibatnya, siapa pun yang sudah login bisa
-- memanggil `supabase.rpc('add_credits', { p_uid: <uid sendiri>, p_amount: 999999 })` langsung dari
-- browser dan mendapat kredit tak terbatas gratis, memotong jalur pembayaran Xendit sepenuhnya.
-- `spend_credits` pun tidak memvalidasi `p_uid = auth.uid()` di badannya sendiri, jadi bisa dipakai
-- untuk menghabiskan kredit akun ORANG LAIN juga.
--
-- Fungsi ini HANYA boleh dipanggil dari Edge Function (claude-proxy, generate-image, xendit-webhook),
-- yang semuanya memakai service_role key — jadi mengunci akses PUBLIC tidak memutus alur mana pun
-- yang sudah ada.

revoke execute on function public.spend_credits(uuid, integer) from public;
revoke execute on function public.add_credits(uuid, integer, text) from public;

grant execute on function public.spend_credits(uuid, integer) to service_role;
grant execute on function public.add_credits(uuid, integer, text) to service_role;
