# Settings Nav Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible **Settings** sidebar group (Billing / Account / Configuration) to `@quikfill/app`, with an Account page to edit first/last name, moving Billing to `/settings/billing` with back-compat redirects.

**Architecture:** Pure frontend change in `apps/app`. New routes under `/settings/*`; a new `Account.vue` (split out of the existing dead `Settings.vue`) and a placeholder `Configuration.vue`; the sidebar gains an inline collapsible disclosure group mirroring the existing Admin section. No backend, schema, or store changes — `auth.updateProfile` and `profileFormSchema` already exist.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), Vue Router, Pinia, VeeValidate + Zod, Tailwind v4, `@quikfill/ui` (shadcn-vue), `lucide-vue-next`.

**Verification note:** These are presentational + routing changes; per repo convention (existing `Settings`/`Billing` views have no Vitest) no unit tests are added. Each task is verified by the quality gate — `pnpm --filter @quikfill/app typecheck` and/or `pnpm --filter @quikfill/app build` — plus a structural grep. The pre-commit hook runs `lint`, `format:check`, `typecheck`, `build` on every commit, so a passing commit IS the gate.

**Git hygiene (concurrent sessions may share this tree):** verify the branch is `main` before each commit; stage only the explicit, quoted paths listed in each task (never `git add -A`); commit each task immediately after its gate passes.

---

### Task 1: Create the Account view

Splits the editable profile form + read-only account info out of the current `Settings.vue` into a focused `Account.vue`. Drops the Subscription card (Billing is now its own nav item).

**Files:**

- Create: `apps/app/src/views/Account.vue`

- [ ] **Step 1: Create `apps/app/src/views/Account.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { BadgeCheck, ShieldAlert } from 'lucide-vue-next'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  toast,
} from '@quikfill/ui'
import { useAuthStore } from '@/stores/auth'
import { useApiError } from '@/composables/useApiError'
import { useFormValidation } from '@/composables/useFormValidation'
import { profileFormSchema } from '@/schemas/forms'
import { formatDateTime } from '@/lib/format'

const auth = useAuthStore()
const { handleError } = useApiError()

const { handleSubmit, defineField, isSubmitting, resetForm } = useFormValidation(profileFormSchema)
const [firstName, firstNameAttrs] = defineField('firstName')
const [lastName, lastNameAttrs] = defineField('lastName')

/** Seed the form from the currently signed-in user. */
function seed(): void {
  resetForm({
    values: {
      firstName: auth.user?.firstName ?? '',
      lastName: auth.user?.lastName ?? '',
    },
  })
}

onMounted(seed)

const verified = computed(() => !!auth.user?.emailVerifiedAt)

const onSubmit = handleSubmit(async (values) => {
  try {
    // Send the trimmed field contents verbatim — an empty string clears the name
    // on the backend (PATCH); omitting it would instead leave the old value.
    await auth.updateProfile({
      firstName: values.firstName?.trim() ?? '',
      lastName: values.lastName?.trim() ?? '',
    })
    toast.success('Profile updated')
  } catch (error) {
    handleError(error)
  }
})
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-5">
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" novalidate @submit="onSubmit">
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <Label for="first-name">First name</Label>
              <Input
                id="first-name"
                v-model="firstName"
                v-bind="firstNameAttrs"
                placeholder="Jane"
              />
            </div>
            <div>
              <Label for="last-name">Last name</Label>
              <Input id="last-name" v-model="lastName" v-bind="lastNameAttrs" placeholder="Doe" />
            </div>
          </div>
          <div class="flex justify-end">
            <Button type="submit" :disabled="isSubmitting">Save changes</Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent>
        <dl class="divide-y text-sm">
          <div class="flex items-center justify-between gap-4 py-2.5 first:pt-0">
            <dt class="text-muted-foreground">Email</dt>
            <dd class="flex items-center gap-2 font-medium">
              <span class="truncate">{{ auth.user?.email ?? '—' }}</span>
              <Badge :variant="verified ? 'success' : 'warning'">
                <BadgeCheck v-if="verified" class="size-3.5" />
                <ShieldAlert v-else class="size-3.5" />
                {{ verified ? 'Verified' : 'Unverified' }}
              </Badge>
            </dd>
          </div>
          <div v-if="verified" class="flex items-center justify-between gap-4 py-2.5">
            <dt class="text-muted-foreground">Verified on</dt>
            <dd class="font-medium">{{ formatDateTime(auth.user?.emailVerifiedAt) }}</dd>
          </div>
          <div class="flex items-center justify-between gap-4 py-2.5 last:pb-0">
            <dt class="text-muted-foreground">Member since</dt>
            <dd class="font-medium">{{ formatDateTime(auth.user?.createdAt) }}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  </div>
</template>
```

- [ ] **Step 2: Typecheck the new view**

Run: `pnpm --filter @quikfill/app typecheck`
Expected: PASS (the file is not yet routed, but `vue-tsc` checks it standalone).

- [ ] **Step 3: Commit**

```bash
git branch --show-current   # expect: main
git add "apps/app/src/views/Account.vue"
git commit -m "feat(app): add Account settings view (profile + account info)"
```

---

### Task 2: Create the Configuration placeholder view

**Files:**

- Create: `apps/app/src/views/Configuration.vue`

- [ ] **Step 1: Create `apps/app/src/views/Configuration.vue`**

```vue
<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@quikfill/ui'
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-5">
    <Card>
      <CardHeader>
        <CardTitle>Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground text-sm">
          Chrome-extension customization will live here. Coming soon.
        </p>
      </CardContent>
    </Card>
  </div>
</template>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @quikfill/app typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git branch --show-current   # expect: main
git add "apps/app/src/views/Configuration.vue"
git commit -m "feat(app): add Configuration settings placeholder view"
```

---

### Task 3: Wire the `/settings/*` routes and back-compat redirects

Move Billing under `/settings/billing` (keeping the route **name** `billing`), add `/settings/account` and `/settings/config`, add the `/settings` and `/billing` redirects, point the root redirect + guard fallbacks directly at `/settings/billing`, and update the two billing-return views' internal `router.replace` targets. Then delete the now-dead `Settings.vue`.

**Files:**

- Modify: `apps/app/src/router/index.ts`
- Modify: `apps/app/src/views/BillingSuccess.vue:23`
- Modify: `apps/app/src/views/BillingCancel.vue:10`
- Delete: `apps/app/src/views/Settings.vue`

- [ ] **Step 1: Confirm `Settings.vue` is only referenced by the commented-out route (safe to delete)**

Run: `grep -rn "views/Settings\|Settings.vue\|'@/views/Settings'" apps/app/src`
Expected: matches only inside the commented block in `router/index.ts` (no live import). If any live reference exists, stop and reassess.

- [ ] **Step 2: Replace the root redirect in `apps/app/src/router/index.ts`**

Change the root route's redirect target from `/billing` to `/settings/billing`:

```ts
  {
    // Root redirects to the billing screen (the primary authenticated surface).
    path: '/',
    redirect: '/settings/billing',
  },
```

- [ ] **Step 3: Remove the commented-out `/settings` dashboard route block**

Delete these stale commented lines (the route is being introduced for real below):

```ts
// {
//   path: '/settings',
//   name: 'settings',
//   meta: { layout: 'app', requiresAuth: true, title: 'Settings' },
//   component: () => import('@/views/Settings.vue'),
// },
```

- [ ] **Step 4: Replace the `/billing` route block with the `/settings/*` routes + `/billing` redirect**

Find this existing block:

```ts
  {
    path: '/billing',
    name: 'billing',
    meta: { layout: 'app', requiresAuth: true, title: 'Billing' },
    component: () => import('@/views/Billing.vue'),
  },
```

Replace it with:

```ts
  // Settings area — Billing keeps the route name `billing` so existing
  // `{ name: 'billing' }` navigations and guard fallbacks still resolve.
  {
    path: '/settings',
    redirect: '/settings/account',
  },
  {
    path: '/settings/billing',
    name: 'billing',
    meta: { layout: 'app', requiresAuth: true, title: 'Billing' },
    component: () => import('@/views/Billing.vue'),
  },
  {
    path: '/settings/account',
    name: 'settings-account',
    meta: { layout: 'app', requiresAuth: true, title: 'Account' },
    component: () => import('@/views/Account.vue'),
  },
  {
    path: '/settings/config',
    name: 'settings-config',
    meta: { layout: 'app', requiresAuth: true, title: 'Configuration' },
    component: () => import('@/views/Configuration.vue'),
  },
  // Back-compat: old bookmarks / links to /billing.
  {
    path: '/billing',
    redirect: '/settings/billing',
  },
```

- [ ] **Step 5: Point the guard fallbacks at `/settings/billing`**

In `router.beforeEach`, change both `return { path: '/billing' }` lines to `return { path: '/settings/billing' }`:

```ts
// Admin-only routes fall back to billing for signed-in non-admins.
if (to.meta.requiresAdmin && !auth.user?.isAdmin) {
  return { path: '/settings/billing' }
}
if (to.name === 'sign-in' && auth.isAuthenticated) {
  return { path: '/settings/billing' }
}
```

- [ ] **Step 6: Update the comment header in `router/index.ts`**

The file's top NOTE references restoring nav entries; leave its intent but ensure no comment still claims `/billing` is the only authenticated screen. Update the root-route comment (done in Step 2) is sufficient; no other comment edit required. (No code change in this step — verification only: re-read lines 1-13.)

- [ ] **Step 7: Update `apps/app/src/views/BillingSuccess.vue` redirect target**

Change line 23 from `await router.replace('/billing')` to:

```ts
await router.replace('/settings/billing')
```

- [ ] **Step 8: Update `apps/app/src/views/BillingCancel.vue` redirect target**

Change line 10 from `await router.replace('/billing')` to:

```ts
await router.replace('/settings/billing')
```

- [ ] **Step 9: Delete the dead `Settings.vue`**

Run: `git rm "apps/app/src/views/Settings.vue"`

- [ ] **Step 10: Typecheck + build**

Run: `pnpm --filter @quikfill/app build`
Expected: PASS (`vue-tsc` then `vite build` succeed; no unresolved `@/views/Settings` import).

- [ ] **Step 11: Commit**

```bash
git branch --show-current   # expect: main
git add "apps/app/src/router/index.ts" "apps/app/src/views/BillingSuccess.vue" "apps/app/src/views/BillingCancel.vue" "apps/app/src/views/Settings.vue"
git commit -m "feat(app): move billing under /settings/* and add account/config routes"
```

---

### Task 4: Add the collapsible Settings group to the sidebar

Remove the standalone top-of-sidebar Billing link and add a collapsible **Settings** group pinned in the bottom block, above the user card. The group auto-expands on `/settings/*` routes.

**Files:**

- Modify: `apps/app/src/layouts/AppLayout.vue`

- [ ] **Step 1: Update the `<script setup>` imports and add collapsible state**

Replace the existing icon import line:

```ts
import { CreditCard, LogOut, Moon, Sun, Users } from 'lucide-vue-next'
```

with (add `ChevronDown`, `Settings`, `SlidersHorizontal`, `User`):

```ts
import {
  ChevronDown,
  CreditCard,
  LogOut,
  Moon,
  Settings,
  SlidersHorizontal,
  Sun,
  User,
  Users,
} from 'lucide-vue-next'
```

Update the `vue` import to include `ref` and `watch`:

```ts
import { computed, ref, watch } from 'vue'
```

Replace the standalone `nav` constant:

```ts
const nav = [{ label: 'Billing', to: '/billing', icon: CreditCard }]
```

with the settings group definition + open-state (place near the existing `adminNav`):

```ts
// Settings group, pinned to the bottom block. Billing lives here now (the old
// standalone top-nav Billing link is removed). The group auto-expands while the
// user is anywhere under /settings/*.
const settingsNav = [
  { label: 'Billing', to: '/settings/billing', icon: CreditCard },
  { label: 'Account', to: '/settings/account', icon: User },
  { label: 'Configuration', to: '/settings/config', icon: SlidersHorizontal },
]

const inSettings = computed(() => route.path.startsWith('/settings'))
const settingsOpen = ref(inSettings.value)
watch(inSettings, (active) => {
  if (active) settingsOpen.value = true
})
```

- [ ] **Step 2: Remove the standalone Billing nav from the top `<nav>`**

In the template, delete the top-of-sidebar Billing `RouterLink` loop (the block that renders `v-for="item in nav"`). The `<nav>` should retain only the admin section `<template v-if="auth.user?.isAdmin">…</template>`. Resulting `<nav>`:

```html
<nav class="flex flex-col gap-0.5">
  <template v-if="auth.user?.isAdmin">
    <div
      class="text-muted-foreground mt-4 mb-1 px-3 text-[11px] font-semibold tracking-wider uppercase"
    >
      Admin
    </div>
    <RouterLink
      v-for="item in adminNav"
      :key="item.to"
      :to="item.to"
      :aria-current="isActive(item.to) ? 'page' : undefined"
      :class="[
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive(item.to)
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                : 'text-sidebar-foreground hover:bg-muted hover:text-foreground',
            ]"
    >
      <component :is="item.icon" class="size-[18px]" />
      {{ item.label }}
    </RouterLink>
  </template>
</nav>
```

- [ ] **Step 3: Add the collapsible Settings group to the bottom block**

In the bottom `<div class="mt-auto …">`, insert the Settings disclosure **above** the existing user-avatar row. Replace the whole bottom block with:

```html
<div class="mt-auto flex flex-col gap-0.5 border-t pt-3">
  <button
    type="button"
    :aria-expanded="settingsOpen"
    aria-controls="settings-subnav"
    :class="[
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            inSettings
              ? 'text-foreground'
              : 'text-sidebar-foreground hover:bg-muted hover:text-foreground',
          ]"
    @click="settingsOpen = !settingsOpen"
  >
    <Settings class="size-[18px]" />
    <span>Settings</span>
    <ChevronDown
      class="ml-auto size-4 transition-transform"
      :class="settingsOpen ? 'rotate-180' : ''"
    />
  </button>

  <div v-show="settingsOpen" id="settings-subnav" class="flex flex-col gap-0.5">
    <RouterLink
      v-for="item in settingsNav"
      :key="item.to"
      :to="item.to"
      :aria-current="isActive(item.to) ? 'page' : undefined"
      :class="[
              'flex items-center gap-3 rounded-lg py-2 pr-3 pl-9 text-sm font-medium transition-colors',
              isActive(item.to)
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                : 'text-sidebar-foreground hover:bg-muted hover:text-foreground',
            ]"
    >
      <component :is="item.icon" class="size-[18px]" />
      {{ item.label }}
    </RouterLink>
  </div>

  <div class="mt-1 flex items-center gap-2.5 px-1 py-1.5">
    <Avatar :name="displayName" class="size-9" />
    <div class="min-w-0">
      <div class="truncate text-[13px] leading-tight font-semibold">{{ displayName }}</div>
      <div class="text-muted-foreground truncate text-[11px]">{{ auth.user?.email }}</div>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Build**

Run: `pnpm --filter @quikfill/app build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # expect: main
git add "apps/app/src/layouts/AppLayout.vue"
git commit -m "feat(app): collapsible Settings sidebar group (billing/account/config)"
```

---

### Task 5: Full-repo gate + push

- [ ] **Step 1: Run the full quality gate from the repo root**

Run: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test`
Expected: all PASS. (`format:check` must be clean — run `pnpm format` first if it flags the new/edited files.)

- [ ] **Step 2: Push**

```bash
git branch --show-current   # expect: main
git pull --rebase origin main
git push origin main
```

Expected: push succeeds (rebased onto `origin/main`).

---

## Self-Review

**Spec coverage:**

- Settings group in sidebar → Task 4. ✓
- Billing `/settings/billing` (existing page) → Task 3 (route, name preserved). ✓
- Account `/settings/account` (first/last name form) → Tasks 1 + 3. ✓
- Configuration `/settings/config` (blank) → Tasks 2 + 3. ✓
- Back-compat (`/billing` redirect, Stripe success/cancel paths unchanged, internal replace retargeted, guard + root → `/settings/billing`) → Task 3. ✓
- Delete dead `Settings.vue` → Task 3. ✓
- Quality gate / push → Task 5. ✓

**Placeholder scan:** No TBD/TODO; "Coming soon" is intentional page copy, not a plan gap. All code blocks complete.

**Type consistency:** Route name `billing` preserved (used by `SignIn` `{ name: 'billing' }`); new names `settings-account`, `settings-config` are referenced only by their own route definitions. `settingsNav`, `settingsOpen`, `inSettings` defined in Task 4 Step 1 and consumed in Steps 2–3. Icon names (`ChevronDown`, `CreditCard`, `Settings`, `SlidersHorizontal`, `User`, `Users`, `LogOut`, `Moon`, `Sun`) all exist in `lucide-vue-next`.
