import { item, smallPlan } from '../test/fixtures'
import { addDays } from './dates'
import { indexByDate } from './filters'
import { daysText, scheduleOf, themesOf, timesText } from './schedule'
import { GRAY } from './types'
import { unitsOf } from './units'

const parts = (p = smallPlan(), from = '2026-10-24', n = 14) => {
  const rules = new Map(p.rules.map((r) => [r.id, r]))
  const rubrics = new Map(p.rubrics.map((r) => [r.id, r]))
  const byDate = indexByDate(p)
  const order = p.channels.map((c) => c.id)
  const units = Array.from({ length: n }, (_, i) => addDays(from, i)).flatMap((d) => unitsOf(byDate.get(d) ?? [], rules, order))
  return [p.channels, units, rules, rubrics] as const
}
const build = (p = smallPlan(), from = '2026-10-24', n = 14) => scheduleOf(...parts(p, from, n))

describe('T-CP-037 FR-CP-037 расписание — план повествования', () => {
  it('каналы → хэштеги → что и когда выходит, по порядку; пустой слот — «Нужна тема»', () => {
    const groups = build()
    expect(groups.map((g) => g.name)).toEqual(['Dataist', 'Andre AIT'])
    const dataist = groups[0]
    expect(dataist.tags.map((t) => t.tag)).toEqual(['#тезисы', '#демо'])
    const rows = (tag: string) => dataist.tags.find((t) => t.tag === tag)!.rows.map((r) => `${r.date} ${r.time} ${r.title}`)
    expect(rows('#демо')).toEqual(['2026-10-26 12:00 Стратегия', '2026-11-02 12:00 Нужна тема'])
    expect(rows('#тезисы')).toEqual(['2026-10-26 11:00 Я устал от хайпа вокруг ИИ', '2026-10-27 11:00 Нужна тема'])
    expect(dataist.tags[1].rows[1].slot).toBe(true)
  })
  it('раздел — своей группой со своим цветом; одно и то же каждый день — одной строкой', () => {
    const p = smallPlan()
    for (let i = 0; i < 7; i++)
      p.items.push(item({ id: `lab${i}`, date: addDays('2026-10-26', i), ruleId: 'office', rubricId: 'updates', sectionId: 'office', title: 'Анонс дня', time: '09:00' }))
    const office = build(p, '2026-10-26', 7).find((g) => g.name === 'Офис Датаиста')!
    expect(office.color).toBe(GRAY)
    const row = office.tags[0].rows[0]
    expect(office.tags[0].rows).toHaveLength(1)
    expect(row.days).toHaveLength(7)
    expect(daysText(row.days, 7)).toBe('каждый день')
  })
  it('потоки 24/7 в расписание не идут', () => {
    const p = smallPlan()
    p.rules = p.rules.map((r) => (r.id === 'sh_thesis' ? { ...r, stream: true } : r))
    expect(build(p)[0].tags.map((t) => t.tag)).toEqual(['#демо'])
  })
  it('дни слитой строки словами', () => {
    expect(daysText(['2026-10-26', '2026-10-28', '2026-10-30'], 7)).toBe('Пн, Ср, Пт')
    expect(daysText(['2026-10-26', '2026-11-02', '2026-11-09'], 30)).toBe('26 окт – 9 ноя')
    expect(timesText(['2026-10-26', '2026-11-02', '2026-11-09'], 30)).toBe('3 раза')
    expect(timesText(['2026-10-26', '2026-10-28'], 7)).toBe('')
  })
})

describe('T-CP-039 FR-CP-039 общая тема над несколькими материалами', () => {
  it('по темам: у материалов разных форматов и каналов одна тема — они вместе, по порядку; остальное — «без темы»', () => {
    const p = smallPlan()
    for (const it of p.items) if (it.id === 'demo' || it.id === 'thesis' || it.id === 'ait') it.theme = 'ИИ-стратегия'
    const { themes, none } = themesOf(...parts(p))
    expect(themes.map((t) => t.theme)).toEqual(['ИИ-стратегия'])
    expect(themes[0].rows.map((r) => `${r.time} ${r.channel} ${r.tag} ${r.format} ${r.title}`)).toEqual([
      '11:00 Dataist #тезисы Короткое вертикальное видео Я устал от хайпа вокруг ИИ',
      '12:00 Dataist #демо Полное горизонтальное видео Стратегия',
      '13:00 Andre AIT #демо Текст с картинкой Стратегия',
    ])
    expect(none.map((r) => r.title)).toEqual(['Нужна тема', 'Нужна тема'])
  })
  it('строка знает все материалы карточки — тема ставится и тизеру с анонсами', () => {
    const row = build()[0].tags.find((t) => t.tag === '#демо')!.rows[0]
    expect(row.ids.sort()).toEqual(['demo', 'office', 'teaser'])
  })
  it('тема у карточки — у главного или у любого её материала; в «по хэштегам» видна у строки', () => {
    const p = smallPlan()
    p.items.find((it) => it.id === 'teaser')!.theme = 'Стратегия ИИ'
    expect(build(p)[0].tags.find((t) => t.tag === '#демо')!.rows[0].theme).toBe('Стратегия ИИ')
  })
})

