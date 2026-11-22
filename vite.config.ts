import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** GitHub Pages serves 404.html for unknown paths: make it the app so /Curio/history works. */
const spaFallback = {
  name: 'spa-404-fallback',
  apply: 'build' as const,
  closeBundle() {
    copyFileSync(resolve('dist/index.html'), resolve('dist/404.html'));
  },
};

// GitHub Pages project site lives at https://k-692.github.io/Curio/
export default defineConfig({
  base: '/Curio/',
  plugins: [preact(), spaFallback],
  build: { target: 'es2020', sourcemap: false },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
} as never);
