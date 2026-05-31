import { describe, expect, it, vi } from 'vitest'
import { reinjectContentScripts, type ReinjectDeps } from './reinject-content-scripts'

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
