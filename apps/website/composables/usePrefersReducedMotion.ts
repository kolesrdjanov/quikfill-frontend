/**
 * Reactive `prefers-reduced-motion` flag. `false` during SSR (motion is the
 * default until we know otherwise on the client), then reconciled on mount and
 * kept in sync if the OS setting changes mid-session.
 */
export function usePrefersReducedMotion() {
  const reduced = ref(false)

  if (import.meta.client) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => (reduced.value = mq.matches)
    onMounted(() => {
      update()
      mq.addEventListener('change', update)
    })
    onBeforeUnmount(() => mq.removeEventListener('change', update))
  }

  return { reduced }
}
