import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadSeed, smallPlan } from '../test/fixtures'
import { calendarCSV, cleanTitle, exportJSON, migrateV1, migrateV2, parsePlan, upgradePlan, type PlanV1, type PlanV2 } from './io'

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
    expect(p.version).toBe(3)
    expect(p.items.map((x) => [x.ruleId, x.rubricId, x.title])).toEqual([['f_demo', 'demo', 'Робот'], ['sh_teaser', 'demo', 'Робот'], ['sh_thesis', 'thesis', 'Тезис']])
  })
  it('план второй версии: названия — только тема, правки и правила сохраняются', () => {
    const seed = loadSeed()
    const v3 = smallPlan()
    const old = {
      ...v3,
      version: 2,
      rules: v3.rules.map(({ time: _t, types: _ty, bank, ...r }) => ({ ...r, ...(bank ? { pattern: '{topic}' } : {}) })),
      items: v3.items.map((it) => ({ ...it, title: it.id === 'demo' ? 'Демо / Стратегия' : it.id === 'teaser' ? 'Тизер: Демо / Стратегия' : it.id === 'office' ? 'Анонс / Стратегия' : it.title, derive: it.derive && 'Тизер: {title}', status: it.id === 'demo' ? 'ready' : it.status })),
    } as unknown as PlanV2
    const p = migrateV2(parsePlan(JSON.stringify(old)) as PlanV2, seed)
    expect(p.version).toBe(3)
    expect(p.items.filter((x) => x.group === 'full-2026-10-26').map((x) => x.title)).toEqual(['Стратегия', 'Стратегия', 'Стратегия', 'Стратегия'])
    expect(p.items.find((x) => x.id === 'demo')!.status).toBe('ready')
    expect(p.rules.find((r) => r.id === 'f_demo')).toMatchObject({ time: '12:00', types: { YouTube: 'FULL' }, bank: true })
  })
  it('названия второй версии', () => {
    expect(cleanTitle('Тизер: Демо / Стратегия')).toBe('Стратегия')
    expect(cleanTitle('Лайфстайл: Офис — Мысль')).toBe('Офис — Мысль')
    expect(cleanTitle('Исследования / Сентябрь 2026')).toBe('Итоги сентября 2026')
    expect(cleanTitle('Новости недели 3')).toBe('Итоги недели №3')
    expect(cleanTitle('Тезис: …')).toBe('…')
    expect(cleanTitle('Автоматизация 3_8', true)).toBe('Автоматизация, модуль 3, урок 8')
    expect(cleanTitle('Автоматизация 4 — старт модуля', true)).toBe('Автоматизация, модуль 4 — старт')
    expect(cleanTitle('Академия: новый курс «Разработка»', true)).toBe('Новый курс «Разработка»')
    expect(cleanTitle('Топ 5 ошибок')).toBe('Топ 5 ошибок')
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

describe('T-CP-026 FR-CP-026 поток 24/7', () => {
  it('план, сохранённый до потоков, узнаёт их из исходного плана; правки остаются', async () => {
    const seed = loadSeed()
    const old = JSON.parse(JSON.stringify(seed))
    for (const r of old.rules) delete r.stream
    const neu = old.rules.find((r: { id: string }) => r.id === 'neu_all')
    neu.time = '08:00'
    old.rules.find((r: { id: string }) => r.id === 'sh_thesis').name = 'Тезис'
    const p = await upgradePlan(old, async () => seed)
    const byId = new Map(p.rules.map((r) => [r.id, r]))
    expect(byId.get('neu_all')).toMatchObject({ stream: true, time: seed.rules.find((r) => r.id === 'neu_all')!.time })
    expect(byId.get('neu_top')!.stream).toBe(true)
    expect(byId.get('sh_thesis')).toMatchObject({ stream: false, name: 'Тезис' })
    // уже знает о потоках — исходный план не нужен
    expect(await upgradePlan(p, async () => { throw new Error('не нужен') })).toBe(p)
  })
})
