import { defineComponent, h } from 'vue'
import type { HTMLAttributes } from 'vue'
import { cn } from './utils'

/**
 * Build a presentational element whose only job is to carry design-system
 * classes. Keeps the trivial wrappers (Card, Table cells, Label, …) as one-line
 * declarations instead of a file each, while still merging a caller `class`.
 */
export function styled(tag: string, base: string, name = 'Styled') {
  return defineComponent({
    name,
    inheritAttrs: false,
    props: {
      class: {
        type: [String, Object, Array] as unknown as () => HTMLAttributes['class'],
        default: undefined,
      },
    },
    setup(props, { slots, attrs }) {
      return () => h(tag, { ...attrs, class: cn(base, props.class) }, slots.default?.())
    },
  })
}
