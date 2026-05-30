const THEME_KEY = 'qf-theme'

/**
 * Dark/light theme, mirrored onto <html data-theme> and persisted in
 * localStorage — matches the standalone design's behaviour (key `qf-theme`).
 * The pre-paint script in nuxt.config applies the saved value before hydration.
 */
export function useTheme() {
  const theme = useState<'dark' | 'light'>('qf-theme', () => 'dark')

  onMounted(() => {
    const saved = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
    theme.value = saved
  })

  function toggle() {
    const next = theme.value === 'light' ? 'dark' : 'light'
    theme.value = next
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* storage unavailable — ignore */
    }
  }

  return { theme, toggle }
}
