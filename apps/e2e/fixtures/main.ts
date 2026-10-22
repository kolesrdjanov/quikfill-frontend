import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  applyFill,
  applyUndo,
  captureFillTargets,
  scanForms,
  type FillOptions,
} from '../../../packages/form-scanner/src'
import { valuesToFillInstructions } from '../../../packages/ai/src/fill-request'
import {
  mountOverlay,
  type OverlayHandle,
} from '../../chrome-extension/entrypoints/content/overlay'
import { transport } from './browser-adapter'

let overlay: OverlayHandle | null = null
let reactRoot: Root | null = null
const reactState = { checked: false, changes: 0, rerender: () => {} }

const harness = {
  applyFill,
  applyUndo,
  captureFillTargets,
  scanForms,
  valuesToFillInstructions,
  transport,
  reactState,
  mountOverlay() {
    overlay?.destroy()
    overlay = mountOverlay(document)
  },
  destroyOverlay() {
    overlay?.destroy()
    overlay = null
  },
  rescan() {
    overlay?.rescan()
  },
  async mountReact() {
    reactRoot?.unmount()
    const container = document.getElementById('fixtures')!
    function Form() {
      const [checked, setChecked] = React.useState(false)
      const [tick, setTick] = React.useState(0)
      reactState.checked = checked
      reactState.rerender = () => setTick((value) => value + 1)
      return React.createElement(
        'form',
        { 'data-tick': tick, onSubmit: (event) => event.preventDefault() },
        React.createElement('input', {
          id: 'react-check',
          type: 'checkbox',
          name: 'enabled',
          checked,
          onChange: (event) => {
            reactState.changes++
            setChecked(event.target.checked)
          },
        }),
      )
    }
    reactRoot = createRoot(container)
    reactRoot.render(React.createElement(Form))
  },
  fillOptions: {} as FillOptions,
}

declare global {
  interface Window {
    qf: typeof harness
  }
}
window.qf = harness
