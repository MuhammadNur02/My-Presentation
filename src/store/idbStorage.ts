import { del, get, set } from 'idb-keyval';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { useUIStore } from './uiStore';

/**
 * Storage persist Zustand berbasis IndexedDB (auto-save).
 * - Menyimpan objek langsung (structured clone) — tanpa JSON.stringify data gambar besar.
 * - Penulisan di-debounce agar mengetik tidak menulis ulang seluruh proyek tiap tombol.
 * - Di-flush saat tab disembunyikan/ditutup agar perubahan terakhir tidak hilang.
 */
export function createIdbStorage<S>(debounceMs = 700): PersistStorage<S> {
  let pending: { name: string; value: StorageValue<S> } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const job = pending;
    if (!job) return;
    pending = null;
    try {
      await set(job.name, job.value);
      useUIStore.getState().setSaveStatus({ state: 'saved', at: Date.now() });
    } catch (err) {
      console.error('[MorphDeck] Gagal menyimpan otomatis', err);
      useUIStore.getState().setSaveStatus({ state: 'error', at: null });
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => void flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush();
    });
  }

  return {
    getItem: async (name) => (await get<StorageValue<S>>(name)) ?? null,
    setItem: (name, value) => {
      pending = { name, value };
      useUIStore.getState().setSaveStatus({ state: 'saving', at: null });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), debounceMs);
    },
    removeItem: async (name) => {
      pending = null;
      await del(name);
    },
  };
}
