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

test('signed-in dashboard exposes saved data and creates a record through the existing API', async ({
  page,
}) => {
  const ownerId = 'c6b3ce11-cb07-40a4-a786-800000000001'
  const typeId = 'c6b3ce11-cb07-40a4-a786-800000000003'
  const recordId = 'c6b3ce11-cb07-40a4-a786-800000000004'
  let submitted: unknown
  await page.addInitScript(
    ({ ownerId }) => {
      localStorage.setItem('qf_access_token', 'fixture-access')
      localStorage.setItem('qf_refresh_token', 'fixture-refresh')
      localStorage.setItem('qf_token_owner', ownerId)
    },
    { ownerId },
  )
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let json: unknown = {}
    if (path.endsWith('/users/me')) json = { id: ownerId, email: 'ada@example.com' }
    else if (path.endsWith('/entity-types'))
      json = [
        {
          id: typeId,
          name: 'Person',
          fields: [{ key: 'email', label: 'Email', type: 'email', required: false }],
        },
      ]
    else if (path.endsWith('/entity-records')) {
      if (route.request().method() === 'POST') {
        submitted = route.request().postDataJSON()
        json = { ...route.request().postDataJSON(), id: recordId }
      } else json = []
    }
    await route.fulfill({ json })
  })
  await page.goto('/data')
  await expect(page.getByRole('link', { name: 'Saved data', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'New record', exact: true }).click()
  await page.getByLabel('Record name').fill('Personal Ada')
  await page.getByLabel('Email', { exact: true }).fill('ada@example.com')
  await page.getByRole('button', { name: 'Create record', exact: true }).click()
  await expect(page.getByText('Personal Ada', { exact: true })).toBeVisible()
  expect(submitted).toEqual({
    entityTypeId: typeId,
    name: 'Personal Ada',
    values: { email: 'ada@example.com' },
  })
})
