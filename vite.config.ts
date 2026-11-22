import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// GitHub Pages project site lives at https://k-692.github.io/Curio/
export default defineConfig({
  base: '/Curio/',
  plugins: [preact()],
  build: { target: 'es2020', sourcemap: false },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
} as never);
