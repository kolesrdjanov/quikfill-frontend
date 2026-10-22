import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const cwd = fileURLToPath(new URL('..', import.meta.url))
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
for (const args of [
  [
    '--filter',
    '@quikfill/chrome-extension',
    'exec',
    'wxt',
    'build',
    '--config',
    '../e2e/wxt.mv3.config.ts',
  ],
  ['exec', 'playwright', 'test', '--config', 'playwright.mv3.config.ts', ...process.argv.slice(2)],
]) {
  const result = spawnSync(pnpm, args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      WXT_QF_API_BASE_URL: 'http://127.0.0.1:4012/api/v1',
      WXT_QF_DASHBOARD_URL: 'http://localhost:5173',
      VITE_QF_MOCK_AI_FILL: 'false',
    },
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
