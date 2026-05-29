import { ref } from 'vue'

const STORAGE_KEY = 'qf-theme'
const isDark = ref(false)

function apply(dark: boolean): void {
  isDark.value = dark
  document.documentElement.classList.toggle('dark', dark)
}

/** Light/dark theme toggle, persisted to localStorage and honouring the OS default. */
export function useTheme() {
  function init(): void {
    const stored = localStorage.getItem(STORAGE_KEY)
    const prefersDark =
      stored === 'dark' ||
      (stored === null && window.matchMedia('(prefers-color-scheme: dark)').matches)
    apply(prefersDark)
  }

  function toggle(): void {
    const next = !isDark.value
    apply(next)
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
  }

  return { isDark, init, toggle }
}
