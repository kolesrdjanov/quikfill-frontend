# Chrome Extension v2 — Popup Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the toolbar **popup** the extension's only surface and reduce it to v2 scope — the user can **log in / sign up (email → OTP code) → see a success message → land on a mini-dashboard** showing their subscription/usage with a **Manage** button that opens the separate dashboard app. No settings, no scan UI. Filling continues to happen on the page via the content overlay.

**Architecture:** All surface logic already lives in surface-agnostic composables (`useAuthGate`, `useEntitlements`, `useExtensionTheme`) and components (`AuthPanel`, `BrandLockup`). The popup entrypoint already mounts a Vue app wired to them — today it's a _launcher_ that points at the side panel. This migration rewrites `popup/App.vue` into the v2 surface, flips the toolbar action so the icon opens the popup, and **retires both the side panel and the settings/options surfaces** (preserved as reference, unbuilt). The content overlay (`entrypoints/content/`), background message handlers, shared packages, and backend are unchanged.

**Tech stack:** WXT + Vue 3 (`<script setup lang="ts">`) + Tailwind v4 + `@quikfill/ui` (shadcn-vue). pnpm workspace. Build: `vue-tsc` typecheck + `wxt build`.

---

## Context the executor needs

- **Working directory:** `/Users/kole/workspace/quikfill/frontend` (the git repo; the workspace root is **not** a repo).
- **Single-user, local-first form-autofill extension.** Conventions: [`CLAUDE.md`](../../../CLAUDE.md), [`apps/chrome-extension/CLAUDE.md`](../../../apps/chrome-extension/CLAUDE.md). In-page fill flow: [`CHROME_EXTENSION_FLOW.md`](../../CHROME_EXTENSION_FLOW.md).
- **No component-test harness; frontend e2e is deferred.** UI is verified by `typecheck` + `build` + `lint` + manual checks (this plan touches no shared-package logic, so the Vitest suites stay green untouched).
- **Per-piece workflow:** verify → commit → push each coherent piece. Parallel sessions may touch the tree, so stage only your files (quoted explicit paths) and land via `git fetch origin && git rebase origin/main && git push origin main`. A `pre-commit` hook runs `pnpm lint && pnpm format:check && pnpm build` — all must be green to commit.
- **Commit trailer (required):** end every commit body with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Auth in a popup is safe (verified):** `useAuthGate.init()` restores the pending OTP email from the background snapshot ([`lib/useAuthGate.ts:162`](../../../apps/chrome-extension/lib/useAuthGate.ts)) and re-derives the `otp` screen, so closing the popup mid-sign-in and reopening returns to the code screen with the email pre-filled. `AuthPanel` already renders the whole flow including the **success ("You're in.")** screen before the gate advances to `app`. The gate exposes `signOut()`, `user`, and `isAppReady` ([`lib/useAuthGate.ts:233-257`](../../../apps/chrome-extension/lib/useAuthGate.ts)).
- **Theme without settings:** `useExtensionTheme().init('auto')` applies the `dark` class from the OS `prefers-color-scheme` and re-applies on change — no settings store needed. (`'auto'` is a valid `ThemePref`.)

### Decisions baked in (override if you disagree)

- **Sign out is included** in the mini-dashboard — without it a user could never switch accounts. Minimal ghost button.
- **The settings/options surface is fully retired** ("retire the whole settings part"): the `options` entrypoint is moved to `legacy/`, and the popup imports no `SettingsPanel`. `useSettings` / `ExtensionSettings` / `SettingsPanel` stay in the tree only because the _legacy_ surfaces still import them — they are not deleted, just unreferenced by anything that ships.
- **Dashboard URL:** `http://localhost:5173` in dev, `https://app.quikfill.io` in production, switched on `import.meta.env.PROD`.

---

## File structure

| File                                                             | Responsibility                                                     | Change                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| `apps/chrome-extension/entrypoints/popup/App.vue`                | v2 surface: auth gate → mini-dashboard (usage + Manage + Sign out) | **Rewrite**                                                    |
| `apps/chrome-extension/entrypoints/background.ts`                | Stop opening the side panel on icon click                          | **Modify** (remove `setPanelBehavior`)                         |
| `apps/chrome-extension/wxt.config.ts`                            | Minimize permissions (drop `sidePanel`, `activeTab`)               | **Modify**                                                     |
| `apps/chrome-extension/entrypoints/sidepanel/`                   | Retired side-panel surface (wizard + minimal panel)                | **Move** → `apps/chrome-extension/legacy/sidepanel/` (unbuilt) |
| `apps/chrome-extension/entrypoints/options/`                     | Retired settings/options page                                      | **Move** → `apps/chrome-extension/legacy/options/` (unbuilt)   |
| `docs/CHROME_EXTENSION_PLAN.md`, `docs/CHROME_EXTENSION_FLOW.md` | Status + flow docs                                                 | **Modify** (Task 6)                                            |

No new packages, no schema changes, no backend changes. The content overlay and all background message handlers are untouched.

---

## Task 1: Rewrite `popup/App.vue` as the v2 surface

**Files:**

- Modify (full replace): `apps/chrome-extension/entrypoints/popup/App.vue`

- [ ] **Step 1: Replace the file contents**

Write `apps/chrome-extension/entrypoints/popup/App.vue` with exactly:

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ArrowUpRight, LogOut } from 'lucide-vue-next'
import { Badge, Button } from '@quikfill/ui'
import BrandLockup from '../../components/BrandLockup.vue'
import AuthPanel from '../../components/auth/AuthPanel.vue'
import { useExtensionTheme } from '../../lib/useExtensionTheme'
import { useAuthGate } from '../../lib/useAuthGate'
import { useEntitlements } from '../../lib/useEntitlements'

// v2 surface: the toolbar popup is auth → success → a mini-dashboard of the user's
// subscription/usage, with a Manage button that opens the full dashboard app. No
// settings and no on-page scan live here — filling happens on the page (overlay).
const DASHBOARD_URL = import.meta.env.PROD ? 'https://app.quikfill.io' : 'http://localhost:5173'

const { init: initTheme } = useExtensionTheme()
const gate = useAuthGate()
const entitlements = useEntitlements()

const planLine = computed(() => {
  if (!entitlements.known.value) return null
  const name = entitlements.planName.value ?? 'Plan'
  const status = entitlements.status.value
  return status && status !== 'active' ? `${name} · ${status}` : name
})

const usageText = computed(() => {
  if (!entitlements.known.value) return 'Loading your plan…'
  if (entitlements.isUnlimited.value) return 'Unlimited AI fills'
  if (entitlements.isOverQuota.value) return 'AI limit reached — resets next month'
  return `≈ ${entitlements.fillsRemaining.value.toLocaleString()} AI fills left this month`
})

const showBar = computed(() => entitlements.known.value && !entitlements.isUnlimited.value)
const barPct = computed(() => Math.min(100, Math.max(0, entitlements.usagePercent.value)))
const barClass = computed(() =>
  entitlements.isOverQuota.value
    ? 'bg-destructive'
    : entitlements.isNearQuota.value
      ? 'bg-warning'
      : 'bg-primary',
)

onMounted(async () => {
  initTheme('auto')
  await gate.init()
  await entitlements.init()
})

function openDashboard() {
  void browser.tabs?.create({ url: DASHBOARD_URL })
  window.close()
}
</script>

<template>
  <div class="bg-card text-foreground w-[340px]">
    <!-- AUTH: log in / sign up → enter code → success (all handled by AuthPanel) -->
    <AuthPanel v-if="!gate.isAppReady.value" />

    <!-- MINI-DASHBOARD -->
    <div v-else class="flex flex-col gap-4 p-4">
      <div class="flex items-center justify-between">
        <BrandLockup />
        <Button variant="ghost" size="sm" class="gap-1.5" @click="gate.signOut()">
          <LogOut class="size-3.5" />
          Sign out
        </Button>
      </div>

      <div class="bg-muted/40 flex flex-col gap-3 rounded-[12px] border p-3.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[13px] font-semibold">{{ planLine ?? 'Your plan' }}</span>
          <Badge v-if="entitlements.isOverQuota.value" variant="danger">AI limit reached</Badge>
        </div>
        <p class="text-muted-foreground text-[12px]">{{ usageText }}</p>
        <div v-if="showBar" class="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div
            class="h-full rounded-full transition-all"
            :class="barClass"
            :style="{ width: `${barPct}%` }"
          />
        </div>
      </div>

      <p v-if="gate.user.value?.email" class="text-muted-foreground px-1 text-[11px]">
        Signed in as {{ gate.user.value.email }}
      </p>

      <Button class="w-full" @click="openDashboard">
        Manage subscription
        <ArrowUpRight class="size-4" />
      </Button>

      <p class="text-muted-foreground px-1 text-center text-[11px] leading-snug">
        Fill happens on the page — look for the QuikFill button near each form.
      </p>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Typecheck the extension**

Run: `pnpm --filter @quikfill/chrome-extension typecheck`
Expected: PASS (only the `vue-tsc --noEmit` banner, no errors).

> If `import.meta.env.PROD` is flagged by `vue-tsc`, replace the `DASHBOARD_URL` line with:
> `const DASHBOARD_URL = import.meta.env.MODE === 'production' ? 'https://app.quikfill.io' : 'http://localhost:5173'`
> and re-run.

- [ ] **Step 3: Lint + format**

Run: `pnpm exec prettier --write apps/chrome-extension/entrypoints/popup/App.vue && pnpm exec eslint apps/chrome-extension/entrypoints/popup/App.vue`
Expected: prettier writes/confirms; eslint exits 0.

- [ ] **Step 4: Build**

Run: `pnpm --filter @quikfill/chrome-extension build`
Expected: `✔ Finished`; output lists `.output/chrome-mv3/popup.html`.

- [ ] **Step 5: Commit**

```bash
git add apps/chrome-extension/entrypoints/popup/App.vue
git commit -m "feat(ext): v2 popup — auth + subscription/usage mini-dashboard

Rewrite popup/App.vue into the v2 surface: AuthPanel handles log in / sign up /
OTP / success, then a mini-dashboard shows plan + AI usage with a Manage button
that opens the dashboard app (localhost:5173 in dev, app.quikfill.io in prod) and
a Sign out action. No settings, no scan UI — filling stays on the page.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Open the popup on the toolbar icon; minimize permissions

The icon currently opens the side panel because `background.ts` calls `setPanelBehavior({ openPanelOnActionClick: true })` (which makes Chrome ignore the popup). Removing it restores the popup (`default_popup`, set by WXT from the popup entrypoint). With the side panel and the surface-initiated scan both gone, the `sidePanel` and `activeTab` permissions are no longer used.

**Files:**

- Modify: `apps/chrome-extension/entrypoints/background.ts`
- Modify: `apps/chrome-extension/wxt.config.ts`

- [ ] **Step 1: Remove the side-panel behavior from background.ts**

In `apps/chrome-extension/entrypoints/background.ts`, delete this line (first statement inside `defineBackground(() => {`):

```ts
// Open the side panel (the primary UI) when the toolbar icon is clicked.
browser.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {})
```

Leave everything else (badge logic, auth/entitlements/sync wiring, all message handlers) unchanged.

- [ ] **Step 2: Minimize permissions in wxt.config.ts**

In `apps/chrome-extension/wxt.config.ts`, change:

```ts
    permissions: ['sidePanel', 'scripting', 'storage', 'activeTab'],
```

to:

```ts
    permissions: ['scripting', 'storage'],
```

(`activeTab` was only used by surface-initiated `requestScan`, which v2 drops. The content script still injects via its declared `matches: ['<all_urls>']`, and the background reaches the backend via `host_permissions` — neither needs `activeTab`. Step 4's manual check confirms on-page fill still works; if it ever doesn't, restore `activeTab`.)

- [ ] **Step 3: Typecheck + build + manifest check**

Run: `pnpm --filter @quikfill/chrome-extension typecheck && pnpm --filter @quikfill/chrome-extension build && cat apps/chrome-extension/.output/chrome-mv3/manifest.json`
Expected: both PASS; the manifest has `"action": { "default_popup": "popup.html" }`, and `"permissions"` contains neither `"sidePanel"` nor `"activeTab"`.

- [ ] **Step 4: Manual smoke (defer full verification to Task 5)**

Load `apps/chrome-extension/.output/chrome-mv3` unpacked, open a page with a form, confirm the on-page QuikFill button still appears and fills. (This validates dropping `activeTab` didn't break the content overlay.)

- [ ] **Step 5: Commit**

```bash
git add apps/chrome-extension/entrypoints/background.ts apps/chrome-extension/wxt.config.ts
git commit -m "feat(ext): open the popup on the toolbar icon; trim permissions

Stop calling sidePanel.setPanelBehavior so the action opens the popup
(default_popup), and drop the now-unused sidePanel + activeTab permissions
(no surface-initiated scan in v2; the content script injects via matches).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Retire the side-panel entrypoint (preserve as reference)

Moving `entrypoints/sidepanel/` out of `entrypoints/` makes WXT stop emitting a `side_panel` manifest entry and `sidepanel.html`, while keeping the code. Relative imports (`../../components`, `../../lib`) resolve the same from `legacy/sidepanel/` (both are two levels below the app root).

**Files:**

- Move: `apps/chrome-extension/entrypoints/sidepanel/` → `apps/chrome-extension/legacy/sidepanel/`

- [ ] **Step 1: Move the directory**

```bash
mkdir -p apps/chrome-extension/legacy
git mv apps/chrome-extension/entrypoints/sidepanel apps/chrome-extension/legacy/sidepanel
```

- [ ] **Step 2: Add a marker**

Create `apps/chrome-extension/legacy/sidepanel/README.md`:

```markdown
# LEGACY — side panel (retired in v2)

The extension's surface is the toolbar **popup** (`entrypoints/popup/App.vue`).
This retired side panel is kept for reference and **not built** (it lives outside
`entrypoints/`, so WXT ignores it):

- `App.vue` — the post-revamp minimal side panel (auth + settings + scan).
- `App.legacy.vue` — the original scan → preview → AI → fill wizard.

Do not delete. The wizard also drives `lib/useFillSession.ts` and
`components/sidepanel/*`, which remain in the tree for the same reason.
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @quikfill/chrome-extension typecheck && pnpm --filter @quikfill/chrome-extension build`
Expected: both PASS; the build output no longer lists `sidepanel.html`. (If `vue-tsc` errors on moved files — it shouldn't, the move preserves imports — add `"apps/chrome-extension/legacy"` to `exclude` in `apps/chrome-extension/tsconfig.json` only if an error actually appears.)

- [ ] **Step 4: Commit**

```bash
git add apps/chrome-extension/legacy apps/chrome-extension/entrypoints
git commit -m "refactor(ext): retire the side-panel entrypoint to legacy/ (unbuilt)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Retire the settings / options surface

v2 has no settings. Move the options page (the settings surface) to `legacy/` the same way. `SettingsPanel`, `useSettings`, and the `ExtensionSettings` schema stay in the tree (still imported by the legacy sidepanel/options) but are referenced by nothing that ships. The popup never imported them (Task 1), and theme works via `useExtensionTheme('auto')`.

**Files:**

- Move: `apps/chrome-extension/entrypoints/options/` → `apps/chrome-extension/legacy/options/`

- [ ] **Step 1: Move the directory**

```bash
git mv apps/chrome-extension/entrypoints/options apps/chrome-extension/legacy/options
```

- [ ] **Step 2: Add a marker**

Create `apps/chrome-extension/legacy/options/README.md`:

```markdown
# LEGACY — options/settings page (retired in v2)

v2 has no in-extension settings. This options page is preserved for reference and
**not built** (outside `entrypoints/`). It still imports `useSettings` and the
`SettingsPanel` / `OptionRow` components, which remain in the tree only for this
and the legacy side panel. Do not delete.
```

- [ ] **Step 3: Typecheck + build + manifest check**

Run: `pnpm --filter @quikfill/chrome-extension typecheck && pnpm --filter @quikfill/chrome-extension build && cat apps/chrome-extension/.output/chrome-mv3/manifest.json`
Expected: both PASS; the build output no longer lists `options.html`; the manifest has no `"options_ui"` / `"options_page"` key.

- [ ] **Step 4: Commit**

```bash
git add apps/chrome-extension/legacy apps/chrome-extension/entrypoints
git commit -m "refactor(ext): retire the options/settings page to legacy/ (unbuilt)

v2 has no in-extension settings. SettingsPanel/useSettings/ExtensionSettings stay
in the tree, now referenced only by the legacy surfaces.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Quality gate + manual verification

- [ ] **Step 1: Full frontend gate**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test`
Expected: every command exits 0.

- [ ] **Step 2: Manual verification**

Load `apps/chrome-extension/.output/chrome-mv3` unpacked (Chrome/Edge/Brave — not Arc). With the backend running (`cd ../../services && npm run start:dev`, dev DB up):

1. Click the toolbar icon → a **dropdown popup** opens (not a side panel).
2. **Signed out:** the popup shows the email screen. Enter an email → **request code** → the OTP screen appears (this is both log in and sign up — a new email auto-creates the account).
3. Enter the emailed code (dev logs it to the backend console as `devCode`) → a brief **success ("You're in.")** screen → the **mini-dashboard**.
4. **Mini-dashboard:** shows the plan name (+ status if not active), the AI-usage line (`≈ N fills left` / `Unlimited` / `AI limit reached`), the usage bar for capped plans, and "Signed in as <email>".
5. **Manage subscription** → opens a new tab at `http://localhost:5173` (dev) and closes the popup.
6. **Sign out** → returns the popup to the email screen.
7. **OTP-across-close:** at the OTP screen, click the page to dismiss the popup, reopen → back on the OTP screen with the email pre-filled.
8. On a real page with a form, the on-page **Fill button still appears and fills** (overlay unaffected), and is hidden when over quota.

- [ ] **Step 3: Sizing pass (only if Step 2 looked wrong)**

If the mini-dashboard or auth screen is cramped, widen the root (`w-[340px]` → e.g. `w-[360px]`) and/or add a min-height (`class="bg-card text-foreground w-[340px] min-h-[360px]"`) in `popup/App.vue`; re-run `typecheck` + `build`, then commit `fix(ext): popup sizing pass`.

---

## Task 6: Docs + push

**Files:**

- Modify: `docs/CHROME_EXTENSION_PLAN.md`
- Modify: `docs/CHROME_EXTENSION_FLOW.md`

- [ ] **Step 1: `docs/CHROME_EXTENSION_PLAN.md`** — add a status row beneath the in-page-fill row:

```markdown
| — | v2 popup surface (auth + usage mini-dashboard; side panel & settings retired) | ✅ Done |
```

And a note after the in-page-flow note:

```markdown
> **v2 popup surface:** the extension's UI is the **toolbar popup** (a dropdown).
> It is auth (email-OTP log in / sign up) → success → a **mini-dashboard** of the
> user's subscription/usage with a **Manage** button to the dashboard app
> (`localhost:5173` dev / `app.quikfill.io` prod) and a Sign out. There are **no
> in-extension settings and no scan UI** — filling happens on the page via the
> content overlay. The icon opens the popup (`default_popup`); the `sidePanel` and
> `activeTab` permissions are dropped, and the side-panel and options/settings
> entrypoints are retired to `apps/chrome-extension/legacy/` (preserved, unbuilt).
```

- [ ] **Step 2: `docs/CHROME_EXTENSION_FLOW.md`** — in §1 ("Target flow"), change the first item so the user signs in through the **toolbar popup**, which after sign-in shows a **subscription/usage mini-dashboard with a Manage link to the dashboard app** (drop the "subscription settings + single-action scan form" wording). The overlay sections elsewhere remain accurate — leave them.

- [ ] **Step 3: Format, commit, push everything**

```bash
pnpm exec prettier --write docs/CHROME_EXTENSION_PLAN.md docs/CHROME_EXTENSION_FLOW.md
git add docs/CHROME_EXTENSION_PLAN.md docs/CHROME_EXTENSION_FLOW.md
git commit -m "docs(ext): record the v2 popup surface (mini-dashboard; settings retired)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git fetch origin
git rebase origin/main
git push origin main
```

Expected: push succeeds (hooks re-run the gate). On a rebase conflict, keep both sides, re-run `pnpm typecheck && pnpm build`, continue.

---

## Self-review notes (for the executor)

- **Spec coverage:** Task 1 = auth + success + mini-dashboard + Manage + Sign out; Task 2 = popup opens on the icon + minimal permissions; Task 3 = side panel retired; Task 4 = settings/options retired; Task 5 = verified incl. OTP-across-close and that dropping `activeTab` didn't break on-page fill; Task 6 = docs + push.
- **Do NOT** import `SettingsPanel`, `useSettings`, `PanelShell`, `SiteChip`, or any scan/`requestScan` code into the popup — v2 has none of that.
- **Do NOT** touch `entrypoints/content/`, background message handlers, `@quikfill/*` packages, or the backend.
- **`Progress` is not exported from `@quikfill/ui`** — the mini-dashboard uses a plain inline bar (`<div>` with a `%` width), so do not add a `Progress` import.
- **`activeTab` removal is the one reversible risk** — Task 2 Step 4 + Task 5 Step 2.8 verify on-page fill still works; restore `activeTab` if it ever doesn't.
- **Entitlements freshness:** the mini-dashboard reads the cached snapshot; it refreshes on the background's own triggers and on an over-quota fill. If you want the dashboard to always show live numbers on open, add `await entitlements.refresh()` in `onMounted` after `init()` — optional, one line.
