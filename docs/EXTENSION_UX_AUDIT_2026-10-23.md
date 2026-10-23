# Extension usability audit — 2026-10-23

This update covers the popup and in-page fill controls. It uses generic fixtures
and shared field semantics; it contains no site-specific selectors or URL rules.
The private application from the report was not accessed.

## Findings and changes

- Expanded popup sections mixed unpadded native disclosures, nested cards and
  legacy settings rows. All four sections now use one shared Reka Disclosure
  primitive with 16px padding, consistent headings, borders and spacing. The file
  picker is styled, and the scenario editor uses the popup's single scroll area.
  Sign-in remains in the header; the persisted OTP challenge survives popup close
  and service-worker restart (the preceding auth fix remains covered).
- AI was hidden behind a local fill result, then excluded fields supported by a
  local generator unless an obscure checkbox was selected. **Sample data** and
  **Fill with AI** are now visible beside the form. AI considers every eligible
  empty field and opens a checklist before applying anything. Existing values
  remain protected even when local overwrite is enabled.
- Sensitive detection could match `2fa` inside an arbitrary generated DOM ID and
  block ordinary name/email/company/phone fields. The common classifier now checks
  bounded, normalized signals separately, including accessible labels. Real
  password, OTP, payment and government-ID controls remain protected. The exact
  DOM of the reported private form is unknown; the generic failure is reproduced
  in unit and browser tests.
- Custom single/multiple selects use observed enabled choices in the same review;
  they are no longer omitted from the AI path. A multiselect label containing a
  comma is retained as one choice. Remote/unavailable controls remain explicit
  skips rather than invented choices.
- The old result panel scrolled its actions away and clipped the status pill.
  Results now have a header, scrollable body and fixed action footer. Loading shows
  a spinner, actual phase text and local per-field progress. It can be cancelled.
  The toolbar and panel are clamped to the viewport for all four corner settings;
  light/dark/automatic appearance uses the same surface hierarchy.
- No eligible fields, empty provider responses and provider failures give distinct
  recovery messages. Review, manual-edit protection, account invalidation, Undo,
  no automatic submit and offline local filling remain in place.

## Validation

- 769 frontend unit tests.
- 99 browser tests, including React/Vue state, Radix/Reka/MUI controls, async and
  virtualized choices, dependent controls, local scenarios, saved records and AI.
- Five installed production-mode MV3 journeys in a fresh Chromium profile: real
  toolbar popup, OTP resume/worker restart, account isolation, reviewed AI, Undo,
  offline fill, extension reload and restricted pages.
- One installed real-Gemini journey with two synthetic requests: review, apply,
  concurrent manual edits, Undo, discard, quota and offline local filling. Test
  email/billing are disabled; only synthetic localhost fixture metadata is sent.
- Lint, formatting, TypeScript and workspace production builds.

Visual artifacts are produced by the browser and MV3 suites under ignored
`apps/e2e/test-results/` and `apps/e2e/playwright-report/`: all four expanded popup
sections, saved selection, active scenario, loading, long review and narrow dark
appearance. The long-review checks require visible footer actions and no overlap
with the toolbar. Narrow-layout checks cover every configured corner at 320px.

These checks establish the listed behavior, not compatibility with every website.
Widget limitations remain documented in [Phase 2](./PHASE_2_WIDGET_ADAPTERS.md).
The existing main-branch deployment workflow builds the store release and submits
it to Chrome Web Store review; Google approval is a separate step.
