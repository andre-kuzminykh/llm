// T-CP-071: план Датаиста в приложении — календарь со страницы (../../source/dataist-calendar.html) с правками владельца:
// «Свободное» — Датаист Live, ситуативно (05.11); с 15 ноября, Нейроний по будням («100 продуктов»), в Датаисте Сб — Ландао,
// Вс — Антрополис (11.11).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { indexByDate } from '../src/model/filters'
import { isStaleDataist, upgradePlan } from '../src/model/io'
import { checkPlan } from '../src/model/rules'
import { DATAIST_EXAMPLE } from '../src/model/types'
import { unitsOf } from '../src/model/units'
import { buildPlan, ownerCards, runCalendar } from './dataist-seed.mjs'

const APP = process.cwd() // npm test — из content-plan/app
const cal = runCalendar(readFileSync(join(APP, '../source/dataist-calendar.html'), 'utf8'))
const seed = JSON.parse(readFileSync(join(APP, 'public/seed.json'), 'utf8'))
const on = (date) => seed.items.filter((it) => it.date === date)
const rules = new Map(seed.rules.map((r) => [r.id, r]))
const timeOf = (it) => it.time ?? rules.get(it.ruleId)?.time
const weekday = (d) => new Date(`${d}T12:00:00Z`).getUTCDay() // Вс = 0
const line = (it) => `${it.allDay ? 'весь день' : timeOf(it)} ${it.channelId || '—'} ${rules.get(it.ruleId)?.name ?? ''}: ${it.title}`

describe('T-CP-071 FR-CP-071 план Датаиста — календарь со страницы, с правками владельца', () => {
  it('public/seed.json собран из страницы и не отстал от неё (npm run seed); метка — как у программы', () => {
    expect(buildPlan(cal)).toEqual(seed)
    expect(seed.example).toBe(DATAIST_EXAMPLE)
  })

  it('семь каналов как в календаре; год с 15 ноября 2026; Ландао — с 1 декабря, Антрополис — с 1 января', () => {
    expect(seed.channels.map((c) => c.name)).toEqual(['Датаист', 'Датаист Live', 'Лаборатория Датаиста', 'Академия Датаиста', 'Нейроний', 'Ландао', 'Антрополис'])
    expect([seed.start, seed.end]).toEqual(['2026-11-15', '2027-11-14'])
    const dates = seed.items.map((it) => it.date).sort()
    expect([dates[0], dates.at(-1), new Set(dates).size]).toEqual(['2026-11-15', '2027-11-14', 365])
    expect(seed.channels.find((c) => c.id === 'landao').start).toBe('2026-12-01')
    expect(seed.items.filter((it) => it.channelId === 'landao').map((it) => it.date).sort()[0]).toBe('2026-12-01')
    expect(seed.items.filter((it) => it.channelId === 'antropolis').map((it) => it.date).sort()[0]).toBe('2027-01-01')
  })

  it('каждая карточка календаря — материал: тот же день, время, канал, рубрика, формат, площадки и название', () => {
    const FORMAT = { short: 'Короткое вертикальное видео', long: 'Полное горизонтальное видео', article: 'Страница на сайте', post: 'Текст с картинкой' }
    const cards = ownerCards(cal)
    const byId = new Map(seed.items.map((it) => [it.id, it]))
    expect(seed.items).toHaveLength(cards.length)
    for (const c of cards) {
      const it = byId.get(`dc-${c.id.replace('|', '-')}`)
      // «Свободное» — в Датаист Live и ситуативно (без часа); остальное — как в карточке
      const free = c.theme === 'free'
      expect([it.date, free ? !!it.allDay : timeOf(it), it.channelId, it.rubricId, it.format]).toEqual([c.date, free ? true : c.time, c.channel ?? 'live', c.theme, FORMAT[c.format]])
      expect(it.title).toBe([c.title, c.context].filter(Boolean).join(' · ') || '…')
      expect(it.platforms.length).toBeGreaterThan(0)
    }
    // всё, что в календаре не трогали, — карточка в карточку (тот же день и время)
    const owner = new Set(['neuron'])
    const untouched = cal.cards.filter((c) => !owner.has(c.channel) && !(c.id.endsWith('|thematic-empty') && [0, 6].includes(weekday(c.date))))
    for (const c of untouched) expect(byId.get(`dc-${c.id.replace('|', '-')}`)?.date).toBe(c.date)
  })

  it('Нейроний — 5 раз в неделю, Пн–Пт: «100 продуктов» по порядку (100 будней), дальше «Стартап» и «Мозги для роботов»', () => {
    const neu = seed.items.filter((it) => it.channelId === 'neuron').sort((a, b) => a.date.localeCompare(b.date))
    expect(neu.every((it) => weekday(it.date) >= 1 && weekday(it.date) <= 5)).toBe(true)
    expect(neu).toHaveLength(260)
    expect([neu[0].date, neu[0].title, neu[0].note]).toEqual(['2026-11-16', 'Knowledge Management · 100 продуктов · 1/100', 'Короткое демо · Management'])
    expect([neu[1].date, neu[1].title]).toEqual(['2026-11-17', 'Note Taking · 100 продуктов · 2/100'])
    expect([neu[99].date, neu[99].title]).toEqual(['2027-04-02', 'Incident Management · 100 продуктов · 100/100'])
    expect([neu[100].date, neu[100].title]).toEqual(['2027-04-05', 'Стартап за 100 дней · День 1 из 100'])
    expect(rules.get('dc-short-employee-demo-neuron').days).toEqual([true, true, true, true, true, false, false])
    expect(on('2026-11-21').filter((it) => it.channelId === 'neuron')).toHaveLength(0)
  })

  it('Датаист раз в неделю: Сб — Ландао (метаверс и прочее), Вс — Антрополис; коротким в 13:00 и длинным в 19:00, вместо «Тематического»', () => {
    const week = (d, rubric) => on(d).filter((it) => it.rubricId === rubric).map(line).sort()
    expect(week('2026-11-21', 'week-landao')).toEqual(['13:00 dataist Короткое видео: …', '19:00 dataist Полное видео: …'])
    // 15 ноября — воскресенье: длинный в 19:20 — после лекции Академии
    expect(week('2026-11-15', 'week-antropolis')).toEqual(['13:00 dataist Короткое видео: …', '19:20 dataist Полное видео: …'])
    expect(seed.rubrics.filter((r) => r.id.startsWith('week-')).map((r) => r.name)).toEqual(['Ландао', 'Антрополис'])
    expect(seed.rubrics.find((r) => r.id === 'week-landao').what).toMatch(/^Метаверс/)
    const sat = seed.items.filter((it) => it.rubricId === 'week-landao' && it.format === 'Короткое вертикальное видео')
    const sun = seed.items.filter((it) => it.rubricId === 'week-antropolis' && it.format === 'Короткое вертикальное видео')
    expect([sat.length, sat.every((it) => weekday(it.date) === 6), sun.length, sun.every((it) => weekday(it.date) === 0)]).toEqual([52, true, 53, true])
    // по субботам и воскресеньям пустого «Тематического» больше нет
    expect(seed.items.filter((it) => it.rubricId === 'thematic' && [0, 6].includes(weekday(it.date)))).toHaveLength(0)
  })

  it('16 ноября, первый будний день: новость дня, «Свободное» сверху, первый продукт Нейрония, анонс, Академия, лайфстайл', () => {
    const day = on('2026-11-16')
    const lines = day.map(line)
    expect(lines).toContain('09:00 live Новость дня: …')
    expect(lines).toContain('весь день live Короткое видео: …')
    expect(lines).toContain('12:00 neuron Короткое демо: Knowledge Management · 100 продуктов · 1/100')
    expect(lines).toContain('13:00 dataist Короткое видео: Стратегия')
    expect(lines).toContain('16:00 academy Обучение 1: ИИ инженер по автоматизации · Лекция 4 из 8 · Тема 1 из 10')
    expect(lines).toContain('20:00 live Короткое видео: Я устал от хайпа вокруг ИИ')
    const free = day.find((it) => it.rubricId === 'free')
    expect([free.channelId, free.ruleId, free.allDay, free.time, free.offGrid]).toEqual(['live', 'dc-short-free-live', true, undefined, undefined])
    expect(day.filter((it) => !it.channelId)).toHaveLength(0)
    const units = unitsOf(day, rules)
    expect(units.filter((u) => u.channelId === 'academy').map((u) => u.time)).toEqual(['16:00', '16:15', '16:30', '16:45'])
    expect([units[0].head.rubricId, units[0].allDay]).toEqual(['free', true]) // ситуативное — сверху дня, первым
  })

  it('среда 18 ноября: обзор Лаборатории за октябрь — коротким и длинным, с подробностями в заметке', () => {
    const review = on('2026-11-18').filter((it) => it.rubricId === 'review')
    expect(review.map((it) => `${timeOf(it)} ${it.format}: ${it.title}`).sort()).toEqual(['13:00 Короткое вертикальное видео: Обзор за октябрь', '19:00 Полное горизонтальное видео: Обзор за октябрь'])
    expect(review[0].note).toBe('Обзор Лаборатории Датаиста за октябрь 2026 года.')
  })

  it('план Датаиста первой версии (05.11) — «Свободное» само в Датаист Live, видео Академии — «Обучение 1…4»; и он устарел — его сменит новый', async () => {
    const old = JSON.parse(JSON.stringify(seed))
    old.example = 'dataist-calendar'
    old.rules = old.rules.filter((r) => r.id !== 'dc-short-free-live')
    for (const it of old.items) {
      if (it.rubricId !== 'free') continue
      Object.assign(it, { channelId: '', ruleId: '', offGrid: true, time: '11:00' })
      delete it.allDay
    }
    old.items[0].title = 'Своя правка' // остальное — как было
    for (const r of old.rules) if (/^dc-short-education-\d-academy$/.test(r.id)) r.name = r.name.replace('Обучение', 'Видео')
    const up = await upgradePlan(old, async () => seed)
    const free = up.items.filter((it) => it.rubricId === 'free')
    expect(free.every((it) => it.channelId === 'live' && it.ruleId === 'dc-short-free-live' && it.allDay && !it.time && !it.offGrid)).toBe(true)
    expect(up.rules.filter((r) => r.id === 'dc-short-free-live')).toHaveLength(1)
    expect(up.items[0].title).toBe('Своя правка')
    expect(up.rules.filter((r) => r.id.startsWith('dc-short-education-')).map((r) => r.name)).toEqual(['Обучение 1', 'Обучение 2', 'Обучение 3', 'Обучение 4'])
    expect(checkPlan(up, indexByDate(up))).toEqual([])
    expect([isStaleDataist(up), isStaleDataist(seed)]).toEqual([true, false])
  })

  it('программа открывает план как есть — без переделок — и проверка сетки молчит', async () => {
    const opened = await upgradePlan(seed, async () => seed)
    expect(opened).toBe(seed)
    expect(checkPlan(seed, indexByDate(seed))).toEqual([])
  })
})
