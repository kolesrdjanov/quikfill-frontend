import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import * as Checkbox from '@radix-ui/react-checkbox'
import * as Switch from '@radix-ui/react-switch'

const h = React.createElement
let root: Root | undefined
export function mountReactWidgets() {
  root?.unmount()
  function Toggles() {
    const [checked, setChecked] = React.useState<Checkbox.CheckedState>(false)
    const [enabled, setEnabled] = React.useState(false)
    const [tick, setTick] = React.useState(0)
    return h(
      'form',
      { 'data-tick': tick, 'data-checked': String(checked), 'data-enabled': String(enabled) },
      h(
        Checkbox.Root,
        {
          name: 'terms',
          required: true,
          checked,
          onCheckedChange: setChecked,
          'aria-label': 'Terms',
        },
        h(Checkbox.Indicator, null, '✓'),
      ),
      h(
        Switch.Root,
        {
          name: 'updates',
          required: true,
          checked: enabled,
          onCheckedChange: setEnabled,
          'aria-label': 'Updates',
        },
        h(Switch.Thumb),
      ),
      h('button', { type: 'button', onClick: () => setTick((t) => t + 1) }, 'Rerender widgets'),
    )
  }
  root = createRoot(document.getElementById('fixtures')!)
  root.render(h(Toggles))
}
