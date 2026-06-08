import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

// https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  // Function form so `import.meta.env` is read AFTER .env files load (wxt.dev/
  // guide/essentials/config/environment-variables). The host permission and the
  // api-client base URL (entrypoints/background.ts) are driven from ONE source —
  // `WXT_QF_API_BASE_URL` — so the worker's allowed origin always tracks the API
  // it actually calls. Dev defaults to the local backend.
  manifest: () => {
    const apiOrigin = new URL(import.meta.env.WXT_QF_API_BASE_URL ?? 'http://localhost:4010/api/v1')
      .origin
    return {
      name: 'QuikFill',
      description: 'Scan, map, and fill any web form.',
      // Minimal permissions; the content script injects via its declared matches.
      // `alarms` drives the periodic pull of dashboard-managed settings so a
      // signed-in extension stays in sync without waiting for a sign-in / SW recycle.
      // `activeTab` lets the popup read the current tab's hostname (granted on the
      // user gesture of opening the popup) for the per-site activation toggle.
      permissions: ['activeTab', 'scripting', 'storage', 'alarms'],
      // Lets the background worker reach the backend for (user-initiated) AI/auth/
      // sync. Tracks the API origin above so dev and production stay in sync.
      host_permissions: [`${apiOrigin}/*`],
      // WXT auto-discovers public/icon/{size}.png into manifest.icons (store +
      // chrome://extensions), but it does NOT populate the toolbar button's
      // icon — set default_icon explicitly so the action button always renders
      // the brand mark instead of Chrome's generated letter monogram.
      action: {
        default_icon: {
          16: 'icon/16.png',
          32: 'icon/32.png',
          48: 'icon/48.png',
          128: 'icon/128.png',
        },
      },
    }
  },
  hooks: {
    // Fail an actual production BUILD (not `wxt prepare`/`wxt dev`) that would ship
    // the localhost dev origin — i.e. WXT_QF_API_BASE_URL was not set. This runs in
    // the build pipeline only, so postinstall `wxt prepare` and `wxt dev` are
    // unaffected. See .env.production.example.
    'build:manifestGenerated': (wxt, manifest) => {
      const origins: string[] = manifest.host_permissions ?? []
      if (wxt.config.mode === 'production' && origins.some((o) => o.includes('localhost'))) {
        throw new Error(
          '[quikfill] Refusing to ship a production build that targets localhost. ' +
            'Set WXT_QF_API_BASE_URL (see .env.production.example).',
        )
      }
    },
  },
})
