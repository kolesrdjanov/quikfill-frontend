import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  chromeReinjectDeps,
  ensureActiveContentScript,
  onContentReady,
  reinjectContentScripts,
  type ReinjectDeps,
} from './reinject-content-scripts'

/** A deps object with sensible no-op defaults; override per test. */
function deps(overrides: Partial<ReinjectDeps> = {}): ReinjectDeps {
  return {
    getManifestContentScripts: () => [],
    getRegisteredContentScripts: async () => [],
    queryTabs: async () => [],
    executeScript: async () => {},
    ...overrides,
  }
}

describe('reinjectContentScripts', () => {
  it('injects manifest + dynamically-registered scripts into matching open tabs', async () => {
    const executeScript = vi.fn().mockResolvedValue(undefined)
    await reinjectContentScripts(
      deps({
        getManifestContentScripts: () => [{ matches: ['<all_urls>'], js: ['content.js'] }],
        getRegisteredContentScripts: async () => [{ matches: ['*://*/*'], js: ['dev.js'] }],
        queryTabs: async (matches) =>
          matches.includes('<all_urls>') ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }],
        executeScript,
      }),
    )
    expect(executeScript.mock.calls).toEqual([
      [1, ['content.js']],
      [2, ['content.js']],
      [3, ['dev.js']],
    ])
  })

  it('skips tabs without an id and survives a restricted-page injection failure', async () => {
    const executeScript = vi
      .fn()
      .mockRejectedValueOnce(new Error('Cannot access a chrome:// URL'))
      .mockResolvedValue(undefined)
    await expect(
      reinjectContentScripts(
        deps({
          getManifestContentScripts: () => [{ matches: ['<all_urls>'], js: ['content.js'] }],
          queryTabs: async () => [{ id: undefined }, { id: 10 }, { id: 11 }],
          executeScript,
        }),
      ),
    ).resolves.toBeUndefined()
    // id:undefined is skipped; tab 10 throws but is caught; tab 11 still gets injected.
    expect(executeScript.mock.calls).toEqual([
      [10, ['content.js']],
      [11, ['content.js']],
    ])
  })

  it('ignores a failure reading dynamically-registered scripts (API unsupported)', async () => {
    const executeScript = vi.fn().mockResolvedValue(undefined)
    await reinjectContentScripts(
      deps({
        getManifestContentScripts: () => [{ matches: ['<all_urls>'], js: ['content.js'] }],
        getRegisteredContentScripts: async () => {
          throw new Error('getRegisteredContentScripts not supported')
        },
        queryTabs: async () => [{ id: 1 }],
        executeScript,
      }),
    )
    expect(executeScript).toHaveBeenCalledWith(1, ['content.js'])
  })

  it('skips specs missing matches or js, and a tab-query failure', async () => {
    const executeScript = vi.fn().mockResolvedValue(undefined)
    await reinjectContentScripts(
      deps({
        getManifestContentScripts: () => [
          { matches: [], js: ['content.js'] }, // no matches → skip
          { matches: ['<all_urls>'], js: [] }, // no js → skip
          { matches: ['<all_urls>'], js: ['content.js'] }, // queryTabs throws → caught
        ],
        queryTabs: async () => {
          throw new Error('tabs.query failed')
        },
        executeScript,
      }),
    )
    expect(executeScript).not.toHaveBeenCalled()
  })
})

afterEach(() => vi.unstubAllGlobals())
function installBrowser({ ready = true, url = 'https://example.test/form' } = {}) {
  const query = vi.fn(async () => [{ id: 7, url }])
  const executeScript = vi.fn(async () => [])
  const sendMessage = ready
    ? vi.fn(async () => ({ ready: true }))
    : vi.fn().mockRejectedValue(new Error('No receiver'))
  const addListener = vi.fn()
  vi.stubGlobal('chrome', {
    tabs: { query, sendMessage },
    scripting: { executeScript },
    runtime: {
      getManifest: () => ({ content_scripts: [{ matches: ['<all_urls>'], js: ['content.js'] }] }),
      onMessage: { addListener },
    },
  })
  return { query, executeScript, sendMessage, addListener }
}
it('queries all tab IDs without a sensitive URL filter for all-URL scripts', async () => {
  const browser = installBrowser()
  await chromeReinjectDeps().queryTabs(['<all_urls>'])
  expect(browser.query).toHaveBeenCalledWith({})
  await chromeReinjectDeps().queryTabs(['https://example.test/*'])
  expect(browser.query).toHaveBeenLastCalledWith({ url: ['https://example.test/*'] })
})
it('preserves a healthy content generation and its Undo session', async () => {
  const browser = installBrowser()
  expect(await ensureActiveContentScript()).toBe(true)
  expect(browser.executeScript).not.toHaveBeenCalled()
})
it('heals only the active tab when its old message receiver is gone', async () => {
  const browser = installBrowser({ ready: false })
  expect(await ensureActiveContentScript()).toBe(true)
  expect(browser.executeScript).toHaveBeenCalledWith({
    target: { tabId: 7 },
    files: ['content.js'],
  })
})
it('does not attempt injection on restricted URLs or propagate denied site access', async () => {
  const browser = installBrowser({ ready: false, url: 'chrome://extensions' })
  expect(await ensureActiveContentScript()).toBe(false)
  expect(browser.executeScript).not.toHaveBeenCalled()
  const denied = installBrowser({ ready: false })
  denied.executeScript.mockRejectedValue(new Error('Site access denied'))
  expect(await ensureActiveContentScript()).toBe(false)
})
it('answers the generation health ping without scanning or exposing page data', () => {
  const browser = installBrowser()
  onContentReady()
  const respond = vi.fn()
  browser.addListener.mock.calls[0][0]({ type: 'QF_CONTENT_READY' }, {}, respond)
  expect(respond).toHaveBeenCalledWith({ ready: true })
})
