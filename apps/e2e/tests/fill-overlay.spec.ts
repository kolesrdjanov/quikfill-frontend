import { expect, test, type Page } from '@playwright/test'
import { html, buttons, replyToPending, twoFields } from './form-fixture'

// Enter the optional AI path through real UI, after undoing the local sample.
async function startAi(page: Page, index = 0) {
  await buttons(page).nth(index).click()
  const panel = page.locator('#quikfill-overlay-host .qf-result').nth(index)
  const undo = panel.getByRole('button', { name: 'Undo fill', exact: true })
  await expect(panel).toBeVisible()
  if (await undo.isVisible()) await undo.click()
  await panel.getByLabel('Include empty fields with local generators').check()
  await panel.getByRole('button', { name: 'AI assist', exact: true }).click()
  if (!(await page.evaluate(() => window.qf.transport.pending)))
    await panel.getByRole('button', { name: 'Apply selected suggestions', exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.qf)
})

test('overlay confines filling to one form and blocks a concurrent fill', async ({ page }) => {
  await html(page, `<form id="first">${twoFields}</form><form id="second">${twoFields}</form>`)
  await page.evaluate(() => {
    window.qf.transport.pending = true
    window.qf.mountOverlay()
  })
  await expect(buttons(page)).toHaveCount(2)
  await startAi(page)
  await expect.poll(() => page.evaluate(() => window.qf.transport.requests.length)).toBe(1)
  await expect(buttons(page).nth(1)).toBeDisabled()
  await buttons(page)
    .nth(1)
    .evaluate((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })))
  expect(await page.evaluate(() => window.qf.transport.requests.length)).toBe(1)
  await replyToPending(page)
  await page.getByRole('button', { name: 'Apply selected suggestions', exact: true }).click()
  await expect(page.locator('#first input[name=email]')).toHaveValue('test@example.com')
  await expect(page.locator('#second input[name=email]')).toHaveValue('')
  await expect(page.locator('#second input[name=name]')).toHaveValue('')
  await expect(buttons(page).first()).toBeEnabled()
})

test('overlay reports omitted values as partial and exposes field details', async ({ page }) => {
  await html(page, `<form>${twoFields}</form>`)
  await page.evaluate(() => {
    window.qf.transport.values = { email: 'test@example.com' }
    window.qf.mountOverlay()
  })
  await startAi(page)
  await expect(page.getByRole('status')).toHaveText('1/2 filled · 1 skipped')
  await expect(buttons(page)).toHaveText('1/2 filled')
  await page.locator('#quikfill-overlay-host summary').click()
  await expect(page.locator('#quikfill-overlay-host li').last()).toContainText(
    'No value was proposed',
  )
  await expect
    .poll(() =>
      page.locator('#quikfill-overlay-host .qf-result').evaluate((el) => {
        const rect = el.getBoundingClientRect()
        const button = (el.getRootNode() as ShadowRoot)
          .querySelector('.qf-fill-btn')!
          .getBoundingClientRect()
        return (
          rect.top >= 0 &&
          rect.bottom <= window.innerHeight &&
          (rect.bottom <= button.top || rect.top >= button.bottom)
        )
      }),
    )
    .toBe(true)
  const screenshot = test.info().outputPath('partial-fill-result.png')
  await page.screenshot({ path: screenshot })
  await test.info().attach('partial-fill-result', { path: screenshot, contentType: 'image/png' })
})

test('overlay leaves assisted autocomplete pending instead of saying Filled', async ({ page }) => {
  await html(
    page,
    '<form><input name="address" class="pac-target-input" aria-label="Address"><input name="name" aria-label="Name"></form>',
  )
  await page.evaluate(() => {
    window.qf.transport.values = { address: 'Main Street', name: 'Ada' }
    window.qf.mountOverlay()
  })
  await startAi(page)
  await expect(page.getByRole('status')).toHaveText('1/2 filled · 1 need your input')
  await expect(buttons(page)).not.toHaveText('Filled')
})

test('overlay preserves an edit made while the AI request is pending', async ({ page }) => {
  await html(page, `<form>${twoFields}</form>`)
  await page.evaluate(() => {
    window.qf.transport.pending = true
    window.qf.mountOverlay()
  })
  await startAi(page)
  await expect.poll(() => page.evaluate(() => window.qf.transport.requests.length)).toBe(1)
  await page.locator('input[name=name]').fill('My manual edit')
  await replyToPending(page)
  await page.getByRole('button', { name: 'Apply selected suggestions', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('1/2 filled · 1 skipped')
  await expect(page.locator('input[name=name]')).toHaveValue('My manual edit')
})

test('overlay does not apply a pending reply after the form is replaced', async ({ page }) => {
  await html(page, `<form id="form">${twoFields}</form>`)
  await page.evaluate(() => {
    window.qf.transport.pending = true
    window.qf.mountOverlay()
  })
  await startAi(page)
  await expect.poll(() => page.evaluate(() => window.qf.transport.requests.length)).toBe(1)
  await page.locator('#form').evaluate((form) => {
    form.replaceWith(form.cloneNode(true))
  })
  await expect(buttons(page)).toBeEnabled()
  await replyToPending(page)
  await expect(page.locator('input[name=email]')).toHaveValue('')
  await expect(page.locator('input[name=name]')).toHaveValue('')
  await expect.poll(() => page.evaluate(() => window.qf.transport.requests.length)).toBe(1)
})

test('undo remains bound after rescanning and preserves subsequent manual edits', async ({
  page,
}) => {
  await html(page, '<form><input name="email" type="email"><input name="name"></form>')
  await page.evaluate(() => {
    window.qf.transport.values = { email: 'test@example.com', name: 'Ada' }
    window.qf.mountOverlay()
  })
  await startAi(page)
  await expect(page.getByRole('status')).toHaveText('2/2 filled')
  await page.locator('input[name=name]').fill('My new edit')
  await page.evaluate(() => window.qf.rescan())
  await page.getByRole('button', { name: 'Undo fill' }).click()
  await expect(page.getByRole('status')).toHaveText('1/2 restored')
  await expect(page.locator('input[name=email]')).toHaveValue('')
  await expect(page.locator('input[name=name]')).toHaveValue('My new edit')
})

test('a timed-out session releases the lock and ignores its late reply', async ({ page }) => {
  await page.clock.install()
  await html(page, `<form>${twoFields}</form>`)
  await page.evaluate(() => {
    window.qf.transport.pending = true
    window.qf.mountOverlay()
  })
  await startAi(page)
  await expect.poll(() => page.evaluate(() => window.qf.transport.requests.length)).toBe(1)
  await page.clock.fastForward(30_001)
  await expect(buttons(page)).toBeEnabled()
  await expect(page.getByRole('status')).toHaveText('Fill timed out. Try again.')
  await replyToPending(page)
  await expect(page.locator('input[name=email]')).toHaveValue('')
})

test('a route change cancels a pending fill even when the form remains mounted', async ({
  page,
}) => {
  await html(page, `<form>${twoFields}</form>`)
  await page.evaluate(() => {
    window.qf.transport.pending = true
    window.qf.mountOverlay()
  })
  await startAi(page)
  await expect.poll(() => page.evaluate(() => window.qf.transport.requests.length)).toBe(1)
  await page.evaluate(() => window.history.pushState({}, '', '/different-record'))
  await replyToPending(page)
  await expect(buttons(page)).toBeEnabled()
  await expect(page.getByRole('status')).toContainText('form or page changed')
  await expect(page.locator('input[name=email]')).toHaveValue('')
})

test('destroying the overlay aborts a pending session and ignores its late response', async ({
  page,
}) => {
  await html(page, `<form>${twoFields}</form>`)
  await page.evaluate(() => {
    window.qf.transport.pending = true
    window.qf.mountOverlay()
  })
  await startAi(page)
  await expect.poll(() => page.evaluate(() => window.qf.transport.requests.length)).toBe(1)
  await page.evaluate(() => window.qf.destroyOverlay())
  await replyToPending(page)
  await expect(page.locator('#quikfill-overlay-host')).toHaveCount(0)
  await expect(page.locator('input[name=email]')).toHaveValue('')
})

test('the result can be dismissed and the same form filled again', async ({ page }) => {
  await html(page, `<form>${twoFields}</form>`)
  await page.evaluate(() => {
    window.qf.transport.values = { email: 'test@example.com', name: 'Ada' }
    window.qf.mountOverlay()
  })
  await startAi(page)
  await expect(page.getByRole('status')).toHaveText('2/2 filled')
  await page.getByRole('button', { name: 'Dismiss result' }).click()
  await expect(page.locator('#quikfill-overlay-host .qf-result')).toBeHidden()
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText('0/2 filled · 2 skipped')
  expect(await page.evaluate(() => window.qf.transport.requests.length)).toBe(1)
})
