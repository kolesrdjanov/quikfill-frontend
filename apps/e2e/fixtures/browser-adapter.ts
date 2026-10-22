import {
  DEFAULT_EXTENSION_SETTINGS,
  DEFAULT_LOCAL_FILL_PREFERENCES,
  localFillPreferencesSchema,
  extensionSettingsSchema,
  type ExtensionSettings,
  type LocalFillPreferences,
  type AiFillRequest,
  type AiFillResponse,
} from '../../../packages/schemas/src'

export type Reply =
  | { ok: true; response: AiFillResponse }
  | { ok: false; reason: 'offline' | 'error' | 'quota' }
export const transport = {
  requests: [] as AiFillRequest[],
  authReads: 0,
  entitlementReads: 0,
  preferences: { ...DEFAULT_LOCAL_FILL_PREFERENCES },
  reply: { ok: true, response: { values: [] } } as Reply,
  pending: false,
  values: null as Record<string, string> | null,
  resolve: null as ((reply: Reply) => void) | null,
}
export const requestEntitlements = async () => {
  transport.entitlementReads++
  return null
}
export const refreshEntitlements = async () => null
const settingsListeners = new Set<(s: ExtensionSettings) => void>()
const preferenceListeners = new Set<(s: LocalFillPreferences) => void>()
export const readExtensionSettings = async () =>
  extensionSettingsSchema.parse({
    ...DEFAULT_EXTENSION_SETTINGS,
    ...JSON.parse(localStorage.getItem('qf-fixture-settings') ?? '{}'),
  })
export const readLocalFillPreferences = async () =>
  localFillPreferencesSchema.parse({
    ...transport.preferences,
    ...JSON.parse(localStorage.getItem('qf-fixture-local') ?? '{}'),
  })
export const writeLocalFillPreferences = async (prefs: LocalFillPreferences) => {
  localStorage.setItem('qf-fixture-local', JSON.stringify(prefs))
  for (const listener of preferenceListeners) listener(prefs)
}
export const onLocalFillPreferencesChange = (listener: (s: LocalFillPreferences) => void) => {
  preferenceListeners.add(listener)
  return () => preferenceListeners.delete(listener)
}
export const onExtensionSettingsChange = (listener: (s: ExtensionSettings) => void) => {
  settingsListeners.add(listener)
  return () => settingsListeners.delete(listener)
}
export const requestSettingsUpdate = async (settings: ExtensionSettings) => {
  localStorage.setItem('qf-fixture-settings', JSON.stringify(settings))
  for (const listener of settingsListeners) listener(settings)
  return settings
}
export const AUTH_STATE_KEY = 'auth-state'
export const ENTITLEMENTS_STATE_KEY = 'entitlements'
export const requestAuthState = async () => {
  transport.authReads++
  return { status: 'signed-out' as const }
}
export const requestAuthCode = async () => ({ ok: false as const, error: 'network' as const })
export const verifyAuthCode = requestAuthCode
export const logoutAuth = async () => ({ ok: true as const })
export const requestSettingsSync = async () => null
export const getActiveTab = async () => ({
  id: 1,
  url: 'https://example.com/form',
  title: 'Fixture',
})
export const onEntitlementsChange = () => () => {}
export async function requestAiFill(request: AiFillRequest): Promise<Reply> {
  transport.requests.push(request)
  if (transport.pending)
    return new Promise((resolve) => {
      transport.resolve = resolve
    })
  if (transport.reply.ok && transport.values)
    return {
      ok: true,
      response: {
        values: request.fields
          .filter((field) => field.name && field.name in transport.values!)
          .map((field) => ({ fieldId: field.fieldId, value: transport.values![field.name!] })),
      },
    }
  return transport.reply
}

import { createRecipeStore } from '../../../packages/browser-adapter/src/recipe-store'
import { recipeContextsSchema, type StorageAdapter } from '../../../packages/schemas/src'
const recipeStorage: StorageAdapter = {
  get: async <T>(key: string) => JSON.parse(localStorage.getItem(key) ?? 'null') as T | null,
  set: async (key, value) => {
    localStorage.setItem(key, JSON.stringify(value))
  },
  delete: async (key) => {
    localStorage.removeItem(key)
  },
  list: async (prefix) => Object.keys(localStorage).filter((key) => key.startsWith(prefix)),
}
export const createChromeRecipeStore = () => createRecipeStore(recipeStorage)
export const requestRecipeContexts = async () =>
  recipeContextsSchema.parse(JSON.parse(localStorage.getItem('qf-fixture-contexts') ?? '[]'))

import {
  savedLibrarySchema,
  savedRecordSnapshotSchema,
  type SavedRecordSnapshot,
} from '../../../packages/schemas/src'
const accountListeners = new Set<() => void>()
export const onAccountChange = (listener: () => void) => {
  accountListeners.add(listener)
  return () => accountListeners.delete(listener)
}
export const changeFixtureAccount = () => {
  for (const listener of accountListeners) listener()
}
export const requestSavedLibrary = async () =>
  savedLibrarySchema.parse(JSON.parse(localStorage.getItem('qf-fixture-library') ?? 'null'))
export const requestSavedRecord = async (selection: {
  ownerId: string
  recordId: string
}): Promise<SavedRecordSnapshot> => {
  const library = await requestSavedLibrary()
  if (library.ownerId !== selection.ownerId) throw new Error('Account changed.')
  const record = library.records.find((r) => r.id === selection.recordId)
  const type = library.types.find((t) => t.id === record?.entityTypeId)
  return savedRecordSnapshotSchema.parse({ ownerId: library.ownerId, record, type })
}
