# Product Requirement Document (PRD)
## MorphDeck — Platform Web Presentasi Interaktif Berbasis AI & Transisi 3D/WebGL (Morph)

> **Catatan tentang dokumen ini:** versi ini adalah **potret akurat dari apa yang SUDAH dibangun dan berjalan** di aplikasi saat ini (bukan lagi sekadar rencana/wishlist seperti draf awal). Tujuannya jadi titik pijak yang benar sebelum revisi besar berikutnya. Bagian "Belum Ada / Batasan" di bagian akhir ditulis sejujur mungkin — itu bukan aib, tapi peta jalan.

---

## 1. Gambaran Umum Produk

MorphDeck adalah aplikasi web (bisa dibuka langsung di peramban, tanpa instalasi) untuk membuat presentasi bergaya sinematik dengan transisi **3D/WebGL** halus (disebut *Morph*), yang disusun otomatis oleh AI dari sebuah topik atau dari dokumen yang sudah ada. Setelah dibuat, pengguna bisa menyempurnakan setiap detail di **Studio** (editor visual dua-panel dengan pratinjau langsung), lalu menayangkannya secara langsung dalam mode presentasi layar penuh atau mengunduhnya sebagai situs web mandiri.

Produk ini sekarang **bukan cuma prototipe pribadi** — sudah punya sistem akun (masuk dengan Google), sistem kredit berbayar dengan backend sungguhan (Supabase) dan gerbang pembayaran Indonesia (Xendit), serta jalur pemakaian gratis (impor dokumen) yang sengaja dibatasi agar mendorong orang berlangganan kredit. Semua fondasi ini sudah terpasang; yang tersisa terutama adalah pengujian dunia-nyata, penyempurnaan tata letak/halaman, dan aktivasi mode produksi penuh (bukan lagi sandbox) di sisi pembayaran.

---

## 2. Status Produk Saat Ini (Ringkasan Cepat)

| Aspek | Status |
|---|---|
| Mesin pembuatan presentasi (AI + manual) | ✅ Lengkap & berfungsi |
| Studio edit visual (6 tab kontrol) | ✅ Lengkap & berfungsi |
| Rendering 3D/WebGL (24 transisi, animasi elemen, dsb.) | ✅ Lengkap & berfungsi, dengan mode cadangan otomatis |
| Ekspor situs mandiri (ZIP/HTML) & mode presentasi | ✅ Lengkap & berfungsi |
| Akun pengguna (masuk Google) & sistem kredit | ✅ Terpasang & terhubung ke backend sungguhan |
| Pembayaran (Xendit: QRIS/e-wallet/VA/kartu) | ⚠️ Terpasang, tapi **masih memakai kunci mode uji (sandbox)** — belum bisa menerima uang sungguhan sampai verifikasi bisnis Xendit selesai |
| Mode gratis vs berbayar (watermark, batasan fitur) | ✅ Terpasang & teruji |
| Tata letak & struktur halaman antarmuka (UI/UX) | ⚠️ Fungsional, tapi **inilah yang akan dirombak besar-besaran** sesuai revisi berikutnya |
| Aplikasi mobile (Play Store/App Store) | ❌ Belum ada — baru rencana (lihat §9) |

---

## 3. Peta Fitur Lengkap yang Sudah Terbangun

### A. Onboarding & Pembuatan Presentasi Awal
* **Dua jalur pembuatan**, dipilih lewat tab di layar utama:
  1. **Prompt AI** — pengguna menulis topik bebas, memilih *tone* (Profesional / Kreatif / Minimalis / Edukatif), bahasa (Indonesia/English), dan jumlah slide (4–20). Kolom topik menampilkan **animasi ketik otomatis** yang bergantian menampilkan 4 contoh topik sebagai inspirasi (berhenti begitu pengguna mulai mengetik).
  2. **Impor dokumen** — tarik-lepas atau pilih berkas **PPTX, PDF, DOCX, TXT, MD**, atau berkas proyek MorphDeck (`.json`) untuk melanjutkan proyek lama. Semua pemrosesan terjadi **di perangkat pengguna sendiri** — tidak ada dokumen yang diunggah ke server mana pun.
* Status "AI aktif / mode simulasi / kredit tersisa" selalu terlihat di layar ini, jadi pengguna tahu persis mode apa yang sedang dipakai sebelum menekan tombol generate.
* Proyek yang sedang berjalan otomatis tersimpan di perangkat (IndexedDB) dan bisa dilanjutkan kapan saja dari layar ini.

### B. Mesin AI (Generation Engine)
Setelah topik/dokumen siap, ada tahap "Tinjau struktur" (koreksi teks, tambah gambar/logo, pilih tema warna) lalu tombol **Generate** yang menjalankan mesin desain otomatis:
* **Pemilihan tata letak cerdas** — AI memilih salah satu dari 11 jenis tata letak sesuai bentuk kontennya (lihat tabel katalog di §5).
* **Pencarian gambar kontekstual** — otomatis mencari gambar pendukung yang relevan dengan kata kunci sub-judul; kalau tidak ada kunci Unsplash, sistem membuat ilustrasi seni generatif sendiri (selalu tersedia, tanpa perlu internet/API tambahan).
* **Perencanaan gerak & transisi** — AI menyusun "bahasa gerak" yang konsisten untuk seluruh presentasi (bukan efek acak per slide), memilih palet transisi yang serasi dengan tone, dan menentukan animasi masuk tiap elemen.
* **Animasi bergerak otomatis** — untuk slide yang topiknya jelas cocok (mis. "sel darah", "roda gigi"), sistem otomatis memasang animasi bergerak yang relevan dari katalog 12 adegan bawaan.
* Proses ini sepenuhnya berjalan **offline & deterministik** (tidak butuh AI berbayar) — bagian yang *butuh* AI sungguhan hanyalah penyusunan teks/struktur awal (judul, poin, catatan) dan (opsional) pemilihan animasi bergerak yang paling cocok.

### C. Studio Edit Manual (Editor Visual)
Antarmuka dua panel: **kiri** = kontrol edit dengan 6 tab, **kanan** = pratinjau langsung (Live Monitor) yang menampilkan hasil render 3D/WebGL sungguhan, bukan simulasi.

| Tab | Fungsi |
|---|---|
| **Slide** | Sunting judul, sub-judul, poin (mendukung format **tebal**, *miring*, dan ==sorot warna==), catatan pembicara tersembunyi, unggah gambar/logo, pilih jenis tata letak, dan pilih animasi bergerak. |
| **Posisi** | Tata letak **manual** penuh — geser & ubah ukuran setiap elemen (judul, sub-judul, tiap poin, foto, logo) langsung di pratinjau dengan mouse (drag, pegangan tepi/sudut, garis pemandu magnet ke tepi/tengah/elemen lain) atau isi angka koordinat secara presisi. Bisa diurungkan (undo/redo). |
| **Gerak** | Atur animasi masuk per elemen (24 gaya, lihat §5), gerak ambient foto (Ken Burns, melayang, dsb.), efek cahaya latar & partikel, serta **"Ungkap poin satu per satu saat presentasi"** (reveal bertahap — poin-poin slide baru muncul satu per satu setiap penonton menekan tombol maju, bukan langsung sekaligus). |
| **Transisi** | Pilih efek transisi 3D antar-slide dari 24 pilihan (lihat §5), atur durasi, jenis easing, dan intensitas efek; bisa diterapkan ke satu slide atau ke semua sekaligus. |
| **Aset** | Kelola pustaka gambar/animasi proyek: cari GIF (GIPHY), unggah GIF/MP4/WebM sendiri, atau pasang animasi generatif bawaan — termasuk tombol **"Minta AI memilih animasi"** yang meminta Claude memilih animasi paling relevan untuk slide yang sedang dibuka. |
| **Tema** | Pilih dari 12 preset warna/tema, 6 pola latar dekoratif, gaya tipografi (Sans/Serif/Mono), warna aksen kustom, dan tampil/sembunyikan nomor slide. |

Fitur pendukung lain di Studio: **riwayat versi** (simpan & pulihkan titik cadangan kapan saja, plus simpan otomatis berkala), **undo/redo** (Ctrl+Z / Ctrl+Shift+Z), susun ulang urutan slide (drag & drop), duplikat/hapus slide, dan ekspor.

### D. Rendering 3D/WebGL & Optimasi Performa
* Renderer dibangun di atas **Three.js**, dengan setiap slide digambar sebagai tekstur yang dianimasikan lewat shader kustom untuk tiap jenis transisi (bukan CSS/video, benar-benar 3D real-time).
* **Degradasi otomatis** (*graceful degradation*): kualitas grafis awal ditebak dari kemampuan perangkat, lalu terus dipantau — kalau frame-rate turun, resolusi & kerumitan render otomatis diturunkan agar tetap mulus. Perangkat tanpa dukungan WebGL sama sekali otomatis beralih ke render Canvas 2D biasa (tampilan tetap utuh, hanya tanpa efek 3D).
* Menghormati pengaturan aksesibilitas "kurangi gerak" (*prefers-reduced-motion*) di sistem operasi pengguna — semua transisi otomatis disederhanakan jadi pudar singkat.
* Manajemen memori ketat: render hanya terjadi saat ada perubahan (bukan loop terus-menerus), dan semua sumber daya GPU dibersihkan total setiap kali pratinjau ditutup/dibuka ulang.

### E. Mode Presentasi
* Tampilan **layar penuh sinematik**, bebas dari elemen antarmuka peramban.
* Navigasi: panah keyboard, tombol spasi, geser layar sentuh (swipe).
* **Ungkap bertahap per klik** — untuk slide yang diaktifkan, poin-poin muncul satu per satu setiap kali presenter menekan maju (lihat tab Gerak di atas).
* Panel **catatan pembicara** tersembunyi (tekan `N`), hanya terlihat oleh presenter.
* Tombol `Esc` mengakhiri presentasi dengan animasi tirai halus dan **mereset otomatis** ke slide pertama, plus opsi cepat "mulai lagi".

### F. Ekspor & Publikasi
* **Paket ZIP** (disarankan) — berisi satu `index.html` mandiri (semua kode/gambar tertanam, tidak butuh server/internet untuk dibuka), `README.txt` panduan pakai, salinan aset asli, dan (untuk proyek penuh) berkas proyek `.json` yang bisa diimpor lagi untuk disunting.
* **Satu berkas HTML** — versi ringkas tanpa ZIP, semua tertanam dalam satu file.
* **Berkas proyek (.json)** — cadangan mentah untuk dibuka/disunting lagi di MorphDeck (khusus proyek mode penuh — lihat §H).
* Hasil ekspor terbukti berjalan langsung dari `file://` di semua peramban modern berbasis Chromium, serta Firefox dan Safari, tanpa plugin apa pun.

### G. Akun Pengguna, Kredit, & Monetisasi *(baru)*
* **Masuk dengan Google** (Supabase Auth) — badge akun tampil di pojok layar utama & Studio; menampilkan avatar dan sisa saldo kredit.
* **Sistem kredit** — setiap pengguna baru otomatis mendapat **5 kredit gratis** saat pertama kali masuk. 1 kredit = 1 kali pembuatan struktur presentasi lewat AI (atau 1 kali "Minta AI memilih animasi").
* **Model AI hosted** — pengguna yang sudah masuk memakai AI lewat server MorphDeck sendiri (bukan kunci pribadi), dengan model **Claude Sonnet 5** yang tetap/tidak bisa diganti pengguna (demi kendali biaya). Pengguna yang punya kunci Anthropic sendiri tetap bisa memasangnya di Pengaturan sebagai alternatif (tanpa perlu kredit).
* **Blokir otomatis saat kredit habis** — tombol generate berubah jadi "Kredit habis — isi ulang" dan langsung mengarahkan ke halaman pembelian, tanpa mencoba panggilan yang pasti gagal.
* **Pengembalian kredit otomatis** — kalau AI gagal merespons (mis. gangguan jaringan/server), kredit yang sempat terpotong dikembalikan otomatis, jadi pengguna tidak dirugikan oleh kegagalan teknis.
* **Pembelian paket kredit** (lewat Xendit — QRIS, e-wallet, transfer bank, kartu):

  | Paket | Jumlah Kredit | Harga |
  |---|---|---|
  | Coba Dulu | 5 | Rp7.500 |
  | Paket Mahasiswa | 25 | Rp30.000 |
  | Hemat | 60 | Rp60.000 |
  | Pro / Organisasi | 150 | Rp120.000 |

  Pembelian **selalu lewat halaman web** (dibuka di tab baru dari dalam aplikasi) — bukan lewat mekanisme beli-dalam-aplikasi Apple/Google — supaya tidak kena potongan 15–30% dari toko aplikasi, mengikuti pola yang sama dipakai Netflix/Spotify.

### H. Mode Gratis vs Mode Penuh *(baru)*
Untuk menyeimbangkan "gratis dan nyaman dipakai" dengan "tetap ada insentif berlangganan":
* **Proyek dari prompt AI** (berbayar kredit, kunci sendiri, atau simulasi) = **mode penuh** — semua fitur terbuka, tanpa watermark, ekspor lengkap termasuk berkas proyek `.json`.
* **Proyek dari impor dokumen** = **mode gratis** — tetap bisa dipakai penuh untuk menyusun & menayangkan presentasi, TAPI:
  - Fitur "Minta AI" (pemilihan animasi otomatis oleh Claude) dimatikan.
  - Ekspor berkas proyek `.json` (sumber yang bisa disunting ulang) tidak tersedia — baik sebagai unduhan terpisah maupun disisipkan diam-diam di dalam ZIP.
  - Muncul lencana kecil **"Dibuat dengan MorphDeck"** di pojok layar, baik saat presentasi langsung maupun di file hasil ekspor.

### I. Keamanan & Arsitektur Backend
* **Tidak ada kunci rahasia yang pernah dikirim ke browser/aplikasi**. Kunci Anthropic asli, kunci Xendit, dan kredensial database hanya hidup di server (Supabase Edge Functions), disimpan sebagai *secrets* terenkripsi — bukan di kode yang bisa dibongkar orang dari aplikasi yang sudah dipublikasikan.
* **Proxy AI** — permintaan AI dari pengguna hosted melewati server MorphDeck dulu (memverifikasi identitas Google, memotong kredit secara atomik/anti-race-condition di database), baru diteruskan ke Anthropic memakai kunci server. Pengguna tidak pernah melihat kunci Anthropic asli.
* **Kredit hanya bisa berubah lewat fungsi database yang dikunci** (Row Level Security) — pengguna biasa hanya bisa *membaca* saldonya sendiri, tidak bisa mengubahnya langsung lewat API.
* **Verifikasi pembayaran** lewat token rahasia khusus dari Xendit (bukan sekadar percaya begitu saja), memastikan hanya Xendit yang bisa memicu penambahan kredit.
* Dokumen yang diimpor (PPTX/PDF/DOCX/dll.) diproses **100% di perangkat pengguna** — tidak pernah diunggah ke server mana pun.

---

## 4. Alur Pengguna Saat Ini

```
[ Layar Utama ]
   │
   ├─► Jalur A: Prompt AI (+ tone, bahasa, jumlah slide)
   │      │  · Sudah masuk Google?  → dipotong kredit, AI hosted (Sonnet 5)
   │      │  · Kunci sendiri diisi? → dipotong nol, langsung ke Anthropic
   │      │  · Tak satu pun?        → mode simulasi offline (tetap bisa dicoba)
   │      ▼
   │  [ Proyek MODE PENUH ]
   │
   └─► Jalur B: Impor Dokumen (PPTX/PDF/DOCX/TXT/MD) — gratis, tanpa kredit
          ▼
      [ Proyek MODE GRATIS — watermark aktif ]

              (kedua jalur bertemu di titik yang sama di bawah)
                       │
                       ▼
        [ Tahap 1: Tinjau struktur, gambar/logo, tema global ]
                       │
                       ▼
        [ Tahap 2: "Generate" — mesin desain AI menyusun layout,
          animasi, gambar, & transisi 3D secara otomatis ]
                       │
                       ▼
        [ Tahap 3: Studio Edit Manual (6 tab kontrol + Live Monitor) ]
                       │
                       ├─► Unduh (ZIP / HTML mandiri / .json* )
                       └─► Mulai Presentasi (layar penuh sinematik)

        (* .json hanya tersedia untuk proyek MODE PENUH)
```

---

## 5. Katalog Fitur Rinci

**11 jenis tata letak slide:** Sampul, Konten, Split (dua kolom), Gambar Penuh, Kutipan, Statistik, Bernomor (langkah/urutan), Linimasa (timeline), Bandingkan (dua sisi berhadapan), Pernyataan (satu kalimat besar).

**24 efek transisi 3D** antar-slide, dalam 5 kategori:
- *Klasik:* Fluid Fade, Parallax Push, Glow Wipe, Barn Doors, Iris Reveal
- *3D:* Zoom 3D, Cube Rotate, Flip Card, Carousel 3D, Card Toss, Spin Zoom, Page Curl
- *Morph:* Morph Mesh, Liquid Ripple, Vortex Twist, **Magic Move** (elemen seperti foto/logo "terbang" mulus dari posisi lama ke posisi baru, bukan cuma potong-ganti)
- *Mosaik:* Mosaic Flip, Venetian Blinds, Shatter, Halftone Dots, Pixel Morph, Diagonal Stripes
- *Efek:* Digital Glitch, Warp Zoom

**24 gaya animasi masuk elemen** (judul/poin/foto muncul dengan cara apa): naik & pudar, pudar, terbit dari garis, geser kiri/kanan, jatuh memantul, pop memantul, membesar halus, zoom mengecil/membesar, putar masuk, balik 3D (horizontal/vertikal), kenyal (elastis), miring naik, spiral, sapuan (3 arah), blur ke fokus, mesin ketik, glitch digital, campur otomatis (gaya beda tiap elemen), dan tanpa animasi.

**4 gaya gerak** (bahasa gerak untuk seluruh presentasi, menyatukan pilihan transisi + animasi + gerak ambient): Halus (tenang/profesional), Sinematik (megah), Energik (cepat/berani), Minimal (hening/fokus konten).

**12 animasi bergerak bawaan** (untuk slide bertema sains/teknis/proses): Sel Darah, Struktur Sel, Jantung & EKG, Heliks DNA, Atom, Tata Surya, Gelombang, Jaringan, Pertumbuhan, Roda Gigi, Siklus Air, Luar Angkasa — plus dukungan GIF hasil pencarian (GIPHY) dan unggah GIF/MP4/WebM sendiri.

**12 preset tema warna** & **6 pola latar dekoratif** (polos, titik, kisi, diagonal, busur, gelombang).

---

## 6. Kebutuhan Non-Fungsional

* **Performa:** target 60 FPS di perangkat desktop standar untuk transisi 3D/WebGL; otomatis menurunkan kualitas di perangkat lemah demi menjaga kelancaran, bukan mematahkan pengalaman.
* **Kompatibilitas:** hasil ekspor & aplikasi web berjalan di semua peramban modern berbasis Chromium (Chrome/Edge/Brave), serta Firefox dan Safari, tanpa plugin.
* **Keamanan data:** dokumen yang diimpor diproses sepenuhnya di perangkat pengguna (tidak diunggah); kredensial/kunci rahasia hanya hidup di server, tidak pernah di aplikasi klien; akses data kredit dijaga lewat kontrol database (Row Level Security), bukan sekadar kepercayaan di sisi aplikasi.
* **Ketersediaan mode offline sebagian:** pembuatan presentasi tetap bisa dipakai tanpa akun/koneksi AI (mode simulasi), meski tanpa kecerdasan AI sungguhan.

---

## 7. Batasan & Hal yang Jujur Belum Ada

Supaya dasar perombakan berikutnya realistis, ini status apa adanya:

* **Pembayaran belum bisa menerima uang sungguhan** — kunci Xendit yang terpasang masih kunci mode uji (development/sandbox). Perlu verifikasi bisnis di Xendit dan penggantian ke kunci mode produksi sebelum benar-benar dijual ke publik.
* **Login Google perlu dipastikan aktif di semua lingkungan** yang akan dipakai publik (Supabase Dashboard → provider Google).
* **Tidak ada aplikasi mobile native** (Play Store/App Store) — saat ini murni aplikasi web; strategi pembungkusan (mis. Capacitor) sudah dipikirkan tapi belum dieksekusi.
* **Belum ada generator gambar AI penuh** (DALL-E/Stable Diffusion) — saat ini gambar kontekstual memakai Unsplash (opsional) atau seni generatif offline sebagai titik ekstensi yang sudah disiapkan.
* **Belum ada tampilan presenter dua-layar** (layar penonton vs layar catatan presenter terpisah) — catatan pembicara saat ini berupa panel overlay di layar yang sama.
* **Belum ada ekstraksi gambar asli dari PPTX/PDF** saat impor (isi teks terbaca penuh, tapi gambar di dalam dokumen sumber belum ikut terambil otomatis).
* **Format lawas `.ppt`/`.doc`** (non-X) belum didukung — perlu disimpan ulang sebagai `.pptx`/`.docx` dulu.
* **Belum ada uji nyata dengan lalu lintas banyak pengguna sekaligus** — arsitektur sudah dirancang untuk itu (server tanpa status per-pengguna, database dengan penguncian baris), tapi belum diuji beban sungguhan.
* **Ukuran bundel aplikasi** sudah melebihi ambang rekomendasi (>1.4 MB per berkas JS terbesar) — belum dipecah lebih lanjut (code-splitting) untuk mempercepat pemuatan pertama.
* Untuk daftar batasan teknis mesin render/animasi yang lebih rinci (mis. seputar GIF besar, codec video, dsb.), lihat bagian "Status verifikasi" di `README.md` proyek ini — dokumen itu tetap menjadi referensi teknis untuk pengembang.

---

## 8. Ke Mana Selanjutnya

Dokumen ini adalah **dasar yang akurat** dari apa yang sudah berjalan hari ini. Revisi besar berikutnya (perombakan tata letak & struktur halaman aplikasi) akan dikirimkan terpisah dan akan dibangun **di atas** fondasi fitur yang sudah tercatat di sini — bukan menggantikannya dari nol.
