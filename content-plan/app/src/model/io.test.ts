import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadSeed, smallPlan } from '../test/fixtures'
import { calendarCSV, exportJSON, migrateV1, parsePlan, type PlanV1 } from './io'

describe('T-CP-013 FR-CP-013 выгрузка и загрузка', () => {
  it('CSV-календарь совпадает с out/4_calendar.csv генератора', () => {
    const expected = readFileSync(resolve(process.cwd(), '../out/4_calendar.csv'), 'utf-8')
    expect(calendarCSV(loadSeed())).toBe(expected)
  })
  it('JSON туда и обратно', () => {
    const p = smallPlan()
    expect(parsePlan(exportJSON(p))).toEqual(p)
  })
  it('план первой версии переводится на рубрики и форматы', () => {
    const seed = loadSeed()
    const old: PlanV1 = {
      version: 1,
      channels: seed.channels,
      items: [
        { ...seed.items[0], id: 'a', rubricId: 'f_spec', title: 'Демо / Робот', group: 'g1', date: '2026-11-15' },
        { ...seed.items[0], id: 'b', rubricId: 'sh_teaser', title: 'Тизер: Демо / Робот', group: 'g1', date: '2026-11-15' },
        { ...seed.items[0], id: 'c', rubricId: 'sh_thesis', title: 'Тезис', date: '2026-11-16' },
      ].map(({ ruleId: _r, ...it }) => ({ ...it, rubricId: it.rubricId as string })),
    }
    const p = migrateV1(parsePlan(JSON.stringify({ ...old, start: seed.start, end: seed.end, platforms: seed.platforms, rubrics: [] })) as PlanV1, seed)
    expect(p.version).toBe(2)
    expect(p.items.map((x) => [x.ruleId, x.rubricId])).toEqual([['f_demo', 'demo'], ['sh_teaser', 'demo'], ['sh_thesis', 'thesis']])
  })
  it('не JSON', () => {
    expect(() => parsePlan('{oops')).toThrow('Это не JSON')
  })
  it('чужой JSON', () => {
    expect(() => parsePlan(JSON.stringify({ hello: 1 }))).toThrow(/не похож/)
    expect(() => parsePlan(JSON.stringify({ ...smallPlan(), items: [{ id: 1 }] }))).toThrow(/не похож/)
    expect(() => parsePlan(JSON.stringify({ ...smallPlan(), rules: undefined }))).toThrow(/не похож/)
  })
})
