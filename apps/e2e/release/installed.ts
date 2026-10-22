import { test as base, expect, type BrowserContext, type Page } from '@playwright/test'
import puppeteer, {
  type Browser as ConnectedBrowser,
  type Page as Popup,
  type Extension,
} from 'puppeteer-core'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const API = 'http://127.0.0.1:4012'
export const DASHBOARD = 'http://localhost:5173'
export const FORM = 'http://localhost:4178/mv3.html'
export type Installed = {
  context: BrowserContext
  browser: ConnectedBrowser
  extension: Extension
  errors: string[]
  reconnect(): Promise<void>
  popup(page: Page): Promise<Popup>
}
export const click = (popup: Popup, name: string) => popup.locator(`aria/${name}`).click()
export const text = (popup: Popup) => popup.evaluate(() => document.body.innerText)
export const waitText = (popup: Popup, value: string) =>
  popup.waitForFunction(
    (value) => document.body.innerText.includes(value),
    { timeout: 10000 },
    value,
  )
export const state = async (): Promise<{
  requests: { page: unknown; fields: { name?: string }[] }[]
  codes: Record<string, string>
  hits: { method: string; path: string; status: number }[]
}> => (await fetch(`${API}/__mv3/state`)).json()
export const fillButton = (page: Page) => page.locator('#quikfill-overlay-host .qf-fill-btn')
export async function visit(page: Page, variant = 'native') {
  await page.goto(`${FORM}?form=${variant}`)
  await expect(fillButton(page).first()).toBeVisible()
}
export const test = base.extend<{ page: Page }, { installed: Installed }>({
  installed: [
    async ({ playwright }, use) => {
      const profile = await mkdtemp(join(tmpdir(), 'quikfill-mv3-'))
      const extensionPath = resolve('../chrome-extension/.output/mv3-release/chrome-mv3')
      const errors: string[] = []
      let context: BrowserContext | undefined, browser: ConnectedBrowser | undefined
      try {
        if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.includes('headless-shell'))
          throw new Error(
            'MV3 requires full Chromium; chrome-headless-shell cannot load extensions.',
          )
        context = await playwright.chromium.launchPersistentContext(profile, {
          channel: 'chromium',
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          headless: process.env.MV3_HEADED !== '1',
          viewport: { width: 1280, height: 900 },
          args: [
            '--enable-unsafe-extension-debugging',
            '--remote-debugging-port=0',
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
          ],
        })
        context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)))
        const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
        const id = new URL(worker.url()).host
        const port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]
        browser = await puppeteer.connect({
          browserURL: `http://127.0.0.1:${port}`,
          defaultViewport: null,
        })
        const extension = (await browser.extensions()).get(id)
        if (!extension || !extension.enabled)
          throw new Error('Built MV3 extension was not installed/enabled.')
        const installed: Installed = {
          context,
          browser,
          extension,
          errors,
          async reconnect() {
            await browser?.disconnect()
            browser = await puppeteer.connect({
              browserURL: `http://127.0.0.1:${port}`,
              defaultViewport: null,
            })
            installed.browser = browser
            const fresh = (await browser.extensions()).get(id)
            if (!fresh) throw new Error('Extension missing after reload')
            installed.extension = fresh
          },
          async popup(page) {
            const connected = installed.browser
            const extension = installed.extension
            await page.bringToFront()
            const target = await connected.waitForTarget(
              (t) => t.type() === 'page' && t.url() === page.url(),
            )
            const content = await target.asPage()
            const old = new Set(connected.targets())
            await content.triggerExtensionAction(extension)
            const popupTarget = await connected.waitForTarget(
              (t) =>
                !old.has(t) &&
                t.type() === 'page' &&
                t.url() === `chrome-extension://${id}/popup.html`,
            )
            const popup = await popupTarget.asPage()
            popup.setDefaultTimeout(10000)
            popup.on('pageerror', (error) =>
              errors.push(error instanceof Error ? error.message : String(error)),
            )
            await popup.waitForFunction(
              () => document.readyState === 'complete' && document.querySelector('button'),
            )
            return popup
          },
        }
        console.log(
          `Installed MV3 ${extension.version}; ${await browser.version()}; fresh profile; real toolbar popup`,
        )
        await use(installed)
      } finally {
        await browser?.disconnect()
        await context?.close()
        await rm(profile, { recursive: true, force: true })
      }
    },
    { scope: 'worker' },
  ],
  page: async ({ installed }, use) => {
    const page = await installed.context.newPage()
    try {
      await use(page)
    } finally {
      await page.close()
    }
  },
})
export { expect }
