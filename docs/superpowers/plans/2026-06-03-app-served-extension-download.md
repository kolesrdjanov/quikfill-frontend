# App-served Chrome extension download — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `api.quikfill.io/ce/` + password download with a signed-in
**Settings → Setup** page that downloads the extension zip served from the
dashboard's own `public/` folder, refreshed by a frontend-root `pnpm deploy:chrome`.

**Architecture:** A new standalone Node script (`frontend/scripts/deploy-chrome.mjs`)
bumps the extension version, builds the zip, drops it + an `extension.json`
manifest into `apps/app/public/`, and commits/pushes the frontend repo in one
atomic commit — triggering the `app-quikfill` Cloudflare Workers Build. The Setup
page reads `extension.json` (same-origin static asset, Zod-parsed) to show the
version and build a cache-busted download link. The old `/ce` Express middleware,
its config, and the old script are removed from `services`.

**Tech Stack:** Node ESM script (`execSync`, `fs`), pnpm workspaces, WXT (`wxt zip`),
Vue 3 + Vite + Zod (dashboard), Cloudflare Workers static assets (`_headers`),
NestJS/Express (services, removal only).

---

## File structure

**Frontend — create:**
- `frontend/scripts/deploy-chrome.mjs` — the new deploy pipeline.
- `frontend/apps/app/src/schemas/extension.ts` — `extensionManifestSchema`,
  `ExtensionManifest`, `buildDownloadHref()`.
- `frontend/apps/app/src/schemas/extension.test.ts` — schema + helper unit tests.
- `frontend/apps/app/src/views/Setup.vue` — the Setup page (renamed from `Configuration.vue`).

**Frontend — modify:**
- `frontend/package.json` — add `"deploy:chrome"` script.
- `frontend/apps/app/public/_headers` — `no-cache` rule for the zip + manifest.
- `frontend/apps/app/src/router/index.ts` — `/settings/config` → `/settings/setup` (+ back-compat redirect).
- `frontend/apps/app/src/layouts/AppLayout.vue` — nav label/route `Configuration` → `Setup`.

**Frontend — delete:**
- `frontend/apps/app/src/views/Configuration.vue` (replaced by `Setup.vue`).

**Services — modify/delete:**
- `services/src/main.ts` — remove the `/ce` middleware + static mount + `safeEqual`.
- `services/src/config/config.schema.ts` — remove `CE_DOWNLOAD_USERNAME`/`CE_DOWNLOAD_PASSWORD`.
- `services/package.json` — remove the `deploy:chrome` script.
- Delete `services/scripts/deploy-chrome.mjs` and `services/public/ce/`.

---

## Task 1: New frontend `deploy:chrome` script

**Files:**
- Create: `frontend/scripts/deploy-chrome.mjs`
- Modify: `frontend/package.json` (add script)

- [ ] **Step 1: Write the script**

Create `frontend/scripts/deploy-chrome.mjs`:

```js
/**
 * deploy:chrome — publish a fresh Chrome-extension build the dashboard serves itself.
 *
 * Pipeline (all inside the frontend repo, one atomic commit):
 *   1. Bump the extension PATCH version (1.0.2 -> 1.0.3) so every deploy is a
 *      distinct build (baked into the manifest + zip name by `wxt zip`).
 *   2. Production build + zip (`pnpm --filter @quikfill/chrome-extension zip`).
 *   3. Copy the newest *-chrome.zip into apps/app/public/quikfill-extension.zip
 *      (fixed name) and write apps/app/public/extension.json {version,filename,builtAt}.
 *   4. Commit ONLY those files + the version bump and push, so the app-quikfill
 *      Cloudflare Workers Build redeploys app.quikfill.io with the fresh download.
 *
 * Run from the frontend repo: `pnpm deploy:chrome`. Requires
 * apps/chrome-extension/.env.production to set WXT_QF_API_BASE_URL (the build
 * fails otherwise).
 */
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extDir = join(frontendRoot, 'apps', 'chrome-extension');
const ceOutputDir = join(extDir, '.output');
const appPublicDir = join(frontendRoot, 'apps', 'app', 'public');
const destZipName = 'quikfill-extension.zip';
const destZip = join(appPublicDir, destZipName);
const manifestPath = join(appPublicDir, 'extension.json');
const EXT_PKG_PATH = 'apps/chrome-extension/package.json';

function run(cmd, cwd) {
  console.log(`\n$ ${cmd}\n  (cwd: ${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}
function capture(cmd, cwd) {
  return execSync(cmd, { cwd }).toString().trim();
}

// 1. Bump PATCH. `wxt zip` reads this version for the manifest + zip name, so it
//    MUST happen before the build. It is committed only at the end, after a
//    successful build, so a failed build never pushes a phantom version.
const currentVersion = capture('npm pkg get version', extDir).replace(/"/g, '');
const semver = currentVersion.split('.').map(Number);
if (semver.length !== 3 || semver.some(Number.isNaN)) {
  throw new Error(`Extension version "${currentVersion}" is not a clean x.y.z — fix it by hand first.`);
}
const nextVersion = `${semver[0]}.${semver[1]}.${semver[2] + 1}`;
console.log(`\nBumping extension version ${currentVersion} -> ${nextVersion}`);
run(`npm pkg set version=${nextVersion}`, extDir);

// 2. Production build + zip.
run('pnpm --filter @quikfill/chrome-extension zip', frontendRoot);

// 3. Pick the newest *-chrome.zip (wxt also emits a *-sources.zip we ignore).
const chromeZips = readdirSync(ceOutputDir)
  .filter((f) => f.endsWith('-chrome.zip'))
  .map((f) => ({ f, mtime: statSync(join(ceOutputDir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);
if (chromeZips.length === 0) {
  throw new Error(`No *-chrome.zip found in ${ceOutputDir} — did the build/zip step run?`);
}
const newest = chromeZips[0].f;
const version = /(\d+\.\d+\.\d+)/.exec(newest)?.[1] ?? nextVersion;

// 4. Refresh the app's public assets. Delete any existing *.zip first so the
//    folder always holds exactly one current zip (robust against stray names).
mkdirSync(appPublicDir, { recursive: true });
const staleZips = readdirSync(appPublicDir).filter((f) => f.endsWith('.zip'));
for (const z of staleZips) rmSync(join(appPublicDir, z));
console.log(`\nPublishing ${newest} -> apps/app/public/${destZipName} (version ${version})`);
copyFileSync(join(ceOutputDir, newest), destZip);
writeFileSync(
  manifestPath,
  JSON.stringify({ version, filename: destZipName, builtAt: new Date().toISOString() }, null, 2) + '\n',
);

// 5. Stage ONLY our explicit, quoted paths (the bump, the new zip, the manifest,
//    and any stale zip we removed) — never `git add -A`. Commit + rebase + push.
const gitPaths = new Set([
  EXT_PKG_PATH,
  relative(frontendRoot, destZip),
  relative(frontendRoot, manifestPath),
]);
for (const z of staleZips) gitPaths.add(relative(frontendRoot, join(appPublicDir, z)));
const pathArgs = [...gitPaths].map((p) => `"${p}"`).join(' ');

run(`git add ${pathArgs}`, frontendRoot);
if (!capture('git diff --cached --name-only', frontendRoot)) {
  console.log('\nNo change to publish — nothing to deploy.');
  process.exit(0);
}
// --no-verify: asset + version-bump only, so skip the heavy frontend gate.
// Autostash protects any unrelated WIP during the rebase.
run(`git commit --no-verify -m "chore(ce): publish extension build ${version}" -- ${pathArgs}`, frontendRoot);
run('git pull --rebase --autostash origin main', frontendRoot);
run('git push --no-verify origin HEAD', frontendRoot);

console.log('\n✅ Published. Cloudflare Workers Build will redeploy app.quikfill.io with the fresh download.');
```

- [ ] **Step 2: Add the root script**

In `frontend/package.json` `scripts`, add after `"generate:web"`:

```json
    "deploy:chrome": "node scripts/deploy-chrome.mjs",
```

- [ ] **Step 3: Smoke-check the script parses (no side effects yet)**

Run: `cd frontend && node --check scripts/deploy-chrome.mjs`
Expected: exit 0, no output (syntax OK). Do NOT run the full script yet — it
builds, commits, and pushes. The real run is Task 6.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add scripts/deploy-chrome.mjs package.json
git commit --no-verify -m "build(ce): frontend-root deploy:chrome script"
git pull --rebase --autostash origin main && git push --no-verify origin HEAD
```

(`--no-verify`: this commit adds a build script + a package.json `scripts` entry
only; the heavy pre-commit gate is exercised by the real code tasks below.)

---

## Task 2: `_headers` no-cache rule for the download

**Files:**
- Modify: `frontend/apps/app/public/_headers`

- [ ] **Step 1: Append the rule**

At the END of `frontend/apps/app/public/_headers`, after the existing `/*` block,
add:

```
# The extension download + its version manifest change on every deploy. Force the
# CDN/browser to revalidate by ETag so users always get the latest build (the
# Setup page also appends ?v=<version> as a second cache-buster).
/quikfill-extension.zip
  Cache-Control: no-cache
/extension.json
  Cache-Control: no-cache
```

- [ ] **Step 2: Commit**

```bash
cd frontend
git add apps/app/public/_headers
git commit -m "build(ce): no-cache headers for extension download"
git pull --rebase --autostash origin main && git push --no-verify origin HEAD
```

(Plain commit — the pre-commit gate runs; a `_headers`-only change passes
lint/format/typecheck/build cleanly.)

---

## Task 3: `extension.json` schema + download-href helper (TDD)

**Files:**
- Create: `frontend/apps/app/src/schemas/extension.ts`
- Test: `frontend/apps/app/src/schemas/extension.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/apps/app/src/schemas/extension.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildDownloadHref, extensionManifestSchema } from './extension'

describe('extensionManifestSchema', () => {
  it('parses a well-formed manifest', () => {
    const parsed = extensionManifestSchema.parse({
      version: '1.0.3',
      filename: 'quikfill-extension.zip',
      builtAt: '2026-06-03T12:00:00.000Z',
    })
    expect(parsed.version).toBe('1.0.3')
    expect(parsed.filename).toBe('quikfill-extension.zip')
  })

  it('rejects a manifest missing fields', () => {
    expect(() => extensionManifestSchema.parse({ version: '1.0.3' })).toThrow()
  })
})

describe('buildDownloadHref', () => {
  it('cache-busts with the version when a manifest is present', () => {
    const href = buildDownloadHref({
      version: '1.0.3',
      filename: 'quikfill-extension.zip',
      builtAt: '2026-06-03T12:00:00.000Z',
    })
    expect(href).toBe('/quikfill-extension.zip?v=1.0.3')
  })

  it('falls back to the fixed URL when the manifest is null', () => {
    expect(buildDownloadHref(null)).toBe('/quikfill-extension.zip')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && pnpm --filter @quikfill/app test -- extension`
Expected: FAIL — `Cannot find module './extension'` / import error.

- [ ] **Step 3: Write the implementation**

Create `frontend/apps/app/src/schemas/extension.ts`:

```ts
import { z } from 'zod'

/**
 * Shape of `/extension.json`, the version manifest the deploy:chrome script writes
 * into apps/app/public alongside the downloadable zip. Fetched same-origin by the
 * Setup page and Zod-parsed before use (untrusted static asset).
 */
export const extensionManifestSchema = z.object({
  version: z.string(),
  filename: z.string(),
  builtAt: z.string(),
})

export type ExtensionManifest = z.infer<typeof extensionManifestSchema>

/** The fixed download URL when no manifest has been published yet. */
const FALLBACK_HREF = '/quikfill-extension.zip'

/**
 * Build the download link. With a manifest we append `?v=<version>` so a new build
 * always defeats any cached copy; without one we point at the fixed URL.
 */
export function buildDownloadHref(manifest: ExtensionManifest | null): string {
  if (!manifest) return FALLBACK_HREF
  return `/${manifest.filename}?v=${manifest.version}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && pnpm --filter @quikfill/app test -- extension`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd frontend
git add apps/app/src/schemas/extension.ts apps/app/src/schemas/extension.test.ts
git commit -m "feat(app): extension manifest schema + download-href helper"
git pull --rebase --autostash origin main && git push --no-verify origin HEAD
```

---

## Task 4: Setup page (view, route, nav)

**Files:**
- Create: `frontend/apps/app/src/views/Setup.vue`
- Delete: `frontend/apps/app/src/views/Configuration.vue`
- Modify: `frontend/apps/app/src/router/index.ts`
- Modify: `frontend/apps/app/src/layouts/AppLayout.vue`

- [ ] **Step 1: Create `Setup.vue`**

Create `frontend/apps/app/src/views/Setup.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Download } from 'lucide-vue-next'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@quikfill/ui'
import {
  buildDownloadHref,
  extensionManifestSchema,
  type ExtensionManifest,
} from '@/schemas/extension'

const manifest = ref<ExtensionManifest | null>(null)

// `/extension.json` is a same-origin STATIC asset (written by deploy:chrome), not
// the backend API — so it is fetched directly, NOT through @quikfill/api-client.
// Parsed with Zod; on any failure the fixed download URL still works (no badge).
onMounted(async () => {
  try {
    const res = await fetch('/extension.json', { cache: 'no-store' })
    if (!res.ok) return
    manifest.value = extensionManifestSchema.parse(await res.json())
  } catch {
    // Manifest missing/malformed — leave version hidden; download still works.
  }
})

const downloadHref = computed(() => buildDownloadHref(manifest.value))
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-5">
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          Chrome extension
          <Badge v-if="manifest" variant="secondary">v{{ manifest.version }}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-5">
        <p class="text-muted-foreground text-sm">
          Download the QuikFill Chrome extension and load it as an unpacked
          extension. Every release here is the latest build — re-download to update.
        </p>

        <Button as="a" :href="downloadHref" download>
          <Download class="size-4" />
          Download extension
        </Button>

        <div class="space-y-2">
          <p class="text-sm font-medium">Loading it into Chrome</p>
          <ol class="text-muted-foreground list-decimal space-y-1.5 pl-5 text-sm">
            <li>Download the file above and unzip it.</li>
            <li>Open <code class="text-foreground">chrome://extensions</code> in Chrome.</li>
            <li>Turn on <span class="text-foreground font-medium">Developer mode</span> (top-right).</li>
            <li>
              Click <span class="text-foreground font-medium">Load unpacked</span> and select the
              unzipped folder.
            </li>
          </ol>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
```

- [ ] **Step 2: Delete the old view**

Run: `cd frontend && git rm apps/app/src/views/Configuration.vue`
Expected: `rm 'apps/app/src/views/Configuration.vue'`.

- [ ] **Step 3: Update the router**

In `frontend/apps/app/src/router/index.ts`, replace the `/settings/config` route
block (currently name `settings-config`, component `Configuration.vue`) with the
new `/settings/setup` route plus a back-compat redirect. Find:

```ts
  {
    path: '/settings/config',
    name: 'settings-config',
    meta: { layout: 'app', requiresAuth: true, title: 'Configuration' },
    component: () => import('@/views/Configuration.vue'),
  },
```

Replace with:

```ts
  {
    path: '/settings/setup',
    name: 'settings-setup',
    meta: { layout: 'app', requiresAuth: true, title: 'Setup' },
    component: () => import('@/views/Setup.vue'),
  },
  // Back-compat: old bookmarks / links to /settings/config.
  {
    path: '/settings/config',
    redirect: '/settings/setup',
  },
```

- [ ] **Step 4: Update the nav**

In `frontend/apps/app/src/layouts/AppLayout.vue`, find the settings nav entry:

```ts
  { label: 'Configuration', to: '/settings/config', icon: SlidersHorizontal },
```

Replace with:

```ts
  { label: 'Setup', to: '/settings/setup', icon: SlidersHorizontal },
```

(Keep the `SlidersHorizontal` icon — already imported; no import change needed.)

- [ ] **Step 5: Run lint + typecheck + the app's tests**

Run: `cd frontend && pnpm --filter @quikfill/app typecheck && pnpm --filter @quikfill/app test`
Expected: typecheck clean (the deleted `Configuration.vue` is no longer
referenced anywhere; `Setup.vue` + `extension.ts` resolve), tests PASS.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add apps/app/src/views/Setup.vue apps/app/src/router/index.ts apps/app/src/layouts/AppLayout.vue
git commit -m "feat(app): Settings → Setup page with extension download"
git pull --rebase --autostash origin main && git push --no-verify origin HEAD
```

(The `git rm` of `Configuration.vue` from Step 2 is already staged and rides
along in this commit.)

---

## Task 5: Retire the old `/ce` flow in services

**Files:**
- Modify: `services/src/main.ts`
- Modify: `services/src/config/config.schema.ts`
- Modify: `services/package.json`
- Delete: `services/scripts/deploy-chrome.mjs`, `services/public/ce/`

- [ ] **Step 1: Remove the `/ce` middleware + static mount + helper from `main.ts`**

In `services/src/main.ts`, delete the `safeEqual` helper (around line 19) and the
entire `/ce` block (the comment, the `ceUsername`/`cePassword` reads, the
`app.use('/ce', …)` middleware, and the `app.useStaticAssets(public/ce, …)`
mount — roughly lines 42–80). Leave the `public/email` static mount and the rest
of `bootstrap()` untouched. Also remove now-unused imports if they were only used
by that block (e.g. `Request`/`Response`/`NextFunction` from express — check
whether anything else in the file uses them before removing).

- [ ] **Step 2: Remove the config keys**

In `services/src/config/config.schema.ts`, delete the `CE_DOWNLOAD_USERNAME` and
`CE_DOWNLOAD_PASSWORD` fields (around lines 111–122) and their leading comment.

- [ ] **Step 3: Delete the old script + assets**

```bash
cd services
git rm scripts/deploy-chrome.mjs
git rm -r public/ce
```

- [ ] **Step 4: Remove the services `deploy:chrome` script**

In `services/package.json` `scripts`, delete the line:

```json
    "deploy:chrome": "node scripts/deploy-chrome.mjs",
```

- [ ] **Step 5: Verify the services gate**

Run: `cd services && npm run verify`
Expected: PASS — lint + typecheck (catches any dangling `CE_DOWNLOAD_*` /
`safeEqual` reference) + test + build + openapi all green. The OpenAPI snapshot is
unchanged (the `/ce` route was raw middleware, not a documented Nest route).

- [ ] **Step 6: Commit**

```bash
cd services
git add src/main.ts src/config/config.schema.ts package.json
git commit -m "chore(ce): retire api.quikfill.io/ce password download

Superseded by the app-served Settings → Setup download (frontend)."
git pull --rebase --autostash origin main && git push --no-verify origin HEAD
```

- [ ] **Step 7: Manual env cleanup (note, not code)**

Remove `CE_DOWNLOAD_USERNAME` / `CE_DOWNLOAD_PASSWORD` from `services/.env.production`
(gitignored) and from the Railway environment. This does not affect the build —
the keys are now absent from the schema — but keeps the env tidy.

---

## Task 6: First real publish + end-to-end verification

**Files:** none (operational).

- [ ] **Step 1: Run the new deploy**

Run: `cd frontend && pnpm deploy:chrome`
Expected: version bumps (e.g. 1.0.2 → 1.0.3), `wxt zip` builds, then the script
prints `Publishing quikfill-<ver>-chrome.zip -> apps/app/public/quikfill-extension.zip`,
makes ONE commit, rebases, and pushes.

- [ ] **Step 2: Verify exactly one zip + manifest landed**

Run:
```bash
cd frontend
ls apps/app/public/*.zip
cat apps/app/public/extension.json
git show --stat HEAD
```
Expected: exactly one `quikfill-extension.zip`; `extension.json` has the new
`version`/`filename`/`builtAt`; the HEAD commit touches ONLY
`apps/chrome-extension/package.json`, `apps/app/public/quikfill-extension.zip`,
and `apps/app/public/extension.json`.

- [ ] **Step 3: Verify the deployed download (after the Workers Build finishes)**

Once the `app-quikfill` Cloudflare Workers Build completes for the push:
```bash
curl -sI https://app.quikfill.io/extension.json | grep -i cache-control
curl -s  https://app.quikfill.io/extension.json
curl -sI "https://app.quikfill.io/quikfill-extension.zip" | grep -iE "content-type|cache-control"
```
Expected: `extension.json` returns `Cache-Control: no-cache` and the current
version JSON; the zip returns a `200`/`304` with `Cache-Control: no-cache`.

- [ ] **Step 4: Verify the Setup page in the browser**

Sign in to `https://app.quikfill.io`, open **Settings → Setup**. Confirm: the
version badge shows the new version, the **Download extension** button downloads
`quikfill-extension.zip?v=<version>`, and the load-unpacked steps render.
Unzip + Load unpacked once to confirm the build loads in Chrome.

---

## Self-review notes

- **Spec coverage:** deploy script (Task 1), caching (Tasks 1+2), Setup page +
  route/nav rename + back-compat redirect (Tasks 3+4), `/ce` retirement
  (Task 5), testing/gates (Tasks 3,4,5) and the operational first publish + e2e
  (Task 6) — every spec section maps to a task.
- **Type consistency:** `extensionManifestSchema` / `ExtensionManifest` /
  `buildDownloadHref` are defined in Task 3 and consumed unchanged in Task 4.
  The deploy script writes exactly the `{version, filename, builtAt}` keys the
  schema requires.
- **Concurrent-git:** every commit stages only explicit, quoted paths and lands
  via `pull --rebase --autostash` → push, per the standing convention.
```
