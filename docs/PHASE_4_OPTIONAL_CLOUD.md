# Phase 4 — optional cloud and saved records

Implemented locally on `main`, 2026-10-22. No push, deployment, store upload or
version bump. Backend work is in the sibling `services` repository.

## User flow

- Sample Fill remains the default and works signed out/offline. Existing QA
  scenarios, widgets, seeds, guarded results and Undo keep using the local engine.
- **Fill with AI** is an explicit action beside the form and in the result panel.
  It covers every eligible empty field without requiring a local fill first.
  Custom dropdown choices use observed enabled options and join the same review. AI always preserves existing values, including when
  sample overwrite is enabled. AI returns a checklist of proposed values; nothing
  is written until **Apply selected suggestions**. Unchecked suggestions are skipped;
  Discard removes the review. Existing edits, replacement controls, navigation,
  cancellation and account changes invalidate or guard the original targets.
- Popup **Saved data** loads the current account's record library. Select one record
  and click **Use selected record**. Main Fill now uses that record exclusively:
  existing values are always preserved, even when sample overwrite is enabled.
  Unknown, ambiguous and absent values stay unfilled. No sample/AI fallback occurs.
  **Use sample data** returns to the local sample engine. Saved mode supports Undo.
- **Manage saved data** opens the authenticated dashboard `/data` route. Existing
  entity-type/record CRUD is restored in the sidebar. Other paused dashboard routes
  remain paused. Account/billing stay optional; existing Stripe Checkout and Portal
  are retained. Non-active/non-trialing paid subscriptions use free AI limits.
  Terminal subscriptions renew free quota on the UTC calendar month; live past-due
  accounts retain the Stripe billing window/counter until billing events renew it.

## Contracts, privacy and retention

`buildAiFillRequest` emits a UUID request ID, at most 200 fields, bounded label/
option/name/constraint metadata and locale. Page title/description, placeholders,
current values, arbitrary surrounding text and full HTML are omitted. HTML tags
are stripped from labels/options/names. Labels and options can themselves contain
identifying text: this is minimization, not a guarantee of PII anonymization.
Suggestions are untrusted, bound to requested IDs, deduplicated and length-limited.
They are held only in the current overlay; they are not saved to browser storage.
No saved-record values are sent to AI by the saved-data flow.

The backend reserves quota under a subscription row lock before calling Gemini.
The same UUID/input replays a completed result for 15 minutes without charging or
calling the model again. Concurrent, mismatched, failed and expired keys return 409. A new explicit action creates a new key; transparent 401 retries retain it.
Deduplication ledgers last 30 days. Provider failures refund once; a stale refund
cannot decrement another billing period. Provider fill calls time out at 25 seconds;
abandoned reservations are reclaimed after five minutes. Metrics cannot cause a
completed request to rerun or refund.

Prompts are no longer persisted. The migration scrubs existing audit prompt text.
Replay values expire after 15 minutes; startup/minute cleanup wipes them and removes
30-day diagnostics/operation ledgers. Metadata-free token/cost metrics remain for
account analytics, subject to account deletion. Expiry checks do not depend on the
cleanup job running; physical deletion needs a running API. Backup retention remains
an operator concern.

Saved libraries are in **chrome.storage.local**, keyed by account UUID, with a
24-hour offline TTL. They are never in `storage.sync`. A current session is required
for a cached record; logout/another account cannot use it. A 401/403/other client
error does not silently fall back to stale data. Full library messages are blocked
from content scripts; the overlay requests its selected record. Cache pruning runs
on startup and the settings alarm; TTL is also enforced at read time. Chrome local
storage is not an encrypted vault; this feature does not add encryption or a password
manager. Account deletion does not remotely erase another offline device's storage;
its expired cache is pruned on the next wake.

## Session and sync isolation

- Tokens persist their owning user ID. Session refresh is coalesced across background
  clients. State/token writes are serialized; stale refresh/verify/logout completions
  cannot restore an old account. Transient network failures keep valid cached tokens.
- HTTP retries refuse a different identity; delayed failures cannot sign out a new
  token. Dashboard data stores clear on account changes and ignore stale responses.
- Settings outbox entries carry their owner. An A-owned pending edit cannot upload
  to B. Signed-out device settings bind to the first syncing account. Local settings
  continue to work if an A-owned outbox is waiting for A to return.
- Legacy profile reconciliation uses account-prefixed storage and a captured,
  identity-checked client. Unowned old profile caches are not automatically uploaded
  into a newly signed-in account. Local QA recipes remain device-local; this phase
  does not add recipe cloud sync or migrate legacy sidepanel UI.

## Verification and release boundary

Final checks: **745 frontend unit tests**, **86 Chromium browser tests**, and
backend **297 unit + 78 PostgreSQL integration tests** pass. Lint, formatting,
typechecks, builds and backend OpenAPI drift checks are green.

Unit coverage includes saved semantic matching/no fallback, account cache TTL and
isolation, pending settings ownership, stale auth/entitlement responses, dashboard
store isolation, stable AI IDs through auth retries and cross-account retry refusal.
Browser coverage exercises the real engine/overlay/popup and dashboard, with fake
Chrome transport and API/provider responses. It covers review/decline/discard,
edits before/after review, account cancellation, saved-record no-overwrite/Undo,
missing-record failure, popup selection and dashboard record creation.

Backend integration tests use a real isolated PostgreSQL database on port 5444;
Gemini/Stripe are mocked. Apply `20261022160000_ai_fill_reservations` before the
updated backend is deployed. No production database was migrated during this work.

Run with reduced concurrency:

```sh
pnpm --workspace-concurrency=1 -r typecheck
pnpm --workspace-concurrency=1 --filter './packages/**' --filter @quikfill/chrome-extension --filter @quikfill/app --filter @quikfill/website -r --if-present test --maxWorkers=2
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome-headless-shell pnpm e2e --workers=2
WXT_QF_API_BASE_URL=https://api.quikfill.example/api/v1 pnpm --workspace-concurrency=1 -r build
```

The [installed MV3 release gate](./RELEASE_MV3_CHECKS.md) now passes against a local
API and real Chrome APIs. The separate real Gemini installed journey and Stripe
test API lifecycle now pass; hosted Checkout/3DS and configured webhook delivery
remain release work. Passing fixture tests is not a universal compatibility
claim. Native/custom control limits remain in the Phase 2 matrix.
