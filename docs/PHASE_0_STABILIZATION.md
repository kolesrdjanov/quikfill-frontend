# Phase 0 — form execution stabilization

Scope: the critical failures from the [2026-10-22 audit](./QUIKFILL_AUDIT_2026-10-22.md). Product focus remains developers and QA. Work is local on `main`; no release, version bump, or push.

## Engine milestone

| Area                | Implemented behavior                                                                                                                                                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Submission          | No generic calendar submit fallback. Widget activation refuses submit controls; capture guards suppress submit events during probe/fill/undo and are always removed afterwards.                                                                                                     |
| Option selection    | No random replacement for a missing proposal. Options are resolved inside the widget, an explicitly linked popup, or one unambiguous popup observed during activation. Hidden/foreign/ambiguous lists are not fallback targets.                                                     |
| Dates               | No nearest-day substitution. Navigation must reach the requested month; success requires matching year/month/day in the accepted display/value. Only an associated calendar's explicit Apply action may be activated.                                                               |
| Framework toggles   | Native checkbox/radio activation notifies React handlers. Checkbox verification waits for a render task.                                                                                                                                                                            |
| Verification        | Unmasked values compare exactly; only an explicit input mask permits formatting normalization. Native validity, text length and `aria-invalid` are checked. Native multiple selects stay unchanged with an explicit skipped result until their adapter exists.                      |
| Field identity      | Scan IDs include a generation. Markers are cleaned across open shadow roots and same-origin frames. Radio grouping and execution respect form owner and tree root. Input-based comboboxes are detected before the native fallback.                                                  |
| Bound execution     | `captureFillTargets` binds live elements and pre-fill state. `applyFill(..., { targets, signal, isCurrent })` skips replaced, disconnected, edited or cancelled targets instead of falling back to replacement elements.                                                            |
| Undo                | Snapshots contain the applied state. Restore checks that the user has not edited the control, uses the same bound elements, and verifies the previous value. Empty radio groups and unsupported multi-select restore are reported for manual handling rather than falsely restored. |
| Places autocomplete | The active AI instruction builder preserves the existing assisted-autocomplete strategy.                                                                                                                                                                                            |

The bound element map is ephemeral, content-script memory only. Optional snapshot fields are backward compatible with existing serialized snapshots. Backend API DTOs and persisted fill-run redaction are unchanged.

The submit guard prevents DOM submit events during QuikFill interactions; it does not claim to sandbox arbitrary host-page JavaScript, such as a handler directly calling `form.submit()` or issuing a network mutation.

## Browser test foundation

`apps/e2e/fixtures` runs the actual scanner/filler and overlay source in Chromium. It replaces only the extension transport with a controllable fake. React 19.2.6 is a test-only dependency and is not bundled into the extension.

The engine tests assert browser validity, React state after re-render, form submission/click counts, independent forms/radio groups, shadow event propagation, stable binding, associated portals and ambiguous popups. The audit reproductions have become regular `form-scanner` regression tests. Two explicit TODOs track later-phase ARIA-only toggle adapters and AI minlength/maxlength forwarding.

Run from `frontend`:

```sh
pnpm test
pnpm test:browser
pnpm e2e
pnpm lint
pnpm format:check
pnpm typecheck
WXT_QF_API_BASE_URL=https://api.quikfill.example/api/v1 pnpm build
```

`test:browser` starts only the fixture server; `e2e` also starts the dashboard smoke test. Install the Playwright Chromium version with `pnpm --filter @quikfill/e2e install:browsers chromium`. For an already installed local Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. CI should use Playwright's pinned browser.

`pnpm test` now runs unit packages explicitly, keeping Playwright under its separate commands. A dashboard test setup binds jsdom's `localStorage` explicitly to avoid Node 26's unavailable host storage property; no runtime flag is needed.

These browser fixtures do not yet load a packaged MV3 extension. Background suspension, permissions, isolated-world execution, real AI services and production-site compatibility remain separate integration work. No broad compatibility claim follows from this fixture suite.

## Later phases

The following remain outside Phase 0: restoring the local planner to the primary flow; removing mandatory AI/account dependency; comprehensive framework-specific adapters; reliable remote/typeahead and dependent-select scheduling; localized calendar parsing beyond the current formats; rich-editor and native multiple-select adapters; cloud retention/quota hardening. These are tracked in the original audit roadmap.
