import { readonly, ref } from 'vue'
import {
  DEFAULT_EXTENSION_SETTINGS,
  extensionSettingsSchema,
  type ExtensionSettings,
} from '@quikfill/schemas'
import { createChromeStorageAdapter } from '@quikfill/browser-adapter'

const SETTINGS_KEY = 'settings:extension'

// Module-level singleton: one source of truth shared across surfaces.
const settings = ref<ExtensionSettings>({ ...DEFAULT_EXTENSION_SETTINGS })
const loaded = ref(false)
let adapter: ReturnType<typeof createChromeStorageAdapter> | null = null

function store() {
  return (adapter ??= createChromeStorageAdapter())
}

/**
 * Reactive, persisted extension preferences. Hydrates once from the local
 * `StorageAdapter`, parsing untrusted storage through the schema and falling
 * back to {@link DEFAULT_EXTENSION_SETTINGS} on anything malformed.
 */
export function useSettings() {
  async function load(): Promise<ExtensionSettings> {
    const raw = await store().get<unknown>(SETTINGS_KEY)
    const parsed = extensionSettingsSchema.safeParse(raw)
    settings.value = parsed.success
      ? parsed.data
      : { ...DEFAULT_EXTENSION_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) }
    // Re-validate the merged result so partial/old payloads still settle to a valid shape.
    settings.value = extensionSettingsSchema.catch(DEFAULT_EXTENSION_SETTINGS).parse(settings.value)
    loaded.value = true
    return settings.value
  }

  async function update(patch: Partial<ExtensionSettings>): Promise<void> {
    settings.value = { ...settings.value, ...patch }
    await store().set(SETTINGS_KEY, settings.value)
  }

  return { settings: readonly(settings), loaded: readonly(loaded), load, update }
}
