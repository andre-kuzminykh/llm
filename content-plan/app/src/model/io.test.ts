import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadSeed, smallPlan } from '../test/fixtures'
import { indexByDate } from './filters'
import { calendarCSV, cleanTitle, exportJSON, migrateV1, migrateV2, parsePlan, renameAndFormats, splitDataist, upgradePlan, webAndMail, type PlanV1, type PlanV2 } from './io'
import { checkPlan } from './rules'
import { FULL_VIDEO, GRAY, MAIL, SHORT_VIDEO, TEXT_IMAGE, WEB_PAGE, type Plan } from './types'
import { unitsOf } from './units'

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

describe('T-CP-035/036 FR-CP-035/036 разделы Датаиста и четыре формата', () => {
  // план, сохранённый до новых названий: разделы «Лаборатория / Академия / Кабинет», форматы FULL, Shorts, Пост…
  const old = (): Plan => {
    const p = smallPlan()
    p.channels[0].sections = [{ id: 'office', name: 'Dataist Office', web: 'Кабинет' }]
    p.rules = p.rules.map((r) =>
      r.id === 'office'
        ? { ...r, name: 'Анонс в Кабинете', format: 'Пост', types: { ...r.types, Web: 'Анонс · Кабинет' } }
        : { ...r, format: r.full ? 'FULL' : r.id.startsWith('sh_') ? 'Shorts' : 'Пост / письмо' },
    )
    p.items = p.items.map((it) => ({ ...it, format: it.ruleId.startsWith('sh_') ? 'Shorts' : it.ruleId === 'office' ? 'Пост' : 'FULL' }))
    return p
  }
  it('старый план переводится: разделы называются полностью и серые, «Кабинет» — «Офис», форматы — из четырёх', () => {
    const p = renameAndFormats(old())
    expect(p.channels[0].sections[0]).toMatchObject({ web: 'Офис Датаиста', color: GRAY })
    const rule = (id: string) => p.rules.find((r) => r.id === id)!
    expect(rule('office')).toMatchObject({ name: 'Анонс в Офисе', format: WEB_PAGE, types: { Web: 'Анонс · Офис' } })
    expect(rule('f_demo').format).toBe(FULL_VIDEO)
    expect(rule('sh_thesis').format).toBe(SHORT_VIDEO)
    expect(rule('ait').format).toBe(TEXT_IMAGE)
    expect(new Set(p.items.map((it) => it.format))).toEqual(new Set([FULL_VIDEO, SHORT_VIDEO, WEB_PAGE]))
  })
  it('уже переведённый план не трогается; свой цвет раздела остаётся', () => {
    const p = smallPlan()
    expect(renameAndFormats(p)).toBe(p)
    const o = old()
    o.channels[0].sections[0].color = '#34c759'
    expect(renameAndFormats(o).channels[0].sections[0].color).toBe('#34c759')
  })
})

describe('T-CP-038 FR-CP-038 Датаист — три отдельных канала', () => {
  // план, сохранённый с Dataist и разделами: у Dataist три раздела, FULL Демо и тезис — без раздела
  const old = (): Plan => {
    const p = smallPlan()
    p.channels[0].sections = [
      { id: 'lab', name: 'Dataist Lab', web: 'Лаборатория Датаиста', color: GRAY },
      { id: 'academy', name: 'Dataist Academy', web: 'Академия Датаиста', color: '#34c759' },
      { id: 'office', name: 'Dataist Office', web: 'Офис Датаиста', color: GRAY },
    ]
    p.rubrics.push({ id: 'research', name: 'Исследования', what: '' })
    p.rules.push({ ...p.rules.find((r) => r.id === 'f_demo')!, id: 'f_res', rubricId: 'research' })
    p.items.push({ ...p.items.find((it) => it.id === 'slot2')!, id: 'res', ruleId: 'f_res', rubricId: 'research', group: undefined })
    return p
  }
  it('вместо Dataist с разделами — три серых канала; формат и материал — в канале своего раздела или рубрики', () => {
    const p = splitDataist(old())
    expect(p.channels.map((c) => c.name)).toEqual(['Лаборатория Датаиста', 'Академия Датаиста', 'Офис Датаиста', 'Andre AIT', 'Landao'])
    expect(p.channels.every((c) => !c.sections.length)).toBe(true)
    expect(p.channels.find((c) => c.id === 'dataist-academy')!.color).toBe('#34c759') // свой цвет раздела остаётся
    const ch = (id: string) => p.items.find((it) => it.id === id)!
    expect(ch('demo').channelId).toBe('dataist-office')
    expect(ch('office')).toMatchObject({ channelId: 'dataist-office' })
    expect(ch('office').sectionId).toBeUndefined()
    expect(ch('thesis').channelId).toBe('dataist-office')
    expect(ch('res').channelId).toBe('dataist-lab')
    expect(p.rules.find((r) => r.id === 'f_res')!.channelId).toBe('dataist-lab')
    expect(p.rules.every((r) => r.channelId !== 'dataist' && !r.sectionId)).toBe(true)
  })
  it('план без Dataist не трогается; исходный план уже из трёх каналов', () => {
    const p = splitDataist(old())
    expect(splitDataist(p)).toBe(p)
    const seed = loadSeed()
    expect(seed.channels.filter((c) => c.id.startsWith('dataist-')).map((c) => [c.name, c.color])).toEqual([
      ['Лаборатория Датаиста', GRAY],
      ['Академия Датаиста', GRAY],
      ['Офис Датаиста', GRAY],
    ])
    expect(seed.channels.some((c) => c.sections.length)).toBe(false)
  })
})

describe('T-CP-050 FR-CP-050 сайт и письмо — форматы', () => {
  it('формат и материал, где сайт или письмо вместе с другими площадками, делятся на части одной карточки', () => {
    const p = webAndMail(smallPlan())
    const rule = (id: string) => p.rules.find((r) => r.id === id)!
    // «Анонс в Офисе»: страница на сайте и пост в Telegram — два формата с тем же названием и днями
    expect([rule('office').format, rule('office').platforms, rule('office~post').format, rule('office~post').platforms]).toEqual([WEB_PAGE, ['Web'], TEXT_IMAGE, ['Telegram']])
    expect(rule('office~post').name).toBe('Анонс в Офисе')
    expect(rule('office~post').types).toEqual({ Telegram: 'Анонс · Office' })
    // анонс Andre AIT: пост в LinkedIn и строка в письме
    expect([rule('ait').platforms, rule('ait~mail').format, rule('ait~mail').platforms]).toEqual([['LinkedIn'], MAIL, ['Mail']])
    const item = (id: string) => p.items.find((x) => x.id === id)!
    expect(item('office~post')).toMatchObject({ ruleId: 'office~post', format: TEXT_IMAGE, platforms: ['Telegram'], group: 'full-2026-10-26', derive: '{title}', date: '2026-10-26' })
    expect(item('ait~mail')).toMatchObject({ ruleId: 'ait~mail', format: MAIL, platforms: ['Mail'], group: 'full-2026-10-26' })
    // видео не трогается; повторно — то же самое
    expect(item('teaser').platforms).toEqual(['YouTube', 'Instagram'])
    expect(webAndMail(p)).toBe(p)
  })
  it('на исходном плане: нарушений не прибавилось, CSV тот же, карточек в дне столько же', () => {
    const before = splitDataist(renameAndFormats(loadSeed()))
    const after = webAndMail(before)
    expect(after.items.some((it) => it.platforms.includes('Web') && it.platforms.length > 1)).toBe(false)
    expect(after.items.some((it) => it.platforms.includes('Mail') && it.format !== MAIL)).toBe(false)
    expect(checkPlan(after, indexByDate(after))).toEqual(checkPlan(before, indexByDate(before)))
    expect(calendarCSV(after)).toBe(calendarCSV(before))
    const rules = (p: Plan) => new Map(p.rules.map((r) => [r.id, r]))
    for (const d of ['2026-10-26', '2026-10-28', '2026-11-01'])
      expect(unitsOf(indexByDate(after).get(d) ?? [], rules(after)).length).toBe(unitsOf(indexByDate(before).get(d) ?? [], rules(before)).length)
  })
})
