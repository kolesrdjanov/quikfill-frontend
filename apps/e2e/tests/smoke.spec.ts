import { expect, test } from '@playwright/test'

// Real smoke test: boot the dashboard SPA and confirm it mounts and the auth gate
// routes an unauthenticated visitor to a sign-in screen. Served by the Vite dev
// server (see playwright.config.ts `webServer`); the sign-in screen renders without
// the backend, so this needs no running API.
test('dashboard boots and gates an unauthenticated visitor to sign-in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/QuikFill/)
  // The SPA actually mounted (not a blank index.html shell).
  await expect(page.locator('#app')).not.toBeEmpty()
  // The auth gate routed a signed-out visitor to an interactive sign-in form.
  await expect(page.getByRole('button').first()).toBeVisible()
})
