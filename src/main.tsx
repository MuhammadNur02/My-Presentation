import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { injectEmbeddedFonts } from './engine/embeddedFonts';
import './index.css';

// Font tambahan (Space Grotesk, Poppins, Playfair Display, Bebas Neue) disematkan sekali di sini —
// dipakai renderer Canvas/WebGL slide, bukan CSS biasa, jadi harus dimuat lebih dulu ke `document.fonts`.
injectEmbeddedFonts();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
