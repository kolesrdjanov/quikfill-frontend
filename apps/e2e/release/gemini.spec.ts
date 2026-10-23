import { test, expect, visit, fillButton, click, waitText, state, API } from './installed'

test.afterAll(async () => {
  const response = await fetch(`${API}/__mv3/cleanup`, { method: 'POST' })
  expect(response.ok).toBe(true)
})

test('installed MV3 uses real Gemini for reviewed suggestions, undo and quota while local fill stays offline', async ({
  installed,
  page,
}, info) => {
  await visit(page, 'ai')
  const mailbox = (await (await fetch(`${API}/__mv3/state`)).json()) as { emailPrefix: string }
  const email = `${mailbox.emailPrefix}user@example.com`
  const popup = await installed.popup(page)
  await click(popup, 'Sign in')
  await popup.locator('input[type=email]').fill(email)
  await click(popup, 'Send sign-in code')
  await expect.poll(async () => (await state()).codes[email]).toMatch(/^\d{6}$/)
  const code = (await state()).codes[email]!
  for (let index = 0; index < code.length; index++)
    await popup.locator(`[aria-label="Digit ${index + 1}"]`).fill(code[index]!)
  await click(popup, 'Verify & sign in')
  await click(popup, 'Start filling')
  await waitText(popup, 'Sign out')
  await popup.close()

  await page.getByRole('button', { name: 'Fill this form with AI', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Review before applying', {
    timeout: 40_000,
  })
  await expect(page.locator('[name=codename]')).toHaveValue('')
  await expect(page.locator('[name=email]')).toHaveValue('mine@example.com')
  await page.locator('[name=milestone]').fill('Manual milestone')
  await page.screenshot({ path: info.outputPath('real-gemini-review.png') })
  await page.getByRole('button', { name: 'Apply selected suggestions', exact: true }).click()
  await expect(page.locator('[name=codename]')).not.toHaveValue('')
  await expect(page.locator('[name=milestone]')).toHaveValue('Manual milestone')
  await page.getByRole('button', { name: 'Undo fill', exact: true }).click()
  await expect(page.locator('[name=codename]')).toHaveValue('')
  await expect(page.locator('[name=milestone]')).toHaveValue('Manual milestone')

  await visit(page, 'ai')
  await page.getByRole('button', { name: 'Fill this form with AI', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Review before applying', {
    timeout: 40_000,
  })
  await page.getByRole('button', { name: 'Discard suggestions', exact: true }).click()
  await expect(page.locator('[name=codename]')).toHaveValue('')
  await visit(page, 'ai')
  await page.getByRole('button', { name: 'Fill this form with AI', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('reached this month')
  const evidence = (await (await fetch(`${API}/__mv3/state`)).json()) as {
    provider: string
    requests: unknown[]
    fillRuns: { model: string; tokensIn: number; tokensOut: number; prompt: string }[]
  }
  expect(evidence.provider).toBe('real-gemini')
  expect(evidence.fillRuns).toHaveLength(2)
  expect(
    evidence.fillRuns.every(
      (run) =>
        run.tokensIn > 0 &&
        run.tokensOut > 0 &&
        run.model !== 'mv3-fixture' &&
        run.prompt === '[metadata omitted]',
    ),
  ).toBe(true)
  expect(JSON.stringify(evidence.requests)).not.toContain('mine@example.com')

  await visit(page)
  await installed.context.setOffline(true)
  await fillButton(page).first().click()
  await expect(page.getByRole('status')).toContainText('4/5 filled')
  await expect(page.locator('#native [name=email]')).toHaveValue(/@example\.com$/)
  await installed.context.setOffline(false)
  expect(installed.errors).toEqual([])
})
