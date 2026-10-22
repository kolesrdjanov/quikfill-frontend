import { test, expect } from '@playwright/test'
import { html, buttons, replyToPending } from './form-fixture'

const ownerId = 'c6b3ce11-cb07-40a4-a786-800000000001'
const typeId = 'c6b3ce11-cb07-40a4-a786-800000000003'
const recordId = 'c6b3ce11-cb07-40a4-a786-800000000004'
const library = {
  ownerId,
  syncedAt: new Date().toISOString(),
  types: [
    {
      id: typeId,
      name: 'Person',
      fields: [
        { key: 'email', label: 'Email', type: 'email', required: false },
        { key: 'firstName', label: 'First name', type: 'text', required: false },
      ],
    },
  ],
  records: [
    {
      id: recordId,
      entityTypeId: typeId,
      name: 'Ada record',
      values: { email: 'ada@example.com', firstName: 'Ada' },
    },
  ],
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.qf)
})

test('AI targets unresolved fields, minimizes metadata and waits for explicit review', async ({
  page,
}) => {
  await html(
    page,
    '<form><label>Email<input name="email" type="email"></label><label>Project codename<input name="codename" placeholder="Private client details"></label><label>Milestone<input name="milestone"></label></form>',
  )
  await page.evaluate(() => {
    document.title = 'Private customer dossier'
    window.qf.transport.values = { codename: 'North', milestone: 'Launch' }
    window.qf.mountOverlay()
  })
  await buttons(page).click()
  await page.getByRole('button', { name: 'Undo fill', exact: true }).click()
  await page.getByRole('button', { name: 'AI assist', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Review before applying')
  await expect(page.locator('[name=codename]')).toHaveValue('')
  await expect(page.locator('[name=milestone]')).toHaveValue('')
  const request = await page.evaluate(() => window.qf.transport.requests[0])
  expect(request.fields.map((f) => f.name)).toEqual(['codename', 'milestone'])
  expect(request.page.title).toBe('')
  expect(JSON.stringify(request)).not.toContain('Private')
  await page.screenshot({ path: test.info().outputPath('ai-review.png') })
  await page.getByLabel('Apply suggestion for Milestone', { exact: true }).uncheck()
  await page.getByRole('button', { name: 'Apply selected suggestions', exact: true }).click()
  await expect(page.locator('[name=codename]')).toHaveValue('North')
  await expect(page.locator('[name=milestone]')).toHaveValue('')
  await expect(page.locator('[name=email]')).toHaveValue('')
})

test('discard and account change invalidate AI review without writing', async ({ page }) => {
  await html(
    page,
    '<form><label>Project codename<input name="codename"></label><input name="email" type="email" value="keep@example.com"></form>',
  )
  await page.evaluate(() => {
    window.qf.transport.values = { codename: 'North' }
    window.qf.mountOverlay()
  })
  await buttons(page).click()
  await page.getByRole('button', { name: 'AI assist', exact: true }).click()
  await page.getByRole('button', { name: 'Discard suggestions', exact: true }).click()
  await expect(page.locator('[name=codename]')).toHaveValue('')
  await page.getByRole('button', { name: 'AI assist', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Apply selected suggestions', exact: true }),
  ).toBeVisible()
  await page.evaluate(() => window.qf.changeFixtureAccount())
  await expect(
    page.getByRole('button', { name: 'Apply selected suggestions', exact: true }),
  ).toBeHidden()
  await expect(page.locator('[name=codename]')).toHaveValue('')
})

test('account change cancels an AI request and ignores its late response', async ({ page }) => {
  await html(
    page,
    '<form><label>Project codename<input name="codename"></label><input name="email" type="email" value="keep@example.com"></form>',
  )
  await page.evaluate(() => {
    window.qf.transport.pending = true
    window.qf.mountOverlay()
  })
  await buttons(page).click()
  await page.getByRole('button', { name: 'AI assist', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.qf.transport.requests.length)).toBe(1)
  await page.evaluate(() => window.qf.changeFixtureAccount())
  await replyToPending(page)
  await expect(buttons(page)).toBeEnabled()
  await expect(page.locator('[name=codename]')).toHaveValue('')
  await expect(
    page.getByRole('button', { name: 'Apply selected suggestions', exact: true }),
  ).toBeHidden()
})

test('saved-data fill preserves existing values even with overwrite enabled and never falls back to samples', async ({
  page,
}) => {
  await html(
    page,
    '<form><label>Email<input name="email" type="email" value="mine@example.com"></label><label>First name<input name="first_name"></label><label>Last name<input name="last_name"></label></form>',
  )
  await page.evaluate(
    ({ library, ownerId, recordId }) => {
      localStorage.setItem('qf-fixture-library', JSON.stringify(library))
      Object.assign(window.qf.transport.preferences, {
        onlyEmpty: false,
        mode: 'saved',
        savedOwnerId: ownerId,
        savedRecordId: recordId,
      })
      window.qf.mountOverlay()
    },
    { library, ownerId, recordId },
  )
  await buttons(page).click()
  await expect(page.locator('[name=email]')).toHaveValue('mine@example.com')
  await expect(page.locator('[name=first_name]')).toHaveValue('Ada')
  await expect(page.locator('[name=last_name]')).toHaveValue('')
  await expect(page.getByRole('status')).toContainText('Saved record: Ada record')
  await expect(page.getByRole('button', { name: 'AI assist', exact: true })).toBeHidden()
  expect(await page.evaluate(() => window.qf.transport.requests.length)).toBe(0)
  await page.getByRole('button', { name: 'Undo fill', exact: true }).click()
  await expect(page.locator('[name=first_name]')).toHaveValue('')
})

test('popup selects a saved record and returns to sample mode', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 })
  await page.goto('/popup.html')
  await page.evaluate(
    (library) => localStorage.setItem('qf-fixture-library', JSON.stringify(library)),
    library,
  )
  await page.getByText('Saved data', { exact: true }).click()
  await page.getByRole('button', { name: 'Load / sync saved records' }).click()
  await page.getByLabel('Saved record', { exact: true }).selectOption(recordId)
  await page.getByRole('button', { name: 'Use selected record' }).click()
  await expect(page.getByText('Saved-data mode active. Use Fill beside the form.')).toBeVisible()
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('qf-fixture-local')!)),
  ).toMatchObject({ mode: 'saved', savedOwnerId: ownerId, savedRecordId: recordId })
  await page.getByRole('button', { name: 'Save local preferences' }).click()
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('qf-fixture-local')!).mode),
  ).toBe('saved')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  await page.screenshot({ path: test.info().outputPath('saved-data-popup.png'), fullPage: true })
  await page.getByRole('button', { name: 'Use sample data' }).click()
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('qf-fixture-local')!)),
  ).toMatchObject({ mode: 'sample' })
})

test('review preserves an edit made after the suggestions arrive', async ({ page }) => {
  await html(
    page,
    '<form><label>Project codename<input name="codename"></label><label>Milestone<input name="milestone"></label></form>',
  )
  await page.evaluate(() => {
    window.qf.transport.values = { codename: 'North', milestone: 'Launch' }
    window.qf.mountOverlay()
  })
  await buttons(page).click()
  await page.getByRole('button', { name: 'AI assist', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Review before applying')
  await page.locator('[name=codename]').fill('My choice')
  await page.getByRole('button', { name: 'Apply selected suggestions', exact: true }).click()
  await expect(page.locator('[name=codename]')).toHaveValue('My choice')
  await expect(page.locator('[name=milestone]')).toHaveValue('Launch')
})

test('an unavailable saved record fails without sample or AI fallback', async ({ page }) => {
  await html(page, '<form><input name="email" type="email"><input name="first_name"></form>')
  await page.evaluate(
    ({ library, ownerId, recordId }) => {
      localStorage.setItem('qf-fixture-library', JSON.stringify({ ...library, records: [] }))
      Object.assign(window.qf.transport.preferences, {
        mode: 'saved',
        savedOwnerId: ownerId,
        savedRecordId: recordId,
      })
      window.qf.mountOverlay()
    },
    { library, ownerId, recordId },
  )
  await buttons(page).click()
  await expect(buttons(page)).toBeEnabled()
  await expect(page.getByRole('status')).not.toContainText('filled')
  await expect(page.locator('[name=email]')).toHaveValue('')
  await expect(page.locator('[name=first_name]')).toHaveValue('')
  expect(await page.evaluate(() => window.qf.transport.requests.length)).toBe(0)
})

test('AI preserves existing values when sample overwrite is enabled', async ({ page }) => {
  await html(
    page,
    '<form><label>Email<input name="email" type="email" value="private@example.com"></label><label>Project codename<input name="codename"></label></form>',
  )
  await page.evaluate(() => {
    window.qf.transport.preferences.onlyEmpty = false
    window.qf.transport.values = { codename: 'North' }
    window.qf.mountOverlay()
  })
  await buttons(page).click()
  await page.getByRole('button', { name: 'Undo fill', exact: true }).click()
  await page.getByRole('button', { name: 'AI assist', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Apply selected suggestions', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => window.qf.transport.requests[0].fields.map((f) => f.name)),
  ).toEqual(['codename'])
  await page.getByRole('button', { name: 'Apply selected suggestions', exact: true }).click()
  await expect(page.locator('[name=email]')).toHaveValue('private@example.com')
  await expect(page.locator('[name=codename]')).toHaveValue('North')
})
