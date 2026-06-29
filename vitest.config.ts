import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// NOTE: vitest.workspace.ts is the primary configuration when present.
// This file is used as a fallback for single-project runs or when
// the workspace file is missing. Keep both in sync if you change settings.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'src/**/*.{test,test-d}.{ts,tsx}',
      'scripts/**/*.{test,test-d}.{ts,tsx}',
      'packages/**/*.{test,test-d}.{ts,tsx}',
    ],
    exclude: ['e2e/**', 'node_modules/**', '.next/**', '**/node_modules/**'],
    globals: true,
    css: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './vitest.shims/server-only.ts'),
    },
  },
});
