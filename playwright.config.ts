import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: '/tmp/guess-meme-playwright-results',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3103',
    locale: 'zh-TW',
    launchOptions: { channel: 'chrome' },
  },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3103',
    url: 'http://127.0.0.1:3103',
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54399',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    reuseExistingServer: false,
  },
});
