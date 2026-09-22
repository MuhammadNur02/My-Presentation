import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../engine';

interface TypewriterOptions {
  /** Jeda antar karakter saat mengetik (ms). */
  typingMs?: number;
  /** Jeda antar karakter saat menghapus (ms). */
  deletingMs?: number;
  /** Jeda diam setelah kata selesai diketik, sebelum mulai dihapus (ms). */
  holdMs?: number;
  /** Jeda setelah kata selesai dihapus, sebelum kata berikutnya mulai diketik (ms). */
  gapMs?: number;
  /** Karakter kursor yang berkedip di ujung teks. */
  cursor?: string;
  /** false = animasi dibekukan di posisi saat ini (dipakai untuk berhenti begitu pengguna mengisi kolom sendiri). */
  active?: boolean;
}

/**
 * Efek "mesin ketik": mengetik kata demi kata dari `words`, menahan sejenak dalam keadaan penuh,
 * menghapusnya huruf demi huruf, lalu lanjut ke kata berikutnya — berulang selamanya. Dipakai untuk
 * placeholder input agar contoh-contoh berganti secara hidup tanpa mengganggu nilai input sebenarnya.
 * Menghormati `prefers-reduced-motion`: kata berganti langsung (tanpa animasi ketik/hapus/kursor).
 */
export function useTypewriter(words: readonly string[], opts: TypewriterOptions = {}): string {
  const { typingMs = 45, deletingMs = 24, holdMs = 1500, gapMs = 300, cursor = '▏', active = true } = opts;
  const reducedRef = useRef(prefersReducedMotion());
  const wordIndex = useRef(0);
  const charIndex = useRef(reducedRef.current ? (words[0]?.length ?? 0) : 0);
  const phase = useRef<'typing' | 'holding' | 'deleting' | 'gap'>('typing');
  const [text, setText] = useState(words[0] ?? '');
  const [blink, setBlink] = useState(true);

  // Reduced-motion: kata berganti langsung pada interval tetap, tanpa animasi ketik.
  useEffect(() => {
    if (!active || !reducedRef.current || words.length <= 1) return;
    const id = setInterval(() => {
      wordIndex.current = (wordIndex.current + 1) % words.length;
      setText(words[wordIndex.current]);
    }, 3200);
    return () => clearInterval(id);
  }, [active, words]);

  // Mesin ketik penuh: satu setTimeout berantai (bukan setInterval) agar tiap fase bisa punya durasi sendiri.
  useEffect(() => {
    if (!active || reducedRef.current || words.length === 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const word = words[wordIndex.current % words.length] ?? '';
      switch (phase.current) {
        case 'typing':
          charIndex.current++;
          setText(word.slice(0, charIndex.current));
          if (charIndex.current >= word.length) {
            phase.current = 'holding';
            timer = setTimeout(tick, holdMs);
          } else {
            timer = setTimeout(tick, typingMs);
          }
          break;
        case 'holding':
          phase.current = 'deleting';
          timer = setTimeout(tick, deletingMs);
          break;
        case 'deleting':
          charIndex.current--;
          setText(word.slice(0, Math.max(0, charIndex.current)));
          if (charIndex.current <= 0) {
            phase.current = 'gap';
            wordIndex.current++;
            timer = setTimeout(tick, gapMs);
          } else {
            timer = setTimeout(tick, deletingMs);
          }
          break;
        case 'gap':
          phase.current = 'typing';
          timer = setTimeout(tick, typingMs);
          break;
      }
    };
    timer = setTimeout(tick, typingMs);
    return () => clearTimeout(timer);
  }, [active, words, typingMs, deletingMs, holdMs, gapMs]);

  // Kursor berkedip; berhenti (tanpa kursor) saat tak aktif atau reduced-motion.
  useEffect(() => {
    if (!active || reducedRef.current) {
      setBlink(false);
      return;
    }
    const id = setInterval(() => setBlink((b) => !b), 500);
    return () => clearInterval(id);
  }, [active]);

  return reducedRef.current ? text : text + (blink ? cursor : ' ');
}
