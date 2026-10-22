import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  probeFields,
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
import { createApp, type App } from 'vue'
import ControlledForm from './ControlledForm.vue'
import RekaWidgets from './RekaWidgets.vue'
import RekaSelect from './RekaSelect.vue'
import { mountReactWidgets } from './react-widgets'
import { mountDependentWidgets } from './dependent-widgets'
import { mountCalendarWidget } from './calendar-widget'

let overlay: OverlayHandle | null = null
let reactRoot: Root | null = null
let vueApp: App | null = null
const reactState = { checked: false, changes: 0, rerender: () => {} }

const harness = {
  applyFill,
  applyUndo,
  captureFillTargets,
  scanForms,
  probeFields,
  valuesToFillInstructions,
  transport,
  reactState,
  mountReactWidgets,
  mountDependentWidgets,
  mountCalendarWidget,
  mountRekaWidgets() {
    vueApp?.unmount()
    vueApp = createApp(RekaWidgets)
    vueApp.mount(document.getElementById('fixtures')!)
  },
  mountRekaSelect() {
    vueApp?.unmount()
    vueApp = createApp(RekaSelect)
    vueApp.mount(document.getElementById('fixtures')!)
  },
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
      const [email, setEmail] = React.useState('')
      const [firstName, setFirstName] = React.useState('')
      reactState.checked = checked
      reactState.rerender = () => setTick((value) => value + 1)
      return React.createElement(
        'form',
        {
          'data-tick': tick,
          'data-email': email,
          'data-name': firstName,
          'data-checked': checked,
          onSubmit: (event) => event.preventDefault(),
        },
        React.createElement('input', {
          name: 'email',
          type: 'email',
          value: email,
          onChange: (event) => setEmail(event.target.value),
        }),
        React.createElement('input', {
          name: 'first_name',
          value: firstName,
          onChange: (event) => setFirstName(event.target.value),
        }),
        React.createElement('input', {
          id: 'react-check',
          type: 'checkbox',
          name: 'enabled',
          checked,
          required: true,
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
  mountVue() {
    vueApp?.unmount()
    vueApp = createApp(ControlledForm)
    vueApp.mount(document.getElementById('fixtures')!)
  },
  fillOptions: {} as FillOptions,
}

declare global {
  interface Window {
    qf: typeof harness
  }
}
window.qf = harness
