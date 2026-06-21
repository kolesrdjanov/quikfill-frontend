# Chrome Web Store — listing copy & review answers

Paste-ready text for the QuikFill listing in the
[CWS Developer Dashboard](https://chrome.google.com/webstore/devconsole). The
listing is **Private (trusted testers)** — see
[`DEPLOY_EXTENSION.md`](./DEPLOY_EXTENSION.md) for the full publish procedure.

> Even a private / trusted-tester item must fill out every required field below
> and still passes Google review before testers can install it.

---

## Store listing tab

| Field                     | Value                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Item / product name**   | `QuikFill — Form Autofill` (≤ 75 chars)                                                                |
| **Summary** (≤ 132 chars) | `Scan, map, and fill any web form. Save reusable profiles, preview every fill, and undo in one click.` |
| **Category**              | `Productivity`                                                                                         |
| **Language**              | `English (United States)`                                                                              |

### Detailed description (≤ 16,000 chars)

```
QuikFill fills web forms for you — on any site — without losing control.

How it works:
1. Open the QuikFill popup on any page with a form.
2. QuikFill scans the page and detects the fields.
3. It matches them to the profiles you've saved (name, contact, address, and
   your own custom fields).
4. For anything it can't map, you can optionally ask AI for a suggestion — it
   only ever sees a redacted summary of the field, never the page or your data.
5. You get a preview of exactly what will be filled before anything happens.
6. Confirm, and QuikFill fills the form. One click undoes it.

Why QuikFill:
• Review-first — AI suggests, you confirm. QuikFill never fills a page on its own.
• Privacy-aware — your saved data lives on your device; only redacted field
  summaries are ever sent for AI help.
• Works anywhere — a general-purpose form filler, not tied to any one site.
• Reusable profiles — save once, reuse across every form.
• Full preview + one-click undo on every fill.

Manage your profiles and settings at https://app.quikfill.io.
```

### Graphic assets (YOU must create these — not in the repo)

| Asset              | Spec                                    | Required?                                                |
| ------------------ | --------------------------------------- | -------------------------------------------------------- |
| Store icon         | 128×128 PNG                             | ✅ have it (`apps/chrome-extension/public/icon/128.png`) |
| **Screenshot(s)**  | **1280×800** (or 640×400) PNG/JPEG, 1–5 | ✅ **at least 1 — this is the blocker**                  |
| Small promo tile   | 440×280 PNG                             | optional (recommended)                                   |
| Marquee promo tile | 1400×560 PNG                            | optional                                                 |

> Screenshots can't be generated from the repo (the in-page overlay doesn't
> render in any dev server — see the `reference-ce-overlay-visual-harness`
> note). Capture them from the real extension: the popup over a sample form, the
> fill-plan preview, and a filled result. For a private listing they can be
> simple — 1 clean screenshot unblocks submission.

---

## Privacy tab (required — review hinges on this)

### Single purpose

```
QuikFill detects, maps, and fills web forms. On the page the user is on, it
scans the form, matches it to the user's saved profiles, optionally asks AI for
help with unmapped fields (using a redacted field summary only), previews a fill
plan, and fills the form on the user's confirmation, with one-click undo.
```

### Permission justifications

Paste one per permission. Each is grounded in `wxt.config.ts` / the manifest.

| Permission                                                                                                                          | Justification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                                                                                                                         | Granted on the user's gesture of opening the popup, so the popup can read the active tab's hostname for the per-site activation toggle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `scripting`                                                                                                                         | Injects the content script that scans and fills the form on the page the user is actively working with, only on user action.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `storage`                                                                                                                           | Persists the user's saved form profiles and extension settings locally on their device.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `alarms`                                                                                                                            | Schedules a periodic background sync so a signed-in user's dashboard-managed settings stay up to date without waiting for a sign-in or service-worker restart.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Host permissions** — ⚠️ ONE field in CWS, must justify BOTH `https://api.quikfill.io/*` AND the content-script `<all_urls>` match | QuikFill requests two host scopes: (1) `https://api.quikfill.io/*` — the background service worker calls the QuikFill backend for user-initiated sign-in, settings sync, and optional AI assistance. (2) All sites (`content_scripts` matches `<all_urls>`) — QuikFill is a general-purpose form filler that must work on whatever site the user is on. The content script runs on the page to detect forms and show an in-page "Fill" button (the user can disable QuikFill per-site or globally). It scans, fills, and contacts the backend only on the user's explicit action, sending only redacted field summaries (field labels and input types — never field values or full page content). |

> ⚠️ The `<all_urls>` content-script match is the single most-scrutinized part of
> this listing. The justification above is the honest reason; expect Google to
> read it carefully even for a private item.

### Data usage disclosures — **verify against the real privacy policy at `https://quikfill.io/privacy` before submitting**

- **Privacy policy URL:** `https://quikfill.io/privacy` (confirm the exact host)
- Data handled (recommended starting point — confirm it matches your policy):
  - _Personally identifiable information_ — the profile data the user saves to fill forms (name, email, address, etc.).
  - _Authentication information_ — passwordless email sign-in.
- Certifications (all three must be true — confirm):
  - ✅ Not selling or transferring user data to third parties outside approved use cases.
  - ✅ Not using or transferring user data for purposes unrelated to the item's single purpose.
  - ✅ Not using or transferring user data to determine creditworthiness or for lending.
- **Remote code:** `No, I am not using remote code` (MV3, everything is bundled in the zip).

---

## Distribution tab

- **Visibility:** `Private`
- **Trusted testers:** add the Google account emails that may install (one per line).
- **Regions:** all (or restrict as you like — irrelevant while private).
