/**
 * Scroll-reveal for `.reveal` elements, ported from the design's `initReveal`.
 *
 * Elements start hidden (`.js .reveal { opacity: 0 }`) and gain `.in` when they
 * enter the viewport. `data-d="1..5"` staggers the transition via CSS. We use an
 * IntersectionObserver (idiomatic in a real framework, per the handoff), plus a
 * failsafe so content is never left hidden if the observer never fires.
 *
 * Call once after the page's sections have mounted (e.g. from `pages/index.vue`).
 */
export function useReveal() {
  if (!import.meta.client) return

  let observer: IntersectionObserver | null = null
  let failsafe: ReturnType<typeof setTimeout> | null = null

  onMounted(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.reveal'))
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'))
      return
    }

    observer = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in')
            obs.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    els.forEach((el) => observer!.observe(el))

    // never leave content hidden
    failsafe = setTimeout(() => els.forEach((el) => el.classList.add('in')), 1600)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    if (failsafe) clearTimeout(failsafe)
  })
}
