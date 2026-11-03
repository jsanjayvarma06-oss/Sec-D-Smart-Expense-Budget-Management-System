
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './frontend/tests',
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'list',

  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    headless: true,
    launchOptions: {
      slowMo: 1000
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },

  webServer: {
    command: 'npm run dev --workspace frontend -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
