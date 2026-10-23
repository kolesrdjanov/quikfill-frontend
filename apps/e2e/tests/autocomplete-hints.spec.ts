import { test, expect } from '@playwright/test'
import { buttons, html, replyToPending } from './form-fixture'

// A shared field component applies this autofill-suppression hint to every
// input. Reproduce its attributes, not a particular site's URL or selectors.
const ordinary = [
  { name: 'business', label: 'Business name', type: 'text' },
  { name: 'company', label: 'Legal company name', type: 'text' },
  { name: 'alias', label: 'Messaging alias', type: 'text' },
  { name: 'website', label: 'Website/URL', type: 'text' },
  { name: 'address', label: 'Address line 2', type: 'text' },
  { name: 'contact', label: 'Contact name', type: 'text' },
  { name: 'email', label: 'Contact email', type: 'text' },
  { name: 'replies', label: 'Replies sent to', type: 'tel' },
]

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.qf)
  await html(
    page,
    `<form>
    ${ordinary.map((field, i) => `<div><label for="field-v-${i}">${field.label}</label><input id="field-v-${i}" name="${field.name}" type="${field.type}" autocomplete="new-password"></div>`).join('')}
    <label>Password<input name="password" type="password" autocomplete="new-password"></label>
    <label>Confirm password<input name="confirmation" type="text" autocomplete="new-password"></label>
    <label>EIN<input name="tax" autocomplete="new-password"></label>
    <label>Verification code<input name="code" autocomplete="new-password"></label>
    <label>City<input name="city" autocomplete="new-password" disabled readonly></label>
  </form>`,
  )
})

test('local fill handles reused new-password hints and still protects credentials and computed inputs', async ({
  page,
}) => {
  await page.evaluate(() => window.qf.mountOverlay())
  await buttons(page).click()
  await expect(page.getByRole('status')).toContainText('8/13 filled')
  for (const { name } of ordinary)
    await expect(page.locator(`input[name="${name}"]`)).not.toHaveValue('')
  for (const name of ['password', 'confirmation', 'tax', 'code', 'city'])
    await expect(page.locator(`input[name="${name}"]`)).toHaveValue('')
  expect(await page.evaluate(() => window.qf.transport.requests.length)).toBe(0)
  await page.getByRole('button', { name: 'Undo fill', exact: true }).click()
  for (const { name } of ordinary)
    await expect(page.locator(`input[name="${name}"]`)).toHaveValue('')
})

test('AI includes ordinary new-password inputs in review but excludes actual sensitive fields', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.qf.transport.pending = true
    window.qf.mountOverlay()
  })
  await page.getByRole('button', { name: 'Fill this form with AI', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Generating suggestions…')
  expect(
    await page.evaluate(() => window.qf.transport.requests[0].fields.map((f) => f.name)),
  ).toEqual(ordinary.map((f) => f.name))
  await replyToPending(page)
  await expect(page.getByRole('status')).toContainText('8 suggestions ready')
  for (const { name } of ordinary)
    await expect(page.locator(`input[name="${name}"]`)).toHaveValue('')
  await page.getByRole('button', { name: 'Apply selected suggestions', exact: true }).click()
  await expect(page.locator('input[name=email]')).toHaveValue('test@example.com')
  for (const name of ['password', 'confirmation', 'tax', 'code', 'city'])
    await expect(page.locator(`input[name="${name}"]`)).toHaveValue('')
})
