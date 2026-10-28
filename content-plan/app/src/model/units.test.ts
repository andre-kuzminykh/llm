import { byId, item, loadSeed, smallPlan } from '../test/fixtures'
import { blockGeometry, layoutBlocks } from './calendar'
import { indexByDate } from './filters'
import { dueOf, platformTypes, taskParts, timeText, unitsOf } from './units'

const rulesOf = (p = smallPlan()) => new Map(p.rules.map((r) => [r.id, r]))

describe('T-CP-017 FR-CP-017 карточка — материал целиком', () => {
  it('FULL с тизером и анонсом в Офисе — одна карточка Dataist, анонс Andre AIT — своя', () => {
    const p = smallPlan()
    const units = unitsOf(indexByDate(p).get('2026-10-26')!, rulesOf(p), p.channels.map((c) => c.id))
    const full = units.find((u) => u.head.id === 'demo')!
    expect(full.items.map((x) => x.id)).toEqual(['demo', 'office', 'teaser'])
    expect(units.find((u) => u.channelId === 'andre')!.items.map((x) => x.id)).toEqual(['ait'])
    expect(units.map((u) => u.time)).toEqual(['11:00', '12:00', '13:00']) // тезис, FULL, Andre AIT — по времени
  })
  it('под каждой площадкой — что на ней выходит', () => {
    const p = smallPlan()
    const full = unitsOf(indexByDate(p).get('2026-10-26')!, rulesOf(p)).find((u) => u.head.id === 'demo')!
    const types = platformTypes(full, rulesOf(p), p.platforms).map((x) => [x.platform, x.parts.map((y) => y.type)])
    expect(types).toEqual([
      ['Web', ['Анонс · Офис']],
      ['YouTube', ['FULL', 'Тизер · Shorts']],
      ['Instagram', ['Тизер · Reels']],
      ['Telegram', ['Анонс · Office']],
    ])
    expect(taskParts(full, rulesOf(p), p.platforms)).toHaveLength(5)
  })
  it('лента Neuronium — поток 24/7: без времени, в дне первой', () => {
    const seed = loadSeed()
    const units = unitsOf(indexByDate(seed).get('2026-10-27')!, rulesOf(seed), seed.channels.map((c) => c.id))
    expect(units.slice(0, 2).map((u) => [u.head.ruleId, timeText(u)])).toEqual([
      ['neu_all', '24/7'],
      ['neu_top', '24/7'],
    ])
    expect(units.filter((u) => u.stream)).toHaveLength(2)
    expect(timeText(units[2])).toMatch(/^\d\d:\d\d$/)
  })
  it('пост и шортс исследования дня — одна карточка', () => {
    const seed = loadSeed()
    const day = indexByDate(seed).get('2026-10-27')!
    const lab = unitsOf(day, rulesOf(seed)).find((u) => u.head.title === 'Исследование дня')!
    expect(lab.items.map((x) => x.ruleId).sort()).toEqual(['lab_day', 'lab_day_v'])
  })
  it('срок подготовки: FULL — за 3 дня, остальное — за день, своё — как задано', () => {
    const p = smallPlan()
    const r = rulesOf(p)
    expect(dueOf(byId(p, 'demo'), r.get('f_demo'))).toBe('2026-10-23')
    expect(dueOf(byId(p, 'thesis'), r.get('sh_thesis'))).toBe('2026-10-25')
    expect(dueOf({ ...byId(p, 'thesis'), due: '2026-10-20' }, r.get('sh_thesis'))).toBe('2026-10-20')
  })
})

describe('T-CP-018 FR-CP-018 неделя по времени', () => {
  it('совпадающие по времени стоят рядом, остальные — во всю ширину; освободившееся место занимает следующий', () => {
    const p = smallPlan()
    // карточка — полчаса: FULL 12:00–12:30, x 12:15–12:45, y 12:40–13:10, анонс Andre AIT 13:00–13:30
    p.items.push(item({ id: 'x', ruleId: 'sh_thesis', rubricId: 'thesis', title: 'В то же время', time: '12:15' }))
    p.items.push(item({ id: 'y', ruleId: 'sh_thesis', rubricId: 'thesis', title: 'Чуть позже', time: '12:40' }))
    const units = unitsOf(indexByDate(p).get('2026-10-26')!, rulesOf(p))
    const placed = layoutBlocks(units, (u) => blockGeometry(u.time, u.end)).map((x) => [x.item.head.id, x.col, x.cols])
    expect(placed).toEqual([
      ['thesis', 0, 1],
      ['demo', 0, 2],
      ['x', 1, 2],
      ['y', 0, 2], // FULL кончился в 12:30 — y встаёт на его место
      ['ait', 1, 2], // x кончился в 12:45 — анонс встаёт на его
    ])
  })
})
