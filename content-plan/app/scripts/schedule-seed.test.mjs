// T-CP-075: план Датаиста — расписание из таблицы владельца (../../source/schedule.csv), без контента: только слоты.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { indexByDate } from '../src/model/filters'
import { upgradePlan } from '../src/model/io'
import { checkPlan } from '../src/model/rules'
import { syncSchedule } from '../src/model/schedule'
import { DATAIST_EXAMPLE } from '../src/model/types'
import { buildPlan, parseCSV, readSchedule } from './schedule-seed.mjs'

const APP = process.cwd() // npm test — из content-plan/app
const csv = readFileSync(join(APP, '../source/schedule.csv'), 'utf8')
const seed = JSON.parse(readFileSync(join(APP, 'public/seed.json'), 'utf8'))
const rubric = new Map(seed.rubrics.map((r) => [r.id, r.name]))
const rules = new Map(seed.rules.map((r) => [r.id, r]))
const on = (date) => seed.items.filter((it) => it.date === date)
const line = (it) => {
  const r = rules.get(it.ruleId)
  return `${r.time} ${seed.channels.find((c) => c.id === it.channelId).name} · ${rubric.get(it.rubricId)} · ${it.format}`
}

describe('T-CP-075 FR-CP-075 план Датаиста — расписание из таблицы владельца', () => {
  it('public/seed.json собран из таблицы и не отстал от неё (npm run seed); метка — как у программы', () => {
    expect(buildPlan(csv)).toEqual(seed)
    expect(seed.example).toBe(DATAIST_EXAMPLE)
  })

  it('семь каналов как в таблице, двадцать рубрик, 49 строк расписания; контента нет — только слоты «Нужна тема»', () => {
    expect(seed.channels.map((c) => c.name)).toEqual(['Лаборатория Датаиста', 'Академия Датаиста', 'Офис Датаиста', 'Датаист Live', 'Нейроний', 'Ландао', 'Антрополис'])
    expect(seed.rubrics.map((r) => r.name).sort()).toEqual(
      ['Live', 'Анонс', 'Бизнесхак', 'Вэйв', 'Дайджест', 'ИИ-трансформация', 'Инструкция', 'Исследование', 'Кейс', 'Кейсы', 'Лекция', 'Микроурок', 'Мнение', 'Мысли', 'Новости', 'Обзор', 'Разработка', 'Советы', 'Технологии', 'Флоу'].sort(),
    )
    expect(seed.rules).toHaveLength(49)
    expect(seed.rules.every((r) => r.scheduled)).toBe(true)
    expect(seed.items.every((it) => it.title === '…' && it.status === 'planned' && it.source === 'расписание')).toBe(true)
    expect([seed.cycleStart, seed.start, seed.end]).toEqual(['2026-11-15', '2026-11-15', '2027-11-14'])
  })

  it('каждая ячейка таблицы — в расписании: неделя, день, канал, категория, время и рубрика совпадают', () => {
    // таблица назад из расписания: неделя цикла × день × канал·категория → «10:00 Рубрика» по времени
    const rows = parseCSV(csv)
    const fromCsv = new Map()
    for (const l of readSchedule(csv)) for (const c of l.cells) {
      const k = `${c.week}|${c.wd}|${l.channel.id}|${l.format}`
      fromCsv.set(k, [...(fromCsv.get(k) ?? []), `${l.time} ${l.rubric}`].sort())
    }
    const fromSeed = new Map()
    for (let i = 0; i < 28; i++) {
      const date = new Date(Date.parse('2026-11-15T12:00:00Z') + i * 864e5).toISOString().slice(0, 10)
      const week = Math.floor(i / 7) + 1
      const wd = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7
      for (const it of on(date)) {
        const k = `${week}|${wd}|${it.channelId}|${it.format}`
        fromSeed.set(k, [...(fromSeed.get(k) ?? []), `${rules.get(it.ruleId).time} ${rubric.get(it.rubricId)}`].sort())
      }
    }
    expect(Object.fromEntries(fromSeed)).toEqual(Object.fromEntries(fromCsv))
    // и в таблице действительно 4 недели по 7 дней
    expect(rows.length - 3).toBe(28)
  })

  it('неделя I — с воскресенья 15 ноября: Обзор Лаборатории — Пн I недели, Разработка — Пн III, Лекция Академии — Ср I и III', () => {
    const week = (id) => rules.get(id).weeks
    expect([week('lab-long-review-1000'), week('lab-long-development-1000'), week('academy-long-lecture-1800'), week('lab-short-research-0900')]).toEqual([[1], [3], [1, 3], undefined])
    const lines16 = on('2026-11-16').map(line)
    expect(lines16).toContain('10:00 Лаборатория Датаиста · Обзор · Полное горизонтальное видео')
    expect(lines16.filter((l) => l.includes('Разработка'))).toHaveLength(0)
    expect(on('2026-11-30').map(line)).toContain('10:00 Лаборатория Датаиста · Разработка · Полное горизонтальное видео')
    expect(on('2026-11-18').map(line)).toContain('18:00 Академия Датаиста · Лекция · Полное горизонтальное видео')
    expect(on('2026-11-25').map(line).filter((l) => l.includes('Лекция'))).toHaveLength(0)
    expect(on('2026-12-14').map(line)).toContain('10:00 Лаборатория Датаиста · Обзор · Полное горизонтальное видео') // снова неделя I
  })

  it('понедельник 16 ноября: 29 слотов — Микроурок четырежды (17:00–17:45), Новости, Live и Мнение в Live, Бизнесхак, Вэйв', () => {
    const lines16 = on('2026-11-16').map(line)
    expect(lines16).toHaveLength(29)
    expect(lines16.filter((l) => l.includes('Микроурок')).sort()).toEqual(['17:00', '17:15', '17:30', '17:45'].map((t) => `${t} Академия Датаиста · Микроурок · Короткое вертикальное видео`))
    for (const l of ['08:00 Датаист Live · Новости · Страница на сайте', '14:00 Датаист Live · Live · Короткое вертикальное видео', '20:00 Датаист Live · Мнение · Текст с картинкой', '13:00 Нейроний · Бизнесхак · Текст с картинкой', '07:00 Ландао · Вэйв · Страница на сайте', '16:00 Антрополис · Новости · Короткое вертикальное видео'])
      expect(lines16).toContain(l)
  })

  it('слоты — те же, что ставит программа сама (syncSchedule), а программа открывает план как есть; проверка сетки молчит', async () => {
    const empty = { ...seed, items: [] }
    expect(syncSchedule(empty, seed.start, seed.end).items).toEqual(seed.items)
    expect(await upgradePlan(seed, async () => seed)).toBe(seed)
    expect(checkPlan(seed, indexByDate(seed))).toEqual([])
  })
})
