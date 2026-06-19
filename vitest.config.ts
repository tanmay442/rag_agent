import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,test-d}.{ts,tsx}', 'scripts/**/*.{test,test-d}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    globals: true,
    css: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Next.js' `server-only` package throws at import time in client
      // bundles; for unit tests we just need a noop module so the
      // import resolves.
      'server-only': path.resolve(__dirname, './vitest.shims/server-only.ts'),
    },
  },
});
