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

The live popup/session integration and browser acceptance are documented with the
second implementation unit.
