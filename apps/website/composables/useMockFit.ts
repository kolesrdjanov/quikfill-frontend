import type { Ref } from 'vue'

const DESIGN_W = 1060
const MIN_SCALE = 0.5

/**
 * Zoom-to-fit the fixed 1060px product mock into its responsive slot, matching
 * the standalone design (which set `slot.style.zoom`). Variant A min scale 0.5.
 */
export function useMockFit(slot: Ref<HTMLElement | null>) {
  function fit() {
    const el = slot.value
    if (!el) return
    const w = el.clientWidth
    if (!w) return
    const s = Math.max(MIN_SCALE, Math.min(1, w / DESIGN_W))
    el.style.zoom = s.toFixed(3)
  }

  onMounted(() => {
    fit()
    window.addEventListener('resize', fit, { passive: true })
  })
  onBeforeUnmount(() => window.removeEventListener('resize', fit))

  return { fit }
}
