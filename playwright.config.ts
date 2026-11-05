import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    actionTimeout: 10_000,
    baseURL: 'http://localhost:8088',
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    timezoneId: 'UTC',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run demo',
    url: 'http://localhost:8088/api/health',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      MOCK_MODE: 'true',
      MOCK_FALLBACK: 'false',
      EMBEDDINGS_ENABLED: 'false',
      DATABASE_PATH: 'server/data/e2e.sqlite',
      RATE_LIMIT_MAX: '2000',
    },
  },
});
