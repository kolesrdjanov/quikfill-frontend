/** Tracks whether the page has scrolled past the top (drives the nav's hairline border). */
export function useNavScroll() {
  const scrolled = ref(false)

  function onScroll() {
    scrolled.value = window.scrollY > 12
  }

  onMounted(() => {
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
  })
  onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))

  return { scrolled }
}
