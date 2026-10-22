import type { Page } from '@playwright/test'
import type { CustomWidget, FillInstruction } from '../../../packages/schemas/src'

export const widget: CustomWidget = {
  kind: 'select',
  triggerSelectorCandidates: [],
  valueDisplaySelectorCandidates: ['.value'],
  optionItemSelector: '[role="option"]',
  optionsOpenOnDemand: true,
  isSearchable: false,
  isVirtualized: false,
}
export function instruction(
  id: string,
  value: string,
  extra: Partial<FillInstruction> = {},
): FillInstruction {
  return {
    detectedFieldId: id,
    selectorCandidates: [`#${id}`],
    frame: 'main',
    shadow: false,
    tagName: 'input',
    inputType: 'text',
    fillStrategy: 'nativeInput',
    proposedValue: value,
    ...extra,
  }
}
export async function html(page: Page, markup: string) {
  await page.locator('#fixtures').evaluate((root, markup) => {
    root.innerHTML = markup
  }, markup)
}
export const buttons = (page: Page) => page.locator('#quikfill-overlay-host .qf-fill-btn')
export async function replyToPending(page: Page) {
  await page.evaluate(() => {
    const request = window.qf.transport.requests[0]
    window.qf.transport.resolve?.({
      ok: true,
      response: {
        values: request.fields.map((field) => ({
          fieldId: field.fieldId,
          value: field.name === 'email' ? 'test@example.com' : 'Generated',
        })),
      },
    })
  })
}
export const twoFields =
  '<label>Email<input name="email" type="email"></label><label>Name<input name="name"></label>'
