import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './release',
  outputDir: './playwright-report/mv3',
  testMatch: 'installed.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 180_000,
  reporter: [['list'], ['json', { outputFile: 'playwright-report/mv3-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4178', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'npm run test:mv3-server',
      cwd: fileURLToPath(new URL('../../../services', import.meta.url)),
      env: {
        MV3_RELEASE_TEST: '1',
        DATABASE_URL: 'postgresql://quikfill:quikfill@localhost:5444/quikfill_test?schema=public',
      },
      url: 'http://127.0.0.1:4012/__mv3/state',
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @quikfill/app dev',
      env: { VITE_QF_API_BASE_URL: 'http://127.0.0.1:4012/api/v1' },
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @quikfill/e2e dev:mv3-fixtures',
      url: 'http://127.0.0.1:4178/mv3.html',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
