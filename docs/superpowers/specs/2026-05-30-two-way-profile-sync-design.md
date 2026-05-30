# Two-way profile sync (Iteration 10) — design

**Status:** approved 2026-05-30. Spans **two repos**: `quikfill-services` (backend)
and `quikfill-frontend` (schemas, browser-adapter, chrome-extension).

## Problem

The extension saves domains / form profiles / field mappings only to
`chrome.storage.local` (local `StorageAdapter`); it never calls the backend. The
dashboard reads profiles from the backend (`GET /form-profiles`). The two stores
are disconnected, so profiles saved in the extension never appear on the
dashboard.

## Goal (v1 scope)

One account-scoped store shared by extension and dashboard, via:

- **Push on save** — after a local save, write-through to the backend.
- **Manual "Sync now"** — full two-way reconcile (push local, pull remote, merge).

**Out of scope (v1):** auto-pull on panel open; delete propagation (needs
tombstones); conflict UI (last-write-wins is silent); wiring AI classification to
saved entity records (issue #3 — separate data path, tracked as follow-up).

## Decisions

- **IDs:** make backend `POST` **idempotent on a client-supplied UUID** (upsert),
  completing the contract `schemas/common.ts` already documents (*"Clients supply
  UUIDs on create so backend push is idempotent."*). The extension already mints
  `crypto.randomUUID()` for every record, so stable ids end-to-end give trivial,
  correct id-based reconciliation — no local↔server id map.
- **Reconciliation:** last-write-wins on `updatedAt` (no version/etag field
  exists). Missing `updatedAt` is treated as oldest.

## Architecture

### 1. Backend — idempotent upsert (`services`)

For `domains`, `form-profiles`, and field `mappings`:

- Create DTO gains an **optional `id`** (`@IsOptional() @IsUUID()`).
- Service `create(userId, dto)`:
  - `dto.id` present → `findFirst({ id, userId })`; found → **update** and return;
    not found → **create with that id** (connect user).
  - `dto.id` absent → create new (server-generated id) — unchanged, keeps the
    dashboard working.
- Cross-user id: creating with an id already owned by another user hits the PK
  unique constraint (`P2002`) → map to **409 Conflict** without leaking ownership.
  Honest sync never triggers this (random UUIDs).
- Prisma `id` is `@default(uuid())`; passing an explicit `id` overrides it.
- **Tests (per module, e2e + unit):** POST with client id creates with that id;
  re-POST same id updates (no duplicate); POST with another user's id → 409 and
  leaves their row untouched; POST without id still works.
- **Docs:** update `services/docs/IMPLEMENTATION_PLAN.md`; regenerate
  `openapi.json` (`npm run export-openapi`) — DTO change alters the snapshot.

### 2. Shared contract (`frontend/packages/schemas` + `api-client`)

- `createDomainInputSchema`, `createFormProfileInputSchema`,
  `createFieldMappingInputSchema` gain an **optional `id`** (keep omitting
  timestamps / `formProfileId`). Implementation: `.partial({ id: true })` instead
  of `.omit({ id: true })`.
- `api-client` needs no signature change — `create()` already forwards the whole
  parsed input.

### 3. Extension sync engine (`browser-adapter`) — background-only

The api-client runs only in the background worker, so sync mirrors the existing
`auth` / `ai` messaging pattern.

- `profile-sync-messaging.ts` — message types + `requestProfilePush(bundle)` /
  `requestProfileReconcile()` send helpers + `onProfileSyncRequest(handlers)`
  registration. Mirrors `auth-messaging.ts`.
- `background-sync.ts` — `createBackgroundSync({ api, store })`. `api` is a
  **structural `SyncApi`** interface (like `AuthApi`) so the package keeps minimal
  deps. Handlers:
  - **`pushBundle({ domain, profile, mappings })`** — upsert domain, then profile,
    then each mapping (`api.formProfiles.createMapping(profileId, { id, ... })`);
    write the server-returned records back into the local store so local
    timestamps match the server. Returns `{ ok }` / `{ ok: false, error }`.
  - **`reconcile()`** — pull all account domains / profiles / mappings; merge with
    all local by id, LWW on `updatedAt`:
    - both sides → newer wins (remote newer → write local; local newer / local-only
      → push upsert → write server result to local);
    - remote-only → write to local.
    - Order: domains → profiles → mappings (FK-safe). Mappings reconciled per
      profile. Returns `{ pushed, pulled }`.
- `profile-store.ts` — `saveDomain` / `saveFormProfile` / `saveMapping` stamp
  `updatedAt = now` (and `createdAt` if absent) so local records are
  LWW-comparable. Today they persist with no timestamps.
- **Tests:** `background-sync.test.ts` (in-memory store + fake api: LWW both-sides,
  push local-only, pull remote-only, push-bundle write-back); existing
  `profile-store.test.ts` updated for timestamps.

### 4. Extension wiring (`chrome-extension`)

- `background.ts` — `createBackgroundSync({ api, store: createProfileStore(
  createChromeStorageAdapter()) })` + `onProfileSyncRequest(sync.handlers)`.
- `useFillSession.ts` `saveProfile()` — after the local saves, send
  `requestProfilePush(bundle)`; best-effort, local-first (a failed push still
  reports "saved", surfaced as a soft "not synced yet" note).
- **"Sync now"** — a `@quikfill/ui` Button near the side-panel footer counts;
  calls `requestProfileReconcile()` then refreshes the local counts. Shows a
  pending state + success/error toast.

## Error handling

- Offline / unauthorized push → local save stands; soft note; "Sync now" retries.
  Auth refresh is handled by the shared transport (401 → refresh → retry).
- `reconcile()` failure → returns an error kind; UI shows a toast.

## Convergence note

After a push, the server returns a record whose `updatedAt` ≥ local. Writing it
back to local means the next reconcile sees equal/remote-newer and is a no-op —
the system converges and does not thrash.

## Implementation order

1. **Backend idempotent upsert** (domains → form-profiles → field-mappings), with
   tests + openapi regen. Self-contained; unblocks everything.
2. **Shared schemas** — optional `id` on the three create inputs + tests.
3. **browser-adapter** — `profile-store` timestamps, `background-sync`,
   `profile-sync-messaging` + tests.
4. **chrome-extension** — background wiring, push-on-save, "Sync now" UI.

Each step ships as its own commit with that repo's gate green.

## Follow-up (not this spec)

- **Issue #3:** AI classification → saved entity records. The `entityRecords`
  resource already exists; wiring `suggestionToProposal` to resolve a value from a
  matching saved record (instead of only generator/`aiGenerated`) is a separate
  data path. Assess after sync lands.
