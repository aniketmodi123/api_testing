import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

// Test config kept separate from vite.config.js so the build pipeline stays untouched.
// Reuses the same `@` alias + react plugin as the app so imports resolve identically.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    // CSS is irrelevant to behavior tests; skipping it keeps runs fast.
    css: false,
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
});
