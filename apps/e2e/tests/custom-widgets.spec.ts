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

for (const kind of [
  'radixSelect',
  'reactSelect',
  'reactMulti',
  'reactAsync',
  'muiSelect',
  'muiAutocomplete',
  'headlessCombobox',
] as const) {
  test(`${kind} commits a real portal selection and survives a framework re-render`, async ({
    page,
  }) => {
    await page.evaluate((kind) => window.qf.mountReactWidgets(kind), kind)
    await expect(page.getByRole('combobox', { name: 'Choice' })).toBeVisible()
    await page.evaluate(() => window.qf.mountOverlay())
    await buttons(page).click()
    await expect(page.getByRole('status')).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('2/2 filled', { timeout: 10000 })
    // This immediate-focus combobox may reopen after committing. A real user
    // dismisses its modal list before interacting with the rest of the form.
    if (kind === 'headlessCombobox')
      await page.getByRole('combobox', { name: 'Choice' }).press('Escape')
    await page.getByRole('button', { name: 'Rerender widgets' }).click()
    const state = await page.locator('form').getAttribute('data-selection')
    expect(state).toContain('chosen')
    expect(
      await page
        .locator('form')
        .evaluate(
          (form, key) => new FormData(form as HTMLFormElement).get(key),
          kind === 'headlessCombobox' ? 'choice[value]' : 'choice',
        ),
    ).toBe('chosen')
    expect(await page.evaluate(() => window.qf.transport.requests.length)).toBe(0)
    if (kind === 'reactMulti') {
      expect(JSON.parse(state!)).toEqual([{ value: 'chosen', label: 'Doe, Jane' }])
      await page.getByRole('button', { name: 'Undo fill' }).click()
      await expect(page.getByRole('status')).toHaveText('2/2 restored')
      await page.getByRole('button', { name: 'Rerender widgets' }).click()
      await expect(page.locator('form')).toHaveAttribute('data-selection', '[]')
    }
  })
}

test('dependent country/state/city controls use current options and wait for enablement', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.qf.mountDependentWidgets()
    window.qf.mountOverlay()
  })
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText('4/4 filled', { timeout: 10000 })
  expect(
    await page
      .locator('form')
      .evaluate((form) => Object.fromEntries(new FormData(form as HTMLFormElement))),
  ).toMatchObject({ country: 'RS', state: 'BG', city: 'Vracar' })
  await expect(page.locator('#fixtures')).not.toHaveAttribute('data-submits')
})

test('a conditional field rendered by a toggle joins the current local fill session', async ({
  page,
}) => {
  await page.evaluate(() => window.qf.mountReactWidgets('conditional'))
  await expect(page.getByRole('checkbox', { name: 'Terms', exact: true })).toBeVisible()
  await page.evaluate(() => window.qf.mountOverlay())
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText('3/3 filled')
  await page.getByRole('button', { name: 'Rerender widgets' }).click()
  await expect(page.getByLabel('Company')).not.toHaveValue('')
  expect(
    await page
      .locator('form')
      .evaluate((form) => new FormData(form as HTMLFormElement).get('company')),
  ).toBeTruthy()
})

for (const delay of [50, 300, 2000]) {
  test(`async options arriving after ${delay}ms complete without a guessed fallback`, async ({
    page,
  }) => {
    await page.evaluate((delay) => window.qf.mountReactWidgets('reactAsync', delay), delay)
    await expect(page.getByRole('combobox', { name: 'Choice' })).toBeVisible()
    await page.evaluate(() => window.qf.mountOverlay())
    await buttons(page).click()
    await expect(page.getByRole('status')).toHaveText('2/2 filled', { timeout: 10000 })
    expect(await page.locator('form').getAttribute('data-selection')).toContain('chosen')
  })
}

for (const locale of ['en-US', 'en-GB', 'sr-RS'] as const) {
  test(`${locale} readonly calendar verifies the exact localized day and month`, async ({
    page,
  }) => {
    await page.evaluate((locale) => {
      window.qf.mountCalendarWidget(locale)
      window.qf.mountOverlay()
    }, locale)
    await buttons(page).click()
    await expect(page.getByRole('status')).toHaveText('2/2 filled', { timeout: 10000 })
    const expected =
      locale === 'en-US' ? '06/05/2032' : locale === 'sr-RS' ? '05.06.2032' : '05/06/2032'
    await page.getByRole('button', { name: 'Rerender calendar' }).click()
    await expect(page.locator('input[name=date]')).toHaveValue(expected)
    await expect(page.locator('#fixtures')).not.toHaveAttribute('data-foreign')
  })
}

test('a swapped day/month in a European calendar is never reported as filled', async ({ page }) => {
  await page.evaluate(() => {
    window.qf.mountCalendarWidget('en-GB', true)
    window.qf.mountOverlay()
  })
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText('1/2 filled · 1 need your input')
  await expect(page.locator('input[name=date]')).toHaveValue('06/05/2032')
})

test('Reka Select commits a portal choice through v-model and form payload', async ({ page }) => {
  await page.evaluate(() => window.qf.mountRekaSelect())
  await expect(page.getByRole('combobox', { name: 'Choice' })).toBeVisible()
  await page.evaluate(() => window.qf.mountOverlay())
  await buttons(page).click()
  await expect(page.getByRole('status')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('2/2 filled')
  await page.getByRole('button', { name: 'Rerender widgets' }).click()
  await expect(page.locator('form')).toHaveAttribute('data-choice', 'chosen')
  expect(
    await page
      .locator('form')
      .evaluate((form) => new FormData(form as HTMLFormElement).get('choice')),
  ).toBe('chosen')
})

test('virtualized options outside the first viewport are matched exactly', async ({ page }) => {
  await html(
    page,
    '<div id="virtual-field"><button type="button" role="combobox" aria-label="Virtual choice" aria-controls="virtual-options" aria-expanded="false"><span class="value">Choose</span></button></div>',
  )
  const result = await page.evaluate(async () => {
    const trigger = document.querySelector('[role=combobox]')!
    trigger.addEventListener('click', () => {
      const existing = document.getElementById('virtual-options')
      if (existing) {
        existing.remove()
        trigger.setAttribute('aria-expanded', 'false')
        return
      }
      const list = document.createElement('div')
      list.id = 'virtual-options'
      list.className = 'virtual-viewport'
      list.setAttribute('role', 'listbox')
      list.style.cssText = 'height:100px;width:300px;overflow-y:auto;position:relative'
      const render = () => {
        list.innerHTML = '<div style="height:2000px"></div>'
        const start = Math.floor(list.scrollTop / 20)
        for (let i = start; i < Math.min(start + 5, 100); i++) {
          const option = document.createElement('div')
          option.setAttribute('role', 'option')
          option.textContent = `Option ${i}`
          option.style.cssText = `height:20px;position:absolute;top:${i * 20}px`
          option.addEventListener('click', () => {
            trigger.querySelector('.value')!.textContent = option.textContent
            list.remove()
            trigger.setAttribute('aria-expanded', 'false')
          })
          list.appendChild(option)
        }
      }
      list.addEventListener('scroll', render)
      document.body.appendChild(list)
      trigger.setAttribute('aria-expanded', 'true')
      render()
    })
    const field = window.qf.scanForms().fields[0]
    await window.qf.probeFields([field])
    return window.qf.applyFill([
      {
        detectedFieldId: field.id,
        selectorCandidates: field.selectorCandidates,
        frame: field.frame,
        shadow: field.shadow,
        inputType: field.inputType,
        tagName: field.tagName,
        fillStrategy: 'customSelect',
        customWidget: field.customWidget,
        proposedValue: 'Option 80',
      },
    ])
  })
  expect(result.results[0].status).toBe('success')
  await expect(page.locator('.value')).toHaveText('Option 80')
})

test('a cancelled async widget never clicks a late arriving option', async ({ page }) => {
  await page.evaluate(() => window.qf.mountReactWidgets('reactAsync', 800))
  await expect(page.getByRole('combobox', { name: 'Choice' })).toBeVisible()
  const outcome = await page.evaluate(async () => {
    const field = window.qf.scanForms().fields.find((f) => f.customWidget)!
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 100)
    return window.qf.applyFill(
      [
        {
          detectedFieldId: field.id,
          selectorCandidates: field.selectorCandidates,
          frame: field.frame,
          shadow: field.shadow,
          inputType: field.inputType,
          tagName: field.tagName,
          fillStrategy: 'customSelect',
          customWidget: field.customWidget,
          proposedValue: 'Editor',
        },
      ],
      document,
      { signal: controller.signal },
    )
  })
  expect(outcome.results[0].status).toBe('skipped')
  await expect(page.getByRole('option', { name: 'Editor' })).toBeVisible()
  await expect(page.locator('form')).toHaveAttribute('data-selection', 'null')
})

test('manual search text entered while local probing waits is preserved', async ({ page }) => {
  await page.evaluate(() => window.qf.mountReactWidgets('reactAsync', 2000))
  await expect(page.getByRole('combobox', { name: 'Choice' })).toBeVisible()
  await page.evaluate(() => window.qf.mountOverlay())
  await buttons(page).click()
  const input = page.getByRole('combobox', { name: 'Choice' })
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await input.fill('My manual search')
  await expect(page.getByRole('status')).toHaveText('1/2 filled · 1 skipped')
  await expect(input).toHaveValue('My manual search')
  await expect(page.locator('form')).toHaveAttribute('data-selection', 'null')
})

test('an unreachable keyboard target never commits the currently active foreign value', async ({
  page,
}) => {
  await html(
    page,
    '<input id="choice" role="combobox" aria-label="Choice" aria-expanded="true" aria-controls="choices" aria-activedescendant="wrong"><div id="choices" role="listbox"><div id="wrong" role="option">Wrong</div><div id="wanted" role="option">Target</div></div>',
  )
  const result = await page.evaluate(async () => {
    const input = document.getElementById('choice') as HTMLInputElement
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        input.value = 'Wrong'
        input.dataset.entered = 'true'
      }
    })
    const field = window.qf.scanForms().fields[0]
    return window.qf.applyFill([
      {
        detectedFieldId: field.id,
        selectorCandidates: field.selectorCandidates,
        frame: field.frame,
        shadow: field.shadow,
        tagName: field.tagName,
        inputType: field.inputType,
        customWidget: field.customWidget,
        fillStrategy: 'customSelect',
        proposedValue: 'Target',
      },
    ])
  })
  expect(result.results[0].status).toBe('failed')
  await expect(page.locator('#choice')).toHaveValue('')
  await expect(page.locator('#choice')).not.toHaveAttribute('data-entered')
})

test('an empty remote list is reported as skipped and is never guessed', async ({ page }) => {
  await html(
    page,
    '<form><input name="email" type="email"><input name="remote" role="combobox" aria-label="Remote" aria-controls="remote-options" aria-expanded="false"></form>',
  )
  await page.evaluate(() => {
    const input = document.querySelector('[name=remote]')!
    input.addEventListener('click', () => {
      if (!document.getElementById('remote-options')) {
        const list = document.createElement('div')
        list.id = 'remote-options'
        list.setAttribute('role', 'listbox')
        list.textContent = 'No results'
        document.body.appendChild(list)
      }
      input.setAttribute('aria-expanded', 'true')
    })
    window.qf.mountOverlay()
  })
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText('1/2 filled · 1 skipped', { timeout: 10000 })
  await page.locator('#quikfill-overlay-host summary').click()
  await expect(page.locator('#quikfill-overlay-host li').last()).toContainText(
    'Options were not available',
  )
  await expect(page.locator('input[name=remote]')).toHaveValue('')
})

test('multiselect undo preserves a subsequent manual removal', async ({ page }) => {
  await page.evaluate(() => window.qf.mountReactWidgets('reactMulti'))
  await expect(page.getByRole('combobox', { name: 'Choice' })).toBeVisible()
  await page.evaluate(() => window.qf.mountOverlay())
  await buttons(page).click()
  await expect(page.getByRole('status')).toHaveText('2/2 filled')
  await page.getByRole('button', { name: 'Remove Doe, Jane', exact: true }).click()
  await page.getByRole('button', { name: 'Undo fill' }).click()
  await expect(page.getByRole('status')).toHaveText('1/2 restored')
  await page.getByRole('button', { name: 'Rerender widgets' }).click()
  await expect(page.locator('form')).toHaveAttribute('data-selection', '[]')
})

test('Radix single-select undo restores the previous framework choice after re-render', async ({
  page,
}) => {
  await page.evaluate(() => window.qf.mountReactWidgets('radixRestore'))
  await expect(page.getByRole('combobox', { name: 'Choice' })).toContainText('Reviewer')
  const outcome = await page.evaluate(async () => {
    const field = window.qf.scanForms().fields.find((f) => f.customWidget)!
    await window.qf.probeFields([field])
    return window.qf.applyFill([
      {
        detectedFieldId: field.id,
        selectorCandidates: field.selectorCandidates,
        frame: field.frame,
        shadow: field.shadow,
        tagName: field.tagName,
        inputType: field.inputType,
        customWidget: field.customWidget,
        fillStrategy: 'customSelect',
        proposedValue: 'Editor',
      },
    ])
  })
  expect(outcome.results[0].status).toBe('success')
  await page.getByRole('button', { name: 'Rerender widgets' }).click()
  await expect(page.locator('form')).toHaveAttribute('data-selection', 'chosen')
  const restored = await page.evaluate(
    (snapshot) => window.qf.applyUndo(snapshot),
    outcome.undoSnapshot,
  )
  expect(restored[0].status).toBe('success')
  await page.getByRole('button', { name: 'Rerender widgets' }).click()
  await expect(page.locator('form')).toHaveAttribute('data-selection', 'previous')
  expect(
    await page
      .locator('form')
      .evaluate((form) => new FormData(form as HTMLFormElement).get('choice')),
  ).toBe('previous')
})

test('equal option labels without unique values are reported for manual selection', async ({
  page,
}) => {
  await html(
    page,
    '<button role="combobox" aria-label="Choice" aria-expanded="true" aria-controls="ambiguous">Choose</button><div id="ambiguous" role="listbox"><div role="option">Editor</div><div role="option">Editor</div></div>',
  )
  const result = await page.evaluate(async () => {
    for (const option of document.querySelectorAll('[role=option]'))
      option.addEventListener('click', () => {
        document.body.dataset.optionClicked = 'true'
      })
    const field = window.qf.scanForms().fields[0]
    return window.qf.applyFill([
      {
        detectedFieldId: field.id,
        selectorCandidates: field.selectorCandidates,
        frame: field.frame,
        shadow: field.shadow,
        tagName: field.tagName,
        inputType: field.inputType,
        customWidget: field.customWidget,
        fillStrategy: 'customSelect',
        proposedValue: 'Editor',
      },
    ])
  })
  expect(result.results[0].status).toBe('assisted')
  await expect(page.locator('body')).not.toHaveAttribute('data-option-clicked')
  await expect(page.getByRole('combobox')).toHaveText('Choose')
})
