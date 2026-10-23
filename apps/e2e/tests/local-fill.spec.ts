import { expect, test } from '@playwright/test'
import { buttons, html, twoFields } from './form-fixture'

test('first fill works offline without auth, entitlements, or AI transport', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.qf)
  await html(page, `<form>${twoFields}</form>`)
  await page.evaluate(() => {
    window.qf.transport.reply = { ok: false, reason: 'offline' }
    window.qf.mountOverlay()
  })
  await context.setOffline(true)
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText('2/2 filled')
  await expect(page.locator('input[name=email]')).toHaveValue(/@example\.com$/)
  expect(
    await page.evaluate(() => ({
      ai: window.qf.transport.requests.length,
      auth: window.qf.transport.authReads,
      quota: window.qf.transport.entitlementReads,
    })),
  ).toEqual({ ai: 0, auth: 0, quota: 0 })
  await page.getByRole('button', { name: 'Undo fill' }).click()
  await expect(page.locator('input[name=email]')).toHaveValue('')
})

test('default local fill preserves existing text, selections, and checked controls', async ({
  page,
}) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.qf)
  await html(
    page,
    `<form>
    <input name="email" type="email" value="mine@example.com">
    <input name="first_name">
    <input name="enabled" type="checkbox" value="" checked>
    <select name="role"><option value="saved" selected>Saved</option><option value="other">Other</option></select>
    <input type="radio" name="role2" value="" checked><input type="radio" name="role2" value="other">
  </form>`,
  )
  await page.evaluate(() => window.qf.mountOverlay())
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText('1/5 filled · 4 skipped')
  await expect(page.locator('input[name=email]')).toHaveValue('mine@example.com')
  await expect(page.locator('#fixtures input[type=checkbox]')).toBeChecked()
  await expect(page.locator('select')).toHaveValue('saved')
  await expect(page.locator('input[type=radio][value=""]')).toBeChecked()
  await page.getByRole('button', { name: 'Undo fill' }).click()
  await expect(page.locator('input[name=first_name]')).toHaveValue('')
  await expect(page.locator('input[name=email]')).toHaveValue('mine@example.com')
})

test('local generation satisfies native ranges, masks, lengths, options, and required checkbox', async ({
  page,
}) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.qf)
  await html(
    page,
    `<form>
    <input name="price" type="number" min="-1.1" max="-0.5" step="0.2">
    <input name="date" type="date" min="1970-01-01" max="1970-01-05" step="2">
    <textarea name="notes" minlength="100" maxlength="110"></textarea>
    <input name="phone" data-maska="(###) ###-####" pattern="\\(\\d{3}\\) \\d{3}-\\d{4}">
    <select name="role"><option value="">Choose</option><optgroup disabled><option value="bad">Disabled</option></optgroup><option value="good">Good</option></select>
    <input type="checkbox" name="terms" required>
  </form>`,
  )
  await page.evaluate(() => {
    window.qf.transport.preferences.seed = 'native'
    window.qf.mountOverlay()
  })
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText('6/6 filled')
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true)
  await expect(page.locator('select')).toHaveValue('good')
  await expect(page.locator('#fixtures input[type=checkbox]')).toBeChecked()
  expect(await page.evaluate(() => window.qf.transport.requests)).toEqual([])
})

test('local fill distinguishes an empty custom-select prompt from a saved selection', async ({
  page,
}) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.qf)
  await html(
    page,
    `<form><input name="email" type="email"><div id="role" name="role">
    <button type="button" role="combobox" aria-controls="choices" aria-expanded="false"><span class="value">Choose role</span></button>
  </div></form>`,
  )
  await page.evaluate(() => {
    const trigger = document.querySelector('[role=combobox]')!
    trigger.addEventListener('click', () => {
      const existing = document.getElementById('choices')
      if (existing) {
        existing.remove()
        trigger.setAttribute('aria-expanded', 'false')
        return
      }
      const list = document.createElement('div')
      list.id = 'choices'
      list.setAttribute('role', 'listbox')
      list.innerHTML =
        '<div role="option" aria-disabled="true">Disabled</div><div role="option">Editor</div>'
      list.lastElementChild!.addEventListener('click', () => {
        trigger.querySelector('.value')!.textContent = 'Editor'
        trigger.setAttribute('aria-expanded', 'false')
        list.remove()
      })
      document.body.appendChild(list)
      trigger.setAttribute('aria-expanded', 'true')
    })
    window.qf.mountOverlay()
  })
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText('2/2 filled')
  await expect(page.locator('.value')).toHaveText('Editor')
  await page.locator('input[name=email]').fill('')
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText('1/2 filled · 1 skipped')
  await expect(page.locator('.value')).toHaveText('Editor')
  await expect(page.locator('#choices')).toHaveCount(0)
  expect(await page.evaluate(() => window.qf.transport.requests.length)).toBe(0)
})

test('a stable seed repeats after undo and rescan without network calls', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.qf)
  await html(page, `<form>${twoFields}<input name="last_name"><input name="first_name"></form>`)
  await page.evaluate(() => {
    window.qf.transport.preferences.seed = 'regression'
    window.qf.mountOverlay()
  })
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText('4/4 filled')
  const values = () =>
    page
      .locator('form input')
      .evaluateAll((inputs) => inputs.map((el) => (el as HTMLInputElement).value))
  const first = await values()
  expect(first[1]).toBe(`${first[3]} ${first[2]}`)
  await page.getByRole('button', { name: 'Undo fill' }).click()
  await page.evaluate(() => window.qf.rescan())
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText('4/4 filled')
  expect(await values()).toEqual(first)
})

test('AI quota failure cannot hide or disable local filling', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.qf)
  await html(page, `<form>${twoFields}<input name="xyzzy"></form>`)
  await page.evaluate(() => {
    window.qf.transport.reply = { ok: false, reason: 'quota' }
    window.qf.mountOverlay()
  })
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText('2/3 filled · 1 skipped')
  await page.getByRole('button', { name: 'Fill with AI', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('reached this month')
  expect(
    await page.evaluate(() => window.qf.transport.requests[0].fields.map((f) => f.name)),
  ).toEqual(['xyzzy'])
  await expect(buttons(page)).toBeVisible()
  await expect(buttons(page)).toBeEnabled()
  await page.getByRole('button', { name: 'Undo fill' }).click()
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText('2/3 filled · 1 skipped')
  expect(await page.evaluate(() => window.qf.transport.requests.length)).toBe(1)
})

for (const framework of ['React', 'Vue'] as const) {
  test(`local fill updates ${framework} controlled state and survives rendering and undo`, async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.qf)
    await page.evaluate(
      (framework) => (framework === 'React' ? window.qf.mountReact() : window.qf.mountVue()),
      framework,
    )
    await expect(page.locator('form input[name=email]')).toBeVisible()
    await page.evaluate(() => window.qf.mountOverlay())
    await buttons(page).click()
    await expect(page.getByRole('status')).toHaveText('3/3 filled')
    const email = await page.locator('form input[name=email]').inputValue()
    await expect(page.locator('form')).toHaveAttribute('data-email', email)
    await expect(page.locator('form')).toHaveAttribute('data-checked', 'true')
    if (framework === 'React') await page.evaluate(() => window.qf.reactState.rerender())
    else await page.getByRole('button', { name: 'Rerender Vue' }).click()
    await expect(page.locator('form input[name=email]')).toHaveValue(email)
    await expect(page.locator('#fixtures input[type=checkbox]')).toBeChecked()
    await page.getByRole('button', { name: 'Undo fill' }).click()
    await expect(page.getByRole('status')).toHaveText('3/3 restored')
    await expect(page.locator('form')).toHaveAttribute('data-email', '')
    await expect(page.locator('form')).toHaveAttribute('data-name', '')
    await expect(page.locator('form')).toHaveAttribute('data-checked', 'false')
    expect(await page.evaluate(() => window.qf.transport.requests.length)).toBe(0)
  })
}

test('signed-out popup exposes local preferences and keeps sign-in optional', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 360, height: 600 })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/popup.html')
  await expect(page.getByText('Local test data', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(600)
  await page.screenshot({ path: test.info().outputPath('popup-home.png'), fullPage: true })
  await page.getByText('Local test data', { exact: true }).click()
  const save = page.getByRole('button', { name: 'Save local preferences' })
  await expect(save).toBeEnabled()
  await context.setOffline(true)
  await page.getByLabel('Repeatable seed').fill('qa-offline')
  await page.getByLabel('Sample locale').selectOption('sr-RS')
  await save.click()
  await expect(page.getByRole('status')).toHaveText('Saved on this device.')
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('qf-fixture-local')!))
  expect(prefs).toEqual({ onlyEmpty: true, seed: 'qa-offline', locale: 'sr-RS' })
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Send sign-in code' })).toBeInViewport()
  await page.screenshot({ path: test.info().outputPath('popup-sign-in.png'), fullPage: true })
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByText('Local test data', { exact: true }).click()
  await expect(page.getByLabel('Repeatable seed')).toHaveValue('qa-offline')
  await page.getByText('Site activation and exclusions', { exact: true }).click()
  await page.getByRole('switch', { name: 'QuikFill on example.com' }).uncheck()
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('qf-fixture-settings') ?? '{}').blockedHostnames,
      ),
    )
    .toEqual(['example.com'])
  await page.getByText('Site activation and exclusions', { exact: true }).click()
  expect(errors).toEqual([])
  await page.screenshot({ path: test.info().outputPath('signed-out-popup.png'), fullPage: true })
})

test('dependent per-control planning keeps one synthetic identity without a configured seed', async ({
  page,
}) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.qf)
  await html(
    page,
    '<form><input name="first_name"><input name="last_name"><input name="full_name"><input type="email" name="email"></form>',
  )
  await page.evaluate(() => window.qf.mountOverlay())
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText('4/4 filled')
  const values = await page
    .locator('form')
    .evaluate((form) => Object.fromEntries(new FormData(form as HTMLFormElement)))
  expect(values.full_name).toBe(`${values.first_name} ${values.last_name}`)
  expect(String(values.email)).toMatch(
    new RegExp(
      `^${String(values.first_name).toLowerCase()}\\.${String(values.last_name).toLowerCase()}[0-9]+@example\\.com$`,
    ),
  )
})
