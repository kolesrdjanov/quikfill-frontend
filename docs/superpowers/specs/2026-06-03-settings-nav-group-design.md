# Settings nav group (Billing / Account / Configuration) — Design

**Date:** 2026-06-03
**Surface:** `apps/app` (`@quikfill/app`, the dashboard / billing-only deployment)
**Status:** Approved — ready for implementation plan

## Problem

When a user signs in/up, there is nowhere to set their first and last name —
the billing-only surface exposes only the Billing screen. We need an account
preferences screen, and a navigation home for it. We also want a single place
for future per-user settings (billing, account, and Chrome-extension config).

## Goal

Introduce a collapsible **Settings** group in the sidebar (pinned at the bottom,
above the user card) containing:

- **Billing** → `/settings/billing` — the existing billing page, unchanged.
- **Account** → `/settings/account` — a form to edit first and last name.
- **Configuration** → `/settings/config` — placeholder for Chrome-extension
  customization (built later).

Almost all of the Account form already exists: `views/Settings.vue` has a Profile
form wired to `auth.updateProfile` (`profileFormSchema`, VeeValidate + Zod), and
the backend already supports the update (`UpdateProfileInput`). The work is
primarily navigation restructuring plus splitting the existing Settings view.

## Scope

In scope:

- New routes under `/settings/*` and a collapsible sidebar group.
- New `Account.vue` (derived from current `Settings.vue`) and a placeholder
  `Configuration.vue`.
- Moving Billing to `/settings/billing` with full back-compat redirects.

Out of scope:

- Actual Configuration features (the page is an intentional placeholder).
- Any backend / API changes — the name-update endpoint already exists.
- Restoring the rest of the previously-trimmed dashboard nav (Home, Data, etc.).

## Routing (`src/router/index.ts`)

| Path                | Name               | Component                       | Notes                                                                                                                            |
| ------------------- | ------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `/settings/billing` | `billing`          | `Billing.vue` (existing)        | Name preserved so `SignIn` `{ name: 'billing' }` and the admin guard still resolve.                                              |
| `/settings/account` | `settings-account` | `Account.vue` (new)             | First/last name form + read-only account info.                                                                                   |
| `/settings/config`  | `settings-config`  | `Configuration.vue` (new)       | Placeholder.                                                                                                                     |
| `/settings`         | —                  | redirect → `/settings/account`  | Safety net for direct URL entry; the sidebar item toggles, it does not navigate.                                                 |
| `/billing`          | —                  | redirect → `/settings/billing`  | Back-compat for bookmarks / old links.                                                                                           |
| `/billing/success`  | `billing-success`  | `BillingSuccess.vue` (existing) | **Path unchanged** — this is Stripe's server-configured `success_url`. Internal `router.replace` updated to `/settings/billing`. |
| `/billing/cancel`   | `billing-cancel`   | `BillingCancel.vue` (existing)  | **Path unchanged** — Stripe's `cancel_url`. Internal `router.replace` updated to `/settings/billing`.                            |

Guard / root changes (made decisive to avoid redirect chains): the root `/`
redirect and the two `return { path: '/billing' }` fallbacks in
`router.beforeEach` are all pointed **directly at `/settings/billing`**. The
`/billing` → `/settings/billing` redirect is kept solely as back-compat for
external bookmarks and old links, not relied on for in-app navigation.

All new `/settings/*` routes use `meta: { layout: 'app', requiresAuth: true, title }`
matching the existing pattern (titles: "Billing", "Account", "Configuration").

## Sidebar (`src/layouts/AppLayout.vue`)

A collapsible **Settings** group rendered as inline disclosure markup (mirroring
the existing Admin section — no new `@quikfill/ui` component, since the package
has no Collapsible primitive and the Admin nav is already inline markup):

- A `Settings` (gear) button row with a trailing chevron (`ChevronDown`) that
  rotates when open. Clicking toggles a local `settingsOpen` ref. The button
  carries `aria-expanded`.
- The group **auto-expands** when the current route is under `/settings/*`
  (initialize `settingsOpen` from the route and watch route changes so deep-links
  open it).
- Children, each a `RouterLink` styled like existing nav items with
  `:aria-current="isActive(...) ? 'page' : undefined"` and the shared active/hover
  classes:
  - Billing — `CreditCard`
  - Account — `User`
  - Configuration — `SlidersHorizontal`
- Placement: in the bottom block, above the user avatar card. The existing
  top-of-sidebar `nav` (currently just the standalone Billing link) is removed —
  Billing now lives only inside the Settings group.

Icons are imported from `lucide-vue-next` (already the icon source here).

## Account page (`src/views/Account.vue`)

Derived from the current `Settings.vue`, keeping:

- **Profile** card — first/last name form via `useFormValidation(profileFormSchema)`,
  `defineField()`, `:aria-invalid`, seeded from `auth.user` on mount, submitting
  through `auth.updateProfile`, success toast. (Verbatim from current Settings.vue.)
- **Account** card — read-only email + verified badge, "Verified on", "Member
  since" (verbatim from current Settings.vue).

Dropped:

- The **Subscription** summary card — Billing is now its own nav item, so this
  avoids duplication and the cross-link.

Title: "Account". The now-unrouted `Settings.vue` is **deleted** (it is dead code
today — its route was commented out and never restored).

## Configuration page (`src/views/Configuration.vue`)

A single `Card` (from `@quikfill/ui`) titled "Configuration" with a muted
"Coming soon" message noting it will hold Chrome-extension customization. No
state, no API calls, no form. Intentionally minimal.

## Data flow / dependencies

No new stores, schemas, or API methods. Reuses:

- `useAuthStore().updateProfile(UpdateProfileInput)` (existing).
- `profileFormSchema` from `src/schemas/forms.ts` (existing).
- `@quikfill/ui` components (`Card*`, `Input`, `Label`, `Button`, `Badge`,
  `toast`) and `lucide-vue-next` icons.

## Error handling

Unchanged from current Settings.vue: form submit wrapped in try/catch routed
through `useApiError().handleError`; success toast on update. Configuration page
has no error surface.

## Testing & quality gate

This is presentational + routing; no Vitest target is added (consistent with the
existing Settings/Billing views having none). Verification is the full pre-commit
gate from the repo root:

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm build
```

(`pnpm build` runs `vue-tsc` for `@quikfill/app`.) `pnpm test` should remain green
(no logic touched). No e2e references these routes today, so none break; an e2e
smoke for `/settings/account` is optional follow-up, not required here.

## Risks / mitigations

- **Stripe redirect URLs** point at `/billing/success` and `/billing/cancel`
  (server-side). Mitigation: those paths are left unchanged; only their internal
  post-redirect `router.replace` target moves to `/settings/billing`.
- **Old bookmarks / the `billing` route name** are preserved via the `/billing`
  redirect and by keeping `name: 'billing'` on the new `/settings/billing` route.
