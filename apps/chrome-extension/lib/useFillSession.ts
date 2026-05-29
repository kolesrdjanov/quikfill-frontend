import { computed, ref } from 'vue'
import {
  createChromeStorageAdapter,
  createProfileStore,
  getActiveTab,
  getActiveTabId,
  requestAiClassify,
  requestFill,
  requestScan,
  requestUndo,
} from '@quikfill/browser-adapter'
import {
  buildFillPlan,
  buildPreviewPlan,
  classifyFields,
  generatorRuleForSemanticType,
  matchMappings,
  matchProfiles,
  type FieldClassification,
  type MatchableProfile,
} from '@quikfill/autofill-core'
import { buildFieldSummaries, suggestionToProposal, type SuggestionProposal } from '@quikfill/ai'
import type {
  AiSuggestion,
  DetectedField,
  FieldMapping,
  FillInstruction,
  FillPlanItem,
  FillResult,
  FillSource,
  FillSourceType,
  GeneratorRule,
  ScanLimitation,
  ScanScope,
  ScopeDescriptor,
  UndoSnapshot,
} from '@quikfill/schemas'
import { SOURCE_CYCLE } from './display-maps'

export type SessionPhase = 'prescan' | 'scanning' | 'detected' | 'preview' | 'filling' | 'results'
type AiState = 'idle' | 'loading' | 'ready' | 'unavailable'
/** Status of an on-demand, single-field AI classification triggered from the source pill. */
export type AiFieldStatus = 'loading' | 'unavailable'

/**
 * The side-panel fill session: scan → match → classify → (AI) → preview → fill →
 * verify → undo → save. A 1:1 behavioural port of the original `sidepanel/App.vue`
 * over the shared packages, plus a per-field source-pill cycle and a hide-values
 * toggle. All planning/classification/generation/messaging stays in the packages.
 */
export function useFillSession() {
  const store = createProfileStore(createChromeStorageAdapter())

  // Preferences mirrored in from settings (see the panel's onMounted).
  const autoMatch = ref(true)
  const locale = ref<string>('en-US')

  const hostname = ref('')
  const scanning = ref(false)
  const scanned = ref(false)
  const error = ref<string | null>(null)
  const fields = ref<DetectedField[]>([])
  const limitations = ref<ScanLimitation[]>([])
  const structureHash = ref('')
  // Which container the user wants scanned, and what the last scan resolved to.
  const scope = ref<ScanScope>('auto')
  const scannedScope = ref<ScopeDescriptor | null>(null)

  const planItems = ref<FillPlanItem[] | null>(null)
  const excluded = ref<Set<string>>(new Set())
  const seed = ref('seed-1')

  const filling = ref(false)
  const undoing = ref(false)
  const results = ref<FillResult[] | null>(null)
  const undoSnapshot = ref<UndoSnapshot | null>(null)

  const matchedProfileId = ref<string | null>(null)
  const matchedProfileName = ref<string | null>(null)
  const savedMappings = ref<Map<string, FieldMapping>>(new Map())
  const mappingByFieldId = ref<Map<string, FieldMapping>>(new Map())
  const saveMessage = ref<string | null>(null)
  const profileSaved = ref(false)

  const aiState = ref<AiState>('idle')
  const aiSuggestions = ref<Map<string, AiSuggestion>>(new Map())
  const aiProposals = ref<Map<string, SuggestionProposal>>(new Map())
  // Per-field status while a single field is being classified via the source pill.
  const aiFieldStatus = ref<Map<string, AiFieldStatus>>(new Map())

  const hideValues = ref(false)

  const classificationById = computed(() => {
    const map = new Map<string, FieldClassification>()
    for (const c of classifyFields(fields.value)) map.set(c.fieldId, c)
    return map
  })
  const ambiguousFields = computed(() =>
    fields.value.filter((f) => {
      const c = classificationById.value.get(f.id)
      return !c || c.semanticType === 'unknown' || c.confidence < 0.6
    }),
  )
  const hasAmbiguous = computed(() => ambiguousFields.value.length > 0)

  const includedCount = computed(
    () => planItems.value?.filter((i) => !excluded.value.has(i.detectedFieldId)).length ?? 0,
  )
  const confirmationCount = computed(
    () =>
      planItems.value?.filter(
        (i) => i.requiresConfirmation && !excluded.value.has(i.detectedFieldId),
      ).length ?? 0,
  )
  const resultById = computed(() => {
    const map = new Map<string, FillResult>()
    for (const r of results.value ?? []) map.set(r.detectedFieldId, r)
    return map
  })
  const resultSummary = computed(() => {
    const rs = results.value ?? []
    return {
      filled: rs.filter((r) => r.status === 'success').length,
      failed: rs.filter((r) => r.status === 'failed').length,
      skipped: rs.filter((r) => r.status === 'skipped').length,
    }
  })

  const phase = computed<SessionPhase>(() => {
    if (scanning.value) return 'scanning'
    if (filling.value) return 'filling'
    if (results.value) return 'results'
    if (planItems.value) return 'preview'
    if (scanned.value && !error.value) return 'detected'
    return 'prescan'
  })

  async function withActiveTab<T>(fn: (tabId: number) => Promise<T>): Promise<T> {
    const tabId = await getActiveTabId()
    if (tabId == null) throw new Error('No active tab.')
    return fn(tabId)
  }

  function resetMatch() {
    matchedProfileId.value = null
    matchedProfileName.value = null
    savedMappings.value = new Map()
    mappingByFieldId.value = new Map()
  }

  function resetAi() {
    aiState.value = 'idle'
    aiSuggestions.value = new Map()
    aiProposals.value = new Map()
    aiFieldStatus.value = new Map()
  }

  /** Set or clear a single field's on-demand AI status (immutable map swap for reactivity). */
  function setAiFieldStatus(fieldId: string, status: AiFieldStatus | null) {
    const next = new Map(aiFieldStatus.value)
    if (status) next.set(fieldId, status)
    else next.delete(fieldId)
    aiFieldStatus.value = next
  }

  async function initSite() {
    try {
      const tab = await getActiveTab()
      hostname.value = safeHostname(tab.url ?? '')
    } catch {
      hostname.value = ''
    }
  }

  async function matchSavedProfile() {
    resetMatch()
    const tab = await getActiveTab()
    if (!tab.url) return
    const host = safeHostname(tab.url)
    hostname.value = host
    const [profiles, domains] = await Promise.all([store.listFormProfiles(), store.listDomains()])
    const hostnamesByDomain = new Map(domains.map((d) => [d.id, d.hostnames]))
    const candidates: MatchableProfile[] = profiles.map((p) => ({
      profile: p,
      hostnames: hostnamesByDomain.get(p.domainId) ?? [],
    }))
    const ranked = matchProfiles(candidates, {
      hostname: host,
      url: tab.url,
      pageTitle: tab.title,
      fieldFingerprintHash: structureHash.value,
      structureHash: structureHash.value,
      fieldCount: fields.value.length,
    })
    const best = ranked[0]
    if (!best) return

    const profile = profiles.find((p) => p.id === best.formProfileId)
    matchedProfileId.value = best.formProfileId
    matchedProfileName.value = profile?.name ?? 'Saved profile'

    const mappings = await store.listMappings(best.formProfileId)
    const matched = matchMappings(fields.value, mappings)
    const byFingerprint = new Map<string, FieldMapping>()
    const byField = new Map<string, FieldMapping>()
    for (const [fieldId, match] of matched) {
      byField.set(fieldId, match.mapping)
      byFingerprint.set(match.mapping.fieldFingerprint, match.mapping)
    }
    savedMappings.value = byFingerprint
    mappingByFieldId.value = byField
  }

  async function scan() {
    scanning.value = true
    error.value = null
    planItems.value = null
    results.value = null
    undoSnapshot.value = null
    saveMessage.value = null
    profileSaved.value = false
    resetAi()
    try {
      const result = await withActiveTab((tabId) =>
        requestScan(tabId, { includeHidden: false, scope: scope.value }),
      )
      fields.value = result.fields
      limitations.value = result.limitations
      structureHash.value = result.structureHash ?? ''
      scannedScope.value = result.scope ?? null
      scanned.value = true
      if (autoMatch.value) await matchSavedProfile()
    } catch {
      error.value =
        'Could not scan this page. Open the panel from the toolbar icon, then reload the page so the content script is active.'
      fields.value = []
      limitations.value = []
      scannedScope.value = null
      resetMatch()
    } finally {
      scanning.value = false
    }
  }

  /** Switch the scan scope (Whole page / This form / This dialog) and re-scan. */
  async function rescanWithScope(next: ScanScope) {
    scope.value = next
    await scan()
  }

  /** Resolve a single accepted AI proposal into a concrete plan item (value via its generator). */
  function buildItemFromProposal(field: DetectedField, proposal: SuggestionProposal): FillPlanItem {
    const rules = proposal.generatorRule ? { [proposal.semanticType]: proposal.generatorRule } : {}
    const [rebuilt] = buildFillPlan(
      [
        {
          field,
          fillSource: proposal.fillSource,
          fillStrategy: proposal.fillStrategy,
          confidence: proposal.confidence,
        },
      ],
      { seed: seed.value, locale: locale.value, rules },
    ).items
    return rebuilt
  }

  /** Override matched plan items with any accepted AI proposals (review-first). */
  function applyAiOverrides(items: FillPlanItem[]): FillPlanItem[] {
    if (!aiProposals.value.size) return items
    const byId = new Map(fields.value.map((f) => [f.id, f]))
    return items.map((item) => {
      const proposal = aiProposals.value.get(item.detectedFieldId)
      const field = byId.get(item.detectedFieldId)
      if (!proposal || !field) return item
      return buildItemFromProposal(field, proposal)
    })
  }

  function rebuildPlan() {
    planItems.value = applyAiOverrides(
      buildPreviewPlan(fields.value, {
        seed: seed.value,
        locale: locale.value,
        savedMappings: savedMappings.value,
      }).items,
    )
  }

  function preview() {
    excluded.value = new Set()
    results.value = null
    undoSnapshot.value = null
    saveMessage.value = null
    rebuildPlan()
  }

  function regenerate() {
    seed.value = `seed-${Math.floor(Math.random() * 1e9)}`
    results.value = null
    undoSnapshot.value = null
    rebuildPlan()
  }

  /** Build a FillSource (and any generator rule it needs) for a target source type. */
  function buildSourceOfType(
    field: DetectedField,
    type: FillSourceType,
  ): { source: FillSource; rules: Record<string, GeneratorRule>; confidence: number } {
    const c = classificationById.value.get(field.id)
    const key = c && c.semanticType !== 'unknown' ? c.semanticType : field.name || field.id
    switch (type) {
      case 'generatorRule': {
        const base =
          generatorRuleForSemanticType(key) ??
          (c?.suggestedKind
            ? { fieldKey: key, kind: c.suggestedKind, options: c.generatorOptions }
            : { fieldKey: key, kind: 'notes' as const })
        return {
          source: { sourceType: 'generatorRule', ruleKey: key },
          rules: { [key]: { ...base, fieldKey: key } },
          confidence: c?.confidence ?? 0.5,
        }
      }
      case 'recordField':
        return {
          source: { sourceType: 'recordField', entityTypeId: 'identity', fieldKey: key },
          rules: {},
          confidence: c?.confidence ?? 0.5,
        }
      case 'aiGenerated':
        return {
          source: { sourceType: 'aiGenerated', hint: field.labelText || key },
          rules: {},
          confidence: 0.4,
        }
      case 'runtimeValue':
        return {
          source: { sourceType: 'runtimeValue', promptLabel: field.labelText || key },
          rules: {},
          confidence: 0.5,
        }
      default:
        return { source: { sourceType: 'staticValue', value: '' }, rules: {}, confidence: 0.3 }
    }
  }

  /** Cycle a field's fill source through the supported types and re-resolve it. */
  function cycleSource(fieldId: string) {
    if (!planItems.value) return
    const idx = planItems.value.findIndex((i) => i.detectedFieldId === fieldId)
    const field = fields.value.find((f) => f.id === fieldId)
    if (idx < 0 || !field) return
    // A field carrying an AI proposal resolves to its generator (badge reads
    // "Generator"), but for cycling purposes it sits at the 'aiGenerated' stop —
    // otherwise the cycle would bounce between AI and generator forever.
    const current = aiProposals.value.has(fieldId)
      ? 'aiGenerated'
      : planItems.value[idx].fillSource.sourceType
    const pos = SOURCE_CYCLE.indexOf(current)
    const next = SOURCE_CYCLE[(pos + 1) % SOURCE_CYCLE.length]
    const { source, rules, confidence } = buildSourceOfType(field, next)
    const [rebuilt] = buildFillPlan([{ field, fillSource: source, confidence }], {
      seed: seed.value,
      locale: locale.value,
      rules,
    }).items
    // Manual override clears any accepted AI mapping for this field.
    if (aiProposals.value.has(fieldId)) {
      const p = new Map(aiProposals.value)
      p.delete(fieldId)
      aiProposals.value = p
    }
    const nextItems = planItems.value.slice()
    nextItems[idx] = rebuilt
    planItems.value = nextItems
    // Landing on AI kicks off an on-demand classification for just this field.
    if (next === 'aiGenerated') void classifyField(fieldId)
    else setAiFieldStatus(fieldId, null)
  }

  /**
   * Classify a single field on demand (the per-field "AI" source). Reuses the
   * privacy-safe classify flow: redacted summary → background → /ai/classify-fields.
   * A mapped suggestion resolves to a generator-backed value; anything else leaves
   * the field on its AI placeholder with an honest warning.
   */
  async function classifyField(fieldId: string) {
    const field = fields.value.find((f) => f.id === fieldId)
    if (!field) return
    setAiFieldStatus(fieldId, 'loading')
    const response = await requestAiClassify(buildFieldSummaries([field]))
    // The field may have been re-cycled away from AI while the request was in flight.
    if (aiFieldStatus.value.get(fieldId) !== 'loading') return
    const suggestion = response.ok
      ? response.suggestions.find((s) => s.fieldId === fieldId)
      : undefined
    if (!suggestion) {
      setAiFieldStatus(fieldId, 'unavailable')
      return
    }
    const proposal = suggestionToProposal(suggestion, field)
    const proposals = new Map(aiProposals.value)
    proposals.set(fieldId, proposal)
    aiProposals.value = proposals
    setAiFieldStatus(fieldId, null)
    if (!planItems.value) return
    const idx = planItems.value.findIndex((i) => i.detectedFieldId === fieldId)
    if (idx < 0) return
    const nextItems = planItems.value.slice()
    nextItems[idx] = buildItemFromProposal(field, proposal)
    planItems.value = nextItems
  }

  async function askAi() {
    if (!ambiguousFields.value.length) return
    aiState.value = 'loading'
    const response = await requestAiClassify(buildFieldSummaries(ambiguousFields.value))
    if (!response.ok) {
      aiState.value = 'unavailable'
      return
    }
    const next = new Map(aiSuggestions.value)
    for (const s of response.suggestions) next.set(s.fieldId, s)
    aiSuggestions.value = next
    aiState.value = 'ready'
  }

  function acceptSuggestion(fieldId: string) {
    const suggestion = aiSuggestions.value.get(fieldId)
    const field = fields.value.find((f) => f.id === fieldId)
    if (!suggestion || !field) return
    const proposals = new Map(aiProposals.value)
    proposals.set(fieldId, suggestionToProposal(suggestion, field))
    aiProposals.value = proposals
    const suggestions = new Map(aiSuggestions.value)
    suggestions.delete(fieldId)
    aiSuggestions.value = suggestions
    if (planItems.value) rebuildPlan()
  }

  function rejectSuggestion(fieldId: string) {
    const suggestions = new Map(aiSuggestions.value)
    suggestions.delete(fieldId)
    aiSuggestions.value = suggestions
  }

  function toggle(id: string) {
    const next = new Set(excluded.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    excluded.value = next
  }

  function includedItems(): FillPlanItem[] {
    return (planItems.value ?? []).filter((i) => !excluded.value.has(i.detectedFieldId))
  }

  function buildInstructions(): FillInstruction[] {
    const byId = new Map(fields.value.map((f) => [f.id, f]))
    return includedItems().map((i) => {
      const f = byId.get(i.detectedFieldId)
      return {
        detectedFieldId: i.detectedFieldId,
        selectorCandidates: f?.selectorCandidates ?? [],
        frame: f?.frame ?? 'main',
        shadow: f?.shadow ?? false,
        tagName: f?.tagName ?? 'input',
        inputType: f?.inputType ?? 'text',
        fillStrategy: i.fillStrategy,
        proposedValue: i.proposedValue,
        customWidget: f?.customWidget,
      }
    })
  }

  async function fill() {
    filling.value = true
    error.value = null
    try {
      const response = await withActiveTab((tabId) => requestFill(tabId, buildInstructions()))
      results.value = response.results
      undoSnapshot.value = response.undoSnapshot
      await bumpSuccessfulMappings(response.results)
    } catch {
      error.value = 'Fill failed. Reload the page and try again.'
    } finally {
      filling.value = false
    }
  }

  async function bumpSuccessfulMappings(fillResults: FillResult[]) {
    const profileId = matchedProfileId.value
    if (!profileId) return
    const now = new Date().toISOString()
    await Promise.all(
      fillResults
        .filter((r) => r.status === 'success')
        .map((r) => {
          const mapping = mappingByFieldId.value.get(r.detectedFieldId)
          if (!mapping) return Promise.resolve()
          return store.touchMapping(profileId, mapping.id, {
            lastSuccessfulFillAt: now,
            confidence: Math.min(1, (mapping.confidence ?? 0) + 0.05),
          })
        }),
    )
  }

  async function undo() {
    if (!undoSnapshot.value) return
    undoing.value = true
    error.value = null
    try {
      await withActiveTab((tabId) => requestUndo(tabId, undoSnapshot.value!))
      results.value = null
      undoSnapshot.value = null
    } catch {
      error.value = 'Undo failed.'
    } finally {
      undoing.value = false
    }
  }

  async function saveProfile() {
    saveMessage.value = null
    try {
      const tab = await getActiveTab()
      if (!tab.url) throw new Error('No tab URL.')
      const hostname = safeHostname(tab.url)
      const name = tab.title || hostname

      let domainId: string
      let profileId: string
      if (matchedProfileId.value) {
        const existing = await store.getFormProfile(matchedProfileId.value)
        profileId = existing?.id ?? crypto.randomUUID()
        domainId = existing?.domainId ?? crypto.randomUUID()
      } else {
        domainId = crypto.randomUUID()
        profileId = crypto.randomUUID()
        await store.saveDomain({ id: domainId, name: hostname, hostnames: [hostname] })
      }

      await store.saveFormProfile({
        id: profileId,
        domainId,
        name,
        urlPatterns: [`${safeOrigin(tab.url)}/*`],
        pageTitlePatterns: tab.title ? [tab.title] : [],
        fieldFingerprintHash: structureHash.value,
        structureMetadata: {
          fieldCount: fields.value.length,
          structureHash: structureHash.value,
        },
      })

      const byId = new Map(fields.value.map((f) => [f.id, f]))
      for (const item of includedItems()) {
        const f = byId.get(item.detectedFieldId)
        if (!f) continue
        await store.saveMapping({
          id: crypto.randomUUID(),
          formProfileId: profileId,
          fieldFingerprint: f.domFingerprint,
          selectorCandidates: f.selectorCandidates,
          target: {
            selectorCandidates: f.selectorCandidates,
            fieldFingerprint: f.domFingerprint,
            frame: f.frame,
            shadow: f.shadow,
          },
          fillSource: item.fillSource,
          fillStrategy: item.fillStrategy,
          confidence: item.confidence,
        })
      }

      matchedProfileId.value = profileId
      matchedProfileName.value = name
      saveMessage.value = `Saved profile "${name}".`
      profileSaved.value = true
    } catch {
      error.value = 'Could not save the profile.'
    }
  }

  return {
    // preferences (mirrored from settings)
    autoMatch,
    locale,
    // state
    hostname,
    scanning,
    scanned,
    error,
    fields,
    limitations,
    structureHash,
    scope,
    scannedScope,
    planItems,
    excluded,
    filling,
    undoing,
    results,
    undoSnapshot,
    matchedProfileId,
    matchedProfileName,
    savedMappings,
    saveMessage,
    profileSaved,
    aiState,
    aiSuggestions,
    aiProposals,
    aiFieldStatus,
    hideValues,
    // derived
    phase,
    classificationById,
    ambiguousFields,
    hasAmbiguous,
    includedCount,
    confirmationCount,
    resultById,
    resultSummary,
    // actions
    initSite,
    scan,
    rescanWithScope,
    preview,
    regenerate,
    cycleSource,
    classifyField,
    askAi,
    acceptSuggestion,
    rejectSuggestion,
    toggle,
    fill,
    undo,
    saveProfile,
  }
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}
function safeOrigin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}
