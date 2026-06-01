import { defineConfig, devices } from '@playwright/test'

const DASHBOARD_URL = 'http://localhost:5173'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: DASHBOARD_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Boot the dashboard SPA for the smoke spec. The sign-in screen renders without
  // the backend, so no API needs to be running. reuseExistingServer keeps a local
  // `pnpm dev:app` you already have open.
  webServer: {
    command: 'pnpm --filter @quikfill/app dev',
    url: DASHBOARD_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
