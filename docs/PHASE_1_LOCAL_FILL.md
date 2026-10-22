# Phase 1 — local fill in the live extension

Implemented locally on `main`, 2026-10-22. No push, release or version change.

## Live behavior

- The main in-page Fill button now runs `buildLocalFillPlan` → `applyFill`.
  It makes no AI, auth, entitlements or history request. No account, API server,
  internet connection or AI allowance is required.
- Fill generates **synthetic test data**. Existing values/selections are preserved
  by default. Popup preferences can explicitly enable overwrite, choose US/UK/RS
  sample locale, or set a repeatable seed. Empty seed produces fresh samples.
- The popup starts with local preferences. Sign-in is an optional, reversible
  route for AI/account features; usage and billing appear only after sign-in.
  A fresh install no longer automatically opens the account dashboard.
- The result panel still reports success, assisted, skipped and failed targets
  separately, with field details and guarded undo. Unknown fields remain skipped.
  Sensitive fields (password, OTP, payment and government ID) remain manual.
- **AI assist** is a separate result-panel action. Its tooltip/copy explains that
  it sends field metadata/page context and needs sign-in. It respects the same
  existing-value/sensitive-field filters. A quota/network failure never removes
  the local Fill button or the last undo.

## Shared engine

`buildLocalFillPlan` composes the existing preview planner with sample data
enabled, returning the plan, executable instructions, and explicit skip reasons.
Unresolved/confirmation items are never automatically executed. The legacy
preview API retains its saved-data-first/sample-opt-in defaults.

One generated persona supplies first/last/full name, email, username and regional
address/phone data within a plan. Seeded generation uses stable fingerprints and
field metadata instead of scanner IDs, and dates have fixed defaults so a seed
does not drift with the system clock. Unseeded RNG now actually uses randomness.
The small bundled sample datasets add no Faker or runtime network dependency.

Each field receives its own constrained generator rule: native number/date
ranges and HTML step bases, masks, prose length bounds, and enabled nonempty
choice options. Invalid structured values/pattern mismatches are skipped rather
than truncated into corrupt data. The DOM executor still verifies every write.
Unchecked checkboxes and custom-select placeholder prompts are distinguished
from existing values before probing. Existing widgets are not opened by default.

## Persistence

- `settings:local-fill`: validated device-local seed/only-empty/locale preferences.
  These never enter account sync.
- Existing activation/appearance settings now save locally without authentication.
  `createBackgroundSettings` persists an account outbox, pushes it before pulling
  remote settings, and retains it across offline failures/worker restarts. Queued
  local writes prevent stale uploads/reads from overwriting newer edits.
- Popup remote-font links were removed. Local controls render with bundled CSS
  and system fallbacks even with no connection.

## Validation

- 699 unit tests passed; two existing audit TODOs remain (ARIA-only toggle adapters
  and optional AI minlength/maxlength forwarding).
- 32 browser tests passed: 31 form/popup tests plus dashboard smoke. Coverage
  includes offline/no-account/no-quota first fill, preserved values and choices,
  masks/ranges/lengths, seeded undo/rescan, on-demand custom options, quota
  isolation, React and Vue controlled state after rendering and undo, and the
  real signed-out popup's local preferences/per-site controls.
- Full lint, formatting, workspace typecheck and production build are required
  by the commit hook. The validation build uses the documented placeholder API
  origin, not a release endpoint.

```bash
pnpm test
pnpm --filter @quikfill/e2e install:browsers chromium
pnpm test:browser # form/popup suite only
pnpm e2e          # also dashboard smoke
```

The browser fixtures render the real scanner, planner, generators, executor,
overlay and popup. Only extension transport/browser globals are substituted.
They do **not** test an installed MV3 service worker, Chrome permissions or the
Web Store package lifecycle. Those remain a release check.

## Boundaries for the next phase

This restores the basic local flow; it does not claim universal custom-widget
support. ARIA-only toggles, virtualized/remote choices, more complex multi-select
and calendar adapters, closed shadow roots and cross-origin frames still need
the next compatibility phase. Local sample locales use small example datasets;
free-text date formats and arbitrary regular-expression generation are not
comprehensive. Optional AI length forwarding remains a separate frontend/backend
contract change; local generation and final execution already enforce lengths.
