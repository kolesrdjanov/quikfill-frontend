import { ref } from 'vue'
import type { ThemePref } from '@quikfill/schemas'

// Module-level singletons so every surface (panel/popup/options) agrees.
const pref = ref<ThemePref>('auto')
const isDark = ref(false)
let mediaBound = false

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function apply(next: ThemePref): void {
  pref.value = next
  const dark = next === 'dark' || (next === 'auto' && prefersDark())
  isDark.value = dark
  document.documentElement.classList.toggle('dark', dark)
}

/**
 * Applies the `dark` class from a {@link ThemePref}. `auto` follows the OS
 * `prefers-color-scheme` and re-applies when it changes. The persisted value
 * lives in extension settings (see {@link useSettings}); this composable only
 * reflects it onto the document.
 */
export function useExtensionTheme() {
  function init(next: ThemePref): void {
    apply(next)
    if (!mediaBound) {
      window
        .matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', () => pref.value === 'auto' && apply('auto'))
      mediaBound = true
    }
  }

  return { isDark, pref, init, apply }
}
