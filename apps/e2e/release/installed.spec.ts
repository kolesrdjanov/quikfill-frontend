import {
  test,
  expect,
  visit,
  fillButton,
  click,
  waitText,
  state,
  API,
  DASHBOARD,
  type Installed,
} from './installed'
import type { Page } from '@playwright/test'

// Serial by design: one fresh installed profile, one local API and no personal browser state.
test.describe.configure({ mode: 'serial' })

test('production MV3 installs with minimal permissions and fills offline without auth or submit', async ({
  installed,
  page,
}) => {
  const worker = installed.context.serviceWorkers()[0]!
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest())
  expect(manifest.manifest_version).toBe(3)
  expect(manifest.permissions?.sort()).toEqual(['activeTab', 'alarms', 'scripting', 'storage'])
  expect(manifest.host_permissions).toEqual([`${API}/*`])
  expect(manifest.content_scripts?.[0].matches).toEqual(['<all_urls>'])
  expect(
    manifest.background && 'service_worker' in manifest.background
      ? manifest.background.service_worker
      : undefined,
  ).toBe('background.js')
  await visit(page)
  expect(await page.evaluate(() => 'qf' in window)).toBe(false)
  const hits = (await state()).hits.length
  await installed.context.setOffline(true)
  await fillButton(page).first().click()
  await expect(page.getByRole('status')).toContainText('4/5 filled')
  await expect(page.locator('#native [name=email]')).toHaveValue(/@example\.com$/)
  await expect(page.locator('#native [name=password]')).toHaveValue('')
  await expect(page.locator('#other [name=email]')).toHaveValue('')
  expect(await page.locator('#native').getAttribute('data-submitted')).toBeNull()
  await page.locator('#native [name=first_name]').fill('Manual edit')
  await page.getByRole('button', { name: 'Undo fill', exact: true }).click()
  await expect(page.locator('#native [name=first_name]')).toHaveValue('Manual edit')
  await expect(page.locator('#native [name=email]')).toHaveValue('')
  expect((await state()).hits.length).toBe(hits)
  await installed.context.setOffline(false)
})

test('installed content script updates real React, Vue, Radix and Reka state and undo', async ({
  page,
}) => {
  for (const variant of ['react', 'reactMulti', 'vue', 'radix', 'reka']) {
    await test.step(variant, async () => {
      await visit(page, variant)
      await fillButton(page).click()
      await expect(page.getByRole('status')).toContainText('filled')
      if (variant.startsWith('react')) {
        await expect(page.locator('form')).toHaveAttribute('data-selection', /chosen/)
        expect(
          await page
            .locator('form')
            .evaluate((form) => new FormData(form as HTMLFormElement).get('choice')),
        ).toBe('chosen')
      } else {
        await expect(page.locator('form')).toHaveAttribute('data-checked', 'true')
        if (variant !== 'vue')
          await expect(page.locator('form')).toHaveAttribute('data-enabled', 'true')
      }
      const rerender = page.getByRole('button', { name: /Rerender/ })
      if (await rerender.count()) await rerender.click()
      if (!variant.startsWith('react'))
        await expect(page.locator('form')).toHaveAttribute('data-checked', 'true')
      await page.getByRole('button', { name: 'Undo fill', exact: true }).click()
      if (variant === 'react') {
        // This fixture deliberately has no clear action. Never claim full undo.
        await expect(page.getByRole('status')).toHaveText('1/2 restored')
        await expect(page.locator('form')).toHaveAttribute('data-selection', /chosen/)
      } else if (variant === 'reactMulti')
        await expect(page.locator('form')).toHaveAttribute('data-selection', '[]')
      else await expect(page.locator('form')).toHaveAttribute('data-checked', 'false')
    })
  }
})

test('real toolbar grants activeTab, saves a scenario and restores it after worker termination', async ({
  installed,
  page,
}, info) => {
  await visit(page)
  let popup = await installed.popup(page)
  await waitText(popup, 'Local test data')
  await popup.locator('#local-seed').fill('mv3-seed')
  await click(popup, 'Save local preferences')
  await waitText(popup, 'Saved on this device.')
  await click(popup, 'Site activation and exclusions')
  await popup.waitForSelector('[aria-label="QuikFill on localhost"]')
  await popup.locator('[aria-label="QuikFill on localhost"]').click()
  await expect(fillButton(page).first()).toBeHidden()
  await popup.locator('[aria-label="QuikFill on localhost"]').click()
  await expect(fillButton(page).first()).toBeVisible()
  await click(popup, 'QA scenarios')
  await click(popup, 'Inspect forms on this page')
  await click(popup, 'Create scenario from this form')
  await popup.locator('#recipe-name').fill('MV3 signup')
  await popup.locator('#recipe-seed').fill('mv3-signup')
  await popup.select('#recipe-mode-0', 'fixed')
  await popup.locator('#recipe-value-0').fill('Release QA')
  await click(popup, 'Save scenario')
  await click(popup, 'Activate')
  await popup.screenshot({ path: info.outputPath('toolbar-scenario.png') })
  await popup.close()
  await fillButton(page).first().click()
  await expect(page.getByRole('status')).toContainText('Scenario: MV3 signup')
  await expect(page.locator('#native [name=first_name]')).toHaveValue('Release QA')
  const first = await page.locator('#native [name=email]').inputValue()
  const cdp = await installed.context.newCDPSession(page)
  let versionId = '',
    runningStatus = ''
  cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
    const version = versions.find((v) =>
      v.scriptURL.startsWith(`chrome-extension://${installed.extension.id}/`),
    )
    if (version) {
      versionId = version.versionId
      runningStatus = version.runningStatus
    }
  })
  await cdp.send('ServiceWorker.enable')
  await expect.poll(() => versionId).not.toBe('')
  await cdp.send('ServiceWorker.stopWorker', { versionId })
  await expect.poll(() => runningStatus).toBe('stopped')
  popup = await installed.popup(page)
  await waitText(popup, 'Local test data')
  await click(popup, 'QA scenarios')
  await waitText(popup, 'MV3 signup')
  await expect.poll(() => runningStatus).toBe('running')
  expect(await popup.$eval('#local-seed', (input) => (input as HTMLInputElement).value)).toBe(
    'mv3-seed',
  )
  await popup.close()
  await expect(page.locator('#native [name=email]')).toHaveValue(first)
  await page.getByRole('button', { name: 'Undo fill', exact: true }).click()
  await expect(page.locator('#native [name=email]')).toHaveValue('')
  await page.reload()
  await expect(fillButton(page).first()).toBeVisible()
  await fillButton(page).first().click()
  await expect(page.locator('#native [name=first_name]')).toHaveValue('Release QA')
  await expect(page.locator('#native [name=email]')).toHaveValue(first)
  await cdp.detach()
})

async function signIn(installed: Installed, page: Page, email: string) {
  const popup = await installed.popup(page)
  await click(popup, 'Sign in for optional AI & sync')
  await popup.locator('input[type=email]').fill(email)
  await click(popup, 'Send sign-in code')
  await expect.poll(async () => (await state()).codes[email]).toMatch(/^\d{6}$/)
  const code = (await state()).codes[email]!
  for (let index = 0; index < code.length; index++)
    await popup.locator(`[aria-label="Digit ${index + 1}"]`).fill(code[index]!)
  await click(popup, 'Verify & sign in')
  await click(popup, 'Start filling')
  await waitText(popup, 'Sign out')
  await waitText(popup, email)
  return popup
}

test('browser cloud journey uses real OTP, dashboard records, saved cache, AI review/quota and account isolation', async ({
  installed,
  page,
}, info) => {
  const email = `mv3-release-${Date.now()}@example.com`
  let savedRecordId = ''
  await visit(page, 'saved')
  let popup = await signIn(installed, page, email)
  await click(popup, 'Saved data')
  const opened = installed.context.waitForEvent('page')
  await click(popup, 'Manage saved data')
  const dashboard = await opened
  await test.step('create type and record through the real dashboard and API', async () => {
    await expect(dashboard).toHaveURL(new RegExp(`${DASHBOARD}/(data|sign-in)`))
    await dashboard.getByLabel('Email address').fill(email)
    const codeReply = dashboard.waitForResponse(
      (response) => response.url().endsWith('/auth/magic-link') && response.status() === 202,
    )
    await dashboard.getByRole('button', { name: 'Send sign-in code', exact: true }).click()
    await codeReply
    await expect.poll(async () => (await state()).codes[email]).toMatch(/^\d{6}$/)
    await dashboard.getByLabel('Sign-in code', { exact: true }).fill((await state()).codes[email]!)
    await dashboard.getByRole('button', { name: 'Verify & sign in', exact: true }).click()
    await expect(dashboard).toHaveURL(`${DASHBOARD}/data`)
    await dashboard.getByRole('tab', { name: 'Entity types', exact: true }).click()
    await dashboard.getByRole('button', { name: 'New type', exact: true }).click()
    const dialog = dashboard.getByRole('dialog')
    await dialog.getByLabel('Name', { exact: true }).fill('MV3 Person')
    await dialog.getByPlaceholder('key', { exact: true }).fill('firstName')
    await dialog.getByPlaceholder('Label', { exact: true }).fill('First name')
    await dialog.getByRole('button', { name: 'Add field' }).click()
    await dialog.getByPlaceholder('key', { exact: true }).nth(1).fill('email')
    await dialog.getByPlaceholder('Label', { exact: true }).nth(1).fill('Email')
    await dialog.locator('select').nth(1).selectOption('email')
    await dialog.getByRole('button', { name: 'Create type', exact: true }).click()
    await expect(dialog).toBeHidden()
    await dashboard.getByRole('tab', { name: 'Records', exact: true }).click()
    await dashboard.getByRole('button', { name: 'New record', exact: true }).click()
    await dashboard.getByLabel('Record name').fill('MV3 Ada')
    await dashboard.locator('#val-firstName').fill('Ada')
    await dashboard.locator('#val-email').fill('ada@example.com')
    await dashboard.getByRole('button', { name: 'Create record', exact: true }).click()
    await expect(dashboard.getByText('MV3 Ada', { exact: true })).toBeVisible()
  })
  await test.step('select saved data through the toolbar, fill/undo and use its offline cache', async () => {
    popup = await installed.popup(page)
    await click(popup, 'Saved data')
    await click(popup, 'Load / sync saved records')
    await popup.waitForSelector('#saved-record option:not([disabled])')
    const recordId = await popup.$eval(
      '#saved-record option:not([disabled])',
      (option) => (option as HTMLOptionElement).value,
    )
    savedRecordId = recordId
    await popup.select('#saved-record', recordId)
    await click(popup, 'Use selected record')
    await waitText(popup, 'Saved-data mode active.')
    await popup.close()
    await fillButton(page).click()
    await expect(page.locator('[name=first_name]')).toHaveValue('Ada')
    await expect(page.locator('[name=email]')).toHaveValue('mine@example.com')
    await expect(page.locator('[name=last_name]')).toHaveValue('')
    await page.getByRole('button', { name: 'Undo fill', exact: true }).click()
    await installed.context.setOffline(true)
    await fillButton(page).click()
    await expect(page.locator('[name=first_name]')).toHaveValue('Ada')
    await installed.context.setOffline(false)
    await page.screenshot({ path: info.outputPath('installed-saved-fill.png') })
  })
  await test.step('a real 401 rotates the background-owned refresh token once', async () => {
    popup = await installed.popup(page)
    await popup.evaluate(async () => {
      const current = (await chrome.storage.local.get('auth:tokens'))['auth:tokens']
      if (!current || typeof current !== 'object') throw new Error('Missing test session')
      await chrome.storage.local.set({
        'auth:tokens': { ...current, accessToken: 'mv3-expired-access-token' },
      })
    })
    const before = (await state()).hits.filter((h) => h.path.endsWith('/auth/refresh')).length
    await click(popup, 'Saved data')
    await click(popup, 'Load / sync saved records')
    await waitText(popup, 'Synced')
    expect((await state()).hits.filter((h) => h.path.endsWith('/auth/refresh')).length).toBe(
      before + 1,
    )
    await click(popup, 'Use sample data')
    await popup.close()
  })
  await test.step('provider failure refunds quota and makes no writes', async () => {
    await visit(page, 'failure')
    await fillButton(page).click()
    await page.getByRole('button', { name: 'AI assist', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('unavailable')
    await expect(page.locator('[name=failure_topic]')).toHaveValue('')
  })
  await test.step('AI values require review and preserve subsequent edits', async () => {
    await visit(page, 'ai')
    await fillButton(page).click()
    await page.getByRole('button', { name: 'AI assist', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Review before applying')
    await expect(page.locator('[name=codename]')).toHaveValue('')
    await page.locator('[name=milestone]').fill('My choice')
    await page.screenshot({ path: info.outputPath('installed-ai-review.png') })
    await page.getByRole('button', { name: 'Apply selected suggestions', exact: true }).click()
    await expect(page.locator('[name=codename]')).toHaveValue('North')
    await expect(page.locator('[name=milestone]')).toHaveValue('My choice')
    const request = (await state()).requests.at(-1)!
    expect(request.page).toEqual({ lang: 'en', title: '', description: '' })
    expect(request.fields.map((f) => f.name)).toEqual(['codename', 'milestone'])
  })
  await test.step('quota blocks another AI request while local filling still works', async () => {
    await visit(page, 'ai')
    await fillButton(page).click()
    await page.getByRole('button', { name: 'AI assist', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Review before applying')
    await page.getByRole('button', { name: 'Discard suggestions', exact: true }).click()
    await visit(page, 'ai')
    await fillButton(page).click()
    const before = (await state()).requests.length
    await page.getByRole('button', { name: 'AI assist', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('reached this month')
    expect((await state()).requests.length).toBe(before)
    await visit(page, 'vue')
    await fillButton(page).click()
    await expect(page.locator('form')).toHaveAttribute('data-checked', 'true')
  })
  await test.step('logout, account B and dashboard handoff cannot reuse account A saved data', async () => {
    popup = await installed.popup(page)
    await click(popup, 'Saved data')
    await click(popup, 'Load / sync saved records')
    await waitText(popup, 'Synced')
    await popup.select('#saved-record', savedRecordId)
    await click(popup, 'Use selected record')
    await waitText(popup, 'Saved-data mode active.')
    await click(popup, 'Sign out')
    await waitText(popup, 'Sign in for optional AI & sync')
    await popup.close()
    popup = await signIn(installed, page, email.replace('@', '-b@'))
    await click(popup, 'Saved data')
    await click(popup, 'Load / sync saved records')
    await waitText(popup, 'Synced')
    expect(await popup.$('#saved-record')).toBeNull()
    await popup.close()
    await visit(page, 'saved')
    await fillButton(page).click()
    await expect(page.getByRole('status')).toContainText('current account')
    await expect(page.locator('[name=first_name]')).toHaveValue('')
    await expect(page.locator('[name=email]')).toHaveValue('mine@example.com')
    popup = await installed.popup(page)
    await click(popup, 'Saved data')
    await click(popup, 'Use sample data')
    await click(popup, 'Sign out')
    await waitText(popup, 'Sign in for optional AI & sync')
    await popup.close()
    await dashboard.reload()
    await expect
      .poll(async () => {
        const worker = installed.context.serviceWorkers()[0]!
        return worker.evaluate(async () => {
          const value = (await chrome.storage.local.get('auth:state'))['auth:state'] as
            | { user?: { email?: string } }
            | undefined
          return value?.user?.email
        })
      })
      .toBe(email)
    popup = await installed.popup(page)
    await waitText(popup, email)
    await popup.close()
  })
  await dashboard.close()
})

test('extension reload heals existing pages and restricted pages do not get injected', async ({
  installed,
  page,
}) => {
  await visit(page, 'vue')
  const original = await page.locator('#quikfill-overlay-host').elementHandle()
  if (!original) throw new Error('Missing original overlay host')
  const cdp = await installed.context.newCDPSession(page)
  const oldTargets = await cdp.send('Target.getTargets')
  const oldWorker = oldTargets.targetInfos.find(
    (target) => target.type === 'service_worker' && target.url.includes(installed.extension.id),
  )?.targetId
  const manager = await installed.context.newPage()
  await manager.goto('chrome://extensions')
  const developerMode = manager.locator('#devMode')
  if ((await developerMode.getAttribute('aria-pressed')) !== 'true') await developerMode.click()
  await manager.getByRole('button', { name: 'Reload', exact: true }).click()
  await expect
    .poll(async () =>
      (await cdp.send('Target.getTargets')).targetInfos.some(
        (target) => target.targetId === oldWorker,
      ),
    )
    .toBe(false)
  await manager.close()
  await installed.reconnect()
  await expect
    .poll(async () => (await installed.browser.extensions()).get(installed.extension.id)?.enabled)
    .toBe(true)
  // Opening the toolbar supplies activeTab if Chrome withheld background injection.
  const recovered = await installed.popup(page)
  await waitText(recovered, 'Local test data')
  await recovered.close()
  await expect.poll(() => original.evaluate((element) => element.isConnected)).toBe(false)
  await expect(page.locator('#quikfill-overlay-host')).toHaveCount(1)
  await expect(fillButton(page)).toBeEnabled()
  await fillButton(page).click()
  await expect(page.locator('form')).toHaveAttribute('data-checked', 'true')
  await page.goto('chrome://version')
  await expect(page.locator('#quikfill-overlay-host')).toHaveCount(0)
  const popup = await installed.popup(page)
  await click(popup, 'Site activation and exclusions')
  await waitText(popup, 'QuikFill can’t run on this page.')
  await popup.close()
  expect(installed.errors).toEqual([])
})
