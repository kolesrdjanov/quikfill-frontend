# Spec: apply `dateFormat` at fill time

## Context (read first — the executing session has no prior context)

QuikFill has a backend-synced **extension settings** feature (built 2026-06-03). The dashboard
is the source of truth: a user edits settings in the app (`apps/app/src/views/Setup.vue`), they
persist on `User.settings` (JSONB) via `PATCH /users/me/settings`, come back on `GET /users/me`
as `extensionSettings`, and the extension background worker syncs them into
`chrome.storage.local['settings:extension']`, where the in-page overlay reads them.

One setting — **`dateFormat`** (`'auto' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'`) — is
fully **stored and synced** but **not yet applied at fill time**. The in-page fill is AI-driven:
the overlay builds a redacted request and the backend prompts Gemini to produce values. The
`dateFormat` preference is never put in that request, and the prompt never mentions it, so the
model just guesses a date format. Today, changing `dateFormat` has no observable effect.

**Goal:** thread `dateFormat` into the `/ai/fill` request and the model prompt so a free-text date
field is filled in the user's chosen format. `'auto'` keeps today's behavior (send nothing).

This spans **two sibling git repos** under `/Users/kole/workspace/quikfill/`:

- `frontend/` — pnpm monorepo (schema, AI request builder, extension overlay).
- `services/` — NestJS backend (request DTO, prompt, type).

The top-level dir is NOT a git repo; commit in each sub-repo separately. Per project conventions:
the frontend `extensionSettingsSchema`/Zod contracts and the backend class-validator DTOs are
**mirrors — keep them in sync**; the backend follows a three-places rule (code + tests +
docs/OpenAPI in the same commit) and `npm run verify` fails if `openapi.json` drifts.

## Important nuance: do NOT break native date inputs

A native `<input type="date">` (the field's `inputType` is `"date"`) requires its value to be ISO
`yyyy-mm-dd` regardless of how it's displayed — overriding that breaks the fill. So `dateFormat`
must apply only to **free-text** date fields. Precedence the prompt must encode:

1. `inputType === "date"` → always ISO `yyyy-mm-dd` (ignore `dateFormat`).
2. A field with its own `min`/`max`/`placeholder` format → mirror that (existing behavior wins).
3. Otherwise, a free-text date field → use the user's `dateFormat`.

## Changes

### 1. Shared contract — `frontend/packages/schemas/src/ai-fill.ts`

Add an optional `preferences` block to the request. `dateFormatSchema` already exists in
`./extension-settings`.

```ts
import { dateFormatSchema } from './extension-settings'

/** Optional user preferences that shape generated values. */
export const aiFillPreferencesSchema = z.object({
  /** Preferred format for free-text date fields. Omit (or 'auto') to let the model decide. */
  dateFormat: dateFormatSchema.optional(),
})
export type AiFillPreferences = z.infer<typeof aiFillPreferencesSchema>

export const aiFillRequestSchema = z.object({
  page: aiFillPageSchema,
  fields: z.array(aiFillFieldSchema).min(1),
  preferences: aiFillPreferencesSchema.optional(), // <-- add
})
```

If `packages/schemas/src/ai-fill.test.ts` asserts the exact request shape, extend it (a request
without `preferences` must still parse).

### 2. Request builder — `frontend/packages/ai/src/fill-request.ts`

`buildAiFillRequest(page, fields)` → add an optional 3rd arg and include it only when meaningful
(omit when `'auto'`/undefined, so the wire shape is unchanged for the default):

```ts
export function buildAiFillRequest(
  page: AiFillPageInput,
  fields: DetectedField[],
  preferences?: AiFillPreferences,
): AiFillRequest | null {
  const fillable = fields.filter(isAiFillableField)
  if (fillable.length === 0) return null
  const dateFormat = preferences?.dateFormat
  return aiFillRequestSchema.parse({
    page: {
      /* unchanged */
    },
    fields: fillable.map(toAiFillField),
    ...(dateFormat && dateFormat !== 'auto' ? { preferences: { dateFormat } } : {}),
  })
}
```

Add a `fill-request.test.ts` case: passing `{ dateFormat: 'DD/MM/YYYY' }` includes
`preferences`; passing `'auto'`/nothing omits it.

### 3. Overlay — `frontend/apps/chrome-extension/entrypoints/content/overlay.ts`

`settings` (an `ExtensionSettings`) is already in scope in `runFill`. Pass the preference:

```ts
const request = buildAiFillRequest(
  pageGlobals(doc),
  fields,
  settings.dateFormat === 'auto' ? undefined : { dateFormat: settings.dateFormat },
)
```

### 4. Backend request DTO — `services/src/modules/ai/infrastructure/http/dto/ai-fill.dto.ts`

Mirror the schema with class-validator. Add a nested preferences DTO and wire it onto the
top-level `AiFillRequestDto` (the class with `page` + `fields`):

```ts
const DATE_FORMATS = ['auto', 'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] as const;

export class AiFillPreferencesDto {
  @ApiPropertyOptional({ enum: DATE_FORMATS })
  @IsOptional()
  @IsIn(DATE_FORMATS)
  dateFormat?: (typeof DATE_FORMATS)[number];
}

// on AiFillRequestDto:
@ApiPropertyOptional({ type: AiFillPreferencesDto })
@IsOptional()
@ValidateNested()
@Type(() => AiFillPreferencesDto)
preferences?: AiFillPreferencesDto;
```

(`@IsIn`, `@IsOptional`, `@ValidateNested` from `class-validator`; `@Type` from
`class-transformer` — both already imported in this file.) The global `ValidationPipe`
(`whitelist` + `forbidNonWhitelisted`) then rejects unknown/invalid preference values.

### 5. Backend input type — `services/src/modules/ai/application/ai.provider.ts`

Add `preferences?: { dateFormat?: string }` to the `AiFillRequestInput` interface (line ~16) so
the provider can read it.

### 6. Model prompt — `services/src/modules/ai/infrastructure/gemini.provider.ts`

The prompt is `FILL_INSTRUCTION` + `JSON.stringify(request)`, so adding `preferences` to the
request automatically puts it in the JSON. Add a sentence to the `FILL_INSTRUCTION` array (after
the existing min/max date line) encoding the precedence above:

```ts
'If the input has "preferences.dateFormat", format FREE-TEXT date fields in that format',
'(MM/DD/YYYY, DD/MM/YYYY, or YYYY-MM-DD). A native date input (inputType "date") MUST stay ISO',
'yyyy-mm-dd regardless, and a field\'s own min/max/placeholder format still takes precedence.',
```

### 7. Privacy guard — `services/src/modules/ai/domain/privacy-guard.ts`

`assertSafeAiFillRequest` scans `page` + `fields` for raw HTML/oversized blobs. `preferences` is a
short enum and needs no scanning — no change required, but confirm the guard doesn't reject the
new key (it ignores unknown top-level keys today).

## Verification

- **Frontend:** `cd frontend && pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test`
  (new/extended tests: `ai-fill.test.ts`, `fill-request.test.ts`).
- **Backend:** `cd services && npm run dev:up && npm run verify` (lint, typecheck, unit, build,
  **OpenAPI check** — run `npm run export-openapi` after the DTO change) and `npm run test:e2e`.
  Extend `ai.service.spec` / the ai e2e: a request with `preferences.dateFormat` is accepted; an
  invalid value (e.g. `'DD-MM'`) → 400.
- **Manual end-to-end:** set Date format → DD/MM/YYYY in the app (`/settings/setup`); on a test
  page with a **free-text** date input, the in-page Fill produces `dd/mm/yyyy`; a native
  `<input type="date">` still fills ISO `yyyy-mm-dd`. With Date format → Automatic, behavior is
  unchanged (no `preferences` on the wire).
- **Docs/memory:** update `services/docs/IMPLEMENTATION_PLAN.md` if you track this, and the
  `project-extension-settings-sync` memory note that currently flags dateFormat as a deferred
  follow-up (remove that caveat once shipped).

## Commit

Two commits, one per repo (branch off `main`; the repos see concurrent sessions — stage only your
own files with explicit quoted paths, then push). End commit messages with the standard
`Co-Authored-By` trailer.
