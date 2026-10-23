# Popup and sign-in regression fix — 2026-10-23

The popup now keeps Sign in in its header, groups fill settings into compact
sections and keeps header/footer visible while expanded settings scroll. The
email form fits without scrolling. Existing local fill, saved data and QA flows
remain available.

Pending OTP state now survives popup closure and MV3 worker termination. The
background restores the original email, expiry and remaining attempts, including
after a wrong code or transport failure. Successful verification and sign-out
clear pending context. No OTP value is persisted. Legacy pending states without
metadata remain verifiable without showing a fabricated countdown.

Regression coverage includes six auth-gate tests, four worker/storage lifecycle
tests and the installed optional-cloud journey: request a code, close the actual
toolbar popup, observe the worker stop, reopen directly to the code screen and
verify the original code. The browser fixture also checks that Sign in and Send
sign-in code remain visible within the popup viewport.

## Installed MV3 browser release checks — 2026-10-22

The installed-extension browser gate passes locally. No push, publication, version
bump or production database change was made. Extension version remains **1.0.13**.

Original regression checks after the installed-MV3 fixes: **750 frontend unit tests**, **86 existing
browser tests**, **297 backend unit tests** and **78 PostgreSQL integration tests**
pass, plus the **five installed MV3 release journeys**. Lint/typecheck/build and
OpenAPI drift checks pass; a missing API opt-in is also verified to refuse startup.

## What ran

A **production-mode WXT build** is installed as an unpacked MV3 extension in a
fresh, disposable Chromium profile. The real content script, service worker,
Chrome messaging/storage/scripting/alarms and toolbar action run unchanged. The
page fixtures never import the overlay or replace `chrome.*`. Playwright drives
web pages; pinned, test-only Puppeteer Core drives the actual toolbar popup and
Chrome extension action. It is not included in the shipped bundle.

The test artifact is separate: `apps/chrome-extension/.output/mv3-release/chrome-mv3`.
It uses API `http://127.0.0.1:4012/api/v1`, dashboard `http://localhost:5173` and form
fixtures on **another hostname**, `http://localhost:4178`. This avoids accidentally
proving reinjection only on the API's permitted hostname. The normal distributable
build is not replaced by this local test artifact.

The API runs the real Nest modules, validation, JWT auth, token rotation, CRUD,
quota reservations and PostgreSQL (`quikfill_test`, port 5444). Only the AI provider
is deterministic. Resend, Gemini and Stripe credentials are explicitly disabled;
no email, model request, checkout or subscription action is sent to real services.
A loopback-only test mailbox exposes development OTPs to the runner. No test
control route is part of the production application/OpenAPI.

Verified with **Chrome for Testing 156.0.8078.4 on macOS arm64**, both headed and
headless. Five serialized release journeys pass:

| Journey                       | Evidence                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installation / offline        | MV3 manifest and unchanged minimal permissions; no auth/API calls for sample Fill; no submission, other-form writes or password fill; guarded Undo preserves manual edits.                                                                                                                                                                                             |
| Framework controls            | Real React Select, React Select multi, Vue controlled inputs, Radix and Reka; framework state and form payload are checked after re-render. Full supported Undo and honest partial Undo are distinguished.                                                                                                                                                             |
| Toolbar / worker lifecycle    | Actual toolbar action grants `activeTab`; site toggle works; UI creates and activates a scenario; CDP observes the worker **stopped**, then **running**. Seed, active scenario and Undo survive the worker restart.                                                                                                                                                    |
| Optional cloud                | Extension OTP → Manage saved data deep link → dashboard OTP/type/record CRUD → popup record selection → saved fill/Undo/offline cache; actual 401/refresh; provider failure/refund; AI review/manual-edit protection; quota refusal with local Fill still working; A → B isolation with A's selection still persisted; dashboard → extension one-time session handoff. |
| Extension reload / boundaries | Real Reload button in `chrome://extensions`; old worker target disappears; old overlay host is replaced, exactly one working overlay remains, and no page reload is needed after opening the toolbar. `chrome://version` stays unmodified and the popup reports it unsupported.                                                                                        |

## Fixes found while checking the installed build

- Chrome's URL-filtered tab enumeration returned no tabs without additional tab
  metadata access, even though static content scripts were allowed. The all-URL
  recovery path now enumerates tab **IDs**, without adding `tabs` permission.
- Popup startup pings the active content generation. A healthy receiver retains its
  current fill/Undo session. A missing receiver is reinjected using the toolbar's
  existing `activeTab` grant. A removed overlay host also invalidates old executors.
  Background install/update reinjection remains best-effort: site-access restrictions
  can prevent it; opening the toolbar repairs an allowed active HTTP(S) tab.
- A temporary provider 503 no longer claims that AI was never enabled. The copy
  states that AI is unavailable and local Fill still works.
- Popup links and session handoff now share one dashboard origin, including an
  optional `WXT_QF_DASHBOARD_URL` for staging/test builds. Production defaults stay
  `https://app.quikfill.io`. Saved-data dialogs now include accessible descriptions.

Chrome's experimental automation action crashed the test browser after
`runtime.reload()` left the CLI-loaded extension disabled. The final test uses the
actual developer Reload button and refreshes the automation connection. This is
not hidden by skipping the reload check.

An empty, non-clearable React Select cannot be generically reset through its UI.
The release test deliberately verifies **1/2 restored**, retains the framework's
selection and verifies that the email was restored. Multi-select and supported
controls are verified fully restored. Other compatibility limits remain in
[Phase 2](./PHASE_2_WIDGET_ADAPTERS.md).

## Repeat locally

Start only the isolated test database from the sibling services repo:

```sh
cd /Users/kole/workspace/quikfill/services
docker compose up -d postgres-test
DATABASE_URL='postgresql://quikfill:quikfill@localhost:5444/quikfill_test?schema=public' npm run db:migrate
```

Then from `frontend`:

```sh
pnpm --filter @quikfill/e2e exec playwright install chromium
pnpm --filter @quikfill/e2e test:mv3
# Optional: show the real browser window.
MV3_HEADED=1 pnpm --filter @quikfill/e2e test:mv3
```

If using a cached browser, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to the **full**
Chromium binary. `chrome-headless-shell` cannot load the extension. The test runner
builds the isolated artifact, starts the API/dashboard/fixtures, uses one worker,
closes its browser and deletes its temporary profile. It refuses to reuse existing
servers on ports 4012/5173/4178. The API refuses a database other than local
`quikfill_test:5444` and requires `MV3_RELEASE_TEST=1`.

Screenshots, failure traces and JSON results are retained under
`apps/e2e/playwright-report/mv3*` (ignored by Git). They contain synthetic test data.
Stop the test database after use to free memory:

```sh
cd /Users/kole/workspace/quikfill/services
docker compose stop postgres-test
```

## Remaining release scope

This closes the installed-MV3 browser gate for the controlled local environment.
Real Gemini and Stripe test API checks were subsequently completed as described
below. Hosted Stripe Checkout/3DS completion, actual configured webhook delivery,
production deployment, Chrome Web Store packaging/upload and a wider Chrome/OS/site
matrix remain separate checks. No universal compatibility or automatic repair on
restricted sites is claimed.

## Real Gemini / Stripe test follow-up

`pnpm --filter @quikfill/e2e test:mv3:gemini` builds/installs the same real MV3
extension in a fresh full Chromium profile and uses the sibling service's
`test:live:server` with **no Gemini override**. It requires `GEMINI_API_KEY` in
ignored `services/.env`. The runner opts in with `QF_LIVE_PROVIDER_TEST=1`, pins
the local test DB, disables Stripe/email, refuses existing servers and uses one
worker. This suite makes two real model requests and is deliberately separate
from `test:mv3`, which remains deterministic and needs no paid-provider key.
Each server run owns a unique synthetic mailbox prefix and audit scope; the test
explicitly awaits scoped cleanup before server shutdown and gives it a SIGTERM
cleanup window as a fallback. Repeated
runs do not include prior runs' audit rows or depend on resetting the database.

Verified: actual toolbar OTP sign-in, unresolved-field review before page writes,
real model values applied after approval, concurrent manual-edit preservation,
Undo, discard, two-fill quota and offline local Fill. Persisted audit rows must
show a real model/token usage and omitted prompt text. Request metadata must not
contain the existing form email. The journey passes on full Chromium 156.0.8078.4
with extension 1.0.13. All five deterministic installed-MV3 journeys still pass.
Artifacts are ignored under `apps/e2e/playwright-report/gemini*`.

Follow-up regression gate: **751 frontend unit tests**, **88 standard browser
tests**, **326 backend unit tests**, **5 provider-environment guard tests**, and
**78 PostgreSQL integration tests** pass, alongside the five deterministic MV3
journeys and the separate real-Gemini MV3 journey. Ordinary integration tests
remain provider-free even when local `.env` contains real credentials.

The sibling services real-API smoke also passes Gemini classify/mapping/fill,
constraints/replay/quota and nine Stripe test lifecycle checkpoints, including
payment decline/recovery, test-clock renewal and delayed invoice protection.
Those tests found/fixed the effective billing-tier mismatch, incorrect renewal
period dates, and localized native date suggestions. See the sibling
`services/docs/LIVE_PROVIDER_CHECKS.md` for commands, cleanup and the exact limits:
Stripe event handling uses signed replay of real API events; hosted Checkout
purchase completion and network webhook delivery are not claimed.

The harness follows the official [Playwright extension guidance](https://playwright.dev/docs/chrome-extensions),
[Chrome end-to-end guidance](https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing)
and [Puppeteer toolbar-action guidance](https://pptr.dev/guides/chrome-extensions).
