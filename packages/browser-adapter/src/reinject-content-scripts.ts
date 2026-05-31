/// <reference types="chrome" />

/**
 * Minimal shape of a content-script registration — covers both the static
 * entries in `manifest.content_scripts` (production builds) and the ones WXT
 * registers dynamically at runtime in dev (`scripting.getRegisteredContentScripts`).
 */
export interface ContentScriptSpec {
  matches?: string[]
  js?: string[]
}

/**
 * The tiny slice of the extension APIs {@link reinjectContentScripts} needs,
 * injected so the function is unit-testable without a fake `chrome` global.
 */
export interface ReinjectDeps {
  /** Static content scripts declared in the manifest (empty in WXT dev). */
  getManifestContentScripts: () => ContentScriptSpec[]
  /** Content scripts registered at runtime (WXT dev); rejects on unsupported. */
  getRegisteredContentScripts: () => Promise<ContentScriptSpec[]>
  /** Tabs whose URL matches any of the given match patterns. */
  queryTabs: (matches: string[]) => Promise<Array<{ id?: number }>>
  /** Inject the given files into a tab; rejects on restricted (non-injectable) URLs. */
  executeScript: (tabId: number, files: string[]) => Promise<void>
}

/**
 * Re-inject the extension's content scripts into already-open tabs.
 *
 * Chrome does **not** re-run content scripts in existing tabs when the extension
 * is installed, updated, or reloaded — those tabs keep an *orphaned* script whose
 * `chrome.runtime` is dead, so every message it sends throws. In QuikFill that
 * surfaces as a misleading "Offline" on the in-page Fill button until the user
 * manually reloads the tab. Re-injecting on install/update heals the tabs in
 * place, so a freshly (re)installed extension is usable without a page reload.
 *
 * Best-effort and never throws: restricted pages (chrome://, the Web Store,
 * other extensions) reject injection and are skipped, and a missing dynamic-
 * scripts API is ignored.
 */
export async function reinjectContentScripts(deps: ReinjectDeps): Promise<void> {
  const specs = [
    ...deps.getManifestContentScripts(),
    ...(await deps.getRegisteredContentScripts().catch(() => [])),
  ]
  for (const spec of specs) {
    const matches = spec.matches ?? []
    const files = spec.js ?? []
    if (matches.length === 0 || files.length === 0) continue
    const tabs = await deps.queryTabs(matches).catch(() => [])
    for (const tab of tabs) {
      if (tab.id == null) continue
      try {
        await deps.executeScript(tab.id, files)
      } catch {
        /* not injectable (restricted URL) — skip this tab, keep healing the rest */
      }
    }
  }
}

/** {@link ReinjectDeps} bound to the live extension globals (used by the background). */
export function chromeReinjectDeps(): ReinjectDeps {
  return {
    getManifestContentScripts: () => chrome.runtime.getManifest().content_scripts ?? [],
    getRegisteredContentScripts: () =>
      chrome.scripting.getRegisteredContentScripts() as Promise<ContentScriptSpec[]>,
    queryTabs: (matches) => chrome.tabs.query({ url: matches }),
    executeScript: async (tabId, files) => {
      await chrome.scripting.executeScript({ target: { tabId }, files })
    },
  }
}
