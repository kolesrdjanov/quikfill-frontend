# Quikfill Frontend Requirements

## Purpose

`quikfill-frontend` is the frontend monorepo for Quikfill.

It should contain:

- A public website.
- A dashboard web app.
- A Chrome extension/widget.
- Shared packages used across frontend surfaces.

The Chrome extension is the primary product experience. The dashboard manages data, templates, subscription, and account settings. The website explains and sells the product.

## Core Principle

Do not build a throwaway demo.

The first implementation can be thin and local-first, but it must use long-term concepts:

- Workspace.
- Domain/app.
- Form profile.
- Detected field.
- Field fingerprint.
- Field mapping.
- Fill source.
- Fill plan.
- Fill run.
- AI suggestion.
- Storage adapter.
- Sync adapter.

## Target Monorepo Structure

Use a Turborepo-style monorepo.

```txt
quikfill-frontend/
  apps/
    website/
    app/
    chrome-extension/
  packages/
    schemas/
    autofill-core/
    form-scanner/
    browser-adapter/
    generators/
    ai/
    api-client/
    ui/
    config/
  requirement.md
```

## Apps

### `apps/website`

Stack:

- Nuxt.
- TypeScript.
- Tailwind CSS.

Purpose:

- Public landing pages.
- Product explanation.
- Pricing.
- Docs/getting started.
- Support/contact.
- Privacy and terms placeholders.

Rules:

- Should not depend on Chrome APIs.
- Should not depend on extension-only packages.
- Should use real product screenshots once available.

### `apps/app`

Stack:

- Vue 3.
- TypeScript.
- Tailwind CSS.
- shadcn-vue or local shadcn-style components.
- Zod.
- VeeValidate.

Purpose:

- Dashboard for authenticated users.
- Account management.
- Subscription and Stripe billing entry points.
- Workspace settings.
- Saved data and templates.
- Generator presets.
- Domains/apps.
- Form profiles.
- Mapping review.
- Fill history.

Rules:

- Dashboard should feel like a productivity tool, not a marketing page.
- Use dense, scannable layouts.
- Use VeeValidate + Zod for forms.
- Share schemas with extension.
- Do not hard-code plan limits deep inside components.

### `apps/chrome-extension`

Stack:

- Chrome Manifest V3.
- TypeScript.
- Vue 3 for side panel/popup/options where practical.
- Tailwind CSS.

Purpose:

- Scan current page.
- Detect fields.
- Match saved profiles.
- Request Gemini assistance when useful.
- Build preview fill plan.
- Fill fields.
- Verify results.
- Undo recent fill.
- Save/update form profiles.

Extension parts:

- `service_worker`
- `content_script`
- `side_panel`
- `popup`
- `options_page`

The side panel is the primary UI. The popup should stay lightweight.

## Shared Packages

### `packages/schemas`

Shared Zod schemas and inferred TypeScript types.

Must define:

- Workspace.
- Domain/app.
- Form profile.
- Detected field.
- Field fingerprint.
- Field mapping.
- Fill source.
- Fill plan.
- Fill result.
- Fill run.
- Entity type.
- Entity record.
- Generator preset.
- AI suggestion.

All cross-package and AI contracts must use these schemas.

### `packages/autofill-core`

Browser-agnostic planning and matching logic.

Responsibilities:

- Normalize scanner results into planning input.
- Match detected fields to saved mappings.
- Score mapping confidence.
- Resolve fill sources.
- Build fill plans.
- Identify warnings and unsupported fields.
- Prepare undo plans.

Must not depend on:

- DOM APIs.
- Chrome APIs.
- Vue.
- Nuxt.
- Backend clients.

### `packages/form-scanner`

DOM-aware scanning logic.

Responsibilities:

- Find inputs, textareas, selects, checkboxes, radios, contenteditable fields, and common custom controls.
- Extract labels, placeholders, `name`, `id`, `autocomplete`, ARIA text, nearby text, section headings, options, current values, and visibility.
- Generate selector candidates.
- Generate field fingerprints.
- Detect same-origin iframes and open shadow DOM where possible.
- Report inaccessible fields and limitations.

### `packages/browser-adapter`

Chrome/browser integration.

Responsibilities:

- Extension messaging.
- Storage wrappers.
- Current tab and frame targeting.
- Permission checks.
- Script injection.
- Runtime utilities.
- Adapter interfaces for local storage and future sync.

### `packages/generators`

Random and deterministic data generation.

Generators should support:

- Person.
- Email.
- Phone.
- Address.
- Company.
- Unit.
- Number.
- Date.
- Currency.
- Boolean.
- Notes.
- Select option.
- Custom enum.

Support locale, seed, constraints, and format options.

### `packages/ai`

Gemini-facing frontend helpers and contracts.

Responsibilities:

- Build privacy-aware field summaries.
- Redact current values by default.
- Validate AI responses.
- Convert AI suggestions into reviewable mapping suggestions.

Must not contain Gemini API keys.

Production AI calls should go through `quikfill-services`.

### `packages/api-client`

Typed client for `quikfill-services`.

Responsibilities:

- Fetch wrapper.
- OpenAPI-generated client or typed manual endpoints.
- Auth/session handling once backend supports it.
- Sync APIs.

Should not contain product decision logic.

### `packages/ui`

Shared Vue UI components for dashboard and extension.

Rules:

- Keep components practical and operational.
- Avoid coupling website marketing design to dashboard/extension UI.

### `packages/config`

Shared config:

- TypeScript.
- ESLint.
- Tailwind.
- Test setup.

## Chrome Extension Product Flow

Required target flow:

1. User opens any third-party form.
2. User opens Quikfill side panel.
3. Extension requests current tab access if needed.
4. User clicks Scan.
5. Content script returns detected fields.
6. Extension checks saved form profiles for the current domain/page/fingerprint.
7. Saved mappings are applied first.
8. Heuristics classify obvious fields.
9. Gemini can classify ambiguous fields.
10. User selects fill source:
    - Generator preset.
    - Saved record.
    - Static template.
    - Hybrid.
    - AI-assisted.
11. Autofill core builds a preview fill plan.
12. User reviews current value, proposed value, source, confidence, and warnings.
13. User clicks Fill.
14. Content script fills fields and dispatches events.
15. Extension verifies values and shows success/failure result.
16. User can undo the most recent fill.
17. User can save/update the form profile.

## Field Detection Requirements

The scanner must collect:

- Scanner field id.
- Tag name.
- Input type.
- Current value.
- Required state.
- Disabled/readonly state.
- Visibility state.
- `name`.
- `id`.
- Class names.
- Placeholder.
- Autocomplete.
- ARIA label.
- ARIA labelled-by text.
- Associated label text.
- Nearby text.
- Section heading.
- Select/radio/checkbox options.
- Selector candidates.
- DOM fingerprint.
- Frame context.
- Shadow DOM context.

## Fill Execution Requirements

The filler must:

- Use native value setters for inputs and textareas.
- Dispatch `input`, `change`, and `blur` events.
- Use click behavior for checkboxes and radios.
- Handle native selects.
- Verify accepted values.
- Track previous values for undo.
- Skip disabled, readonly, hidden, or unsupported fields unless explicitly allowed.
- Return structured per-field results.

## Gemini AI Requirements

Gemini should help the user understand and map forms.

Gemini can:

- Classify fields.
- Suggest fill source types.
- Suggest dropdown option matches.
- Group fields into sections.
- Explain ambiguous fields.
- Suggest mapping updates.

Gemini cannot:

- Directly fill the page.
- Override user preview.
- Be trusted without schema validation.
- Receive full page HTML by default.

AI output should be reviewable and rejectable.

## Local-First And Sync

The first implementation may be local-first.

Local data should live behind adapter interfaces so backend sync can replace or augment it later.

Local storage may include:

- Implicit local workspace.
- Saved domains.
- Saved form profiles.
- Saved mappings.
- Generator presets.
- Recent scan.
- Undo snapshot.
- Extension preferences.

Avoid `chrome.storage.sync` for sensitive data.

Backend sync should later support:

- Workspaces.
- Saved records.
- Generator presets.
- Domains.
- Form profiles.
- Mappings.
- Fill runs.
- Subscription/entitlements.

## Dashboard Requirements

Dashboard MVP should include:

- Login/account shell once backend auth exists.
- Subscription page.
- Stripe billing portal entry point.
- Data library.
- Generator presets.
- Domains/apps.
- Form profiles.
- Mapping review.
- Fill history.
- Settings.

Recommended navigation:

- Home.
- Data.
- Generators.
- Apps.
- Form Profiles.
- Fill History.
- Subscription.
- Settings.

## Website Requirements

Website MVP pages:

- Landing.
- Product overview.
- Chrome extension.
- Pricing.
- Docs/getting started.
- Support/contact.
- Privacy.
- Terms.

## Iteration Plan

### Iteration 1: Monorepo Foundation

Deliverables:

- Turborepo workspace.
- `apps/website`.
- `apps/app`.
- `apps/chrome-extension`.
- Shared packages with placeholder exports.
- Root scripts for lint/typecheck/test/build.

Exit criteria:

- All apps/packages build from root.

### Iteration 2: Shared Schemas

Deliverables:

- Zod schemas for all core concepts.
- Type exports.
- Tests for schema parsing.

Exit criteria:

- Dashboard and extension can import shared contracts.

### Iteration 3: Scanner Prototype

Deliverables:

- Manifest V3 extension.
- Side panel.
- Service worker/content script messaging.
- Native field scanner.
- Detected field list UI.

Exit criteria:

- User can scan a real page and inspect detected fields.

### Iteration 4: Fill Plan Preview

Deliverables:

- Generator fill sources.
- Matching heuristics.
- Fill plan builder.
- Preview UI.

Exit criteria:

- User can generate a preview plan without filling.

### Iteration 5: Fill Execution And Undo

Deliverables:

- Native field filler.
- Event dispatch.
- Verification.
- Undo snapshot.
- Structured results.

Exit criteria:

- User can preview, fill, verify, and undo on native forms.

### Iteration 6: Local Form Profiles

Deliverables:

- Save domain/form profile locally.
- Save mappings locally.
- Match current page to saved profile using URL and fingerprint.
- Update mappings.

Exit criteria:

- User can reuse a saved form profile.

### Iteration 7: Gemini Assistance

Deliverables:

- Field summary builder.
- Backend AI client integration.
- AI suggestion validation.
- Review/accept/reject UI.

Exit criteria:

- User can use Gemini to classify ambiguous fields and improve mappings.

### Iteration 8: Dashboard Management

Deliverables:

- Data and generator management.
- Domain/form profile management.
- Mapping review.
- Subscription/settings shell.

Exit criteria:

- Dashboard manages the same data model as the extension.

### Iteration 9: Website

Deliverables:

- Nuxt marketing website.
- Product pages.
- Pricing/docs/support placeholders.

Exit criteria:

- Public site can explain Quikfill and direct users to app/extension.

### Iteration 10: Backend Sync And Billing

Deliverables:

- API client integration.
- Auth flow.
- Sync adapter.
- Entitlements.
- Stripe billing integration.

Exit criteria:

- Extension and dashboard can use backend-backed data without rewriting local-first logic.

## Testing Requirements

Test high-risk logic:

- Schema validation.
- Field scanning.
- Fingerprint generation.
- Mapping confidence.
- Fill plan generation.
- Generator outputs.
- Fill execution on fixture pages.
- Extension messaging.
- Dashboard forms.
- API client.

Recommended tooling:

- Vitest for packages.
- Playwright for website/dashboard.
- Chrome extension E2E harness or Playwright extension tests.
- Fixture HTML pages for scanner/filler behavior.

## Agent Instructions

Agents working in this repo must:

- Build only the requested iteration.
- Preserve package boundaries.
- Keep DOM/Chrome logic out of `autofill-core`.
- Use schemas for AI and cross-package contracts.
- Keep AI review-first.
- Keep extension permissions minimal.
- Avoid URL-only form identity.
- Avoid hard-coding one app or domain.
