import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '@/lib/api'
import { useAuthStore } from './auth'
import { useEntityRecordsStore } from './entityRecords'
import { useEntityTypesStore } from './entityTypes'
import type { EntityRecord, EntityType } from '@quikfill/schemas'
vi.mock('@/lib/api', () => ({
  api: { entityRecords: { list: vi.fn(), create: vi.fn() }, entityTypes: { list: vi.fn() } },
}))
beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
})
describe('saved data dashboard account isolation', () => {
  it('clears both stores and ignores late list responses from the previous account', async () => {
    const auth = useAuthStore()
    auth.user = { id: 'a' }
    let recordsDone!: (data: EntityRecord[]) => void, typesDone!: (data: EntityType[]) => void
    vi.mocked(api.entityRecords.list).mockImplementation(
      () =>
        new Promise((r) => {
          recordsDone = r
        }),
    )
    vi.mocked(api.entityTypes.list).mockImplementation(
      () =>
        new Promise((r) => {
          typesDone = r
        }),
    )
    const records = useEntityRecordsStore(),
      types = useEntityTypesStore()
    records.items = [{ id: 'old', name: 'Private A', entityTypeId: 'type', values: {} }]
    types.items = [{ id: 'type', name: 'Private type A', fields: [] }]
    const pending = Promise.all([records.fetch(), types.fetch()])
    auth.user = { id: 'b' }
    expect(records.items).toEqual([])
    expect(types.items).toEqual([])
    recordsDone([{ id: 'late', name: 'Private A', entityTypeId: 'type', values: {} }])
    typesDone([{ id: 'type', name: 'Private type A', fields: [] }])
    await pending
    expect(records.items).toEqual([])
    expect(types.items).toEqual([])
  })
  it('does not merge a late create response into another account', async () => {
    const auth = useAuthStore()
    auth.user = { id: 'a' }
    let done!: (record: EntityRecord) => void
    vi.mocked(api.entityRecords.create).mockImplementation(
      () =>
        new Promise((r) => {
          done = r
        }),
    )
    const records = useEntityRecordsStore()
    const pending = records.create({ name: 'A', entityTypeId: 'type', values: {} })
    auth.user = { id: 'b' }
    done({ id: 'new', name: 'A', entityTypeId: 'type', values: {} })
    await pending
    expect(records.items).toEqual([])
  })
})
