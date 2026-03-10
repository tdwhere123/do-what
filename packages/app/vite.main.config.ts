import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

const external = [
  'electron',
  'electron-squirrel-startup',
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
];

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main/main.ts',
      formats: ['cjs'],
      fileName: () => 'main.js',
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
