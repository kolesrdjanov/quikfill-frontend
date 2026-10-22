import { createApp } from 'vue'
import App from '../../chrome-extension/entrypoints/popup/App.vue'
import '../../chrome-extension/style.css'
import { transport } from './browser-adapter'

// WXT/browser globals are the only substitute; the popup/components render for real.
Object.assign(globalThis, {
  browser: {
    runtime: { getManifest: () => ({ version: '1.0.13' }) },
    storage: { onChanged: { addListener: () => {}, removeListener: () => {} } },
    tabs: { create: () => {} },
  },
})
Object.assign(window, { popupTransport: transport })
createApp(App).mount('#app')
