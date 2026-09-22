# Product Requirement Document (PRD)
## Platform Web Presentasi Interaktif Berbasis AI & Transisi 3D/WebGL (Morph)

---

## 1. Gambaran Umum Produk (Product Overview)
Platform pembuatan dan penayangan presentasi berbasis web yang mengusung konsep modern, halus, dan sinematik. Menggunakan teknologi **3D/WebGL** dan efek transisi **Morph** otomatis yang ditenagai oleh kecerdasan buatan (*AI*). 

Platform ini dirancang untuk memberikan pengalaman setara perangkat lunak presentasi kelas dunia langsung di peramban, memungkinkan pengguna menghasilkan presentasi memukau secara instan melalui *prompt* teks atau impor dokumen, melakukan kustomisasi tingkat lanjut melalui *real-time monitor*, hingga mendistribusikannya sebagai aplikasi web mandiri (*standalone website*).

---

## 2. Peningkatan & Analisis Kesenjangan (Gap Analysis & Enhancements)
Untuk membuat aplikasi ini jauh lebih maksimal, profesional, dan bersaing di pasar global, berikut adalah penambahan fitur krusial yang sebelumnya belum tercakup:

1. **Sistem Manajemen Tema & Desain Global (Design System & Global Styling):** Pengguna butuh kemampuan untuk mengubah palet warna, tipografi, dan *mood* visual secara keseluruhan dengan satu klik tanpa harus mengubah per slide secara manual.
2. **Riwayat Versi & Manajemen Sesi (Auto-Save & Version History):** Mencegah kehilangan data saat proses *AI Generation* atau editing manual yang panjang.
3. **Pustaka Aset & Media (Media Asset Library & Unsplash/AI Image Integration):** Selain upload manual, sistem perlu menyediakan integrasi stok gambar bebas hak cipta atau generator gambar AI (misal: Stable Diffusion / DALL-E) secara langsung.
4. **Optimasi Performa WebGL & Fallback Mode:** Menjaga perangkat dengan spesifikasi rendah atau *mobile* tetap bisa membuka presentasi dengan mulus melalui degradasi grafis otomatis (*graceful degradation*).
5. **Kontrol Interaktif & Speaker Notes:** Mendukung catatan pemateri (*speaker notes*) tersembunyi dan navigasi sentuh/gesture selain tombol *keyboard*.

---

## 3. Alur Pengguna yang Diperbarui (Enhanced User Flow)

```
[ Beranda / Dashboard Utama ]
       │
       ├─► Opsi A: Input Prompt AI (+ Pilih Tone / Gaya Visual)
       └─► Opsi B: Impor Dokumen (PPT / PDF / Word)
             │
             ▼
[ Tahap 1: Pengaturan Tema Global & Struktur Slide Awal ]
             │
             ▼
[ Tahap 2: Proses "Generate" AI ] 
  (AI Generating Layout, Smart Content, Realistis AI/Stock Images, & 3D WebGL Morph Transitions)
             │
             ▼
[ Tahap 3: Studio Editing Full Manual (Split-Screen Interface) ]
  ├─ Panel Kiri: Manajemen Kontrol Teks, Tata Letak, Pilihan Animasi Transisi Kaya
  └─ Panel Kanan: Real-Time 3D WebGL Live Monitor Preview
             │
             ├─► Aksi Ekspor 1: Unduh Paket File Website (HTML/JS/Assets Standalone)
             └─► Aksi Ekspor 2: Mulai Mode Presentasi (Full-Screen Sinematik + Keyboard Nav + Speaker Notes)
```

---

## 4. Fitur Utama & Kebutuhan Fungsional (Functional Requirements)

### A. Modul Inisiasi & Pembuatan Awal (Onboarding & Ingestion)
* **AI Prompt Engine Lanjutan:** Pengguna memasukkan topik dengan opsi tambahan pengaturan *tone* (Profesional, Kreatif, Minimalis, Edukatif) dan durasi/jumlah slide.
* **Document Parser:** Mengonversi struktur heading dan paragraf dari file **PPTX, PDF, dan DOCX** secara otomatis ke dalam slot slide modular.
* **Global Theme Selector:** Pengaturan awal skema warna (Dark/Light mode, Brand Colors) yang langsung diaplikasikan ke seluruh elemen secara konsisten.

### B. Mesin Pemrosesan AI (*AI Generation Engine*)
* **Smart Layout Engine:** AI menentukan tata letak terbaik berdasarkan jenis konten (misal: infografis, matriks perbandingan, poin ringkas, atau galeri gambar).
* **Automated Asset Sourcing:** AI secara otomatis mencari ilustrasi gambar pendukung yang relevan atau memicu *AI Image Generator* dengan tema selaras sub-judul.
* **WebGL Morph Engine Initialization:** Otomatis menghitung matriks transisi objek antar slide agar efek morph 3D berjalan mulus tanpa distorsi visual.

### C. Studio Pengeditan Manual (*Full Manual Editing Studio*)
* **Arsitektur Dual-Panel (Split-Screen):**
  * **Panel Kiri (Editor & Controls):** Pengaturan teks kaya (*rich text*), pengunggahan aset logo/gambar kustom, manajemen urutan slide (drag-and-drop), serta *dropdown* pemilihan efek transisi 3D/WebGL yang beragam (Zoom Morph, Cube Rotation, Fluid Fade, dll).
  * **Panel Kanan (Live 3D Monitor):** Canvas interaktif berbasis WebGL/Three.js yang menampilkan pratinjau hasil transisi dan animasi secara langsung (*real-time preview*) setiap kali ada perubahan data.
* **Asset Library:** Akses cepat ke penyimpanan lokal (upload gambar/logo) dan integrasi stok media eksternal.

### D. Modul Publikasi & Mode Presentasi (*Output & Presentation Mode*)
* **Ekspor Website Mandiri (*Standalone Web Package*):** Menghasilkan arsip `.zip` berisi file HTML tunggal yang sudah memuat seluruh skrip WebGL, aset gambar, dan konfigurasi animasi tanpa memerlukan server backend saat dijalankan.
* **Mode Presentasi Sinematik (Presentation Mode):**
  * Tampilan layar penuh (*Full-screen mode*) bebas dari elemen UI peramban.
  * Navigasi intuitif menggunakan tombol panah keyboard (`Arrow Left/Right`, `Spacebar`).
  * Tombol **`Esc`** untuk keluar dari mode presentasi, mengembalikan tampilan ke ukuran studio edit semula dengan mulus, serta menyediakan opsi cepat untuk mengulang presentasi dari awal.
  * Panel opsional untuk melihat *Speaker Notes* bagi presenter.

---

## 5. Kebutuhan Non-Fungsional (Non-Functional Requirements)

* **Performa & Frame Rate:** Transisi 3D/WebGL wajib berjalan stabil minimal di angka 60 FPS pada perangkat standar desktop.
* **Responsivitas UI Studio:** Bagian dashboard dan panel editing dirancang responsif dengan pendekatan *desktop-first* mengingat kompleksitas manipulasi slide.
* **Kompatibilitas Ekspor:** Hasil unduhan web wajib berjalan di semua peramban modern berbasis Chromium (Chrome, Edge, Brave) maupun Firefox dan Safari tanpa plugin tambahan.
* **Keamanan Data:** Pengolahan dokumen impor dan penyimpanan sementara menggunakan enkripsi standar industri.
