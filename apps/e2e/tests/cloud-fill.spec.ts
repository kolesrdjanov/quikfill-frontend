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

test('AI covers empty fields, minimizes metadata and waits for explicit review', async ({
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
  await page.getByRole('button', { name: 'Fill with AI', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Review before applying')
  await expect(page.locator('[name=codename]')).toHaveValue('')
  await expect(page.locator('[name=milestone]')).toHaveValue('')
  const request = await page.evaluate(() => window.qf.transport.requests[0])
  expect(request.fields.map((f) => f.name)).toEqual(['email', 'codename', 'milestone'])
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
  await page.getByRole('button', { name: 'Fill with AI', exact: true }).click()
  await page.getByRole('button', { name: 'Discard suggestions', exact: true }).click()
  await expect(page.locator('[name=codename]')).toHaveValue('')
  await page.getByRole('button', { name: 'Fill with AI', exact: true }).click()
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
  await page.getByRole('button', { name: 'Fill with AI', exact: true }).click()
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
  await expect(page.getByRole('button', { name: 'Fill with AI', exact: true })).toBeHidden()
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
  await page.getByText('Local test data', { exact: true }).click()
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
  await page.getByRole('button', { name: 'Fill with AI', exact: true }).click()
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
  await page.getByRole('button', { name: 'Fill with AI', exact: true }).click()
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

test('direct AI handles ordinary fields with generated IDs and shows unclipped loading and review actions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 })
  const names = ['company', 'contact_name', 'email', 'phone', 'website']
  await html(
    page,
    `<form>${names.map((name, index) => `<label>${name}<input id="input-82fa7c31-b653-${index}" name="${name}"></label>`).join('')}<label>Password<input type="password" name="password"></label><label>Tax ID<input name="taxId"></label></form>`,
  )
  await page.evaluate(() => {
    window.qf.transport.pending = true
    window.qf.mountOverlay()
  })
  await page.getByRole('button', { name: 'Fill this form with AI', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Generating suggestions…')
  const busy = page.locator('#quikfill-overlay-host .qf-fill-btn')
  await expect(busy).toHaveAttribute('aria-busy', 'true')
  expect(await busy.locator('.qf-label').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  )
  expect(await busy.locator('.qf-mark').evaluate((el) => getComputedStyle(el).animationName)).toBe(
    'qf-spin',
  )
  const sent = await page.evaluate(() =>
    window.qf.transport.requests[0].fields.map((field) => field.name),
  )
  expect(sent).toEqual(names)
  await page.screenshot({ path: test.info().outputPath('ai-loading.png') })
  await replyToPending(page)
  await expect(page.getByRole('status')).toContainText('Review before applying')
  await expect(
    page.getByRole('button', { name: 'Apply selected suggestions', exact: true }),
  ).toBeInViewport()
  expect(
    await page
      .locator('#quikfill-overlay-host .qf-panel-body')
      .evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true)
  const bounds = await page.locator('#quikfill-overlay-host .qf-result').evaluate((panel) => {
    const toolbar = (panel.getRootNode() as ShadowRoot)
      .querySelector('.qf-toolbar')!
      .getBoundingClientRect()
    const result = panel.getBoundingClientRect()
    return result.bottom <= toolbar.top || result.top >= toolbar.bottom
  })
  expect(bounds).toBe(true)
  await page.screenshot({ path: test.info().outputPath('ai-long-review.png') })
  await page.getByRole('button', { name: 'Apply selected suggestions', exact: true }).click()
  await expect(page.locator('[name=email]')).toHaveValue('test@example.com')
  await expect(page.locator('[name=password]')).toHaveValue('')
  await expect(page.locator('[name=taxId]')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Undo fill', exact: true })).toBeInViewport()
})

test('AI on a form of existing or protected fields explains the blockers without a request', async ({
  page,
}) => {
  await html(
    page,
    '<form><label>Email<input name="email" value="keep@example.com"></label><label>Password<input type="password"></label><label>Verification code<input autocomplete="one-time-code"></label></form>',
  )
  await page.evaluate(() => window.qf.mountOverlay())
  await page.getByRole('button', { name: 'Fill this form with AI', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('No editable empty fields')
  await page.getByText('Field details', { exact: true }).click()
  await expect(page.locator('#quikfill-overlay-host li').first()).toContainText(
    'Existing value preserved',
  )
  expect(await page.evaluate(() => window.qf.transport.requests.length)).toBe(0)
})

test('expanded popup sections share padding and keep actions reachable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 600 })
  await page.goto('/popup.html')
  for (const title of [
    'Local test data',
    'Saved data',
    'QA scenarios',
    'Site activation and exclusions',
  ]) {
    const trigger = page.getByRole('button', { name: title, exact: true })
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const content = page.locator(`#${await trigger.getAttribute('aria-controls')}`)
    const spacing = await content.locator(':scope > div').evaluate((el) => {
      const style = getComputedStyle(el)
      return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
    })
    expect(spacing).toEqual(['16px', '16px', '16px', '16px'])
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
    await page.screenshot({
      path: test.info().outputPath(`popup-${title.replaceAll(' ', '-').toLowerCase()}.png`),
    })
    await trigger.click()
  }
})

for (const kind of ['reactSelect', 'reactMulti'] as const) {
  test(`direct AI reviews observed ${kind} options without changing the form or guessing`, async ({
    page,
  }) => {
    await page.evaluate((kind) => window.qf.mountReactWidgets(kind), kind)
    await page.locator('input[name=email]').fill('keep@example.com')
    await page.evaluate(() => window.qf.mountOverlay())
    await page.getByRole('button', { name: 'Fill this form with AI', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Review before applying')
    expect(await page.evaluate(() => window.qf.transport.requests.length)).toBe(0)
    await expect(page.locator('form')).not.toHaveAttribute('data-selection', /chosen/)
    await page.getByRole('button', { name: 'Apply selected suggestions', exact: true }).click()
    await expect(page.locator('form')).toHaveAttribute('data-selection', /chosen/)
    await expect(page.locator('input[name=email]')).toHaveValue('keep@example.com')
  })
}

test('canceling AI stops the loading state and ignores a late response', async ({ page }) => {
  await html(page, '<form><input name="email" type="email"><input name="company"></form>')
  await page.evaluate(() => {
    window.qf.transport.pending = true
    window.qf.mountOverlay()
  })
  await page.getByRole('button', { name: 'Fill this form with AI', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Generating suggestions…')
  await page.getByRole('button', { name: 'Cancel fill', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Fill cancelled')
  await replyToPending(page)
  await expect(page.locator('input[name=email]')).toHaveValue('')
  await expect(
    page.getByRole('button', { name: 'Fill this form with AI', exact: true }),
  ).toBeEnabled()
  await expect(
    page.getByRole('button', { name: 'Apply selected suggestions', exact: true }),
  ).toBeHidden()
})

test('empty AI response explains recovery and does not claim a successful fill', async ({
  page,
}) => {
  await html(page, '<form><input name="email" type="email"><input name="company"></form>')
  await page.evaluate(() => window.qf.mountOverlay())
  await page.getByRole('button', { name: 'Fill this form with AI', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('AI returned no usable suggestions')
  await expect(page.getByRole('button', { name: 'Use sample data', exact: true })).toBeEnabled()
  await expect(page.locator('input[name=email]')).toHaveValue('')
})

for (const buttonPosition of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
  test(`AI panel stays inside a narrow viewport at ${buttonPosition} and follows dark appearance`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 600 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await html(
      page,
      '<form style="position:fixed;right:0;bottom:0;width:180px;height:250px"><label>Email<input name="email" type="email" style="width:100%"></label><label>Company<input name="company" style="width:100%"></label></form>',
    )
    await page.evaluate((buttonPosition) => {
      localStorage.setItem('qf-fixture-settings', JSON.stringify({ buttonPosition, theme: 'auto' }))
      window.qf.transport.pending = true
      window.qf.mountOverlay()
    }, buttonPosition)
    await page.getByRole('button', { name: 'Fill this form with AI', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Generating suggestions…')
    await expect(page.locator('#quikfill-overlay-host')).toHaveAttribute('data-theme', 'dark')
    for (const selector of ['.qf-toolbar', '.qf-result']) {
      const box = await page.locator(`#quikfill-overlay-host ${selector}`).boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(8)
      expect(box!.y).toBeGreaterThanOrEqual(8)
      expect(box!.x + box!.width).toBeLessThanOrEqual(312)
      expect(box!.y + box!.height).toBeLessThanOrEqual(592)
    }
    if (buttonPosition === 'bottom-right')
      await page.screenshot({ path: test.info().outputPath('ai-dark-narrow.png') })
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('#quikfill-overlay-host')).toHaveAttribute('data-theme', 'light')
  })
}
