import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    minify: 'esbuild',
    chunkSizeWarningLimit: 250,
    assetsInlineLimit: 0,
  },
});
