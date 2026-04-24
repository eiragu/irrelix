import { defineConfig } from 'vite';
import crossOriginIsolation from 'vite-plugin-cross-origin-isolation';

export default defineConfig({
  plugins: [crossOriginIsolation()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
});
