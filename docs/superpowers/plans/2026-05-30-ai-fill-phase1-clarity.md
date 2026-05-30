# AI Fill Experience — Phase 1: Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI fill UI legible — the confidence meter reads as confidence (not progress), the AI inset sets correct expectations, and the "no value" state explains why and offers a way out.

**Architecture:** Presentational changes only, in the side-panel Vue components and the display-map copy. No engine/package logic changes. The "no value" state gains a button that opens the existing Settings view (where Sample data lives) and a hint to use the per-field source pill.

**Tech Stack:** Vue 3 `<script setup>`, Tailwind v4 semantic classes, `@quikfill/ui`, lucide-vue-next.

Spec: [docs/superpowers/specs/2026-05-30-ai-fill-experience-design.md](../specs/2026-05-30-ai-fill-experience-design.md) (Part 1).

---

## File Structure

- `apps/chrome-extension/components/sidepanel/ConfidenceMeter.vue` — add a leading "AI confidence" caption.
- `apps/chrome-extension/components/sidepanel/AiSuggestionInset.vue` — reframe the inset copy.
- `apps/chrome-extension/lib/display-maps.ts` — clarify the `aiGenerated` source copy.
- `apps/chrome-extension/components/sidepanel/PlanCard.vue` — actionable "needs a value" block; new `open-settings` emit.
- `apps/chrome-extension/entrypoints/sidepanel/App.vue` — wire `@open-settings` to `view = 'settings'`.

> **Note on testing:** these are presentational changes; the side panel has no component-test harness. Verification is `pnpm typecheck && pnpm build` plus explicit manual checks in the side panel. Where the repo gate (`pnpm lint/format:check/typecheck/build`) is mentioned, run it from `frontend/`.

---

### Task 1: Label the confidence meter

**Files:**

- Modify: `apps/chrome-extension/components/sidepanel/ConfidenceMeter.vue`

- [ ] **Step 1: Add a `label` prop with an "AI confidence" default and render it before the bar**

Replace the whole file with:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { confidenceTone, pct } from '../../lib/display-maps'

const props = withDefaults(defineProps<{ confidence: number; label?: string }>(), {
  label: 'AI confidence',
})

const tone = computed(() => confidenceTone(props.confidence))
const barClass = computed(
  () =>
    ({ success: 'bg-success', warning: 'bg-warning', primary: 'bg-primary' })[
      tone.value as 'success' | 'warning' | 'primary'
    ] ?? 'bg-primary',
)
const width = computed(() => `${Math.round(props.confidence * 100)}%`)
</script>

<template>
  <div class="flex flex-1 items-center gap-2">
    <span class="text-muted-foreground shrink-0 text-[11px]">{{ label }}</span>
    <div
      class="bg-muted h-1.5 flex-1 overflow-hidden rounded-full"
      role="meter"
      :aria-valuenow="Math.round(confidence * 100)"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="`${label} ${pct(confidence)}`"
    >
      <div class="h-full rounded-full transition-all" :class="barClass" :style="{ width }" />
    </div>
    <span class="text-muted-foreground text-[11px] tabular-nums">{{ pct(confidence) }}</span>
  </div>
</template>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @quikfill/chrome-extension typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add apps/chrome-extension/components/sidepanel/ConfidenceMeter.vue
git commit -m "feat(ext): label the AI confidence meter so it doesn't read as progress"
```

---

### Task 2: Reframe the AI suggestion inset copy

**Files:**

- Modify: `apps/chrome-extension/components/sidepanel/AiSuggestionInset.vue`

- [ ] **Step 1: Replace the heading line + add an explanatory sub-line**

In the `<template>`, replace the heading `<span>` block and add a clarifying line under the reasons list. Replace:

```vue
      <span class="flex items-center gap-1.5">
        <WandSparkles class="text-warning size-3.5" />
        AI thinks this is <span class="text-primary">{{ suggestion.semanticType }}</span>
      </span>
```

with:

```vue
      <span class="flex items-center gap-1.5">
        <WandSparkles class="text-warning size-3.5" />
        AI identified this as <span class="text-primary">{{ suggestion.semanticType }}</span>
      </span>
```

Then, immediately after the closing `</ul>` of the reasons list (before the buttons `<div class="flex gap-2 pt-1">`), add:

```vue
<p class="text-muted-foreground text-[11px] leading-snug">
      Accepting fills this from your saved data or a labeled sample — AI never invents a value.
    </p>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @quikfill/chrome-extension typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/chrome-extension/components/sidepanel/AiSuggestionInset.vue
git commit -m "feat(ext): reframe AI inset — identify, not 'fill a value'"
```

---

### Task 3: Clarify the `aiGenerated` source copy

**Files:**

- Modify: `apps/chrome-extension/lib/display-maps.ts:35`

- [ ] **Step 1: Keep the label, sharpen the short/pill wording**

Replace line 35:

```ts
  aiGenerated: { label: 'Needs a value', short: 'Add value', badge: 'warning', icon: WandSparkles },
```

with:

```ts
  aiGenerated: { label: 'Needs a value', short: 'No value yet', badge: 'warning', icon: WandSparkles },
```

(`label` stays "Needs a value"; the source-pill `short` no longer says "Add value", which implied the AI would add one.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @quikfill/chrome-extension typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/chrome-extension/lib/display-maps.ts
git commit -m "feat(ext): clarify the no-value source pill wording"
```

---

### Task 4: Make the "needs a value" state actionable

**Files:**

- Modify: `apps/chrome-extension/components/sidepanel/PlanCard.vue`
- Modify: `apps/chrome-extension/entrypoints/sidepanel/App.vue:321-335`

- [ ] **Step 1: Add an `open-settings` emit and an action block to PlanCard**

In `PlanCard.vue`, extend the emits (line 19):

```ts
defineEmits<{
  toggle: []
  cycle: []
  accept: []
  reject: []
  retry: []
  remove: []
  openSettings: []
}>()
```

Add a computed under `proposed` (after line 29) to detect the no-value state:

```ts
const needsValue = computed(() => props.item.fillSource.sourceType === 'aiGenerated')
```

Inside the `<template>`, in the `<template v-else>` block, immediately after the `requiresConfirmation` `<p>` (after line 97, before `</template>` at line 98), add:

```vue
<div v-if="needsValue && !excluded" class="mt-2 flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground text-[11px]">
          Switch the source above to <strong>Saved</strong> or <strong>Sample</strong>, or
        </span>
        <Button variant="outline" size="sm" class="h-6 px-2 text-[11px]" @click="$emit('openSettings')">
          Turn on sample data
        </Button>
      </div>
```

- [ ] **Step 2: Wire `@open-settings` in App.vue**

In `App.vue`, on the `<PlanCard ... />` element (lines 321-335), add the handler alongside the other listeners:

```vue
@open-settings="view = 'settings'"
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @quikfill/chrome-extension typecheck && pnpm --filter @quikfill/chrome-extension build`
Expected: PASS; `✔ Built extension`.

- [ ] **Step 4: Manual verification (side panel)**

Load the unpacked extension (`apps/chrome-extension/.output/chrome-mv3`), open the side panel on a form with an unrecognized field (e.g. an EIN field), Scan → Preview. Confirm:

- the meter shows "AI confidence NN%" (not a bare bar),
- a "Needs a value" field shows the hint + a "Turn on sample data" button,
- clicking it switches the panel to Settings.

- [ ] **Step 5: Commit**

```bash
git add apps/chrome-extension/components/sidepanel/PlanCard.vue apps/chrome-extension/entrypoints/sidepanel/App.vue
git commit -m "feat(ext): make the no-value plan state actionable (settings + source hint)"
```

---

### Task 5: Gate + push

- [ ] **Step 1: Full gate**

Run (from `frontend/`): `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build`
Expected: all green.

- [ ] **Step 2: Push** (per repo convention: stage only Phase-1 files; land on `origin/main`)

```bash
git push origin HEAD:main
```

## Self-Review

- **Spec coverage (Part 1):** confidence-meter label → Task 1; AI inset reframe → Task 2; no-value copy → Task 3; one-tap actions → Task 4. ✓
- **Placeholders:** none — every step shows the exact code/command.
- **Consistency:** the new `openSettings` emit (PlanCard) matches the `@open-settings` listener (App.vue); `needsValue` keys off `fillSource.sourceType === 'aiGenerated'`, the same value `SOURCE_META` is keyed on.
