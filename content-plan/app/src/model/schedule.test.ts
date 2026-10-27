import { item, smallPlan } from '../test/fixtures'
import { addDays } from './dates'
import { indexByDate } from './filters'
import { dateText, daysText, entriesOf, scheduleOf, timesText } from './schedule'
import { GRAY } from './types'
import { unitsOf } from './units'

const parts = (p = smallPlan(), from = '2026-10-24', n = 14) => {
  const rules = new Map(p.rules.map((r) => [r.id, r]))
  const rubrics = new Map(p.rubrics.map((r) => [r.id, r]))
  const byDate = indexByDate(p)
  const order = p.channels.map((c) => c.id)
  const units = Array.from({ length: n }, (_, i) => addDays(from, i)).flatMap((d) => unitsOf(byDate.get(d) ?? [], rules, order))
  return [p.channels, units, rules, rubrics, p.platforms] as const
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
  it('общая тема — внутри хэштега, где выходит её первый материал; собирает материалы разных форматов; остальное — по порядку', () => {
    const p = smallPlan()
    // у #тезисы два материала: тезис 26.10 и слот 27.10; общая тема — у тезиса и у FULL #демо
    p.items.push(item({ id: 'th2', date: '2026-10-28', ruleId: 'sh_thesis', rubricId: 'thesis', title: 'Агенты вместо отделов', format: 'Текст с картинкой', platforms: ['X'], rank: 20 }))
    for (const it of p.items) if (it.id === 'thesis' || it.id === 'th2' || it.id === 'demo') it.theme = 'ИИ-стратегия'
    const tags = build(p)[0].tags
    const thesis = entriesOf(tags.find((t) => t.tag === '#тезисы')!.rows)
    expect(thesis.map((e) => ('row' in e ? e.row.title : `Тема ${e.theme}: ${e.rows.map((r) => `${r.title} (${r.format})`).join(', ')}`))).toEqual([
      'Тема ИИ-стратегия: Я устал от хайпа вокруг ИИ (Короткое вертикальное видео), Агенты вместо отделов (Текст с картинкой)',
      'Нужна тема',
    ])
    const demo = entriesOf(tags.find((t) => t.tag === '#демо')!.rows)
    expect(demo.map((e) => ('row' in e ? e.row.title : `Тема ${e.theme}`))).toEqual(['Тема ИИ-стратегия', 'Нужна тема'])
  })
  it('строка знает все материалы карточки и площадки всех — тема ставится и тизеру с анонсами', () => {
    const row = build()[0].tags.find((t) => t.tag === '#демо')!.rows[0]
    expect(row.ids.sort()).toEqual(['demo', 'office', 'teaser'])
    expect(row.platforms).toEqual(['Web', 'YouTube', 'Instagram', 'Telegram'])
  })
  it('тема у карточки — у главного или у любого её материала', () => {
    const p = smallPlan()
    p.items.find((it) => it.id === 'teaser')!.theme = 'Стратегия ИИ'
    expect(build(p)[0].tags.find((t) => t.tag === '#демо')!.rows[0].theme).toBe('Стратегия ИИ')
  })
  it('дата в этом году — «26 окт», в другом — с годом', () => {
    expect(dateText('2026-10-26', '2026-10-24')).toBe('26 окт')
    expect(dateText('2027-01-05', '2026-10-24')).toBe('5 янв 2027')
    expect(daysText(['2026-10-26', '2027-01-04'], 730, '2026-10-24')).toBe('26 окт – 4 янв 2027')
  })
})
