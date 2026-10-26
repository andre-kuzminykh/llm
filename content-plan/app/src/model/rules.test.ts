import { loadSeed, smallPlan } from '../test/fixtures'
import { indexByDate } from './filters'
import { checkPlan, weekTemplate } from './rules'
import { moveItem, updateRule } from './store'

const check = (p = smallPlan()) => checkPlan(p, indexByDate(p))

describe('T-CP-007 FR-CP-007 проверка правил', () => {
  it('исходный план из генератора — без нарушений', () => {
    expect(check(loadSeed())).toEqual([])
  })
  it('маленький план — без нарушений', () => {
    expect(check()).toEqual([])
  })
  it('два FULL в день — одно нарушение, без отдельных «сверх лимита» для тизеров', () => {
    const v = check(moveItem(smallPlan(), 'slot', '2026-10-26'))
    expect(v.map((x) => x.kind)).toEqual(['full'])
    expect(v[0].itemIds).toEqual(expect.arrayContaining(['demo', 'teaser', 'slot', 'slot-teaser']))
  })
  it('вне сетки: разовый материал проверка не трогает', () => {
    const p = moveItem(smallPlan(), 'thesis', '2026-10-31')
    p.items = p.items.map((x) => (x.id === 'thesis' ? { ...x, offGrid: true } : x))
    expect(check(p)).toEqual([])
  })
  it('Тезис в субботу — не свой день', () => {
    const v = check(moveItem(smallPlan(), 'thesis', '2026-10-31'))
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ date: '2026-10-31', kind: 'weekday' })
  })
  it('FULL с группой во вторник — одно нарушение на группу', () => {
    const v = check(moveItem(smallPlan(), 'demo', '2026-10-27')).filter((x) => x.kind === 'weekday')
    expect(v).toHaveLength(1)
    expect(v[0].text).toContain('Демо · FULL')
  })
  it('сверх лимита: два Тезиса в день, группа считается одной', () => {
    const v = check(moveItem(smallPlan(), 'th-slot', '2026-10-26'))
    expect(v.map((x) => x.kind)).toEqual(['limit'])
  })
  it('канал ещё не запущен', () => {
    const p = smallPlan()
    p.items.push({ ...p.items[0], id: 'lan', group: undefined, channelId: 'landao', ruleId: 'lan_upd', rubricId: 'updates', title: 'Обновления', date: '2026-10-28' })
    expect(check(p).map((x) => x.kind)).toEqual(['start'])
  })
  it('выключенный день в сетке делает материалы нарушениями', () => {
    const p = updateRule(smallPlan(), 'f_demo', { days: [false, true, false, false, false, false, false] })
    expect(check(p).filter((x) => x.kind === 'weekday').length).toBe(3)
  })
})

describe('T-CP-008 FR-CP-008 типовая неделя', () => {
  it('из сетки: Демо · FULL в понедельник на YouTube, в субботу нет Тезиса', () => {
    const t = weekTemplate(loadSeed())
    expect(t.get('0|YouTube')!.map((l) => l.label)).toContain('Демо · FULL')
    expect(t.get('6|YouTube')!.map((l) => l.label)).toContain('Академия · FULL')
    expect(t.get('5|YouTube')!.map((l) => l.label)).not.toContain('Тезисы · Тезис дня')
    expect(t.get('0|Telegram')!.map((l) => l.header)).toContain('Dataist Office')
    expect(t.get('0|Web')!.map((l) => l.header)).toContain('Офис Датаиста')
  })
  it('разовые рубрики не попадают в неделю', () => {
    const t = weekTemplate(loadSeed())
    expect([...t.values()].flat().some((l) => l.rule.freq === 'разово')).toBe(false)
  })
})
