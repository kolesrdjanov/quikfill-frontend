import { expect, test } from '@playwright/test'
import { html, instruction, widget } from './form-fixture'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!window.qf)
})

test('datepicker fill never clicks Save or submits the form; normal submit still works afterwards', async ({
  page,
}) => {
  await html(
    page,
    `<form id="form" data-submits="0" data-save-clicks="0"><div id="date">
    <input id="date-input" readonly><span class="calendar-title">June 2032</span>
    <div role="grid"><button type="button" role="gridcell" aria-label="June 15, 2032">15</button></div>
    </div><button type="submit" id="save">Save</button></form>`,
  )
  await page.evaluate(() => {
    const form = document.getElementById('form')!
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      form.dataset.submits = String(Number(form.dataset.submits) + 1)
    })
    document.getElementById('save')!.addEventListener('click', () => {
      form.dataset.saveClicks = String(Number(form.dataset.saveClicks) + 1)
    })
    document.querySelector('[role="gridcell"]')!.addEventListener('click', () => {
      ;(document.getElementById('date-input') as HTMLInputElement).value = '2032-06-15'
    })
  })
  const outcome = await page.evaluate(
    (ins) => window.qf.applyFill([ins]),
    instruction('date', '2032-06-15', {
      fillStrategy: 'customSelect',
      customWidget: {
        ...widget,
        kind: 'datepicker',
        valueDisplaySelectorCandidates: ['#date-input'],
      },
    }),
  )
  expect(outcome.results[0].status).toBe('success')
  await expect(page.locator('#form')).toHaveAttribute('data-submits', '0')
  await expect(page.locator('#form')).toHaveAttribute('data-save-clicks', '0')
  await page.locator('#save').click()
  await expect(page.locator('#form')).toHaveAttribute('data-submits', '1')
})

test('invalid number and sign-changing input are reported as failed', async ({ page }) => {
  await html(
    page,
    '<input id="age" type="number" min="18" max="99"><input id="amount" type="number">',
  )
  await page.locator('#amount').evaluate((el) =>
    el.addEventListener('input', () => {
      ;(el as HTMLInputElement).value = '100'
    }),
  )
  const outcome = await page.evaluate(
    (instructions) => window.qf.applyFill(instructions),
    [
      instruction('age', '200', { inputType: 'number' }),
      instruction('amount', '-100', { inputType: 'number' }),
    ],
  )
  expect(outcome.results.map((r) => r.status)).toEqual(['failed', 'failed'])
})

test('script-assigned text must satisfy length constraints even when browser validity accepts it', async ({
  page,
}) => {
  await html(
    page,
    '<input id="short" minlength="5"><input id="long" maxlength="5"><input id="valid" maxlength="5">',
  )
  const outcome = await page.evaluate(
    (instructions) => window.qf.applyFill(instructions),
    [instruction('short', 'abc'), instruction('long', 'abcdef'), instruction('valid', 'abcde')],
  )
  expect(outcome.results.map((result) => result.status)).toEqual(['failed', 'failed', 'success'])
})

test('React controlled checkbox updates state, survives a render, and restores through undo', async ({
  page,
}) => {
  await page.evaluate(() => window.qf.mountReact())
  await expect(page.locator('#react-check')).toBeVisible()
  const outcome = await page.evaluate(
    (ins) => window.qf.applyFill([ins]),
    instruction('react-check', 'true', {
      inputType: 'checkbox',
      fillStrategy: 'clickToggle',
    }),
  )
  expect(outcome.results[0].status).toBe('success')
  await expect.poll(() => page.evaluate(() => window.qf.reactState.checked)).toBe(true)
  await page.evaluate(() => window.qf.reactState.rerender())
  await expect(page.locator('form')).toHaveAttribute('data-tick', '1')
  await expect(page.locator('#react-check')).toBeChecked()
  const restored = await page.evaluate(
    (snapshot) => window.qf.applyUndo(snapshot),
    outcome.undoSnapshot,
  )
  expect(restored[0].status).toBe('success')
  await expect.poll(() => page.evaluate(() => window.qf.reactState.checked)).toBe(false)
  await expect(page.locator('#react-check')).not.toBeChecked()
})

test('a changed month is not accepted as the requested date', async ({ page }) => {
  await html(page, '<input id="date">')
  await page.locator('#date').evaluate((el) =>
    el.addEventListener('input', () => {
      ;(el as HTMLInputElement).value = '2032-07-15'
    }),
  )
  const outcome = await page.evaluate(
    (ins) => window.qf.applyFill([ins]),
    instruction('date', '2032-06-15', {
      fillStrategy: 'customSelect',
      customWidget: { ...widget, kind: 'datepicker' },
    }),
  )
  expect(outcome.results[0].status).not.toBe('success')
})

test('dropdown display changing to Loading does not count as a selection', async ({ page }) => {
  await html(
    page,
    '<div id="country"><button type="button" role="combobox"><span class="value">Choose</span></button><div role="option">Serbia</div></div>',
  )
  await page.locator('[role="option"]').evaluate((el) =>
    el.addEventListener('click', () => {
      document.querySelector('.value')!.textContent = 'Loading…'
    }),
  )
  const outcome = await page.evaluate(
    (ins) => window.qf.applyFill([ins]),
    instruction('country', 'Serbia', {
      fillStrategy: 'customSelect',
      customWidget: widget,
    }),
  )
  expect(outcome.results[0].status).toBe('failed')
})

test('a missing probed option is never replaced by a random option or a foreign hidden list', async ({
  page,
}) => {
  await html(
    page,
    '<div id="country"><button type="button" role="combobox"><span class="value">Choose</span></button><div role="option">Alpha</div><div role="option">Beta</div></div><div hidden><div role="option">Ghost</div></div>',
  )
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[role="option"]'))
      el.addEventListener('click', () => {
        document.querySelector('.value')!.textContent = el.textContent
      })
  })
  const outcome = await page.evaluate(
    (ins) => window.qf.applyFill([ins]),
    instruction('country', 'Ghost', {
      fillStrategy: 'customSelect',
      customWidget: { ...widget, optionsProbed: true },
    }),
  )
  expect(outcome.results[0].status).toBe('assisted')
  await expect(page.locator('.value')).toHaveText('Choose')
})

test('same-name radio groups in different forms remain independent', async ({ page }) => {
  await html(
    page,
    '<form id="first"><input type="radio" name="status" value="a"><input type="radio" name="status" value="b"></form><form id="second"><input type="radio" name="status" value="a" checked><input type="radio" name="status" value="b"></form>',
  )
  const outcome = await page.evaluate(async () => {
    const fields = window.qf.scanForms().fields
    const instructions = window.qf.valuesToFillInstructions(
      [{ fieldId: fields[0].id, value: 'b' }],
      fields,
    )
    return { fields: fields.length, outcome: await window.qf.applyFill(instructions) }
  })
  expect(outcome.fields).toBe(2)
  expect(outcome.outcome.results[0].status).toBe('success')
  await expect(page.locator('#first input[value=b]')).toBeChecked()
  await expect(page.locator('#second input[value=a]')).toBeChecked()
})

test('shadow rescans resolve the live field and composed input reaches the host page', async ({
  page,
}) => {
  await html(page, '<div id="shadow-host"></div>')
  const result = await page.evaluate(async () => {
    const shadow = document.getElementById('shadow-host')!.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<input id="old" aria-label="Old"><input id="live" aria-label="Live">'
    window.qf.scanForms()
    ;(shadow.querySelector('#old') as HTMLInputElement).disabled = true
    const fields = window.qf.scanForms().fields
    let seen = 0
    document.addEventListener(
      'input',
      () => {
        seen++
      },
      { once: true },
    )
    const outcome = await window.qf.applyFill(
      window.qf.valuesToFillInstructions([{ fieldId: fields[0].id, value: 'Hello' }], fields),
    )
    return { outcome, seen, value: (shadow.querySelector('#live') as HTMLInputElement).value }
  })
  expect(result.value).toBe('Hello')
  expect(result.seen).toBe(1)
  expect(result.outcome.results[0].status).toBe('success')
})

test('bound execution skips a replacement control with the same selector', async ({ page }) => {
  await html(page, '<form id="form"><input id="name" aria-label="Name"></form>')
  const outcome = await page.evaluate(async () => {
    const root = document.getElementById('form')!
    const fields = window.qf.scanForms(root).fields
    const targets = window.qf.captureFillTargets(fields, root)
    root.innerHTML = '<input id="name" aria-label="Name">'
    return window.qf.applyFill(
      window.qf.valuesToFillInstructions([{ fieldId: fields[0].id, value: 'Wrong' }], fields),
      root,
      { targets },
    )
  })
  expect(outcome.results[0].status).toBe('skipped')
  await expect(page.locator('#name')).toHaveValue('')
})

test('linked portal selection ignores an unrelated visible list', async ({ page }) => {
  await html(
    page,
    '<form id="form"><div id="country"><button type="button" role="combobox" aria-controls="owned"><span class="value">Choose</span></button></div></form><div role="listbox" id="foreign"><div role="option">Serbia</div></div><div role="listbox" id="owned"><div role="option">Serbia</div></div>',
  )
  await page.evaluate(() => {
    for (const id of ['owned', 'foreign'])
      document.querySelector(`#${id} [role=option]`)!.addEventListener('click', () => {
        document.querySelector('.value')!.textContent = id === 'owned' ? 'Serbia' : 'WRONG'
      })
  })
  const outcome = await page.evaluate(
    (ins) => window.qf.applyFill([ins], document.getElementById('form')!),
    instruction('country', 'Serbia', { fillStrategy: 'customSelect', customWidget: widget }),
  )
  expect(outcome.results[0].status).toBe('success')
  await expect(page.locator('.value')).toHaveText('Serbia')
})

test('two unlinked popups appearing together are treated as ambiguous', async ({ page }) => {
  await html(
    page,
    '<div id="country"><button type="button" role="combobox"><span class="value">Choose</span></button></div>',
  )
  await page.evaluate(() => {
    document.querySelector('[role=combobox]')!.addEventListener('click', () => {
      for (let i = 0; i < 2; i++) {
        const popup = document.createElement('div')
        popup.setAttribute('role', 'listbox')
        popup.innerHTML = '<div role="option">Serbia</div>'
        popup.addEventListener('click', () => {
          document.querySelector('.value')!.textContent = 'WRONG'
        })
        document.body.appendChild(popup)
      }
    })
  })
  const outcome = await page.evaluate(
    (ins) => window.qf.applyFill([ins]),
    instruction('country', 'Serbia', { fillStrategy: 'customSelect', customWidget: widget }),
  )
  expect(outcome.results[0].status).toBe('assisted')
  await expect(page.locator('.value')).toHaveText('Choose')
})
