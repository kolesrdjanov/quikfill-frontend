import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/** Form regressions run independently of the dashboard and backend. */
export default defineConfig({
  ...base,
  projects: base.projects?.filter((project) => project.name === 'forms'),
  webServer: {
    command: 'pnpm --filter @quikfill/e2e dev:fixtures',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
