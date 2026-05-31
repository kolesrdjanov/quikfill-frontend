import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

// https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'QuikFill',
    description: 'Scan, map, and fill any web form.',
    // Minimal permissions; the content script injects via its declared matches.
    permissions: ['scripting', 'storage'],
    // Lets the background worker reach the local backend for (user-initiated) AI.
    // Production builds add their API origin here.
    host_permissions: ['http://localhost:4010/*'],
    action: {},
  },
})
