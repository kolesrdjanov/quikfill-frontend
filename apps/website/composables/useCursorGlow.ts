/**
 * Cursor-tracking radial glow on `.flow-card`, `.pcard` and `.tile`, ported from
 * the design's `initGlow`. One delegated pointermove listener writes `--mx`/`--my`
 * on the hovered card; the CSS `::after` renders the highlight at that point.
 * Disabled under reduced-motion. Call once (e.g. from `pages/index.vue`).
 */
export function useCursorGlow() {
  if (!import.meta.client) return

  function onMove(e: PointerEvent) {
    const target = e.target as HTMLElement | null
    const card = target?.closest?.('.flow-card, .pcard, .tile') as HTMLElement | null
    if (!card) return
    const r = card.getBoundingClientRect()
    card.style.setProperty('--mx', `${e.clientX - r.left}px`)
    card.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  onMounted(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    document.addEventListener('pointermove', onMove, { passive: true })
  })
  onBeforeUnmount(() => document.removeEventListener('pointermove', onMove))
}
