/** Shared dashboard origin for popup links and session handoff. Defaults to the
 * deployed app in production and local Vite in dev. An explicit build-time
 * WXT_QF_DASHBOARD_URL supports staging and isolated MV3 release checks. */
export const DASHBOARD_URL = new URL(
  import.meta.env.WXT_QF_DASHBOARD_URL ??
    (import.meta.env.PROD ? 'https://app.quikfill.io' : 'http://localhost:5173'),
).origin

/** Chrome Web Store listing (stable across environments). */
export const WEB_STORE_URL = 'https://chrome.google.com/webstore'

/** Public privacy policy, served by the marketing site (stable across envs). */
export const PRIVACY_URL = 'https://quikfill.io/privacy'

/** Public terms of service, served by the marketing site (stable across envs). */
export const TERMS_URL = 'https://quikfill.io/terms'

/** Support inbox, surfaced as a `mailto:` deep-link across the extension UI. */
export const SUPPORT_EMAIL = 'support@quikfill.io'
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`
