import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, 'src/renderer');

export default defineConfig({
  root,
  base: './',
  publicDir: false,
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  build: {
    outDir: resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: true,
    target: 'esnext',
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        widget: resolve(root, 'widget.html'),
      },
    },
  },
});
