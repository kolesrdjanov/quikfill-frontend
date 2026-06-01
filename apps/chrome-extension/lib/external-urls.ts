/**
 * External web destinations the extension deep-links to. The dashboard origin is
 * build-time — production points at the deployed app, dev at the local Vite
 * server — mirroring the API origin (`WXT_QF_API_BASE_URL`, see
 * `entrypoints/background.ts`) so a production build never deep-links to
 * `localhost`. Matches the popup's `DASHBOARD_URL` (`entrypoints/popup/App.vue`).
 */
export const DASHBOARD_URL = import.meta.env.PROD
  ? 'https://app.quikfill.io'
  : 'http://localhost:5173'

/** Chrome Web Store listing (stable across environments). */
export const WEB_STORE_URL = 'https://chrome.google.com/webstore'
