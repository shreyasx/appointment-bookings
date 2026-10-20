import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist/web' },
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { testTimeout: 20_000, hookTimeout: 20_000 },
});
