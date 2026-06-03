# App-served Chrome extension download

**Date:** 2026-06-03
**Status:** Approved — ready for implementation plan
**Repos touched:** `frontend` (primary), `services` (retirement only)

## Problem

Today beta testers get the Chrome extension from
`https://api.quikfill.io/ce/`, behind an HTTP Basic-Auth password gate
(`CE_DOWNLOAD_PASSWORD`). The deploy script (`services/scripts/deploy-chrome.mjs`)
bumps the extension version, builds the zip, copies it into `services/public/ce/`,
and commits/pushes the **services** repo so Railway redeploys and serves it.

We are replacing the `api.quikfill.io/ce/` → enter-password flow with a
self-serve, signed-in download inside the dashboard:

- A beta user signs in to `app.quikfill.io`, opens **Settings → Setup**, reads a
  short "how to load the extension" blurb, and clicks **Download**.
- No password. The zip is served as a static asset of the app itself.
- Every `deploy:chrome` run rebuilds the extension, refreshes the zip in the
  app's `public/` folder, and auto-commits/pushes — so the download is always the
  latest build.

## Goals

1. `deploy:chrome` lives in and operates entirely within the **frontend** repo,
   producing a fresh zip in `apps/app/public/` and pushing in one atomic commit.
2. A user-facing **Setup** page with a description, the current version, a
   download button, and load-unpacked instructions.
3. The download is always fresh despite CDN caching.
4. The old `/ce` + password flow is fully removed from `services`.

## Non-goals

- Packing a `.crx` / Chrome Web Store publishing (separate CWS workflow exists).
- Auto-update of an already-installed extension.
- Gating the zip URL itself (it is a public static asset; the Setup *page* is
  behind sign-in, which is sufficient for a trusted-tester build).

## Design

### 1. `deploy:chrome` (frontend root)

New script `frontend/scripts/deploy-chrome.mjs`, run via `pnpm deploy:chrome`
(added to the frontend root `package.json` `scripts`). One repo, one atomic commit.

Pipeline:

1. **Bump** the extension PATCH version in `apps/chrome-extension/package.json`
   (read working-tree version, `x.y.z → x.y.(z+1)`, reject non-`x.y.z`). Same
   logic as the current script.
2. **Build + zip:** `pnpm --filter @quikfill/chrome-extension zip` from the
   frontend root. Requires `apps/chrome-extension/.env.production` to set
   `WXT_QF_API_BASE_URL` (already in place; the build fails otherwise).
3. **Locate** the newest `*-chrome.zip` in `apps/chrome-extension/.output/`
   (ignore the `*-sources.zip`).
4. **Refresh public assets** in `apps/app/public/`:
   - Delete any existing `apps/app/public/*.zip` (robust against stray/old-named
     zips; the fixed name means a copy already overwrites, but we clean
     explicitly so the folder always holds exactly one current zip).
   - Copy the located zip → `apps/app/public/quikfill-extension.zip` (fixed name).
   - Write `apps/app/public/extension.json`:
     ```json
     { "version": "1.0.3", "filename": "quikfill-extension.zip", "builtAt": "<ISO-8601>" }
     ```
5. **Commit + push:** stage ONLY these explicit, quoted paths — the version bump
   (`apps/chrome-extension/package.json`), the new zip, `extension.json`, and any
   deleted zip path. Then `git commit --no-verify` (asset + version-bump only;
   skips the heavy frontend gate), `git pull --rebase --autostash origin main`,
   `git push --no-verify origin HEAD`. The push triggers the `app-quikfill`
   Cloudflare Workers Build → `app.quikfill.io` redeploys with the fresh zip.

Concurrent-git discipline (per standing convention): stage only this script's
own files via explicit quoted paths; never `git add -A`; land via rebase onto
`origin/main`.

A failed build never pushes a phantom version because the bump is committed only
after the build succeeds.

### 2. Freshness / caching

- `apps/app/public/_headers`: add a rule so `/quikfill-extension.zip` and
  `/extension.json` are served with `Cache-Control: no-cache` (force CDN/browser
  revalidation by ETag). Each deploy changes the content → new ETag → fresh
  download on next request.
- The Setup page appends `?v=<version>` to the download href as a second
  cache-buster.
- Both are same-origin static assets (Vite copies `public/` → `dist/` root, which
  the worker serves). The existing CSP `connect-src 'self'` already permits the
  `extension.json` fetch; real assets take precedence over the SPA
  `not_found_handling` fallback, so the zip downloads directly.

### 3. Setup page (`/settings/setup`)

Routing & nav:

- Rename route `/settings/config` → `/settings/setup`, route name
  `settings-config` → `settings-setup`, title `Configuration` → `Setup`.
- Keep `/settings/config` as a redirect to `/settings/setup` (back-compat).
- Rename `views/Configuration.vue` → `views/Setup.vue`.
- `AppLayout.vue` Settings nav: label `Configuration` → `Setup`, `to:
  '/settings/setup'` (keep the existing icon).

Page content (all `@quikfill/ui` shadcn components):

- A short description of what the download is.
- The **current version** shown as a `Badge`, read from `/extension.json`.
- A **Download** button — an `<a :href="downloadHref" download>` styled as the
  shared button, where `downloadHref = `/quikfill-extension.zip?v=${version}``.
- Numbered **load-unpacked** steps for non-technical testers:
  1. Download and unzip the file.
  2. Open `chrome://extensions`.
  3. Enable **Developer mode** (top-right toggle).
  4. Click **Load unpacked** and select the unzipped folder.

Data fetch:

- The view fetches `/extension.json` with a plain same-origin `fetch` on mount
  (it is a static asset, **not** the backend API — so it deliberately does NOT go
  through `@quikfill/api-client`). The response is parsed with a small Zod schema
  before use (per the "parse untrusted input" rule). On fetch/parse failure the
  download still works against the fixed URL; the version badge is simply hidden.

### 4. Retire the old `/ce` flow (services)

- `services/src/main.ts`: remove the `/ce` Basic-Auth middleware
  (`app.use('/ce', …)`), the `useStaticAssets(public/ce, …)` mount, and the
  `safeEqual` helper (used only by that block).
- `services/src/config/config.schema.ts`: remove `CE_DOWNLOAD_USERNAME` and
  `CE_DOWNLOAD_PASSWORD`.
- Delete `services/public/ce/` (its `.gitkeep` + committed zip),
  `services/scripts/deploy-chrome.mjs`, and the `deploy:chrome` script in
  `services/package.json`.
- Remove `CE_DOWNLOAD_*` from `services/.env.production` (gitignored — manual /
  deploy-env cleanup; does not affect the build).
- No documented OpenAPI routes change (the `/ce` route was raw Express
  middleware, not a Nest controller), so the OpenAPI snapshot is unaffected.

## Testing & quality gate

- **Frontend:** a focused Vitest covering the `extension.json` Zod schema and the
  Setup page's version-display / download-href construction. Full gate:
  `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build`.
- **Services:** `npm run verify` (lint + typecheck + test + build + openapi) —
  typecheck catches any dangling `CE_DOWNLOAD_*` reference after removal.
- **Manual:** run `pnpm deploy:chrome` once and confirm it produces exactly one
  zip + `extension.json` in `apps/app/public/`, makes one commit with only those
  files, and that the deployed Setup page downloads the current build.

## Risks / trade-offs

- The zip (~158 KB) is committed into the frontend repo's git history on every
  deploy. This is the same pattern as today (services committed it), just
  relocated, and the size is small — accepted as a conscious choice.
- The zip URL is unauthenticated. Acceptable for a trusted-tester build; the
  Setup page that surfaces it is behind sign-in, and the build contains no
  secrets (the API is a separate, auth-gated origin).
