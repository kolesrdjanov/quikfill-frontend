import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

// https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Quikfill',
    description: 'Scan, map, and fill any web form.',
    // Minimal permissions; host access is requested on user action (activeTab).
    permissions: ['sidePanel', 'scripting', 'storage', 'activeTab'],
    // Lets the background worker reach the local backend for (user-initiated) AI.
    // Production builds add their API origin here.
    host_permissions: ['http://localhost:4010/*'],
    action: {},
  },
})
