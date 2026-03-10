import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

const external = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
];

export default defineConfig({
  build: {
    lib: {
      entry: 'src/preload/preload.ts',
      formats: ['cjs'],
      fileName: () => 'preload.js',
    },
    outDir: '.vite/build',
    emptyOutDir: false,
    minify: false,
    sourcemap: true,
    rollupOptions: {
      external,
    },
  },
});
