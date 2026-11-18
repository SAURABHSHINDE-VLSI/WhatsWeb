import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--allow-file-access',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run start:e2e-server',
    url: 'http://localhost:3001/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      NODE_ENV: 'test',
      ENABLE_TEST_AUTH: 'true',
      JWT_SECRET: 'test_super_secret_jwt_key_at_least_32_bytes_long_12345',
      DATABASE_URL: 'postgresql://whatsus:whatsus_secret@localhost:5432/postgres?schema=public',
      APP_ORIGIN: 'http://localhost:3001,http://127.0.0.1:3001',
      PORT: '3001',
    },
  },
});
