import { vi } from 'vitest'

// Node 26 defines an unavailable host localStorage property. Vitest 3 can retain
// it instead of copying jsdom's storage, so bind the browser fixture explicitly.
const { jsdom } = globalThis as typeof globalThis & { jsdom: { window: Window } }
vi.stubGlobal('localStorage', jsdom.window.localStorage)
