import { defineConfig } from 'vite';

// base './' hace que el build funcione en cualquier subruta (GitHub Pages, Capacitor, servidor local).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  server: { host: true, port: 5173 },
});
