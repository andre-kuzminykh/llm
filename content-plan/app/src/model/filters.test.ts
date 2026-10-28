import { smallPlan } from '../test/fixtures'
import { indexByDate, NO_FILTERS, visible } from './filters'

describe('T-CP-009 FR-CP-009 фильтры', () => {
  const p = smallPlan()
  const ids = (f = NO_FILTERS) => p.items.filter((it) => visible(it, f)).map((it) => it.id)

  it('выделенные рубрики — видны только они (с тизерами и анонсами); ничего не выделено — все', () => {
    const shown = ids({ ...NO_FILTERS, pickedRubrics: ['thesis'] })
    expect(shown).not.toContain('teaser')
    expect(shown).toContain('thesis')
    expect(ids({ ...NO_FILTERS, pickedRubrics: ['demo'] })).toEqual(expect.arrayContaining(['demo', 'teaser']))
    expect(ids({ ...NO_FILTERS, pickedRubrics: ['demo'] })).not.toContain('thesis')
    expect(ids({ ...NO_FILTERS, pickedRubrics: [] })).toEqual(ids())
  })
  it('скрытый канал', () => {
    expect(ids({ ...NO_FILTERS, hiddenChannels: ['andre'] })).not.toContain('ait')
  })
  it('скрытая площадка: материал виден, пока есть другая', () => {
    const f = { ...NO_FILTERS, hiddenPlatforms: ['YouTube'] }
    expect(ids(f)).toContain('teaser') // ещё Instagram
    expect(ids(f)).not.toContain('demo')
  })
  it('только без темы', () => {
    expect(ids({ ...NO_FILTERS, onlySlots: true })).toEqual(['slot', 'slot-teaser', 'slot2', 'th-slot'])
  })
  it('индекс по датам: порядок каналов, затем ранг; банк не попадает', () => {
    const plan = { ...p, items: [...p.items, { ...p.items[0], id: 'bank', date: null }] }
    const day = indexByDate(plan).get('2026-10-26')!.map((x) => x.id)
    expect(day).toEqual(['demo', 'thesis', 'office', 'teaser', 'ait'])
    expect([...indexByDate(plan).values()].flat().some((x) => x.id === 'bank')).toBe(false)
  })
})
