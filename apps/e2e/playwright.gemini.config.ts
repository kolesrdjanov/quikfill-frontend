import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'
import installed from './playwright.mv3.config'

export default defineConfig({
  ...installed,
  testMatch: 'gemini.spec.ts',
  outputDir: './playwright-report/gemini',
  reporter: [['list'], ['json', { outputFile: 'playwright-report/gemini-results.json' }]],
  webServer: [
    {
      command: 'npm run test:live:server',
      cwd: fileURLToPath(new URL('../../../services', import.meta.url)),
      env: {
        QF_LIVE_PROVIDER_TEST: '1',
        DATABASE_URL: 'postgresql://quikfill:quikfill@localhost:5444/quikfill_test?schema=public',
      },
      url: 'http://127.0.0.1:4012/__mv3/state',
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      timeout: 60_000,
    },
    ...(Array.isArray(installed.webServer) ? installed.webServer.slice(1) : []),
  ],
})
