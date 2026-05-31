# Chrome Extension — Popup Dropdown Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the side panel with the toolbar **popup** (the native dropdown from the extension icon) as the extension's only surface — hosting auth, subscription settings, AI-budget/usage, and a single-action scan — while filling continues to happen on the page via the content overlay.

**Architecture:** All surface logic already lives in surface-agnostic composables (`useAuthGate`, `useEntitlements`, `useSettings`, `useExtensionTheme`) and components (`AuthPanel`, `SettingsPanel`, `BrandLockup`). The popup entrypoint (`entrypoints/popup/`) already mounts a Vue app wired to all of them — today it's just a _launcher_ that points at the side panel. This migration rewrites `popup/App.vue` to host the real UI, flips the toolbar action so the icon opens the popup instead of the side panel, and retires the side-panel entrypoint (preserved as reference, unbuilt). The content overlay (`entrypoints/content/`) is unchanged.

**Tech stack:** WXT + Vue 3 (`<script setup lang="ts">`) + Tailwind v4 + `@quikfill/ui` (shadcn-vue). pnpm workspace. Build: `vue-tsc` typecheck + `wxt build`.

---

## Context the executor needs

- **Working directory:** `/Users/kole/workspace/quikfill/frontend` (this is the git repo; the workspace root is **not** a repo).
- **This is a single-user, local-first form-autofill extension.** Repo conventions: [`CLAUDE.md`](../../../CLAUDE.md) and [`apps/chrome-extension/CLAUDE.md`](../../../apps/chrome-extension/CLAUDE.md). The in-page fill flow is documented in [`CHROME_EXTENSION_FLOW.md`](../../CHROME_EXTENSION_FLOW.md).
- **The extension has no component-test harness and frontend e2e is deferred** (per the flow revamp). So UI work is verified by `typecheck` + `build` + `lint` + manual checks, not by component unit tests. (Logic in shared packages keeps its Vitest tests; this plan touches no shared-package logic.)
- **Per-piece workflow (project rule):** verify → commit → push each coherent piece. Parallel sessions may touch the same tree, so: confirm the branch, stage only the files you changed (quoted explicit paths), and land via `git fetch origin && git rebase origin/main && git push origin main`. The repo has a `pre-commit` hook that runs `pnpm lint && pnpm format:check && pnpm build` — all must be green for a commit to land.
- **Commit message trailer (required):** end every commit body with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Why a popup is safe for auth (verified):** `useAuthGate.init()` restores the pending OTP email from the background snapshot (`if (state.status === 'code-sent') email.value = state.pendingEmail ?? email.value`, [`lib/useAuthGate.ts:162`](../../../apps/chrome-extension/lib/useAuthGate.ts)) and re-derives the `otp` screen, so closing the popup mid-sign-in (e.g. to copy the code from email) and reopening lands the user back on the OTP screen with the right email. The only thing not restored is the **client-side** attempt counter / TTL labels (`attemptsLeft`, `codeExpiresAt`) — verification is server-authoritative, so this is cosmetic. Task 5 (optional) hardens that.

---

## File structure

| File                                                                    | Responsibility                                                      | Change                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/chrome-extension/entrypoints/popup/App.vue`                       | The surface: auth gate → main (explainer + usage + scan) → settings | **Rewrite** (port of the minimal `sidepanel/App.vue`, popup-sized)                  |
| `apps/chrome-extension/entrypoints/background.ts`                       | Stop opening the side panel on icon click                           | **Modify** (remove `setPanelBehavior`)                                              |
| `apps/chrome-extension/wxt.config.ts`                                   | Drop the `sidePanel` permission                                     | **Modify**                                                                          |
| `apps/chrome-extension/entrypoints/sidepanel/`                          | The retired side-panel surface (wizard + minimal panel)             | **Move** to `apps/chrome-extension/legacy/sidepanel/` (preserved, unbuilt)          |
| `apps/chrome-extension/lib/useFillSession.ts`, `components/sidepanel/*` | Legacy wizard composable + components                               | **Unchanged** (already unreferenced; still imported only by the moved legacy files) |
| `docs/CHROME_EXTENSION_PLAN.md`, `docs/CHROME_EXTENSION_FLOW.md`        | Status + flow docs                                                  | **Modify** (Task 6)                                                                 |

No new packages, no schema changes, no backend changes.

---

## Task 1: Rewrite `popup/App.vue` as the real surface

**Files:**

- Modify (full replace): `apps/chrome-extension/entrypoints/popup/App.vue`

This ports the minimal `sidepanel/App.vue` (auth gate + usage chip + settings + single-action scan) into the popup, sized for a dropdown (fixed width, settings scrolls within a bounded height). It removes all the old "open the side panel" launcher code.

- [ ] **Step 1: Replace the file contents**

Write `apps/chrome-extension/entrypoints/popup/App.vue` with exactly:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowLeft, MousePointerClick, ScanLine, Settings, ShieldCheck } from 'lucide-vue-next'
import { Alert, Badge, Button } from '@quikfill/ui'
import { getActiveTab, getActiveTabId, requestScan } from '@quikfill/browser-adapter'
import BrandLockup from '../../components/BrandLockup.vue'
import AuthPanel from '../../components/auth/AuthPanel.vue'
import SettingsPanel from '../../components/sidepanel/SettingsPanel.vue'
import { useSettings } from '../../lib/useSettings'
import { useExtensionTheme } from '../../lib/useExtensionTheme'
import { useAuthGate } from '../../lib/useAuthGate'
import { useEntitlements } from '../../lib/useEntitlements'

// The toolbar popup is now the whole surface: auth + subscription settings +
// AI-budget + a single-action scan. Filling happens on the page (content overlay
// floating buttons). The old side-panel wizard lives in legacy/sidepanel/.
const { load: loadSettings } = useSettings()
const { init: initTheme } = useExtensionTheme()
const gate = useAuthGate()
const entitlements = useEntitlements()

const view = ref<'main' | 'settings'>('main')
const hostname = ref('')
const scanning = ref(false)
const fieldCount = ref<number | null>(null)
const scopeLabel = ref<string | undefined>(undefined)
const scanError = ref<string | null>(null)

/** Compact AI-budget chip for the header; null for unlimited / unknown plans. */
const usageChip = computed(() => {
  if (!entitlements.known.value || entitlements.isUnlimited.value) return null
  const variant = entitlements.isOverQuota.value
    ? 'danger'
    : entitlements.isNearQuota.value
      ? 'warning'
      : 'gray'
  const label = entitlements.isOverQuota.value
    ? 'AI limit reached'
    : `≈ ${entitlements.fillsRemaining.value.toLocaleString()} AI fills left`
  return { variant, label } as const
})

const siteInitial = computed(
  () =>
    hostname.value
      .replace(/^www\./, '')
      .charAt(0)
      .toUpperCase() || 'Q',
)

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

onMounted(async () => {
  const loaded = await loadSettings()
  initTheme(loaded.theme)
  await gate.init()
  await entitlements.init()
  try {
    const tab = await getActiveTab()
    hostname.value = safeHostname(tab.url ?? '')
  } catch {
    hostname.value = ''
  }
})

// Single-action scan: report how many fillable fields are on the page. The actual
// fill is triggered on the page itself via the overlay's floating buttons.
async function scan() {
  scanning.value = true
  scanError.value = null
  try {
    const tabId = await getActiveTabId()
    if (tabId === undefined) throw new Error('No active tab')
    const result = await requestScan(tabId, { includeHidden: false, scope: 'auto' })
    fieldCount.value = result.fields.length
    scopeLabel.value = result.scope?.label
  } catch (e) {
    console.error('[quikfill] scan request failed:', e)
    scanError.value =
      'Could not scan this page. Reload the page so the content script is active, then try again.'
    fieldCount.value = null
  } finally {
    scanning.value = false
  }
}
</script>

<template>
  <div class="bg-card text-foreground w-[360px]">
    <!-- AUTH GATE — full-bleed until the gate is lifted -->
    <AuthPanel v-if="!gate.isAppReady.value" />

    <template v-else>
      <!-- HEADER -->
      <div class="bg-card flex items-center justify-between border-b px-4 py-3">
        <div v-if="view === 'settings'" class="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            class="size-[30px]"
            aria-label="Back"
            @click="view = 'main'"
          >
            <ArrowLeft class="size-4" />
          </Button>
          <span class="text-[15px] font-semibold">Preferences</span>
        </div>
        <template v-else>
          <BrandLockup />
          <div class="flex items-center gap-1.5">
            <Badge v-if="usageChip" :variant="usageChip.variant">{{ usageChip.label }}</Badge>
            <Button
              variant="ghost"
              size="icon"
              class="size-[30px]"
              aria-label="Settings"
              @click="view = 'settings'"
            >
              <Settings class="size-4" />
            </Button>
          </div>
        </template>
      </div>

      <!-- SETTINGS (scrolls within the bounded popup height) -->
      <div v-if="view === 'settings'" class="max-h-[460px] overflow-y-auto p-4">
        <SettingsPanel />
      </div>

      <!-- MAIN: in-page fill explainer + single-action scan -->
      <div v-else class="flex flex-col gap-3 p-4">
        <div class="flex items-start gap-2.5">
          <MousePointerClick class="text-primary mt-0.5 size-5 shrink-0" />
          <div>
            <p class="text-[14px] font-semibold">Fill happens on the page</p>
            <p class="text-muted-foreground text-[12px] leading-snug">
              Look for the QuikFill button near each form’s submit button on
              {{ hostname || 'this page' }}. Hover it and click “Fill”.
            </p>
          </div>
        </div>

        <Alert variant="info" class="text-left text-[12px]">
          <ShieldCheck />
          <div>Only redacted field metadata is sent — never your values or the page HTML.</div>
        </Alert>

        <Alert v-if="fieldCount !== null && !scanError" variant="success" class="text-[12px]">
          <ScanLine />
          <div>
            <strong>{{ fieldCount }} fillable {{ fieldCount === 1 ? 'field' : 'fields' }}</strong>
            detected<template v-if="scopeLabel"> in {{ scopeLabel }}</template
            >. Use the on-page Fill button to fill them.
          </div>
        </Alert>

        <p v-if="scanError" class="text-destructive text-[13px]">{{ scanError }}</p>

        <Button class="w-full" :disabled="scanning" @click="scan()">
          <ScanLine class="size-4" />
          {{ scanning ? 'Scanning…' : 'Scan this page' }}
        </Button>
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 2: Typecheck the extension**

Run: `pnpm --filter @quikfill/chrome-extension typecheck`
Expected: PASS (no output after the `vue-tsc --noEmit` banner). If `siteInitial` is reported as unused, that's expected to be used in the template — it is referenced via `{{ }}`? It is **not** in this template, so **remove the `siteInitial` computed** (it was only needed by the side panel's `SiteChip`). Re-run until clean.

> Note: the code above intentionally does not render `siteInitial`. Delete the `const siteInitial = computed(...)` block in Step 1 before typechecking to avoid an unused-variable lint error. (Left in the snippet only so you can see it was considered and dropped.)

- [ ] **Step 3: Lint + format the file**

Run: `pnpm exec prettier --write apps/chrome-extension/entrypoints/popup/App.vue && pnpm exec eslint apps/chrome-extension/entrypoints/popup/App.vue`
Expected: prettier writes/confirms; eslint exits 0 with no output.

- [ ] **Step 4: Build the extension**

Run: `pnpm --filter @quikfill/chrome-extension build`
Expected: `✔ Finished`, and the output lists `.output/chrome-mv3/popup.html`.

- [ ] **Step 5: Commit**

```bash
git add apps/chrome-extension/entrypoints/popup/App.vue
git commit -m "feat(ext): host auth + settings + scan in the toolbar popup

Rewrite popup/App.vue from a side-panel launcher into the real surface: the
auth gate, subscription settings, AI-budget chip, and a single-action scan,
sized for a dropdown. Filling still happens on the page via the content overlay.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Flip the toolbar action to open the popup

The icon currently opens the side panel because `background.ts` calls `setPanelBehavior({ openPanelOnActionClick: true })` — when that is on, Chrome opens the side panel on action click and **ignores** the popup. Removing it restores the popup (`default_popup`, which WXT sets from the popup entrypoint) as the action.

**Files:**

- Modify: `apps/chrome-extension/entrypoints/background.ts`
- Modify: `apps/chrome-extension/wxt.config.ts`

- [ ] **Step 1: Remove the side-panel behavior from background.ts**

In `apps/chrome-extension/entrypoints/background.ts`, delete this line (it is the first statement inside `defineBackground(() => {`):

```ts
// Open the side panel (the primary UI) when the toolbar icon is clicked.
browser.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {})
```

Leave everything else in the file unchanged (the badge logic, auth/entitlements/sync wiring, and all message handlers stay).

- [ ] **Step 2: Drop the `sidePanel` permission from wxt.config.ts**

In `apps/chrome-extension/wxt.config.ts`, change the permissions array from:

```ts
    permissions: ['sidePanel', 'scripting', 'storage', 'activeTab'],
```

to:

```ts
    permissions: ['scripting', 'storage', 'activeTab'],
```

(`activeTab` stays — it's what `requestScan` needs on the user-initiated scan.)

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @quikfill/chrome-extension typecheck && pnpm --filter @quikfill/chrome-extension build`
Expected: both PASS.

- [ ] **Step 4: Verify the built manifest opens the popup, not the side panel**

Run: `cat apps/chrome-extension/.output/chrome-mv3/manifest.json`
Expected: the `"action"` object has `"default_popup": "popup.html"`, AND there is **no** `"side_panel"` key and **no** `"sidePanel"` in `"permissions"`. (The `side_panel` key disappears in Task 3 when the entrypoint is moved; at this step it may still be present — that's fine, this step only confirms `default_popup` is set and `sidePanel` permission is gone.)

- [ ] **Step 5: Commit**

```bash
git add apps/chrome-extension/entrypoints/background.ts apps/chrome-extension/wxt.config.ts
git commit -m "feat(ext): open the popup on the toolbar icon, drop sidePanel permission

Stop calling sidePanel.setPanelBehavior so the action falls back to the popup
(default_popup), and remove the now-unused sidePanel permission.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Retire the side-panel entrypoint (preserve as reference)

Moving `entrypoints/sidepanel/` out of `entrypoints/` makes WXT stop emitting a `side_panel` manifest entry and a `sidepanel.html`, while keeping the code (the legacy wizard `App.legacy.vue` and the minimal `App.vue`) for reference. Relative imports (`../../components`, `../../lib`) resolve the same from `legacy/sidepanel/` because both directories are two levels below the app root.

**Files:**

- Move: `apps/chrome-extension/entrypoints/sidepanel/` → `apps/chrome-extension/legacy/sidepanel/`

- [ ] **Step 1: Move the directory (preserve git history)**

```bash
mkdir -p apps/chrome-extension/legacy
git mv apps/chrome-extension/entrypoints/sidepanel apps/chrome-extension/legacy/sidepanel
```

- [ ] **Step 2: Add a LEGACY marker so the directory's status is self-evident**

Create `apps/chrome-extension/legacy/sidepanel/README.md` with:

```markdown
# LEGACY — side panel (retired)

The extension's surface moved to the toolbar **popup** (`entrypoints/popup/App.vue`).
This directory is the retired side panel, kept for reference and **not built** (it
lives outside `entrypoints/`, so WXT ignores it):

- `App.vue` — the minimal post-revamp side panel (auth + settings + scan), superseded by the popup.
- `App.legacy.vue` — the original scan → preview → AI-suggestion → fill **wizard**, disabled during the in-page fill revamp.

Do not delete — restore or harvest from here if the side panel returns. The wizard
also still drives `lib/useFillSession.ts` and `components/sidepanel/*`, which remain
in the tree for the same reason.
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @quikfill/chrome-extension typecheck && pnpm --filter @quikfill/chrome-extension build`
Expected: both PASS. The build output should **no longer** list `sidepanel.html`.

> If `vue-tsc` errors on files under `legacy/` (it includes all `.vue` by tsconfig globs), that's fine as long as they were compiling before the move — the move doesn't change their imports. If the project's `tsconfig.json` has an `include`/`exclude` you'd rather not have legacy in, you may add `"apps/chrome-extension/legacy"` to `exclude` — but only if a typecheck error actually appears; otherwise leave tsconfig untouched.

- [ ] **Step 4: Confirm the side panel is gone from the manifest**

Run: `cat apps/chrome-extension/.output/chrome-mv3/manifest.json`
Expected: no `"side_panel"` key; `"action": { "default_popup": "popup.html" }` present; `"permissions"` has no `sidePanel`.

- [ ] **Step 5: Commit**

```bash
git add apps/chrome-extension/legacy apps/chrome-extension/entrypoints
git commit -m "refactor(ext): retire the side-panel entrypoint to legacy/ (unbuilt)

Move entrypoints/sidepanel → legacy/sidepanel so WXT stops emitting a side_panel
surface; the minimal panel and the legacy wizard are preserved for reference.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Quality gate + manual verification

- [ ] **Step 1: Run the full frontend gate**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test`
Expected: every command exits 0. (`pnpm test` runs the shared-package Vitest suites — they should be unaffected by this UI-only change.)

- [ ] **Step 2: Load the unpacked build and verify by hand**

1. `pnpm dev:ext` (or load `apps/chrome-extension/.output/chrome-mv3` as an unpacked extension at `chrome://extensions`). Use Chrome/Edge/Brave — Arc has no reliable popup.
2. Click the toolbar icon → a **dropdown popup** opens (NOT a side panel).
3. **Signed out:** the popup shows the auth screen (`AuthPanel`). Enter your email → request code → the OTP screen appears.
4. **OTP-across-close:** with the OTP screen showing, click the page to dismiss the popup, then reopen it → it returns to the OTP screen with your email pre-filled (proves background-snapshot recovery). Complete sign-in.
5. **Signed in:** the popup header shows the logo + the AI-budget chip; the body shows the "Fill happens on the page" explainer + "Scan this page".
6. Click **Scan this page** → it reports the fillable-field count for the current tab.
7. Click the **gear** → `SettingsPanel` (subscription + settings) renders and **scrolls within the popup** if taller than ~460px; the back arrow returns to main.
8. On a real page with a form, the **on-page Fill button still appears and fills** (overlay unaffected), and is hidden when over quota.

- [ ] **Step 3: Adjust popup sizing if needed (only if Step 2 looked wrong)**

If the popup is too narrow/cramped for `SettingsPanel`, widen the root in `popup/App.vue` (`w-[360px]` → e.g. `w-[380px]`) and/or raise the settings scroll cap (`max-h-[460px]`). If the auth screen looks too short, add a min-height to the root wrapper (e.g. `class="bg-card text-foreground w-[360px] min-h-[420px]"`). Re-run Step 1's `typecheck` + `build` and re-commit `popup/App.vue` with message `fix(ext): popup sizing pass`.

---

## Task 5 (OPTIONAL polish): Persist OTP attempt/TTL across popup close

Only do this if, during Task 4 Step 4, the wrong/expired/locked **labels** matter to you. Sign-in itself already works across popup close (server-authoritative); this only restores the _client-side_ labeling. Skip otherwise — it is not required for the migration.

**Files:**

- Modify: `apps/chrome-extension/lib/useAuthGate.ts`

- [ ] **Step 1: Persist the transient OTP counters to `chrome.storage.session`**

In `lib/useAuthGate.ts`, after `attemptsLeft` / `codeExpiresAt` / `cooldownUntil` are updated (in `requestCode`, `verify`, and the rate-limit path), write them to `browser.storage.session` under a key like `ui:otpState`, and in `init()` (when the restored screen is `otp`) read them back and seed the refs. Keep the existing in-memory defaults as the fallback when the key is absent.

- [ ] **Step 2: Typecheck + build + lint**

Run: `pnpm --filter @quikfill/chrome-extension typecheck && pnpm --filter @quikfill/chrome-extension build && pnpm exec eslint apps/chrome-extension/lib/useAuthGate.ts`
Expected: all PASS.

- [ ] **Step 3: Manually verify** the OTP error label survives a popup close (enter a wrong code, reopen, confirm the attempt count carried over), then **commit** with `feat(ext): persist OTP attempt/TTL across popup close`.

---

## Task 6: Docs + push both pieces

**Files:**

- Modify: `docs/CHROME_EXTENSION_PLAN.md`
- Modify: `docs/CHROME_EXTENSION_FLOW.md`

- [ ] **Step 1: Update `docs/CHROME_EXTENSION_PLAN.md`**

In the status table, add a row beneath the in-page fill row:

```markdown
| — | Toolbar popup is the surface (side panel retired) | ✅ Done |
```

Then add a short note paragraph after the existing in-page-flow note:

```markdown
> **Popup surface (post in-page revamp):** the extension's UI moved from the side
> panel to the **toolbar popup** (a dropdown). It hosts the auth gate, subscription
> settings, the AI-budget chip, and a single-action scan; filling stays on the page
> via the content overlay. The icon opens the popup (`default_popup`); the
> `sidePanel` permission is dropped and the side-panel entrypoint is retired to
> `apps/chrome-extension/legacy/sidepanel/` (preserved, unbuilt).
```

- [ ] **Step 2: Update `docs/CHROME_EXTENSION_FLOW.md`**

In §1 ("Target flow"), change the first numbered item to say the user signs in through the **toolbar popup** (not "popup / side panel"), and that the popup keeps only auth + subscription settings + a single-action scan form. Everything else in the doc (the overlay sections) is still accurate — leave it.

- [ ] **Step 3: Format, gate, commit**

```bash
pnpm exec prettier --write docs/CHROME_EXTENSION_PLAN.md docs/CHROME_EXTENSION_FLOW.md
git add docs/CHROME_EXTENSION_PLAN.md docs/CHROME_EXTENSION_FLOW.md
git commit -m "docs(ext): record the popup-dropdown surface migration

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Land everything on origin/main**

```bash
git fetch origin
git rebase origin/main
git push origin main
```

Expected: push succeeds (the `pre-push`/`pre-commit` hooks re-run the gate). If the rebase reports conflicts, resolve them in favor of keeping both your changes and incoming ones, re-run `pnpm typecheck && pnpm build`, then continue.

---

## Self-review notes (for the executor)

- **Spec coverage:** Task 1 = popup hosts the surface; Task 2 = icon opens popup; Task 3 = side panel retired/preserved; Task 4 = verified incl. the OTP-across-close concern; Task 5 = optional OTP-label polish; Task 6 = docs + push. All of the original scoping discussion is covered.
- **Known sharp edge — `siteInitial`:** the Task 1 snippet includes a `siteInitial` computed that the popup template does **not** use (it was for the side panel's `SiteChip`). Delete it before typechecking (called out in Task 1 Step 2) or eslint's `no-unused-vars` will fail the build.
- **Do not** re-introduce `SiteChip`/`PanelShell` in the popup — those are side-panel chrome; the popup uses its own compact layout.
- **Do not** touch `entrypoints/content/`, the background message handlers, `@quikfill/*` packages, or the backend — this migration is surface-only.
