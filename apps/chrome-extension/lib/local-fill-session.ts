import {
  buildLocalFillPlan,
  localFillSkipReason,
  type LocalFillOptions,
} from '@quikfill/autofill-core'
import {
  applyFill,
  captureFillTargets,
  probeFields,
  scanForms,
  looksLikeDatepickerInput,
  type FillOptions,
  type FillOutcome,
  type FillTarget,
} from '@quikfill/form-scanner'
import type { DetectedField } from '@quikfill/schemas'

/** Re-read the selected form between dependent controls, retaining original DOM identity. */
export async function fillLocalSession(
  fields: DetectedField[],
  root: Element,
  preferences: LocalFillOptions,
  options: FillOptions & { targets: Map<string, FillTarget> },
): Promise<FillOutcome> {
  const outcome: FillOutcome = {
    results: [],
    undoSnapshot: { entries: [], capturedAt: new Date().toISOString() },
  }
  // Each dependent control is planned separately, but all must share one persona.
  const sessionPreferences = { ...preferences, seed: preferences.seed ?? crypto.randomUUID() }
  let changed = false
  const known = new Set([...options.targets.values()].map((target) => target.element))
  const identity = (field: DetectedField) =>
    `${field.frame}:${field.shadow}:${field.tagName}:${field.inputType}:${field.domId ?? field.name ?? field.labelText ?? field.ariaLabel ?? field.domFingerprint}`
  const originalIdentities = new Set(fields.map(identity))
  for (const original of fields) {
    if (options.signal?.aborted || options.isCurrent?.() === false) break
    const bound = options.targets?.get(original.id)
    if (!bound?.element.isConnected) {
      outcome.results.push({
        detectedFieldId: original.id,
        status: 'skipped',
        reason: 'The original control was replaced. Fill the current form again.',
      })
      continue
    }
    // A prior choice may asynchronously enable its dependent control. Never wait
    // on permanently disabled fields before any value has changed.
    if (changed && bound.element.matches(':disabled, [aria-disabled="true"]')) {
      const deadline = Date.now() + 2500
      while (
        Date.now() < deadline &&
        bound.element.matches(':disabled, [aria-disabled="true"]') &&
        !options.signal?.aborted &&
        options.isCurrent?.() !== false
      )
        await new Promise((resolve) => setTimeout(resolve, 40))
    }
    if (options.signal?.aborted || options.isCurrent?.() === false) break
    const scan = scanForms(root, { includeHidden: false, includeNonFillable: true })
    const live = captureFillTargets(scan.fields, root)
    const field = scan.fields.find((f) => live.get(f.id)?.element === bound.element)
    if (!field) {
      outcome.results.push({
        detectedFieldId: original.id,
        status: 'skipped',
        reason: 'The original control is no longer available.',
      })
      continue
    }
    let edited = false
    const onInput = (event: Event) => {
      if (event.isTrusted && bound.element.contains(event.target as Node)) edited = true
    }
    const doc = bound.element.ownerDocument
    doc.addEventListener('input', onInput, true)
    try {
      const calendarCandidate =
        looksLikeDatepickerInput(bound.element) &&
        !localFillSkipReason({ ...field, readonly: false }, preferences)
      if (!localFillSkipReason(field, preferences) || calendarCandidate)
        await probeFields([field], root, {
          ...options,
          isCurrent: () => !edited && options.isCurrent?.() !== false,
        })
    } finally {
      doc.removeEventListener('input', onInput, true)
    }
    if (edited) {
      outcome.results.push({
        detectedFieldId: original.id,
        status: 'skipped',
        reason: 'Your input during widget loading was preserved.',
      })
      continue
    }
    const batch = buildLocalFillPlan([field], sessionPreferences)
    outcome.results.push(...batch.skipped.map((r) => ({ ...r, detectedFieldId: original.id })))
    const filled = await applyFill(
      batch.instructions.map((i) => ({ ...i, detectedFieldId: original.id })),
      root,
      options,
    )
    outcome.results.push(...filled.results)
    outcome.undoSnapshot.entries.push(...filled.undoSnapshot.entries)
    changed ||= filled.undoSnapshot.entries.length > 0
    // Conditional controls rendered by this choice join the same scoped session.
    // A replacement of an existing identity is deliberately not rebound.
    if (filled.undoSnapshot.entries.length) {
      const deadline = Date.now() + 2500
      while (
        Date.now() < deadline &&
        root.matches('[aria-busy="true"]') &&
        !options.signal?.aborted &&
        options.isCurrent?.() !== false
      )
        await new Promise((resolve) => setTimeout(resolve, 40))
      const next = scanForms(root, { includeHidden: false, includeNonFillable: true })
      const nextTargets = captureFillTargets(next.fields, root)
      for (const added of next.fields) {
        const target = nextTargets.get(added.id)
        if (!target || known.has(target.element) || originalIdentities.has(identity(added)))
          continue
        known.add(target.element)
        originalIdentities.add(identity(added))
        fields.push(added)
        options.targets.set(added.id, target)
      }
    }
  }
  return outcome
}
