import { expect, test } from '@playwright/test'
import { buttons, html } from './form-fixture'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.qf)
})

for (const library of ['Radix', 'Reka'] as const) {
  test(`${library} checkbox and switch update framework state, payload, and undo`, async ({
    page,
  }) => {
    await page.evaluate(
      (library) =>
        library === 'Radix' ? window.qf.mountReactWidgets() : window.qf.mountRekaWidgets(),
      library,
    )
    await expect(page.getByRole('checkbox', { name: 'Terms', exact: true })).toBeVisible()
    await page.evaluate(() => window.qf.mountOverlay())
    await buttons(page).click()
    await expect(page.getByRole('status')).toHaveText('2/2 filled')
    await page.getByRole('button', { name: 'Rerender widgets' }).click()
    await expect(page.locator('form')).toHaveAttribute('data-checked', 'true')
    await expect(page.locator('form')).toHaveAttribute('data-enabled', 'true')
    expect(
      await page
        .locator('form')
        .evaluate((form) => Object.fromEntries(new FormData(form as HTMLFormElement))),
    ).toEqual({ terms: 'on', updates: 'on' })
    await page.getByRole('button', { name: 'Undo fill' }).click()
    await expect(page.getByRole('status')).toHaveText('2/2 restored')
    await page.getByRole('button', { name: 'Rerender widgets' }).click()
    await expect(page.locator('form')).toHaveAttribute('data-checked', 'false')
    await expect(page.locator('form')).toHaveAttribute('data-enabled', 'false')
    expect(await page.evaluate(() => window.qf.transport.requests.length)).toBe(0)
  })
}

test('ARIA radio groups select only within their owner and restore the previous choice', async ({
  page,
}) => {
  await html(
    page,
    '<form><input name="email"><div role="radiogroup" aria-label="Priority"><button type="button" role="radio" data-value="low" aria-checked="true">Low</button><button type="button" role="radio" data-value="high" aria-checked="false">High</button></div></form><div role="radiogroup"><button role="radio" aria-checked="true">Foreign</button></div>',
  )
  const outcome = await page.evaluate(async () => {
    const group = document.querySelector('[role=radiogroup]')!
    for (const radio of group.querySelectorAll('[role=radio]'))
      radio.addEventListener('click', () => {
        for (const sibling of group.querySelectorAll('[role=radio]'))
          sibling.setAttribute('aria-checked', String(sibling === radio))
      })
    const field = window.qf.scanForms().fields.find((f) => f.inputType === 'radiogroup')!
    const batch = [
      {
        detectedFieldId: field.id,
        selectorCandidates: field.selectorCandidates,
        frame: field.frame,
        shadow: field.shadow,
        inputType: field.inputType,
        tagName: field.tagName,
        fillStrategy: 'clickToggle' as const,
        proposedValue: 'high',
      },
    ]
    return window.qf.applyFill(batch)
  })
  expect(outcome.results[0].status).toBe('success')
  await expect(page.getByRole('radio', { name: 'High', exact: true })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Foreign' })).toBeChecked()
  const undo = await page.evaluate(
    (snapshot) => window.qf.applyUndo(snapshot),
    outcome.undoSnapshot,
  )
  expect(undo[0].status).toBe('success')
  await expect(page.getByRole('radio', { name: 'Low', exact: true })).toBeChecked()
})
