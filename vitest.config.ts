import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './worker/index.ts',
      miniflare: {
        compatibilityDate: '2026-03-17',
      },
    }),
  ],
  test: {
    include: ['worker/**/*.test.ts', 'shared/**/*.test.ts'],
  },
});
