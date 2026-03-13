import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const root = path.resolve(__dirname, 'src/renderer');
const DEFAULT_CORE_PROXY_TARGET = 'http://127.0.0.1:3847';
const CORE_PROXY_PATHS = ['/acks', '/api', '/health'] as const;

function createCoreProxy(target: string) {
  return Object.fromEntries(
    CORE_PROXY_PATHS.map((proxyPath) => [
      proxyPath,
      {
        changeOrigin: true,
        target,
      },
    ]),
  );
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const coreProxyTarget = env.VITE_CORE_BASE_URL || DEFAULT_CORE_PROXY_TARGET;

  return {
    root,
    base: './',
    plugins: [react()],
    server: {
      proxy: createCoreProxy(coreProxyTarget),
    },
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
        {
          find: '@do-what/protocol',
          replacement: path.resolve(__dirname, '../protocol/src/index.ts'),
        },
      ],
    },
    build: {
      outDir: path.resolve(__dirname, '.vite/renderer/main_window'),
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});
