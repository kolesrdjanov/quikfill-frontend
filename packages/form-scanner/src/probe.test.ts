import { beforeEach, describe, expect, it } from 'vitest'
import type { DetectedField, FillInstruction } from '@quikfill/schemas'
import { applyFill } from './fill'
import { probeFields } from './probe'
import { scanForms } from './scan'

/**
 * SCAN-TIME WIDGET PROBE
 * ======================
 * The probe opens each on-demand custom select, harvests the options that render,
 * and closes it — so a dropdown whose list mounts only on expand still yields a
 * real value set (the bug: such widgets reached the AI with ZERO options, the AI
 * invented a label, the fill matched nothing). The first cases reconstruct the
 * actual failing app's Role dropdown and react-datepicker (captured DOM, reduced).
 */

/** Build the customSelect instruction the production pipeline hands `applyFill`. */
function toInstruction(field: DetectedField, value: string): FillInstruction {
  return {
    detectedFieldId: field.id,
    selectorCandidates: field.selectorCandidates,
    frame: field.frame,
    shadow: field.shadow,
    tagName: field.tagName,
    inputType: field.inputType,
    fillStrategy: 'customSelect',
    proposedValue: value,
    customWidget: field.customWidget,
  }
}

const ROLE_LABELS = ['Marko', 'Milos', 'Full Permissions', 'No permissions', 'Kobac']

/**
 * The failing app's Role dropdown (captured closed): a `data-trigger="select"`
 * trigger whose option panel renders INSIDE the field container on expand and
 * unmounts on collapse. Mirrors the live behaviour: trigger click toggles, option
 * click selects + closes.
 */
function mountRoleDropdown(): { trigger: HTMLElement; clicks: () => number } {
  document.body.innerHTML = `
    <div data-test-id="role-id" name="roleId" class="relative flex flex-col">
      <label for="_r_8f_">Role</label>
      <div class="relative">
        <div role="button" data-trigger="select" class="select group relative flex" aria-expanded="false">
          <div class="flex items-center">
            <div class="select-value-container flex gap-1">
              <p class="placeholder">Please Choose</p>
            </div>
          </div>
          <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"></path></svg>
        </div>
      </div>
    </div>`
  const trigger = document.querySelector('[data-trigger="select"]') as HTMLElement
  const container = document.querySelector(
    '.relative .relative, [name="roleId"] > .relative',
  ) as HTMLElement
  let panel: HTMLElement | null = null
  let clicks = 0

  const close = (): void => {
    panel?.remove()
    panel = null
    trigger.setAttribute('aria-expanded', 'false')
  }
  const open = (): void => {
    container.insertAdjacentHTML(
      'beforeend',
      `<div class="absolute z-15"><div tabindex="0" class="dropdown flex w-full flex-col">${ROLE_LABELS.map(
        (l) =>
          `<div role="button" class="rounded px-3 py-1 transition-colors" aria-label="Select option">${l}</div>`,
      ).join('')}</div></div>`,
    )
    panel = container.querySelector('.dropdown') as HTMLElement
    trigger.setAttribute('aria-expanded', 'true')
    for (const opt of Array.from(panel.querySelectorAll('[role="button"]'))) {
      opt.addEventListener('click', () => {
        const p = document.querySelector('.placeholder')
        if (p) p.textContent = opt.textContent
        close()
      })
    }
  }
  trigger.addEventListener('click', () => {
    clicks++
    if (panel) close()
    else open()
  })
  return { trigger, clicks: () => clicks }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('probeFields — on-demand custom select (the failing app’s Role dropdown)', () => {
  it('opens the widget, harvests the real options, and closes it again', async () => {
    mountRoleDropdown()
    const { fields } = scanForms(document.body)
    const field = fields.find((f) => f.inputType === 'customSelect')
    expect(field, 'scan detects the closed select').toBeDefined()
    expect(field!.options ?? []).toHaveLength(0) // closed → the scan saw no options

    await probeFields(fields)

    expect(field!.options?.map((o) => o.label)).toEqual(ROLE_LABELS)
    expect(field!.customWidget?.optionsProbed).toBe(true)
    expect(field!.customWidget?.remoteOptions).toBeUndefined()
    // Closed again: the panel unmounted and the trigger reports collapsed.
    expect(document.querySelector('.dropdown')).toBeNull()
    expect(document.querySelector('[data-trigger="select"]')!.getAttribute('aria-expanded')).toBe(
      'false',
    )
  })

  it('fills end-to-end with a harvested label: reopen → re-match → click (labels survive unmount)', async () => {
    mountRoleDropdown()
    const { fields } = scanForms(document.body)
    await probeFields(fields)
    const field = fields.find((f) => f.inputType === 'customSelect')!
    const pick = field.options![3].label // "No permissions" — as the local random pick would

    const { results } = await applyFill([toInstruction(field, pick)])

    expect(results[0].status).toBe('success')
    expect(document.querySelector('.placeholder')!.textContent).toBe('No permissions')
    expect(document.querySelector('.dropdown')).toBeNull() // selection closed the list
  })

  it('skips widgets whose options were already visible at scan time (no needless flicker)', async () => {
    document.body.innerHTML = `
      <div id="cat" data-test-id="cat" name="cat">
        <label>Category</label>
        <div role="button" data-trigger="select" id="trigger"><div class="val">Locker</div></div>
        <div class="dropdown">
          <div role="button" aria-label="Select option">Locker</div>
          <div role="button" aria-label="Select option">Office</div>
        </div>
      </div>`
    let clicks = 0
    document.getElementById('trigger')!.addEventListener('click', () => clicks++)
    const { fields } = scanForms(document.body)
    const field = fields.find((f) => f.inputType === 'customSelect')!
    expect(field.options?.length).toBe(2)

    await probeFields(fields)

    expect(clicks).toBe(0) // already harvested at scan — never opened
    expect(field.customWidget?.optionsProbed).toBeUndefined()
  })

  it('marks a remote select (options never render) and leaves its options empty', async () => {
    document.body.innerHTML = `
      <div data-test-id="dept" name="dept">
        <label>Department</label>
        <div class="relative">
          <div role="button" data-trigger="select" aria-expanded="false">
            <p class="placeholder">Please Choose</p>
          </div>
        </div>
      </div>`
    const trigger = document.querySelector('[data-trigger="select"]') as HTMLElement
    // The live widget fires a fetch and renders only a spinner row — options never come.
    trigger.addEventListener('click', () => {
      trigger.setAttribute('aria-expanded', 'true')
      trigger.parentElement!.insertAdjacentHTML(
        'beforeend',
        '<div class="dropdown"><div class="spinner">Loading…</div></div>',
      )
    })
    const { fields } = scanForms(document.body)
    const field = fields.find((f) => f.inputType === 'customSelect')!

    await probeFields(fields)

    expect(field.customWidget?.remoteOptions).toBe(true)
    expect(field.customWidget?.optionsProbed).toBeUndefined()
    expect(field.options ?? []).toHaveLength(0)
  })

  it('discovers a zero-ARIA portaled panel via the mutation diff (repeating-sibling rows)', async () => {
    document.body.innerHTML = `
      <div data-test-id="plan" name="plan">
        <label>Plan</label>
        <div class="relative">
          <div role="button" data-trigger="select" aria-expanded="false">
            <p class="placeholder">Please Choose</p>
          </div>
        </div>
      </div>`
    const trigger = document.querySelector('[data-trigger="select"]') as HTMLElement
    const LABELS = ['Starter', 'Growth', 'Scale']
    let panel: HTMLElement | null = null
    const close = (): void => {
      panel?.remove()
      panel = null
      trigger.setAttribute('aria-expanded', 'false')
    }
    trigger.addEventListener('click', () => {
      if (panel) {
        close()
        return
      }
      // Portaled to <body>, rows are plain styled divs — no ARIA, no list markup.
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div class="floating-panel">${LABELS.map(
          (l) => `<div class="opt-row cursor-pointer">${l}</div>`,
        ).join('')}</div>`,
      )
      panel = document.querySelector('.floating-panel') as HTMLElement
      trigger.setAttribute('aria-expanded', 'true')
      for (const row of Array.from(panel.querySelectorAll('.opt-row'))) {
        row.addEventListener('click', () => {
          const p = document.querySelector('.placeholder')
          if (p) p.textContent = row.textContent
          close()
        })
      }
    })

    const { fields } = scanForms(document.body)
    const field = fields.find((f) => f.inputType === 'customSelect')!
    await probeFields(fields)

    expect(field.options?.map((o) => o.label)).toEqual(LABELS)
    expect(field.customWidget?.optionsProbed).toBe(true)
    // The probe derived a durable selector so the fill can re-find the rows.
    expect(field.customWidget?.optionItemSelector).toContain('div[class="opt-row cursor-pointer"]')
    expect(document.querySelector('.floating-panel')).toBeNull() // closed again

    // End-to-end: reopen, re-discover the portaled rows, click the pick.
    const { results } = await applyFill([toInstruction(field, 'Growth')])
    expect(results[0].status).toBe('success')
    expect(document.querySelector('.placeholder')!.textContent).toBe('Growth')
  })
})

// --- Datepicker probing ------------------------------------------------------

/**
 * The failing app's react-datepicker (captured open, reduced): the closed DOM is a
 * bare text input; clicking it mounts a popper whose custom header reads
 * "June 2032", whose prev-month nav is DISABLED (a min-date picker), and whose
 * day cells are role=option with ordinal aria-labels.
 */
function mountDatepicker(): { input: HTMLInputElement } {
  document.body.innerHTML = `
    <div class="flex-1">
      <div class="datepicker"><div><div class="datepicker-container">
        <div class="react-datepicker-wrapper"><div class="react-datepicker__input-container">
          <input id="_r_s7_" placeholder="mm / dd / yyyy" autocomplete="off" type="text" value=""
                 name="leases.8f7dc524.customPaidThroughDate" />
        </div></div>
      </div></div></div>
    </div>`
  const input = document.getElementById('_r_s7_') as HTMLInputElement
  const host = document.querySelector('.datepicker-container') as HTMLElement
  let popper: HTMLElement | null = null

  const dayCell = (day: number, opts: { disabled?: boolean; outside?: boolean } = {}): string => {
    const ord = day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'
    const cls = `react-datepicker__day react-datepicker__day--0${day}${
      opts.disabled ? ' react-datepicker__day--disabled' : ''
    }${opts.outside ? ' react-datepicker__day--outside-month' : ''}`
    const label = opts.disabled
      ? `Not available Sunday, May ${day}${ord}, 2032`
      : `Choose Tuesday, June ${day}${ord}, 2032`
    return `<div class="${cls}" role="option" aria-disabled="${!!opts.disabled}" aria-label="${label}">${day}</div>`
  }
  const open = (): void => {
    if (popper) return
    host.insertAdjacentHTML(
      'beforeend',
      `<div class="react-datepicker__tab-loop">
        <div class="react-datepicker-popper">
          <div class="react-datepicker" role="dialog" aria-label="Choose Date">
            <span role="alert" aria-live="polite" class="react-datepicker__aria-live"></span>
            <div class="react-datepicker__month-container">
              <div class="react-datepicker__header react-datepicker__header--custom">
                <div class="flex items-center justify-between">
                  <button class="flex disabled:text-grey-300" type="button" disabled=""
                          data-test-id="prev-month-button"><svg viewBox="0 0 24 24"></svg></button>
                  <div class="flex items-center"><p class="font-medium text-lg">June 2032</p></div>
                  <button class="flex disabled:text-grey-300" type="button"
                          data-test-id="next-month-button"><svg viewBox="0 0 24 24"></svg></button>
                </div>
                <div class="react-datepicker__day-names">
                  <div aria-label="Sunday" class="react-datepicker__day-name">S</div>
                  <div aria-label="Monday" class="react-datepicker__day-name">M</div>
                </div>
              </div>
              <div class="react-datepicker__month" role="listbox">
                <div class="react-datepicker__week">
                  ${dayCell(30, { disabled: true, outside: true })}
                  ${dayCell(31, { disabled: true, outside: true })}
                  ${[1, 2, 3, 4, 5].map((d) => dayCell(d)).join('')}
                </div>
                <div class="react-datepicker__week">
                  ${[6, 7, 8, 9, 10, 11, 12].map((d) => dayCell(d)).join('')}
                </div>
                <div class="react-datepicker__week">
                  ${[13, 14, 15, 16, 17, 18, 19].map((d) => dayCell(d)).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`,
    )
    popper = host.querySelector('.react-datepicker__tab-loop') as HTMLElement
    for (const cell of Array.from(
      popper.querySelectorAll('[role="option"]:not([aria-disabled="true"])'),
    )) {
      cell.addEventListener('click', () => {
        const day = String(cell.textContent).padStart(2, '0')
        input.value = `06 / ${day} / 2032`
        closePopper()
      })
    }
  }
  const closePopper = (): void => {
    popper?.remove()
    popper = null
  }
  input.addEventListener('mousedown', open)
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') closePopper()
  })
  return { input }
}

describe('probeFields — datepicker input (react-datepicker, min-constrained)', () => {
  it('detects the calendar, reads its min date, attaches a datepicker descriptor, and closes it', async () => {
    mountDatepicker()
    const { fields } = scanForms(document.body)
    const field = fields.find((f) => f.tagName === 'input')!
    expect(field.customWidget).toBeUndefined() // closed: just a text input

    await probeFields(fields)

    expect(field.customWidget?.kind).toBe('datepicker')
    // Prev nav disabled + first enabled cell = June 1 ⇒ the calendar PROVED its min.
    expect(field.min).toBe('2032-06-01')
    expect(field.max).toBeUndefined() // next nav enabled — max unknown, never claimed
    expect(document.querySelector('.react-datepicker__tab-loop')).toBeNull() // Escape closed it
  })

  it('fills the probed datepicker by clicking the day cell when typing is rejected', async () => {
    const { input } = mountDatepicker()
    // A constrained picker REJECTS typed text on blur/parse (the way react-datepicker
    // with a minDate clears a typed-in out-of-range value) — only its own cell picks
    // (formatted "06 / dd / 2032") survive.
    input.addEventListener('blur', () => {
      if (!/^06 \/ \d{2} \/ 2032$/.test(input.value)) input.value = ''
    })
    const { fields } = scanForms(document.body)
    await probeFields(fields)
    const field = fields.find((f) => f.tagName === 'input')!

    const { results } = await applyFill([toInstruction(field, '06/15/2032')])

    expect(results[0].status).toBe('success')
    expect(input.value).toBe('06 / 15 / 2032')
  })

  it('leaves a non-date text input untouched (no clicks, no descriptor)', async () => {
    document.body.innerHTML = `
      <div><label for="em">Email</label><input id="em" type="text" placeholder="you@example.com" /></div>`
    let clicks = 0
    document.getElementById('em')!.addEventListener('mousedown', () => clicks++)
    const { fields } = scanForms(document.body)

    await probeFields(fields)

    const field = fields.find((f) => f.domId === 'em')!
    expect(clicks).toBe(0)
    expect(field.customWidget).toBeUndefined()
    expect(field.min).toBeUndefined()
  })
})

/**
 * @vuepic/vue-datepicker (captured, reduced): unlike react-datepicker, its visible
 * `<input>` is READONLY — you pick from the calendar, you never type — and it carries
 * no ARIA, so the scan must rescue it from the read-only skip on its date placeholder /
 * `dp__`/`input--datepicker` container classes. Clicking the input mounts a
 * `role="grid"` calendar of `dp__cell_inner` cells; a cell click writes the value.
 */
function mountVueDatepicker(): { input: HTMLInputElement } {
  document.body.innerHTML = `
    <div class="col-span-12 lg:col-span-6">
      <div class="input--datepicker__wrapper relative">
        <label class="fw-700 flex items-center">Birthday</label>
        <div class="dp__main dp__theme_light" data-datepicker-instance data-test-id="subscriber_dob">
          <div class="dp__input_wrap">
            <div class="input--datepicker">
              <input class="input-primary fs-unmask" placeholder="MM/DD/YYYY" readonly value="" />
            </div>
          </div>
          <div class="dp--menu-wrapper dp__outer_menu_wrap"></div>
        </div>
      </div>
    </div>`
  const input = document.querySelector('input') as HTMLInputElement
  const menuHost = document.querySelector('.dp--menu-wrapper') as HTMLElement
  let menu: HTMLElement | null = null

  const dayCell = (day: number): string =>
    `<div class="dp__cell_inner" role="gridcell" aria-label="June ${day}, 2000">${day}</div>`
  const open = (): void => {
    if (menu) return
    menuHost.insertAdjacentHTML(
      'beforeend',
      `<div class="dp__menu" role="dialog" aria-label="Calendar">
        <div class="dp__month_year_row"><div class="dp__month_year_wrap">June 2000</div></div>
        <div class="dp__calendar" role="grid">
          ${Array.from({ length: 30 }, (_, i) => dayCell(i + 1)).join('')}
        </div>
      </div>`,
    )
    menu = menuHost.querySelector('.dp__menu') as HTMLElement
    for (const cell of Array.from(menu.querySelectorAll('.dp__cell_inner'))) {
      cell.addEventListener('click', () => {
        input.value = `06/${String(cell.textContent).padStart(2, '0')}/2000`
        close()
      })
    }
  }
  const close = (): void => {
    menu?.remove()
    menu = null
  }
  input.addEventListener('mousedown', open)
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') close()
  })
  return { input }
}

describe('probeFields — readonly datepicker input (@vuepic/vue-datepicker)', () => {
  it('survives the read-only skip at scan time and probes to a datepicker', async () => {
    mountVueDatepicker()
    const { fields } = scanForms(document.body)
    const field = fields.find((f) => f.labelText === 'Birthday')
    expect(field).toBeDefined() // not dropped by the readonly gate
    expect(field!.readonly).toBe(true)
    expect(field!.customWidget).toBeUndefined() // closed: just a readonly text input

    await probeFields(fields)

    expect(field!.customWidget?.kind).toBe('datepicker')
    expect(document.querySelector('.dp__menu')).toBeNull() // Escape closed it
  })

  it('fills the readonly picker by clicking the day cell (typing is impossible)', async () => {
    const { input } = mountVueDatepicker()
    const { fields } = scanForms(document.body)
    await probeFields(fields)
    const field = fields.find((f) => f.labelText === 'Birthday')!

    const { results } = await applyFill([toInstruction(field, '06/15/2000')])

    expect(results[0].status).toBe('success')
    expect(input.value).toBe('06/15/2000')
  })
})
