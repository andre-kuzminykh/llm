import { smallPlan } from '../test/fixtures'
import { memoryStorage, openStorage } from './storage'

describe('T-CP-011 FR-CP-011 хранение', () => {
  it('без IndexedDB — память, и это видно', async () => {
    const s = await openStorage(undefined)
    expect(s.persistent).toBe(false)
  })
  it('падающий IndexedDB — память', async () => {
    const broken = { open: () => { throw new Error('blocked') } } as unknown as IDBFactory
    const s = await openStorage(broken)
    expect(s.persistent).toBe(false)
  })
  it('память: сохранить, прочитать, очистить', async () => {
    const s = memoryStorage()
    const p = smallPlan()
    await s.save(p)
    expect(await s.load()).toBe(p)
    await s.clear()
    expect(await s.load()).toBeNull()
  })
})
