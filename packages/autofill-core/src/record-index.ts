import type { DetectedField, EntityFieldDef, EntityRecord, EntityType } from '@quikfill/schemas'
import { classifyField } from './classify'

/**
 * Where a saved value for a semantic type lives: which entity record, and which
 * field within it. Resolved later through a `recordField` FillSource.
 */
export interface RecordMatch {
  entityTypeId: string
  recordId: string
  fieldKey: string
}

/** semanticType → the first saved record/field that actually holds a value. */
export type RecordIndex = Map<string, RecordMatch>

// Entity field types that map 1:1 to a form semanticType. The remaining types
// (`text`, `address`) have no inherent meaning, so we fall back to classifying
// the field's key/label the same way a scanned form field is classified.
const SEMANTIC_BY_ENTITY_TYPE: Partial<Record<EntityFieldDef['type'], string>> = {
  email: 'email',
  phone: 'phone',
  date: 'date',
  currency: 'currency',
  boolean: 'boolean',
  enum: 'enum',
  notes: 'notes',
  number: 'number',
}

/** Reuse the form-field classifier on a saved field's key/label (no DOM). */
function classifyEntityFieldByName(field: EntityFieldDef): string {
  const synthetic: DetectedField = {
    id: field.key,
    tagName: 'input',
    inputType: 'text',
    name: field.key,
    labelText: field.label,
    required: false,
    disabled: false,
    readonly: false,
    visible: true,
    classNames: [],
    selectorCandidates: [],
    domFingerprint: field.key,
    frame: 'main',
    shadow: false,
  }
  return classifyField(synthetic).semanticType
}

/** The semantic type a saved entity field satisfies (heuristic; no stored tag). */
export function semanticTypeForEntityField(field: EntityFieldDef): string {
  return SEMANTIC_BY_ENTITY_TYPE[field.type] ?? classifyEntityFieldByName(field)
}

/**
 * Index saved entity data by the form semanticType each field satisfies. Only
 * fields that have a non-empty value in some record are indexed (so a hit always
 * means there is something to fill). First match wins: the first entity field
 * for a semanticType, and the first record of its type that holds a value.
 */
export function buildRecordIndex(types: EntityType[], records: EntityRecord[]): RecordIndex {
  const index: RecordIndex = new Map()
  const recordsByType = new Map<string, EntityRecord[]>()
  for (const record of records) {
    const list = recordsByType.get(record.entityTypeId) ?? []
    list.push(record)
    recordsByType.set(record.entityTypeId, list)
  }
  for (const type of types) {
    for (const field of type.fields) {
      const semanticType = semanticTypeForEntityField(field)
      if (semanticType === 'unknown' || index.has(semanticType)) continue
      for (const record of recordsByType.get(type.id) ?? []) {
        const value = record.values[field.key]
        if (value != null && String(value).trim() !== '') {
          index.set(semanticType, {
            entityTypeId: type.id,
            recordId: record.id,
            fieldKey: field.key,
          })
          break
        }
      }
    }
  }
  return index
}

/** Look up the saved-record match for a semantic type, if any. */
export function recordMatchForSemanticType(
  index: RecordIndex,
  semanticType: string,
): RecordMatch | null {
  return index.get(semanticType) ?? null
}

/** Shape saved records into a ResolveContext `records` map (recordId → values). */
export function recordValuesById(records: EntityRecord[]): Record<string, Record<string, unknown>> {
  return Object.fromEntries(records.map((record) => [record.id, record.values]))
}
