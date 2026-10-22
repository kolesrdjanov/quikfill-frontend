# Phase 2 — custom widget adapters

Local work on `main`; no push or version/release change.

## First unit: ARIA toggles

- Scanner recognizes non-native ARIA checkbox/switch and owned radio groups.
  Framework hidden payload proxies are not scanned as extra controls.
- Activation uses the control's click behavior and verifies framework-owned
  `aria-checked`; assigning ARIA attributes is never used to fake acceptance.
- Existing/mixed values remain protected by default. Undo uses activation and
  preserves subsequent edits. A previous mixed state or empty radio group that
  cannot be restored through activation is explicitly reported as manual.
- Real Radix checkbox/switch and Vue Reka checkbox/switch browser fixtures check
  controlled state after re-render, actual `FormData`, and undo. A separate ARIA
  radio fixture checks owner isolation and previous-choice restoration.
- Audit reproduction A02 is now a passing regression instead of a TODO.

Further select, async/dependent and localized date work follows in the next unit.
Fixtures run the real engine and local overlay, with Chrome transport substituted;
installed MV3 lifecycle remains a separate release check.
