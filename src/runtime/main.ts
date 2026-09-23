/**
 * Runtime standalone — di-bundle menjadi satu file IIFE lalu di-embed ke HTML hasil ekspor.
 * Memakai engine WebGL & DeckPlayer yang sama dengan aplikasi studio, sehingga transisi
 * hasil ekspor identik dengan pratinjau. Tanpa jaringan/CDN/server.
 */
import { DeckPlayer, bindPresentationInput, createDeckRenderer, detectQuality, prefersReducedMotion } from '../engine';
import { stripRichText } from '../engine/richText';
import type { DeckData } from '../types';

interface Payload {
  title: string;
  deck: DeckData;
}

function boot(): void {
  const dataEl = document.getElementById('deck-data');
  const root = document.getElementById('app');
  if (!dataEl || !root) return;
  const payload = JSON.parse(dataEl.textContent || '{}') as Payload;
  const deck = payload.deck;
  const total = deck.slides.length;
  const theme = deck.theme;

  const rs = document.documentElement.style;
  rs.setProperty('--bg1', theme.bg1);
  rs.setProperty('--bg2', theme.bg2);
  rs.setProperty('--fg', theme.text);
  rs.setProperty('--muted', theme.muted);
  rs.setProperty('--accent', theme.accent);
  rs.setProperty('--accent2', theme.accent2);

  root.innerHTML = `
    <div id="stage"></div>
    <div id="cover">
      <div class="cover-card">
        <div class="eyebrow">Presentasi Interaktif · WebGL</div>
        <h1 id="cover-title"></h1>
        <p id="cover-meta"></p>
        <button id="start" type="button" data-no-nav>Mulai Presentasi</button>
        <p class="hint">Space / → maju &nbsp;·&nbsp; ← mundur &nbsp;·&nbsp; N catatan &nbsp;·&nbsp; F layar penuh &nbsp;·&nbsp; Esc keluar</p>
      </div>
    </div>
    <div id="hud" data-no-nav>
      <div id="bar"><i id="bar-fill"></i></div>
      <div class="hud-row">
        <span id="counter"></span>
        <span class="spacer"></span>
        <button id="btn-notes" type="button" title="Catatan pembicara (N)">Catatan</button>
        <button id="btn-fs" type="button" title="Layar penuh (F)">Layar penuh</button>
        <button id="btn-exit" type="button" title="Keluar (Esc)">Keluar</button>
      </div>
    </div>
    <aside id="notes" data-no-nav>
      <div class="notes-head"><span>Catatan pembicara</span><span id="timer">00:00</span></div>
      <div id="notes-body"></div>
      <div id="notes-next"></div>
    </aside>
    <div id="toast" data-no-nav></div>
    ${deck.watermark ? '<div id="watermark" data-no-nav>Dibuat dengan <b>MorphDeck</b></div>' : ''}`;

  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const stage = $('stage');
  $('cover-title').textContent = payload.title;
  $('cover-meta').textContent = `${total} slide`;

  const canvas = document.createElement('canvas');
  stage.appendChild(canvas);
  // Kejernihan didahulukan: tier tinggi kecuali perangkat terdeteksi lemah (sama seperti mode presentasi di aplikasi).
  const tier = detectQuality() === 'low' ? 'medium' : 'high';
  const renderer = createDeckRenderer(canvas, { tier, reducedMotion: prefersReducedMotion(), presenting: true });
  renderer.setData(deck);
  const fit = () => renderer.resize(stage.clientWidth || window.innerWidth, stage.clientHeight || window.innerHeight, window.devicePixelRatio || 1);
  new ResizeObserver(fit).observe(stage);
  fit();
  renderer.show(0);

  let presenting = false;
  let startedAt = 0;
  let timerId = 0;
  let hudTimer = 0;

  const pad = (n: number) => String(n).padStart(2, '0');
  const toast = (msg: string) => {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    window.setTimeout(() => t.classList.remove('on'), 2600);
  };

  /** Reveal bertahap: gabungkan hitungan slide + progres poin ke satu teks penghitung ("03 / 10 · 2/4"). */
  let curIndex = 0;
  const updateCounter = (done: number, stepTotal: number): void => {
    const base = `${pad(curIndex + 1)} / ${pad(total)}`;
    $('counter').textContent = stepTotal > 0 ? `${base} · ${done}/${stepTotal}` : base;
  };

  const player = new DeckPlayer(renderer, () => total, {
    onChange: (i) => {
      curIndex = i;
      $('bar-fill').style.width = `${((i + 1) / total) * 100}%`;
      $('notes-body').textContent = deck.slides[i]?.notes?.trim() || 'Tidak ada catatan untuk slide ini.';
      const next = deck.slides[i + 1];
      $('notes-next').textContent = next ? `Berikutnya: ${stripRichText(next.title)}` : 'Slide terakhir';
      updateCounter(0, 0);
    },
    onStep: (done, stepTotal) => updateCounter(done, stepTotal),
    onEnd: () => toast('Akhir presentasi — tekan R untuk mengulang, Esc untuk keluar'),
  });

  const wakeHud = () => {
    document.body.classList.add('hud-on');
    clearTimeout(hudTimer);
    hudTimer = window.setTimeout(() => document.body.classList.remove('hud-on'), 2600);
  };

  async function begin(): Promise<void> {
    if (presenting) return;
    presenting = true;
    document.body.classList.add('presenting');
    wakeHud();
    startedAt = Date.now();
    timerId = window.setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      $('timer').textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    }, 1000);
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      /* layar penuh ditolak: tetap presentasi di dalam halaman */
    }
    await player.start();
  }

  /** Keluar & reset: kembali ke sampul dan slide pertama. */
  function end(): void {
    if (!presenting) return;
    presenting = false;
    clearInterval(timerId);
    document.body.classList.remove('presenting', 'notes-on', 'hud-on');
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    renderer.show(0);
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && presenting) end();
  });
  document.addEventListener('pointermove', () => presenting && wakeHud());

  bindPresentationInput(document.body, {
    next: () => (presenting ? player.next() : void begin()),
    prev: () => presenting && player.prev(),
    first: () => presenting && player.goTo(0),
    last: () => presenting && player.goTo(total - 1),
    restart: () => presenting && player.restart(),
    exit: end,
    toggleNotes: () => presenting && document.body.classList.toggle('notes-on'),
    toggleFullscreen,
  });

  $('start').addEventListener('click', () => void begin());
  $('btn-notes').addEventListener('click', () => document.body.classList.toggle('notes-on'));
  $('btn-fs').addEventListener('click', toggleFullscreen);
  $('btn-exit').addEventListener('click', end);
}

boot();
