import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { buttons, html } from './form-fixture'

const identity =
  '<form id="identity"><input name="first_name"><input name="last_name"><input name="full_name"><input type="email" name="email"><input name="company"></form>'
async function mount(page: Page, markup = identity) {
  await page.goto('/')
  await page.waitForFunction(() => !!window.qf)
  await html(page, markup)
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLInputElement>('input[data-reject]'))
      el.addEventListener('input', () => {
        if (el.hasAttribute('data-reject')) el.pattern = 'never'
      })
    window.qf.mountOverlay()
    window.qf.publishRecipeContexts()
  })
  await expect(buttons(page).first()).toBeVisible()
}
const payload = (page: Page) =>
  page.locator('form').evaluate((form) => Object.fromEntries(new FormData(form as HTMLFormElement)))

test('popup creates fixed/generated/skip scenario and replays it after reload without network', async ({
  page,
  context,
}) => {
  await mount(page)
  const popup = await context.newPage()
  const errors: string[] = []
  popup.on('pageerror', (error) => errors.push(error.message))
  await popup.goto('/popup.html')
  await popup.getByText('QA scenarios', { exact: true }).click()
  await popup.getByRole('button', { name: 'Inspect forms on this page' }).click()
  await popup.getByRole('button', { name: 'Create scenario from this form' }).click()
  await popup.getByLabel('Scenario name').fill('Signup regression')
  await popup.getByLabel('Scenario seed').fill('signup-qa')
  await popup.getByLabel('Behavior for company', { exact: true }).selectOption('skip')
  await popup.getByLabel('Behavior for full_name', { exact: true }).selectOption('fixed')
  await popup.getByLabel('Fixed value for full_name', { exact: true }).fill('QA Person')
  await popup.getByRole('button', { name: 'Save scenario', exact: true }).click()
  await popup.getByRole('button', { name: 'Activate', exact: true }).click()
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText(
    '4/5 filled · 1 skipped · Scenario: Signup regression',
  )
  const first = await payload(page)
  expect(first.full_name).toBe('QA Person')
  expect(first.company).toBe('')
  expect(String(first.email)).toContain(
    `${String(first.first_name).toLowerCase()}.${String(first.last_name).toLowerCase()}`,
  )
  await mount(page)
  await buttons(page).click()
  await expect(page.getByRole('status')).toContainText('Scenario: Signup regression')
  expect(await payload(page)).toEqual(first)
  expect(await page.evaluate(() => window.qf.transport.requests.length)).toBe(0)
  expect(errors).toEqual([])
  await popup.close()
})

test('scenario export/import preserves seed and rules but imported copy needs activation', async ({
  page,
  context,
}) => {
  await mount(page)
  const saved = await page.evaluate(() => window.qf.saveScenario())
  const popup = await context.newPage()
  const errors: string[] = []
  popup.on('pageerror', (error) => errors.push(error.message))
  await popup.goto('/popup.html')
  await popup.getByText('QA scenarios', { exact: true }).click()
  await popup.getByRole('button', { name: 'Inspect forms on this page' }).click()
  const downloadPromise = popup.waitForEvent('download')
  await popup.getByRole('button', { name: 'Export', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('quikfill-scenario.json')
  const text = await readFile((await download.path())!, 'utf8')
  expect(JSON.parse(text).recipes[0].seed).toBe(saved.seed)
  await popup.getByRole('button', { name: 'Deactivate', exact: true }).click()
  await popup.getByRole('button', { name: 'Delete', exact: true }).click()
  await popup.getByLabel('Import scenario JSON').setInputFiles({
    name: 'scenario.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
  await expect(popup.getByRole('status').last()).toContainText('Imported copies')
  const imported = await page.evaluate(async () => window.qf.createRecipeStore().list())
  expect(imported[0].id).not.toBe(saved.id)
  expect(imported[0].rules).toEqual(saved.rules)
  expect(imported[0].seed).toBe(saved.seed)
  await expect(popup.getByRole('button', { name: 'Activate', exact: true })).toBeVisible()
  await popup.getByRole('button', { name: 'Activate', exact: true }).click()
  await buttons(page).click()
  await expect(page.getByRole('status')).toContainText('Scenario: Browser QA')
  expect(errors).toEqual([])
  await popup.close()
})

test('malformed and unsupported import never replaces an active scenario', async ({
  page,
  context,
}) => {
  await mount(page)
  const saved = await page.evaluate(() => window.qf.saveScenario())
  const popup = await context.newPage()
  const errors: string[] = []
  popup.on('pageerror', (error) => errors.push(error.message))
  await popup.goto('/popup.html')
  await popup.getByText('QA scenarios', { exact: true }).click()
  await popup.getByLabel('Import scenario JSON').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"quikfill-recipes","version":99,"recipes":[]}'),
  })
  await expect(popup.getByRole('status').last()).toBeVisible()
  expect(await page.evaluate(async () => window.qf.createRecipeStore().list())).toEqual([saved])
  await buttons(page).click()
  await expect(page.getByRole('status')).toContainText('Scenario: Browser QA')
  expect(errors).toEqual([])
  await popup.close()
})

test('scenario never matches another path, changed structure or another form', async ({ page }) => {
  await mount(
    page,
    '<form id="one"><input name="email"><input name="company"></form><form id="two"><input name="email"><input name="company"></form>',
  )
  await page.evaluate(async () => {
    const rules = window.qf.recipeContexts()[0].fields.map((f) => ({
      fieldKey: JSON.stringify([
        f.frame,
        f.shadow,
        f.tagName,
        f.inputType,
        f.name || f.labelText || f.ariaLabel || f.domId || '',
        f.labelText || f.ariaLabel || '',
      ]),
      label: f.name!,
      mode: 'fixed',
      value: 'Only first form',
      case: 'valid',
    }))
    await window.qf.saveScenario({ rules })
  })
  await buttons(page).nth(1).click()
  await expect(page.getByRole('status')).not.toContainText('Scenario:')
  await expect(page.locator('#two input[name=company]')).not.toHaveValue('Only first form')
  await mount(
    page,
    '<form id="one"><input name="email"><input name="company"><input name="first_name"></form>',
  )
  await buttons(page).click()
  await expect(page.getByRole('status')).not.toContainText('Scenario:')
  await mount(page, '<form id="one"><input name="email"><input name="company"></form>')
  await page.evaluate(() => history.pushState({}, '', '/other'))
  await buttons(page).click()
  await expect(page.getByRole('status')).not.toContainText('Scenario:')
})

test('retry only failed fields uses the same seed, preserves successes and keeps the first undo state', async ({
  page,
}) => {
  await mount(
    page,
    '<form><input name="first_name"><input name="email" type="email" data-reject></form>',
  )
  await page.evaluate(() => {
    window.qf.transport.preferences.seed = 'repeat-retry'
    window.qf.destroyOverlay()
    window.qf.mountOverlay()
  })
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText('1/2 filled · 1 failed')
  const first = await payload(page)
  await page.locator('[name=first_name]').fill('Manual success edit')
  await page.locator('[name=email]').evaluate((el) => {
    el.removeAttribute('pattern')
    el.removeAttribute('data-reject')
  })
  await page.getByRole('button', { name: 'Retry failed fields' }).click()
  await expect(page.getByRole('status')).toHaveText('2/2 filled')
  await expect(page.locator('[name=first_name]')).toHaveValue('Manual success edit')
  await expect(page.locator('[name=email]')).toHaveValue(String(first.email))
  await page.getByRole('button', { name: 'Undo fill' }).click()
  await expect(page.getByRole('status')).toHaveText('1/2 restored')
  await expect(page.locator('[name=email]')).toHaveValue('')
  await expect(page.locator('[name=first_name]')).toHaveValue('Manual success edit')
})

test('retry preserves a subsequent manual change of a failed control', async ({ page }) => {
  await mount(
    page,
    '<form><input name="first_name"><input name="email" type="email" data-reject></form>',
  )
  await buttons(page).click()
  await expect(page.getByRole('status')).toContainText('1 failed')
  await page.locator('[name=email]').fill('manual@example.com')
  await page.getByRole('button', { name: 'Retry failed fields' }).click()
  await expect(page.getByRole('status')).toHaveText('1/2 filled · 1 skipped')
  await expect(page.locator('[name=email]')).toHaveValue('manual@example.com')
  await buttons(page).click()
  await expect(page.getByRole('status')).toContainText('skipped')
})

for (const variant of ['minimum', 'maximum', 'belowMinimum', 'aboveMaximum', 'missing'] as const) {
  test(`scenario ${variant} verifies actual constraint state and supports undo`, async ({
    page,
  }) => {
    await mount(
      page,
      '<form><input name="email" type="email"><input name="quantity" type="number" min="2" max="10" step="2" required></form>',
    )
    await page.evaluate(async (variant) => {
      const recipe = await window.qf.saveScenario()
      recipe.rules[1].case = variant
      recipe.rules[1].mode = 'generated'
      await window.qf.createRecipeStore().save(recipe)
    }, variant)
    await buttons(page).click()
    await expect(page.getByRole('status')).toContainText('2/2 filled')
    const invalid = !['minimum', 'maximum'].includes(variant)
    await expect(page.getByRole('status')).toContainText(
      invalid ? '1 expected invalid' : 'Scenario:',
    )
    expect(
      await page
        .locator('[name=quantity]')
        .evaluate((el) => (el as HTMLInputElement).validity.valid),
    ).toBe(!invalid)
    await page.getByRole('button', { name: 'Undo fill' }).click()
    await expect(page.locator('[name=quantity]')).toHaveValue('')
  })
}

test('expected-invalid reports failure when the page accepts a valid value', async ({ page }) => {
  await mount(
    page,
    '<form><input name="email" type="email"><input name="quantity" type="number" min="2" max="10"></form>',
  )
  await page.evaluate(async () => {
    const recipe = await window.qf.saveScenario()
    recipe.rules[1] = { ...recipe.rules[1], mode: 'fixed', value: '5', case: 'invalid' }
    await window.qf.createRecipeStore().save(recipe)
  })
  await buttons(page).click()
  await expect(page.getByRole('status')).toContainText('1 failed')
  await page.locator('#quikfill-overlay-host summary').click()
  await expect(page.locator('#quikfill-overlay-host li').last()).toContainText(
    'Expected invalid, but',
  )
})

test('retry does not retarget a replacement of a failed control', async ({ page }) => {
  await mount(
    page,
    '<form><input name="first_name"><input name="email" type="email" data-reject></form>',
  )
  await buttons(page).click()
  await expect(page.getByRole('status')).toContainText('1 failed')
  await page.locator('[name=email]').evaluate((el) => {
    const replacement = document.createElement('input')
    replacement.name = 'email'
    replacement.value = 'Replacement'
    el.replaceWith(replacement)
  })
  await page.getByRole('button', { name: 'Retry failed fields' }).click()
  await expect(page.getByRole('status')).toHaveText('1/2 filled · 1 skipped')
  await expect(page.locator('[name=email]')).toHaveValue('Replacement')
})

test('a fixed custom-widget recipe commits React Select state and payload after re-render', async ({
  page,
}) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.qf)
  await page.evaluate(() => window.qf.mountReactWidgets('reactSelect'))
  await expect(page.getByRole('combobox', { name: 'Choice' })).toBeVisible()
  await page.evaluate(async () => {
    window.qf.mountOverlay()
    const recipe = await window.qf.saveScenario()
    recipe.rules[1] = { ...recipe.rules[1], mode: 'fixed', value: 'Editor' }
    await window.qf.createRecipeStore().save(recipe)
  })
  await buttons(page).click()
  await expect(page.getByRole('status')).toContainText('2/2 filled')
  await page.getByRole('button', { name: 'Rerender widgets' }).click()
  expect(await payload(page)).toMatchObject({ choice: 'chosen' })
  await expect(page.locator('form')).toHaveAttribute(
    'data-selection',
    '{"value":"chosen","label":"Editor"}',
  )
})

test('an imported ambiguous scenario cannot write either duplicate field', async ({ page }) => {
  await mount(page, '<form><input name="company"><input name="company"></form>')
  await page.evaluate(async () => {
    const c = window.qf.recipeContexts()[0]
    const field = c.fields[0]
    const key = JSON.stringify([
      field.frame,
      field.shadow,
      field.tagName,
      field.inputType,
      field.name || '',
      field.labelText || field.ariaLabel || '',
    ])
    await window.qf.saveScenario({
      rules: [
        {
          fieldKey: key,
          label: 'company',
          mode: 'fixed',
          value: 'Should never land',
          case: 'valid',
        },
      ],
    })
  })
  await buttons(page).click()
  await expect(page.getByRole('status')).toContainText('ambiguous')
  expect(
    await page
      .locator('input')
      .evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value)),
  ).toEqual(['', ''])
})

test('editing an active scenario validates input and makes explicit overwrite repeatable', async ({
  page,
  context,
}) => {
  await mount(page, '<form><input name="email" type="email"><input name="company"></form>')
  const saved = await page.evaluate(() => window.qf.saveScenario())
  const popup = await context.newPage()
  await popup.goto('/popup.html')
  await popup.getByText('QA scenarios', { exact: true }).click()
  await popup.getByRole('button', { name: 'Inspect forms on this page' }).click()
  await popup.getByRole('button', { name: 'Edit', exact: true }).click()
  await popup.getByLabel('Scenario seed').fill('')
  await popup.getByRole('button', { name: 'Save scenario', exact: true }).click()
  await expect(popup.getByLabel('Scenario seed')).toHaveAttribute('aria-invalid', 'true')
  expect((await page.evaluate(async () => window.qf.createRecipeStore().list()))[0].seed).toBe(
    saved.seed,
  )
  await popup.getByLabel('Scenario seed').fill('edited-seed')
  await popup.getByLabel('Only empty fields', { exact: true }).last().click()
  await popup.getByLabel('Behavior for company', { exact: true }).selectOption('fixed')
  await popup.getByLabel('Fixed value for company', { exact: true }).fill('QA Company')
  await popup.getByRole('button', { name: 'Save scenario', exact: true }).click()
  await expect(popup.getByRole('status').last()).toHaveText(
    'Saved. Active scenario updated for the next Fill.',
  )
  await buttons(page).click()
  await expect(page.getByRole('status')).toContainText('2/2 filled')
  const first = await payload(page)
  await page.locator('[name=company]').fill('Manual prior value')
  await buttons(page).click()
  await expect(page.getByRole('status')).toContainText('2/2 filled')
  expect(await payload(page)).toEqual(first)
  expect(first.company).toBe('QA Company')
  await popup.close()
})
