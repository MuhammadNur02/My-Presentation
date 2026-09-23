import { Kbd, SectionTitle } from '../common/ui';

/** Panduan penggunaan: konsolidasi pintasan & tips yang sebelumnya tersebar di berbagai tooltip. */
export function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold">Panduan Penggunaan</h1>
        <p className="mt-1 text-sm text-muted">Cara cepat memakai MorphDeck — dari membuat presentasi sampai menayangkannya.</p>
      </div>

      <section>
        <SectionTitle>Memulai</SectionTitle>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li>
            <b className="text-fg">AI Generate PPT</b> — tulis topik, pilih tone/bahasa/jumlah slide, AI menyusun strukturnya. Butuh masuk Google (kredit) atau kunci Anthropic sendiri di Pengaturan; tanpa keduanya tetap bisa dicoba lewat mode simulasi.
          </li>
          <li>
            <b className="text-fg">Alat Editor</b> — impor PPTX/PDF/DOCX/TXT/MD, atau mulai dari kanvas kosong. Gratis, tanpa kredit, diproses sepenuhnya di perangkat Anda — tapi fitur AI dimatikan dan hasilnya memakai watermark kecil.
          </li>
        </ul>
      </section>

      <section>
        <SectionTitle>Tab di Studio</SectionTitle>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li><b className="text-fg">Slide</b> — teks, gambar/logo, catatan pembicara, jenis tata letak.</li>
          <li><b className="text-fg">Posisi</b> — geser & ubah ukuran elemen manual langsung di pratinjau.</li>
          <li><b className="text-fg">Gerak</b> — animasi masuk tiap elemen, gerak ambient, dan "ungkap poin satu per satu".</li>
          <li><b className="text-fg">Transisi</b> — efek 3D antar-slide.</li>
          <li><b className="text-fg">Aset</b> — animasi bergerak (GIF/video/generatif) untuk slide.</li>
          <li><b className="text-fg">Tema</b> — warna, pola latar, tipografi.</li>
        </ul>
      </section>

      <section>
        <SectionTitle>Pintasan keyboard</SectionTitle>
        <div className="glass grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-2xl border border-line p-4 text-sm">
          <span className="text-muted">Di Studio</span>
          <span />
          <span className="flex gap-1"><Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd></span>
          <span className="text-muted">Urungkan</span>
          <span className="flex gap-1"><Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>Z</Kbd></span>
          <span className="text-muted">Ulangi</span>
          <span><Kbd>F5</Kbd></span>
          <span className="text-muted">Mulai presentasi</span>

          <span className="mt-2 text-muted">Saat presentasi</span>
          <span />
          <span className="flex gap-1"><Kbd>Space</Kbd> / <Kbd>→</Kbd></span>
          <span className="text-muted">Maju</span>
          <span><Kbd>←</Kbd></span>
          <span className="text-muted">Mundur</span>
          <span className="flex gap-1"><Kbd>Home</Kbd> / <Kbd>End</Kbd></span>
          <span className="text-muted">Slide pertama / terakhir</span>
          <span><Kbd>N</Kbd></span>
          <span className="text-muted">Catatan pembicara</span>
          <span><Kbd>F</Kbd></span>
          <span className="text-muted">Layar penuh</span>
          <span><Kbd>R</Kbd></span>
          <span className="text-muted">Ulangi dari awal</span>
          <span><Kbd>Esc</Kbd></span>
          <span className="text-muted">Keluar & reset</span>
        </div>
      </section>

      <section>
        <SectionTitle>Kredit & Kesalahan AI</SectionTitle>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li>1 kredit = 1 kali "Buat struktur slide" atau 1 kali "Minta AI memilih animasi".</li>
          <li>Kredit yang terpotong dikembalikan otomatis kalau AI gagal merespons.</li>
          <li>Kredit habis? Tombol generate akan mengarahkan langsung ke halaman isi ulang.</li>
        </ul>
      </section>

      <section>
        <SectionTitle>Ekspor & Cloud</SectionTitle>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li><b className="text-fg">Download</b> di Studio — ZIP (disarankan), HTML mandiri, atau berkas proyek .json untuk disunting ulang.</li>
          <li><b className="text-fg">Simpan ke cloud</b> (ikon awan di Studio, perlu masuk Google) — menyalin proyek ke akun Anda, bisa dibuka lagi dari "Hasil Proyek" di perangkat mana pun.</li>
        </ul>
      </section>
    </div>
  );
}
