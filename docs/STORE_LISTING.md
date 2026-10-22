# Chrome Web Store listing and review answers

Updated in the QuikFill CWS draft on 2026-10-22 for the local-first release.
Item: `nnfiaaapphfcenegcppgdoehdalmnhce`; publisher:
`d2259aca-32f7-43f4-9960-a9dd6ac5214c`. See [deployment](./DEPLOY_EXTENSION.md).

Visibility remains **Public**, category **Tools**, language **English (United
States)**. Name and summary come from the extension manifest. Homepage, official
site and support URL remain `https://quikfill.io`. The existing icon, three
screenshots and promo tiles are retained; review their visual freshness separately.
The release workflow uploads the package and submits the saved CWS draft. It does
not update metadata itself or bypass Google review.

## Detailed description

```text
QuikFill helps developers and QA teams fill web forms with sample data and repeatable test scenarios.

Start locally
Open QuikFill on a page and use Fill to generate sample values. Basic filling works without an account, AI, or a network connection. Choose a seed for repeatable data, keep existing values by default, and use local QA scenarios with fixed, generated, or skipped fields. Import and export scenarios as JSON.

Inspect the result
See which fields were filled, skipped, or unsupported. Retry failed fields and use Undo for values QuikFill changed. Undo preserves later edits. QuikFill never submits the form.

Optional AI assistance
Sign in and explicitly request AI assistance for fields that need help. Review the proposed values and select which suggestions to apply. QuikFill sends bounded field metadata, such as labels, input types, options, constraints, and locale, through its backend to Google Gemini. It omits current field values, saved-record values, full page HTML, page title, and page description. Labels and options can contain personal information; this minimization does not guarantee anonymization. AI usage is subject to your plan and quota.

Optional saved data
Manage records at https://app.quikfill.io, select a record in the extension, and fill matching fields while preserving existing values. Saved records are stored in your QuikFill account and cached locally for the signed-in account.

QuikFill supports native form controls and selected custom widgets. Some widgets, embedded frames, restricted pages, and application-specific validation may need manual input. Check generated data and the result before submitting a form.

Learn more: https://quikfill.io
Privacy: https://quikfill.io/privacy
```

## Single purpose

```text
Help users fill web forms with locally generated sample data, repeatable QA scenarios, or an explicitly selected saved record. Optional AI assistance proposes values for review before the user applies them. Filling is user initiated, reports field outcomes, supports guarded Undo, and never submits forms.
```

## Permission explanations

### activeTab

Accesses the current tab after the user opens QuikFill, reads its hostname for site preferences, and supports user-initiated activation on that tab.

### scripting

Injects or restores the bundled form-filling content script on the active tab when the user activates QuikFill, including recovery after an extension update or reload. No remote executable code is loaded.

### storage

Stores device-local preferences and QA scenarios, sign-in session tokens, pending account settings, and account-scoped saved-record caches. Logout and account changes isolate saved records; cached libraries expire after 24 hours. Local sample filling does not require an account.

### alarms

Wakes the background worker to synchronize signed-in account settings and prune expired account-scoped saved-record caches. Local sample filling does not require this network sync.

### Host permissions

https://api.quikfill.io/* lets the background worker authenticate users, sync account settings and saved records, read entitlements, and request optional AI assistance. The content script matches <all_urls> to detect supported forms and offer user-initiated Fill across sites; it does not submit forms. Local sample filling works without network access. AI is an explicit action and sends bounded field labels, types, names, options, constraints, and locale, not current values, saved-record values, or full HTML. Labels and options can contain personal information. AI suggestions require review before application. Signed-in saved records are stored in the QuikFill account and cached locally. Users can disable the extension globally or per site.

## Existing disclosures verified in CWS

- Personally identifiable information, authentication information and website
  content are selected. The field metadata sent for optional AI is website content;
  labels/options may themselves contain identifying text.
- No remotely hosted executable code; all JavaScript is bundled in the extension.
- Privacy policy URL: `https://quikfill.io/privacy`.
- Existing limited-use certifications remain selected: no sale/transfer outside
  approved use cases, no unrelated use, no creditworthiness/lending use.
- The other existing data-category checkboxes were not changed. This is a record
  of the current listing, not authorization to expand collection.

The detailed description and permission explanations distinguish device-local QA
scenarios, account-backed saved records, and explicit Gemini requests. They do not
promise universal widget compatibility, a preview before every local fill, or
complete anonymization of field metadata.
