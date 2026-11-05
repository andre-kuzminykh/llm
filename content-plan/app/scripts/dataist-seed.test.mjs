// T-CP-071: план Датаиста в приложении — тот же календарь, что прислан страницей (../../source/dataist-calendar.html).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { indexByDate } from '../src/model/filters'
import { upgradePlan } from '../src/model/io'
import { checkPlan } from '../src/model/rules'
import { unitsOf } from '../src/model/units'
import { buildPlan, runCalendar } from './dataist-seed.mjs'

const APP = process.cwd() // npm test — из content-plan/app
const cal = runCalendar(readFileSync(join(APP, '../source/dataist-calendar.html'), 'utf8'))
const seed = JSON.parse(readFileSync(join(APP, 'public/seed.json'), 'utf8'))
const on = (date) => seed.items.filter((it) => it.date === date)
const rules = new Map(seed.rules.map((r) => [r.id, r]))
const timeOf = (it) => it.time ?? rules.get(it.ruleId)?.time

describe('T-CP-071 FR-CP-071 план Датаиста — календарь со страницы, как есть', () => {
  it('public/seed.json собран из страницы и не отстал от неё (npm run seed)', () => {
    expect(buildPlan(cal)).toEqual(seed)
  })

  it('семь каналов как в календаре; год с 8 ноября 2026; Ландао — с 1 декабря, Антрополис — с 1 января', () => {
    expect(seed.example).toBe('dataist-calendar')
    expect(seed.channels.map((c) => c.name)).toEqual(['Датаист', 'Датаист Live', 'Лаборатория Датаиста', 'Академия Датаиста', 'Нейроний', 'Ландао', 'Антрополис'])
    expect([seed.start, seed.end]).toEqual(['2026-11-08', '2027-11-07'])
    expect(seed.channels.find((c) => c.id === 'landao').start).toBe('2026-12-01')
    expect(seed.items.filter((it) => it.channelId === 'landao').map((it) => it.date).sort()[0]).toBe('2026-12-01')
    expect(seed.items.filter((it) => it.channelId === 'antropolis').map((it) => it.date).sort()[0]).toBe('2027-01-01')
    expect(new Set(seed.items.map((it) => it.date)).size).toBe(365)
  })

  it('каждая карточка календаря — материал: тот же день, время, канал, рубрика, формат, площадки и название', () => {
    const FORMAT = { short: 'Короткое вертикальное видео', long: 'Полное горизонтальное видео', article: 'Страница на сайте', post: 'Текст с картинкой' }
    const byId = new Map(seed.items.map((it) => [it.id, it]))
    expect(seed.items).toHaveLength(cal.cards.length)
    for (const c of cal.cards) {
      const it = byId.get(`dc-${c.id.replace('|', '-')}`)
      // правка владельца: «Свободное» — в Датаист Live и ситуативно (без часа); остальное — как в календаре
      const free = c.theme === 'free'
      expect([it.date, free ? !!it.allDay : timeOf(it), it.channelId, it.rubricId, it.format]).toEqual([c.date, free ? true : c.time, c.channel ?? 'live', c.theme, FORMAT[c.format]])
      expect(it.title).toBe([c.title, c.context].filter(Boolean).join(' · ') || '…')
      expect(it.platforms.length).toBeGreaterThan(0)
    }
  })

  it('8 ноября: новость дня, свободное без канала, первое демо Нейрония, четыре видео Академии, лайфстайл', () => {
    const day = on('2026-11-08')
    const line = (it) => `${timeOf(it)} ${it.channelId || '—'} ${rules.get(it.ruleId)?.name ?? ''}: ${it.title}`
    const lines = day.map(line)
    expect(lines).toContain('09:00 live Новость дня: …')
    expect(lines).not.toContain('11:00 — : …')
    expect(lines).toContain('12:00 neuron Короткое демо: Knowledge Management · 100 ИИ-сотрудников за 100 дней · 1/100')
    expect(lines).toContain('16:00 academy Обучение 1: ИИ инженер по автоматизации · Лекция 4 из 8')
    expect(lines).toContain('16:45 academy Обучение 4: ИИ инженер по автоматизации · Лекция 4 из 8')
    expect(lines).toContain('20:10 live Короткое видео: Моя история')
    expect(day.find((it) => it.channelId === 'neuron').note).toBe('Короткое демо · Management')
    // «Свободное» — Датаист Live, ситуативно: без часа и вне «чужих» правил
    const free = day.find((it) => it.rubricId === 'free')
    expect([free.channelId, free.ruleId, free.allDay, free.time, free.offGrid]).toEqual(['live', 'dc-short-free-live', true, undefined, undefined])
    expect(rules.get('dc-short-free-live')).toMatchObject({ allDay: true, freq: 'ситуативно', channel: 'Датаист Live' })
    expect(day.filter((it) => !it.channelId)).toHaveLength(0)
    // карточки дня: четыре видео Академии — четыре карточки (и лекция целиком в 19:00); короткое и пост лайфстайла с одной темой — одна
    const units = unitsOf(day, rules)
    expect(units.filter((u) => u.channelId === 'academy').map((u) => u.time)).toEqual(['16:00', '16:15', '16:30', '16:45', '19:00'])
    expect(units.filter((u) => u.head.rubricId === 'lifestyle').map((u) => `${u.time} ${u.items.map((it) => it.format).join(' + ')}`)).toEqual([
      '20:00 Короткое вертикальное видео + Текст с картинкой',
      '20:10 Короткое вертикальное видео + Текст с картинкой',
      '20:20 Короткое вертикальное видео + Текст с картинкой',
    ])
    expect(units).toHaveLength(15)
    // ситуативное — сверху дня, первым
    expect([units[0].head.rubricId, units[0].allDay]).toEqual(['free', true])
  })

  it('среда 11 ноября: обзор Лаборатории за октябрь — коротким и длинным, с подробностями в заметке', () => {
    const review = on('2026-11-11').filter((it) => it.rubricId === 'review')
    expect(review.map((it) => `${timeOf(it)} ${it.format}: ${it.title}`).sort()).toEqual(['13:00 Короткое вертикальное видео: Обзор за октябрь', '19:00 Полное горизонтальное видео: Обзор за октябрь'])
    expect(review[0].note).toBe('Обзор Лаборатории Датаиста за октябрь 2026 года.')
  })

  it('план Датаиста, сохранённый до правки (05.11): «Свободное» само переходит в Датаист Live и становится ситуативным', async () => {
    const old = JSON.parse(JSON.stringify(seed))
    old.rules = old.rules.filter((r) => r.id !== 'dc-short-free-live')
    for (const it of old.items) {
      if (it.rubricId !== 'free') continue
      Object.assign(it, { channelId: '', ruleId: '', offGrid: true, time: '11:00' })
      delete it.allDay
    }
    old.items[0].title = 'Своя правка' // остальное — как было
    // и видео Академии назывались «Видео 1…4» — «видео» на карточке выходило дважды
    for (const r of old.rules) if (/^dc-short-education-\d-academy$/.test(r.id)) r.name = r.name.replace('Обучение', 'Видео')
    const up = await upgradePlan(old, async () => seed)
    const free = up.items.filter((it) => it.rubricId === 'free')
    expect(free.every((it) => it.channelId === 'live' && it.ruleId === 'dc-short-free-live' && it.allDay && !it.time && !it.offGrid)).toBe(true)
    expect(up.rules.filter((r) => r.id === 'dc-short-free-live')).toHaveLength(1)
    expect(up.items[0].title).toBe('Своя правка')
    expect(up.rules.filter((r) => r.id.startsWith('dc-short-education-')).map((r) => r.name)).toEqual(['Обучение 1', 'Обучение 2', 'Обучение 3', 'Обучение 4'])
    expect(checkPlan(up, indexByDate(up))).toEqual([])
  })

  it('программа открывает план как есть — без переделок — и проверка сетки молчит', async () => {
    const opened = await upgradePlan(seed, async () => seed)
    expect(opened).toBe(seed)
    expect(checkPlan(seed, indexByDate(seed))).toEqual([])
  })
})
