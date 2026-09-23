# Product Requirement Document (PRD) - Revisi UI/UX & Fitur Baru

## MorphDeck — Platform Web Presentasi Interaktif Berbasis AI & Transisi 3D/WebGL

> **Catatan Revisi:** Dokumen ini merupakan pembaruan dari arsitektur awal, mengubah struktur antarmuka menjadi model *Dashboard SaaS* yang lebih modular, memisahkan alat gratis dan berbayar (token), serta menambahkan kapabilitas generatif baru (Gambar & GIF AI).

## 1. Arsitektur Antarmuka & Navigasi (Baru)

Sistem antarmuka kini dibagi menjadi dua zona utama: **Halaman Publik (Login/Landing)** dan **Area Dashboard (App).**

### A. Halaman Publik & Login (`/login`)

* **Visual & Animasi:** Menggunakan pustaka *React Bits* atau template UI premium. Latar belakang sinematik/3D interaktif yang langsung mendemonstrasikan kemampuan WebGL aplikasi.

* **Autentikasi:** Kotak login terpusat (Masuk dengan Google via Supabase Auth).

* **Kredit Kreator (Developer Attribution):** Bagian khusus bergaya *glassmorphism* di halaman login yang memperkenalkan arsitek utama platform:

  * **Dikembangkan & Dirancang oleh:** Muhammad Nurrahman Juliansyah

  * **Tautan Sosial:**

    * [Instagram](https://www.instagram.com/rianz_yan?igsh=bDRvaGtwZXvcmdn&utm_source=qr)

    * [TikTok](https://www.tiktok.com/@julian.alvarezz?lang=id-ID&utm_source=gemini)

    * [GitHub](https://github.com/MuhammadNur02?utm_source=gemini)

### B. Dashboard Utama & Navbar (`/dashboard`)

Setelah login, pengguna masuk ke antarmuka Dashboard. Terdapat **Navbar (Bilah Navigasi) di Atas** yang selalu persisten:

* **Profil Pengguna:** Menampilkan avatar Google. Mengklik ini membuka modal/halaman "Edit Profil" (Ubah nama, preferensi tampilan,Tombol Keluar).

* **Sistem Token:** Menampilkan sisa Kredit. Terdapat tombol animasi **\[+\] Isi Ulang** yang membuka modal *top-up* pembayaran (Xendit) tanpa meninggalkan halaman.

### C. Menu Halaman (Routing)

Navigasi menu utama terdiri dari 6 modul terpisah:

1. **#1 Alat Editor (Mode Gratis):**

   * Halaman untuk *Impor Dokumen* (PPTX/PDF/DOCX) atau membuat presentasi dari kanvas kosong.

   * Terhubung langsung ke Studio Editor Visual dengan fungsi penuh, namun dengan *watermark* MorphDeck dan tanpa bantuan AI.

2. **#2 AI Generate PPT (Bayar Kredit):**

   * Mesin AI (Claude Sonnet 5) yang sudah ada. Pengguna memasukkan *prompt*/topik, memilih jumlah slide, dan AI langsung membangun struktur serta memilih animasi 3D. (Perlihatkan habisnya berapa kredit sebelum Generate)

   * Hasilnya otomatis terbuka di Studio tanpa *watermark* dan bisa diekspor sepenuhnya.

3. **#3 AI Generate Gambar (Bayar Token) - *FITUR BARU*:**

   * Halaman khusus untuk membuat aset gambar ilustrasi pendukung menggunakan *prompt* teks (Integrasi API Stable Diffusion / DALL-E / Midjourney).

   * Gambar yang dihasilkan masuk ke "Pustaka Aset" pengguna.

4. **#4 AI Generate Animasi GIF (Bayar Token) - *FITUR BARU*:**

   * Halaman untuk merender objek/teks menjadi animasi GIF pendek dengan pilihan Background Transparan/Full Gambar (Integrasi Text-to-GIF AI atau *script* otomatisasi WebGL ke GIF).

   * Cocok untuk membuat stiker atau elemen bergerak unik untuk presentasi.

5. **#5 Hasil Proyek:**

   * Galeri yang menampilkan kartu-kartu proyek presentasi yang pernah dibuat pengguna.

   * Opsi: Lanjutkan Edit, Ganti Nama, Hapus, Unduh.

6. **#6 Panduan Penggunaan:**

   * Halaman dokumentasi interaktif. Berisi video tutorial singkat atau panduan *step-by-step* (menggunakan *tooltip* interaktif) cara memakai Editor 3D, cara mengolah Token, dan tips *prompting* AI.

## 2. Fitur Baru & Perbaikan Tambahan (Yang Belum Ada di PRD Lama)

Untuk mewujudkan struktur di atas, berikut adalah modifikasi *backend* dan logika yang **harus ditambahkan dan diperbaiki**:

### A. Integrasi API Baru (Gambar & GIF)

* **Kebutuhan:** PRD lama hanya menggunakan *Claude* (teks) dan Unsplash (gambar stok). Fitur #3 dan #4 membutuhkan *provider* AI baru.

* **Tindakan:** Mengatur *Edge Functions* di Supabase untuk memanggil API *Stable Diffusion* (untuk gambar) atau API pihak ketiga penyedia GIF generatif. Sistem pemotongan token (RLS database) harus disesuaikan agar bisa memotong token dengan nilai berbeda (misal: Generate PPT = 1-2 Token, Gambar = 0,5-1 Token).

### B. Migrasi Penyimpanan: Dari Lokal ke Cloud (Hasil Proyek)

* **Kebutuhan:** Di PRD lama, proyek disimpan di `IndexedDB` (perangkat lokal pengguna). Dengan adanya halaman "#5 Hasil Proyek" di Dashboard SaaS, pengguna mengharapkan proyek mereka bisa diakses di perangkat lain saat mereka login.

* **Tindakan:** Perlu merancang skema *database* baru di Supabase (Tabel `projects`). Menyimpan file struktur `.json` proyek pengguna ke *Supabase Storage*, sehingga halaman Hasil Proyek bisa mengambil data dari server, bukan sekadar dari *cache browser*.

### C. Manajemen Profil Pengguna

* **Kebutuhan:** Navbar sekarang punya fitur Edit Profil.

* **Tindakan:** Menambahkan tabel `user_profiles` di Supabase untuk menyimpan nama preferensi pengguna, pekerjaan, tema UI yang disukai (Dark/Light mode), dan *history* transaksi *top-up* token.

### D. Perbaikan UX Pembayaran (Xendit)

* **Kebutuhan:** Sebelumnya pembayaran melempar pengguna ke tab baru.

* **Tindakan:** Memanfaatkan modal atau *iframe* *checkout* agar pengguna bisa melakukan *top-up* saat mengklik tombol "+" di Navbar tanpa harus terlempar keluar dari antarmuka MorphDeck. Pindah dari mode *Sandbox* ke *Production* Xendit.

### E. Integrasi Aset Lintas Menu

* **Kebutuhan:** Hasil dari "#3 Generate Gambar" dan "#4 Generate GIF" harus bisa unduh atau dapat dipakai di"#1 Alat Editor".

* **Tindakan:** Membangun *state management* (misal: Redux/Zustand) untuk "Pustaka Aset Akun". Gambar yang digenerate di halaman terpisah otomatis masuk ke tab "Aset -> Unggahan Saya" saat pengguna membuka Studio Editor.