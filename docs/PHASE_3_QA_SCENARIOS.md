# Phase 3 — repeatable local QA scenarios

Local work on `main`. No push, release or version bump.

## Shared scenario contract

Version-1 recipes contain a generator engine version, seed, locale, only-empty
preference, exact origin/path/form identity and per-field generated/fixed/skip
rules. Field identities exclude values, option datasets and ephemeral scan IDs.
Ambiguous identities must be resolved by giving forms/fields distinct names or
labels; recipes never target a form using its URL alone.

The pure recipe planner reuses local generation and its correlated persona.
Boundary cases cover exact minimum/maximum, just below/above and a missing value.
Numeric/date/length constraints are read from the current field. Arbitrary invalid
inputs use a fixed value with an explicit invalid expectation. Unsupported cases
are skipped with reasons. Existing-value, unavailable-field and sensitive-field
protections still apply.

Expected-invalid instructions require the exact value to survive and a native or
ARIA validation error (including explicit HTML length constraints). A rejected or
sanitized value is a failure, even if the sanitized result is invalid. Normal
fills still require valid data. Results carry the invalid expectation separately.

Recipes persist behind a local storage adapter. Export/import is schema-validated,
versioned JSON, limited to 1 MB / 100 recipes per import. Imported recipes receive
new IDs, preserve seed/rules and never overwrite or auto-activate existing recipes.
Corrupt stored records are ignored. No recipe values are synced or sent to AI.

## Live popup and execution

1. Open the popup's **QA scenarios**, then **Inspect forms on this page**.
2. Select the target form and create a scenario. Name it, keep or change its
   saved seed/locale, then set each field to Generate, Fixed value or Skip.
   Only-empty defaults to on; disabling it explicitly permits overwriting.
3. Save and **Activate**. The normal in-page Fill button now uses that recipe;
   its result names the scenario and separately counts expected-invalid cases.
   Deactivate to return to fresh local generation. Editing an active recipe
   takes effect on the next Fill.
4. Export downloads JSON, including fixed values. Import creates inactive copies;
   inspect/select a matching form before activating a copy. Delete removes the
   local recipe. Everything works while signed out and without the backend.

The editor uses existing shared UI components, Zod + VeeValidate and a Pinia
store. It lives in the popup; Vue/Pinia are not added to the content script.
Only current field metadata crosses the page-to-popup context message, with
current values and nearby prose removed. Raw page values are not captured as
fixed defaults. Query strings/fragments are not stored in the recipe context.

Generation shares one saved seed/persona across per-control plans. Select option
values are sorted before seeded selection, preserving choices when the same
option dataset is reordered. Fixed fields deliberately override the generated
identity; they do not redefine the persona for the other generated fields.

**Retry failed fields** is offered for local execution failures only. It retains
that run's seed, locale and recipe snapshot; successful, skipped and assisted
fields are not retried. It binds original elements and compares their post-fill
state before retrying, preserving manual edits and skipping replacements. It
also prevents newly discovered controls from joining a retry. Results merge into
the original report. Undo retains the first pre-fill state and latest applied
state, so a successful retry can still be undone in one action. Retry is scoped
to the live page/form and disappears after Undo or another Fill.

## Verification

724 unit tests pass, with one remaining optional-AI TODO. The full browser suite
passes 77 tests (76 form/popup regressions plus dashboard smoke), including 16
scenario/retry regressions. Lint, formatting, typecheck and full build are required
by the commit hook.

The regression corpus covers UI creation/editing inputs, fixed/generated/skip,
reload replay and correlated identity, actual file download/import, corrupt or
unsupported imports, origin/path/form isolation, native boundaries and missing
values, invalid expectations that must fail, retry/manual edits/replacements and
Undo, real React Select controlled state/payload, and duplicate-field rejection.
The popup was also checked at compact width for overflow and runtime errors.
As in previous phases, browser fixtures substitute Chrome transport/storage;
packaged MV3 messaging/permissions remain a release check.

## Deliberate limits

- Matching is exact for origin, pathname, stable form anchor and field identities.
  A different route (including a changed trailing slash), renamed form/field or
  added/removed control requires a new/updated recipe. No fuzzy fallback applies
  a fixed value to a different field. Duplicate identities are rejected at create
  time and execution, including imported recipes.
- Newly revealed conditional fields without a rule are skipped. Capture a scenario
  with the relevant controls present. Disabled dependents present in the capture
  remain supported through the Phase 2 live rescan/wait flow.
- Repeatability assumes the same generator engine version, constraints and option
  dataset. This is a form-data recipe, not a recording of arbitrary site actions,
  clicks, external validators, server state or asynchronous business logic.
- Generated boundaries support native numeric/date and text length constraints.
  Exact numeric maximum/minimum can still violate an incompatible step; that is
  reported as failure. Custom calendars/widgets and radio groups do not claim
  invalid-case support. Sanitized/clamped invalid values fail exact verification.
- Length errors are explicitly checked because browsers do not necessarily mark
  programmatically assigned text as tooLong/tooShort. A site's delayed/custom
  validator may require manual review; the engine cannot certify server validation.
- Unsupported cases remain skipped/assisted with reasons. Native multiple-select
  and custom empty reset retain the documented Phase 2 limits. Local recipes do
  not bypass sensitive-field, availability or manual-edit protections.
- The optional-AI A12 TODO remains outside this local QA phase.
