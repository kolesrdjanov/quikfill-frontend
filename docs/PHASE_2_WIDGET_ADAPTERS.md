# Phase 2 — custom widget adapters

Local work on `main`; no push, release or version change.

## Behavior

- ARIA checkbox/switch and owned radio groups activate through the control's
  handlers. Framework hidden payload proxies are excluded from scanning. Mixed,
  readonly and existing values are protected by default; no ARIA attributes are
  assigned to fake acceptance. Audit reproduction A02 is now a passing regression.
- Custom selects use their owned popup, exact labels or automation values, and
  disabled-option filtering. Equal best matches require manual selection.
  Keyboard fallback commits only the exact focused/active target, never whatever
  happens to be active after a navigation limit.
- Async options use bounded, cancellable waits (2.5 seconds per wait). Virtual
  lists scroll their actual owned viewport, up to 30 windows. A successful fill
  requires committed display/selection state; transient search text is insufficient.
- React Select reads selected labels/chips separately from its search query.
  Multiselect instructions and undo snapshots carry structured value arrays, so
  labels containing commas stay intact. Undo restores previous choices when the
  adapter can read and activate them, and preserves subsequent manual changes.
- The local session re-scans the selected form before planning each control and
  after mutations. It waits for disabled dependents to enable and for form-level
  `aria-busy` to clear, and includes newly rendered conditional controls. Original
  DOM bindings remain authoritative; replacement controls require a new Fill.
  All per-control plans share a session seed to preserve one synthetic identity.
- Date adapters parse explicit formats and English/Serbian month headings. US,
  GB and Serbian formats are verified as calendar dates, so swapped day/month
  values cannot produce a false success. Navigation follows live calendar roots
  across re-renders, checks month changes and stops after 24 months.
- Fill and Undo stop on cancellation, navigation or detached controls. Basic Fill
  remains local and account-free. Widget libraries exist only in E2E dev dependencies.

## Browser coverage

These are the tested components/configurations, not a promise about every library
component or all versions. Portal selection tests assert controlled framework state
and actual `FormData` after re-render; toggle fixtures also verify Undo.

| Real library      | Pinned fixture version                     | Covered behavior                                                                                               |
| ----------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Radix React       | Select 2.2.6, Checkbox 1.3.3, Switch 1.2.6 | Portal selection, disabled option, previous-choice Undo; toggle state/payload/Undo                             |
| Reka / Vue        | 2.9.8                                      | Portal Select via v-model; checkbox/switch state/payload/Undo                                                  |
| React Select      | 5.10.2                                     | Single, multiselect with comma label, async options at 50/300/800/2000 ms, cancellation, manual edits and Undo |
| MUI React         | 7.3.5                                      | Select and Autocomplete portal selection                                                                       |
| Headless UI React | 2.2.9                                      | Immediate-focus Combobox portal selection and object form payload                                              |

Reduced DOM contract fixtures additionally cover owned ARIA radio groups,
country/state/city dependencies, conditional React fields, virtual options beyond
the first viewport, unreachable keyboard targets, ambiguous labels, empty remote
lists, and US/GB/Serbian calendars including a deliberately wrong month.
Headless UI's immediate-focus configuration may reopen a committed list; the test
uses a real user Escape before re-rendering. The engine does not generically
send Escape, which can dismiss a containing page dialog.

## Verification

710 unit tests pass, with one remaining optional-AI TODO. The full browser suite
passes 61 tests (60 form/popup regressions plus dashboard smoke), including 28
custom-widget regressions.

Run `pnpm test`, `pnpm e2e`, then lint, formatting, typecheck and full build.
The browser harness runs the real scanner, planner, filler, overlay and widget
libraries; Chrome transport is substituted. Installed MV3 lifecycle/permissions
remain a separate release check.

## Remaining boundaries

- Ant Design and other unlisted components/versions have not been certified.
- Unknown remote datasets requiring a meaningful query, waits beyond the budget,
  unreadable selection state, unsupported calendars and closed shadow/cross-origin
  controls remain skipped, failed or assisted with explicit reasons.
- Asynchronous conditional insertion without a disabled/busy signal may need a
  second Fill. Existing controls replaced by the framework also need a new session.
- Native multiple-select reset, unknown custom empty-selection reset, mixed toggle
  restoration and clearing a previously empty radio group may require manual Undo.
- Locale dates cover the documented formats and month languages; arbitrary custom
  formats, month/year chooser UIs and navigation beyond 24 months are not promised.
- The remaining audit TODO A12 concerns optional AI text length coercion. The main
  local flow already enforces text constraints; that AI issue is outside Phase 2.
