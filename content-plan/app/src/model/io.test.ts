import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadSeed, smallPlan } from '../test/fixtures'
import { calendarCSV, exportJSON, parsePlan } from './io'

describe('T-CP-013 FR-CP-013 выгрузка и загрузка', () => {
  it('CSV-календарь совпадает с out/4_calendar.csv генератора', () => {
    const expected = readFileSync(resolve(process.cwd(), '../out/4_calendar.csv'), 'utf-8')
    expect(calendarCSV(loadSeed())).toBe(expected)
  })
  it('JSON туда и обратно', () => {
    const p = smallPlan()
    expect(parsePlan(exportJSON(p))).toEqual(p)
  })
  it('не JSON', () => {
    expect(() => parsePlan('{oops')).toThrow('Это не JSON')
  })
  it('чужой JSON', () => {
    expect(() => parsePlan(JSON.stringify({ hello: 1 }))).toThrow(/не похож/)
    expect(() => parsePlan(JSON.stringify({ ...smallPlan(), items: [{ id: 1 }] }))).toThrow(/не похож/)
  })
})
