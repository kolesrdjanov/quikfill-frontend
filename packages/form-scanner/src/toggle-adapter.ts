import { clickElement } from './widget-dom'

/** Read framework-owned state; never assign ARIA attributes to simulate selection. */
export function isAriaToggle(el: Element): boolean {
  return el.matches('[role="checkbox"], [role="switch"], [role="radio"]') && !el.matches('input')
}
export function isToggle(el: Element): boolean {
  return el.matches('input[type="checkbox"], input[type="radio"]') || isAriaToggle(el)
}
export function checkedState(el: Element): boolean {
  return isAriaToggle(el)
    ? el.getAttribute('aria-checked') === 'true'
    : (el as HTMLInputElement).checked
}
export function toggleValue(el: Element): string {
  return el.matches('input')
    ? (el as HTMLInputElement).value
    : (el.getAttribute('data-value') ??
        el.getAttribute('aria-label') ??
        el.textContent?.trim() ??
        '')
}
export function activateToggle(el: Element, checked: boolean): void {
  if (checkedState(el) === checked && el.getAttribute('aria-checked') !== 'mixed') return
  if (isAriaToggle(el)) clickElement(el)
  else if ((el as HTMLInputElement).type === 'radio' && !checked) {
    // Native radio undo from a previously empty group is handled as manual.
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'checked')?.set?.call(el, false)
    for (const type of ['input', 'change'])
      el.dispatchEvent(new Event(type, { bubbles: true, composed: true }))
  } else (el as HTMLInputElement).click()
}
