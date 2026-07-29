import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5173,
    proxy: {
      // Evita configurar CORS y cookies entre orígenes durante el desarrollo.
      '/v1': { target: 'http://localhost:3000', changeOrigin: true },
      '/assets': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
