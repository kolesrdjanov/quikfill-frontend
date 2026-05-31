# LEGACY — side panel (retired in v2)

The extension's surface is the toolbar **popup** (`entrypoints/popup/App.vue`).
This retired side panel is kept for reference and **not built** (it lives outside
`entrypoints/`, so WXT ignores it):

- `App.vue` — the post-revamp minimal side panel (auth + settings + scan).
- `App.legacy.vue` — the original scan → preview → AI → fill wizard.

Do not delete. The wizard also drives `lib/useFillSession.ts` and
`components/sidepanel/*`, which remain in the tree for the same reason.
