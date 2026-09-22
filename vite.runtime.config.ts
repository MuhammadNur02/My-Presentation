import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Membangun "runtime" mandiri (engine WebGL + player) menjadi satu file IIFE.
// File ini kemudian di-embed oleh Export Engine ke dalam HTML standalone,
// sehingga hasil ekspor berjalan offline tanpa server maupun CDN.
export default defineConfig({
  publicDir: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    target: 'es2019',
    outDir: resolve(import.meta.dirname, 'src/services/export/generated'),
    emptyOutDir: true,
    minify: true,
    copyPublicDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/runtime/main.ts'),
      name: 'MorphDeckRuntime',
      formats: ['iife'],
      fileName: () => 'runtime.js',
    },
  },
});
