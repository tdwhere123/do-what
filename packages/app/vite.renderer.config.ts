import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = path.resolve(__dirname, 'src/renderer');

export default defineConfig({
  root,
  base: './',
  plugins: [react()],
  optimizeDeps: {
    // Keep React Router out of esbuild prebundle so it reuses the app's single React instance.
    exclude: ['react-router', 'react-router-dom'],
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
    alias: [
      {
        // React Router 7 pulls CommonJS cookie helpers through ESM entrypoints in dev mode.
        find: /^cookie$/,
        replacement: path.resolve(__dirname, 'src/vendor/cookie-compat.mjs'),
      },
      {
        find: /^set-cookie-parser$/,
        replacement: path.resolve(__dirname, 'src/vendor/set-cookie-parser-compat.mjs'),
      },
      {
        find: '@app',
        replacement: path.resolve(__dirname, 'src/app'),
      },
      {
        find: '@stores',
        replacement: path.resolve(__dirname, 'src/stores'),
      },
      {
        find: '@styles',
        replacement: path.resolve(__dirname, 'src/styles'),
      },
    ],
  },
  build: {
    outDir: path.resolve(__dirname, '.vite/renderer/main_window'),
    emptyOutDir: true,
    sourcemap: true,
  },
});
