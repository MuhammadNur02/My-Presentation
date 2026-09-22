# MorphDeck — Presentasi Interaktif Berbasis AI dengan Transisi 3D/WebGL Morph

Aplikasi web (Vite + React + TypeScript + Tailwind v4 + Three.js + GSAP + Zustand) yang mengimplementasikan
`product_requirement_document.md`: buat presentasi dari prompt AI atau dokumen, sempurnakan di studio dual-panel
dengan Live Monitor WebGL, ekspor sebagai website mandiri, dan tampilkan dalam mode sinematik layar penuh.

## Menjalankan

```bash
npm install
npm run dev        # http://localhost:5173  (otomatis membangun runtime ekspor lebih dulu)
npm run build      # typecheck + build produksi ke dist/
npm run typecheck
```

> Node ≥ 20. `predev`/`prebuild` menjalankan `npm run build:runtime` — lihat bagian *Export Engine*.

## Alur pengguna → modul

| Tahap PRD | Komponen | Berkas utama |
|---|---|---|
| Onboarding: Prompt AI / Impor dokumen | `Onboarding` | `components/onboarding`, `services/ai/*`, `services/importers/*` |
| Tahap 1: tinjau teks, unggah gambar/logo, tema global | `OutlineStage` | `components/outline`, `components/studio/{SlideEditor,ThemePanel}` |
| Tahap 2: "Generate" (layout, animasi, gambar, matriks morph) | `GeneratingStage` | `services/ai/designEngine.ts` |
| Tahap 3: studio manual dual-panel | `Studio` (kiri: `SlideList` + tab; kanan: `LivePreview`) | `components/studio/*` |
| Ekspor: ZIP / HTML standalone | `ExportMenu` | `services/export/*`, `runtime/main.ts` |
| Presentasi sinematik + Esc reset | `PresentationMode` | `components/presentation/*`, `engine/{DeckPlayer,input}.ts` |

## Arsitektur

```
src/
├─ engine/          ← inti WebGL, TANPA React/Zustand (dipakai app, presentasi, dan runtime ekspor)
│  ├─ DeckRenderer.ts        renderer Three.js: loop on-demand, transisi GSAP, degradasi adaptif, dispose penuh
│  ├─ FallbackRenderer.ts    crossfade Canvas 2D bila WebGL tidak tersedia
│  ├─ slideRenderer.ts       layout slide → daftar LAPISAN (latar, cahaya, judul, poin, foto, logo, dekorasi)
│  ├─ layers.ts / motion.ts  tipe lapisan; resolusi gerak per elemen (gaya slide + penyetelan per peran)
│  ├─ scene/                 SceneView (mesh per lapisan) · shaders · motionPlayer (masuk per elemen + ambient, GPU)
│  ├─ imageStore.ts / media/ gambar + sumber animasi (GIF/video/generatif): gifDecoder · sources · scenes (12 adegan)
│  ├─ textureCache.ts        cache LRU tekstur DATAR (sumber transisi halaman)
│  ├─ transitions/           definisi + GLSL 24 transisi (vertex morph, kubus, flip, ubin, page curl, Magic Move, …)
│  ├─ DeckPlayer.ts / input.ts   navigasi + keyboard/swipe (dibagi app & runtime ekspor)
│  └─ quality.ts             deteksi tier grafis + fallback
├─ store/           Zustand: projectStore (persist IndexedDB), uiStore, settingsStore (localStorage)
├─ services/
│  ├─ ai/           llm.ts (SDK Anthropic), mockGenerator.ts (offline), designEngine.ts, imageProvider.ts
│  ├─ media/        assets.ts (GIF/video/adegan → Asset), giphy.ts (pencarian GIF)
│  ├─ importers/    pptx / docx / pdf / txt-md / proyek .json
│  └─ export/       buildHtml.ts, index.ts (ZIP)
├─ runtime/main.ts  ← entri bundel mandiri yang di-embed ke HTML hasil ekspor
├─ hooks/           useDeckRenderer (siklus hidup GPU), useDeckData, useAssets
└─ components/      common · onboarding · outline · generating · studio · presentation
```

### Pipeline render

Setiap slide digambar ke **Canvas 2D 1920×1080** → diunggah sebagai `CanvasTexture` → dua *layer* (slide keluar &
masuk) berupa mesh bidang bersubdivisi digambar dengan `ShaderMaterial`. Definisi transisi hanya berisi dua fungsi GLSL
(`transformVertex`, `shadeFragment`) yang disisipkan ke kerangka bersama (`transitions/shaderTemplates.ts`).

- **Morph Mesh** — interpolasi vertex sejati: tiap vertex bidang diinterpolasi ke permukaan bola
  (`lon = x/R, lat = y/R`) dengan jendela waktu berbeda per-vertex (`stagger`) sehingga gelombang morph merambat dari
  pusat; bola berputar 180° (`rotY`), lalu slide masuk membuka kembali.
- **Cube / Flip / Carousel** — matriks rotasi `rotY` terhadap pivot (pusat kubus / silinder) dengan *face culling*
  untuk menyembunyikan sisi belakang; **Zoom 3D** memakai translasi-Z dan perspektif kamera.
- **Fluid Fade / Ripple / Pixel** — distorsi UV & mask alpha di fragment shader (noise fbm, cincin radial, grid acak).
- **Geometri ubin** (`transitions/tileGeometry.ts`) — tiap sel grid adalah quad terpisah dengan atribut `aTile`
  (pusat + acak), sehingga **Mosaic Flip**, **Venetian Blinds**, dan **Shatter** memutar/melempar tiap keping 3D sendiri.
- **Page Curl** — lipatan silinder `x' = xf + R·sin(s/R)`, `z' = R(1−cos(s/R))`, lalu rebah; render dua sisi
  (`gl_FrontFacing` untuk sisi belakang kertas).

#### Magic Move — Seamless Element Morphing

Elemen utama slide (foto hero, **lencana logo** bulat di sampul, logo pojok) didaftarkan renderer slide dengan sebuah
**tag** (`Slide.heroTag`, default `hero`; logo pojok = `logo`). Pada transisi `magic`
(`engine/{sharedElements,MagicMove}.ts`, `transitions/morphShader.ts`):

1. Elemen ber-tag sama di dua slide berurutan **dipasangkan** (`pairSharedElements`); sisa logo → tag `logo`.
2. Layer dasar digambar **tanpa** elemen itu (varian cache `slideId#-hero`) dan berganti dengan crossfade.
3. Satu quad shader menerbangkan elemen: **posisi** bergeser lebih dulu (lintasan melengkung), lalu **ukuran, radius sudut
   (lingkaran → kartu → tepi tajam, SDF kotak membulat), bayangan, dan isi (logo → foto, alpha-premultiplied)** mekar
   berurutan — tidak ada potongan keras. Berlaku juga arah mundur (foto menyusut kembali menjadi lencana).
4. Teks slide baru dirangkai (animasi build) **setelah** elemen mendarat.

Isi ID elemen yang sama di slide-slide berbeda untuk memasangkannya; kosongkan untuk menonaktifkan. Mesin AI otomatis
memakai Magic Move bila dua slide berurutan sama-sama punya elemen utama (mis. sampul → slide 2 dengan foto).

#### Renderer berlapis & koreografi tiga tingkat

`buildLayers` menjalankan layout sekali → daftar `SlideLayer` (rect, isi, peran gerak, potongan kata/baris). Dari daftar
yang sama ada dua jalur render:

- **Jalur datar** — semua lapisan digambar ke satu kanvas; dipakai sebagai sumber **transisi halaman** & thumbnail.
- **Jalur adegan** (slide diam & animasi elemen) — tiap lapisan menjadi tekstur + mesh sendiri (`SceneView`) yang
  digerakkan GPU lewat transform/uniform, tanpa menggambar ulang kanvas: teks **per kata/baris**, foto, logo, dan dekorasi
  bergerak sendiri-sendiri. Kartu foto memakai shader SDF (sudut membulat, bayangan, bingkai) sehingga isinya bisa di-zoom
  (Ken Burns) tanpa menggerakkan bingkai.

Tiga tingkat gerak, diselaraskan oleh **Gaya gerak** (Halus / Sinematik / Energik / Minimal):

1. **Halaman** — palet kecil 2–4 transisi per deck (deterministik), transisi aksen, **Magic Move** untuk elemen bersama.
2. **Elemen** — animasi masuk per peran (judul, subjudul, poin, media, logo): 24 gaya (`rise` = teks terbit dari garis
   via klip; `typewriter` = diketik bergiliran per baris), pemecahan blok/baris/kata, jeda, durasi, dan jeda antar potongan. Teks slide baru dirangkai **setelah**
   halaman mendarat.
3. **Mikro** — gerak ambient sebagai fungsi waktu: foto (Ken Burns, geser panorama, melayang, denyut, mengayun, miring 3D),
   cahaya latar aurora, **partikel cahaya** (satu draw call instancing, geraknya dihitung di vertex shader), lencana "bernapas".
   Saat transisi dimulai, adegan yang sedang bergerak **ditangkap ke render target** sehingga tidak ada loncatan.

Di studio: klik elemen langsung di Live Monitor untuk memilihnya (sorotan hover/terpilih), atur di tab **Gerak**, dan
urungkan/ulangi dengan Ctrl+Z / Ctrl+Shift+Z.

#### Tata letak manual (tab Posisi)

Setiap elemen (judul, subjudul, tiap poin, foto, lencana/logo, kartu/baris/langkah/panel) bisa dipindah dan diubah ukurannya
langsung di Live Monitor: **seret** untuk menggeser (garis pemandu tarik ke tepi/tengah/margin/elemen lain; tahan **Alt**
untuk mematikannya), **pegangan** di tepi untuk mengubah ukuran, panah keyboard untuk geser 1 px (Shift = 10 px), atau isi
angka X/Y/Lebar/Tinggi di panel. Perilaku pegangan bergantung jenis elemen (`SlideLayer.edit`):

| Jenis | Pegangan tepi | Pegangan sudut |
| --- | --- | --- |
| `text` (judul, subjudul, poin) | lebar bungkus teks (teks disusun ulang) | skala font |
| `free` (foto, kartu, baris, panel) | ubah lebar / tinggi | ubah ukuran (Shift = rasio terkunci) |
| `lock` (logo, lencana) | — | ubah ukuran, rasio terkunci |

Foto punya pilihan **bentuk bingkai** (kotak / halus / membulat / kapsul-bulat) dan slider radius. Penempatan disimpan sebagai
`Slide.overrides[idLapisan]` (`{x, y, w, h, scale, radius}`) dan diterapkan **saat lapisan dibuat** (`place`/`addText`/`addHero`
di `slideRenderer.ts`) — jadi jalur datar, adegan, Magic Move, thumbnail, dan **ekspor** otomatis ikut memakainya; garis aksen
pendamping ikut bergeser bersama judulnya. Semua perubahan bisa di-undo (penyeretan beruntun digabung jadi satu langkah).

#### Media bergerak: GIF, video, animasi generatif

Slot foto sebuah slide bisa berisi **media bergerak** untuk membantu menjelaskan topik (mis. slide "sel darah" → sel darah mengalir).
Tab **Aset → Animasi / GIF** menyediakan tiga sumber:

1. **Animasi generatif** — 12 ilustrasi bergerak yang digambar kode (Canvas 2D, `engine/media/scenes.ts`): sel darah, struktur sel,
   jantung & EKG, heliks DNA, atom, tata surya, gelombang, jaringan, pertumbuhan, roda gigi, siklus air, luar angkasa. Berlabel
   penjelas (Eritrosit, Nukleus, Mitokondria, …) sesuai bahasa proyek, dan penempatan label memperhitungkan area foto yang terlihat
   setelah di-crop. Pemilihan: kecocokan kata kunci otomatis dengan isi slide ("Cocok untuk slide ini"), atau **Minta AI memilih**
   bila kunci Claude diisi (`suggestSceneWithLLM`, keluaran JSON terstruktur). Saat **Generate**, slide yang topiknya jelas cocok
   (kata kunci spesifik di judul/subjudul; maks. 4 per deck, tiap adegan sekali) langsung memakai animasinya.
2. **Cari GIF** — API GIPHY (kunci gratis diisi di Pengaturan; `services/media/giphy.ts`). GIF yang dipilih diunduh dan disimpan di
   proyek sehingga tetap tampil offline dan ikut ekspor; atribusi "Powered by GIPHY".
3. **Unggah** GIF, MP4, atau WebM (drag & drop atau tombol "Unggah gambar" di tab Slide). Batas: GIF 12 MB, video 24 MB.

Teknis: `Asset.dataUrl` selalu berupa **gambar diam (poster)** sehingga thumbnail, pustaka, dan renderer 2D tetap bekerja; animasinya
ada di `Asset.anim`. Dekoder GIF ditulis sendiri (`engine/media/gifDecoder.ts`: LZW, interlace, disposal, transparansi — tanpa
dependensi baru; keluarannya identik piksel-demi-piksel dengan dekoder Chrome pada GIF uji). `ImageStore` menjaga satu `AnimSource`
per aset (GIF/video/adegan) yang kanvasnya berisi frame terkini. Pada jalur adegan, lapisan foto yang bergerak ditandai `SlideLayer.live`:
tiap tick sumber dimajukan dan **hanya tekstur lapisan itu** dilukis ulang (kanvas & tekstur dipakai ulang, batas 1280 px) — sehingga
teks, posisi manual, bingkai bulat, Ken Burns/miring 3D, dan animasi masuk tetap bekerja. Media dimulai dari awal saat slide tampil,
video otomatis dijeda bila slide tidak tampil (juga saat renderer editor dijeda oleh mode presentasi), dan bila `prefers-reduced-motion`
aktif yang tampil hanyalah frame diam. Renderer cadangan Canvas 2D (tanpa WebGL) juga memutar media bergerak.
Ketahanan: dekoder GIF membatasi dimensi/jumlah frame/total piksel dan menolak data LZW rusak (tanpa hang; diuji dengan >7.000 berkas
GIF terpotong/dirusak/berdimensi bohong), dan penimpaan tata letak disanitasi (NaN/negatif/raksasa dari impor `.json` dibuang atau
dibatasi).

#### Tata letak & desain

**11 layout**: Sampul (lencana logo ikonik), Konten, Split, Gambar penuh, Kutipan, Statistik, **Bernomor** (baris panel dengan angka
besar), **Linimasa** (titik pada garis waktu, format `tahun | keterangan`), **Bandingkan** (dua panel; pisahkan sisi dengan baris
`---`, baris pertama tiap sisi = judul panel), dan **Pernyataan** (satu kalimat raksasa berhiaskan cincin). Perencana AI
(`designEngine.suggestLayout`, prompt `llm.ts`) ikut memakainya. **12 tema** (6 baru: Neon, Forest, Royal, Graphite, Rose, Sand)
dan **6 pola latar** (polos, titik, kisi, diagonal, busur, gelombang) yang memudar di tengah agar teks tetap terbaca.

**24 transisi** dalam 5 kategori — Klasik: Fluid Fade, Parallax Push, Glow Wipe, Barn Doors, **Iris Reveal** · 3D: Zoom 3D, Cube Rotate,
Flip Card, Carousel 3D, Card Toss, Spin Zoom, Page Curl · Morph: Morph Mesh, Liquid Ripple, Vortex Twist, Magic Move ·
Mosaik: Mosaic Flip, Venetian Blinds, Shatter, Halftone Dots, Pixel Morph, **Diagonal Stripes** · Efek: Digital Glitch, **Warp Zoom**.

**24 pilihan animasi masuk elemen** (per slide, `slide.build`): naik-pudar, pudar, terbit dari garis, geser kiri/kanan, jatuh memantul, pop
memantul, membesar, zoom mengecil, zoom membesar cepat, kenyal (elastis), putar masuk, spiral, balik horizontal/vertikal 3D, miring
naik, sapuan (kiri→kanan, atas→bawah, bawah→atas), blur ke fokus, mesin ketik, glitch digital, **campur** (gaya berbeda tiap
elemen), dan tanpa animasi. Tombol "Acak" tersedia untuk transisi dan animasi elemen; mesin AI memilihnya sesuai tone.
- Progres transisi digerakkan **GSAP** (`gsap.timeline`, easing bernama) dan disuplai ke shader sebagai `uProgress`
  yang sudah ter-ease; animasi masuk elemen teks (*build*) juga timeline GSAP.
- Pipeline warna sengaja "mentah" (`ColorManagement` off, output linear) → piksel WebGL identik dengan Canvas 2D.

### Performa & manajemen memori

- Render **on-demand** (hanya saat ada perubahan/animasi) lewat `gsap.ticker`; tidak ada loop idle.
- `useDeckRenderer` membuat canvas baru per-mount (aman StrictMode) dan cleanup memanggil `dispose()`:
  tekstur, geometri, material, `renderer.dispose()`, `forceContextLoss()`, listener, ticker, timeline GSAP.
- Cache tekstur LRU (6 slide), *prefetch* tetangga saat idle, shader di-*warm-up* (`compileAsync`).
- **Graceful degradation**: tier awal dari perangkat (`low/medium/high`); saat frame-time terukur > 28 ms terus-menerus,
  renderer menurunkan resolusi, lalu tier tekstur/mesh (badge "diturunkan otomatis" di Live Monitor).
  Tanpa WebGL → renderer Canvas 2D. `prefers-reduced-motion` → semua transisi menjadi fade singkat.

### Export Engine (offline & mandiri)

`npm run build:runtime` membundel `runtime/main.ts` (engine + three + GSAP + player) menjadi **satu file IIFE**
(~640 kB, 174 kB gzip) yang di-`?raw`-import oleh `services/export/buildHtml.ts`. Ekspor menyusun satu `index.html`
berisi CSS + JSON deck + runtime. Gambar disematkan sebagai **data-URI** — disengaja: tekstur WebGL dari berkas terpisah
gagal pada `file://` (canvas dianggap cross-origin). ZIP memuat `index.html`, `README.txt`, `project.morphdeck.json`
(bisa diimpor kembali) dan `assets/`. Runtime standalone punya sampul "Mulai Presentasi", keyboard/swipe, catatan (N),
dan `Esc`/keluar layar penuh → reset ke sampul.

### Mode Presentasi

`Space`/`→`/`PageDown` maju · `←`/`PageUp` mundur · `Home`/`End` · `N` catatan pembicara · `R` ulang · `F` layar penuh ·
`Esc` keluar. Layar penuh diminta dari gestur klik; keluar layar penuh (yang menangani `Esc` di browser) dan tombol
`Esc` sama-sama memicu fade-out → overlay ditutup → renderer dibuang (**reset otomatis**) → toast "Mulai lagi".

#### Reveal bertahap (klik per poin)

Slide dengan `stepReveal` aktif (tab **Gerak** → "Ungkap poin satu per satu saat presentasi") menampilkan poin/kartu (peran
`body`) SATU PER SATU: tiap `next()` pertama-tama menawarkan ke renderer untuk mengungkap poin berikutnya (dengan animasi
masuknya sendiri) — pindah ke slide berikutnya baru terjadi setelah poin terakhir diungkap. `prev()` bekerja simetris:
menyembunyikan poin terakhir dulu, baru mundur slide setelah kosong. Kembali ke slide yang sudah pernah dituntaskan (mundur
dari slide sesudahnya) menampilkannya **langsung utuh**, bukan mengulang dari awal. Sepenuhnya ditangani `DeckRenderer`
(`stepForward`/`stepBackward`/`stepStatus`) + `DeckPlayer`, sehingga bekerja identik di mode presentasi maupun hasil ekspor
HTML mandiri (HUD/`#counter` menampilkan progres, mis. "04 / 10 · 2/4"). Hanya aktif saat **presenting**
(`DeckRendererOptions.presenting`) — Live Monitor di studio sengaja tidak terpengaruh (selalu menampilkan slide utuh agar
mudah diedit) — dan hanya di jalur adegan WebGL; renderer fallback Canvas 2D menampilkan slide tersebut utuh langsung
(degradasi anggun, bukan galat).

## Integrasi AI

- **Tanpa API key**: `mockGenerator` (simulasi offline) membuat kerangka deck dari topik apa pun (ID/EN, 4 tone).
- **Dengan API key** (Pengaturan): `llm.ts` memakai `@anthropic-ai/sdk` (`dangerouslyAllowBrowser`), model default
  `claude-opus-5`, keluaran JSON terstruktur (`output_config.format`). Gagal → otomatis kembali ke mode simulasi.
- **Keamanan**: kunci hanya di `localStorage` browser. Untuk produksi isi *Base URL proxy* dan simpan kunci di backend.
- Gambar kontekstual: seni generatif offline dari kata kunci; dengan kunci Unsplash → foto stok. Titik ekstensi untuk
  DALL-E/Stable Diffusion ada di `services/ai/imageProvider.ts`.

## Status verifikasi

Diuji otomatis di Chromium headless (perenderan software): alur prompt → outline → Generate → studio, 9 transisi
(frame 50%), mode presentasi (navigasi, catatan, Esc), 6× buka/tutup presentasi tanpa canvas tersisa, edit teks
real-time, ganti tema & mode terang, impor MD/PPTX/DOCX/PDF, ekspor HTML & ZIP (HTML dibuka dari `file://`).
Fitur tata letak manual & desain diuji dengan mouse sungguhan (seret, pegangan tepi/sudut, isian angka, panah keyboard, undo/redo,
reset) di Live Monitor; 4 layout baru, 6 tema, 5 pola, partikel, mesin ketik, foto berbingkai bulat, 3 transisi baru, serta
ekspor HTML yang memuat semua itu (termasuk posisi manual) diperiksa lewat tangkapan layar.

**Belum terverifikasi / batasan yang jujur:**
- Pencarian GIPHY diuji hanya dengan respons API **tersimulasi** (tanpa kunci asli); jalur unduh, dekode, dan pemasangannya nyata.
- Video MP4 bergantung pada codec browser (H.264 umumnya aman; diuji dengan WebM/VP8). Firefox/Safari belum diuji untuk media bergerak.
- Saat transisi halaman berlangsung, media bergerak pada slide asal/tujuan membeku sesaat (transisi memakai gambar diam slide); ia bergerak lagi begitu slide mendarat.
- Simpan-otomatis menulis ulang seluruh proyek ke IndexedDB tiap perubahan (di-debounce 700 ms): dengan media besar ada jeda kecil (terukur ±130 ms untuk 12 MB, ±270 ms untuk 24 MB). Belum dipecah per aset.
- GIF sangat besar didekode penuh ke memori (dijarangkan otomatis di atas ±88 MB); ImageDecoder/WebCodecs tidak dipakai, dan animasi WebP/APNG diperlakukan sebagai gambar diam.
- Animasi generatif hanya 12 adegan bawaan; "AI memilih" memilih dari katalog itu (bukan menggambar animasi baru), dan jalur Claude-nya hanya lolos typecheck.
- Jalur LLM Claude hanya lolos typecheck — belum dijalankan karena tidak ada API key di lingkungan uji.
- Saat menyeret/mengubah ukuran, adegan dibangun ulang tiap frame (tekstur lapisan dilukis ulang); terasa mulus di perenderan
  software pada slide biasa, tetapi slide dengan teks sangat panjang belum diukur.
- Animasi dinilai dari frame diam (tangkapan pada waktu tertentu), bukan dari penilaian gerak oleh mata manusia.
- FPS 54–60 diukur pada perenderan software; performa GPU nyata, Firefox, dan Safari belum diuji.
- PRD "enkripsi standar industri": data disimpan **tanpa enkripsi** di IndexedDB perangkat (tidak ada server);
  pemrosesan dokumen 100% lokal.
- Belum ada: generator gambar AI (DALL-E/SD), view presenter dua-jendela, undo/redo, impor `.ppt`/`.doc` lawas,
  ekstraksi gambar dari PPTX/PDF.
