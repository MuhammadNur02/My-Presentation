import { LogIn, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrandName } from '../common/Brand';
import { StageShell } from '../common/StageShell';
import { Button } from '../common/ui';

// lucide-react tidak menyertakan logo merek (GitHub/Instagram/TikTok) — SVG minimal sendiri,
// mengikuti gaya ikon Lucide (stroke 2, 24×24) supaya konsisten dengan ikon lain di aplikasi.
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M15 22v-4a4.3 4.3 0 0 0-1.1-3.2c3.1-.4 6.3-1.6 6.3-7A5.6 5.6 0 0 0 19 4.2a5.2 5.2 0 0 0-.1-3.9S17.6 0 15 1.7a13 13 0 0 0-6 0C6.4 0 5.1.3 5.1.3a5.2 5.2 0 0 0-.1 3.9A5.6 5.6 0 0 0 3.5 7.8c0 5.4 3.2 6.6 6.3 7A4.3 4.3 0 0 0 8.7 18v4" />
      <path d="M9 20c-3.5 1-5-1.5-5-1.5" />
    </svg>
  );
}
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  );
}

const CREATOR_LINKS = [
  { label: 'Instagram', href: 'https://www.instagram.com/rianz_yan', icon: InstagramIcon },
  { label: 'TikTok', href: 'https://www.tiktok.com/@julian.alvarezz', icon: TikTokIcon },
  { label: 'GitHub', href: 'https://github.com/MuhammadNur02', icon: GithubIcon },
];

/** Halaman publik pertama (`/`) — hero + ajakan mulai + seksi "Meet the Creator". Login tidak wajib untuk mencoba. */
export function LandingPage() {
  return (
    <StageShell className="aurora overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col px-6 pb-16 pt-6">
        <header className="flex items-center justify-between gap-2">
          <BrandName />
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="secondary" size="sm" icon={<LogIn className="size-3.5" />}>
                Masuk
              </Button>
            </Link>
          </div>
        </header>

        <section className="mx-auto mt-16 max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-field px-3 py-1 text-xs font-medium text-muted">
            <Sparkles className="size-3.5 text-accent" /> Presentasi berbasis AI · Transisi 3D/WebGL Morph
          </span>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Presentasi sinematik,
            <br />
            <span className="bg-linear-to-r from-violet-500 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">dirancang oleh AI.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-muted">
            Ceritakan topiknya atau impor dokumen. AI menyusun slide, gambar, dan transisi 3D yang halus — lalu Anda sempurnakan langsung di studio. Tidak perlu akun untuk mencoba.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/dashboard/generate">
              <Button variant="primary" size="lg" icon={<Sparkles className="size-4" />}>
                Mulai buat presentasi
              </Button>
            </Link>
            <Link to="/dashboard/editor">
              <Button variant="secondary" size="lg">
                Impor dokumen (gratis)
              </Button>
            </Link>
          </div>
        </section>

        <section className="glass mx-auto mt-20 w-full max-w-2xl rounded-[28px] border border-line p-7 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Dikembangkan &amp; dirancang oleh</p>
          <h2 className="mt-2 text-xl font-semibold">Muhammad Nurrahman Juliansyah</h2>
          <div className="mt-4 flex justify-center gap-2">
            {CREATOR_LINKS.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={label}
                className="grid size-10 place-items-center rounded-full border border-line bg-field text-muted transition hover:border-accent/50 hover:text-fg"
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </section>
      </div>
    </StageShell>
  );
}
