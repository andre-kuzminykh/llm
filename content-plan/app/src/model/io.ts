// Выгрузка и загрузка: JSON целиком и CSV-календарь в формате out/4_calendar.csv.
import { addDays, MONTHS, WEEKDAYS, weekday } from './dates'
import { formatOf, GRAY, isFormat, lineOf, MAIL, OLD_MAIL, PLACEHOLDER, TEXT_IMAGE, timeOf, WEB_PAGE, type Channel, type ISODate, type Item, type Plan, type Rule } from './types'

export const exportJSON = (plan: Plan) => JSON.stringify(plan)

export type AnyPlan = Plan | PlanV2 | PlanV1

/** Разбирает выгрузку. Старые версии переводятся upgradePlan: первая — рубрика и формат были одним,
 *  вторая — рубрика стояла в названии («Демо / Стратегия»). */
export function parsePlan(text: string): AnyPlan {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Это не JSON')
  }
  const p = data as Omit<Partial<Plan>, 'version'> & { version?: number }
  const common =
    p &&
    typeof p.start === 'string' &&
    typeof p.end === 'string' &&
    Array.isArray(p.platforms) &&
    Array.isArray(p.channels) &&
    Array.isArray(p.rubrics) &&
    Array.isArray(p.items)
  const v2 =
    common &&
    (p.version === 2 || p.version === 3) &&
    Array.isArray(p.rules) &&
    p.items!.every((it: Partial<Item>) => typeof it.id === 'string' && typeof it.ruleId === 'string' && typeof it.title === 'string')
  const v1 =
    common &&
    p.version === 1 &&
    (p.items as { id?: unknown; rubricId?: unknown; title?: unknown }[]).every((it) => typeof it.id === 'string' && typeof it.rubricId === 'string' && typeof it.title === 'string')
  if (!v2 && !v1) throw new Error('Файл не похож на выгрузку контент-плана (нужны каналы, рубрики, правила и материалы)')
  return p as AnyPlan
}

export interface PlanV2 extends Omit<Plan, 'version' | 'rules'> {
  version: 2
  rules: (Omit<Rule, 'time' | 'types'> & { pattern?: string; time?: string; types?: Record<string, string> })[]
}

export interface PlanV1 {
  version: 1
  channels: Plan['channels']
  items: (Omit<Item, 'ruleId' | 'rubricId'> & { rubricId: string })[]
}

/** Первая версия хранила формат вместо рубрики (rubricId = «f_demo», «sh_teaser»…). Рубрики и правила
 *  берём из нового исходного плана, материалы и каналы — из старого; рубрику тизеров и анонсов — от их FULL. */
export function migrateV1(old: PlanV1, seed: Plan): Plan {
  return migrateV2(migrateV1toV2(old, seed), seed)
}

function migrateV1toV2(old: PlanV1, seed: Plan): PlanV2 {
  const rules = new Map(seed.rules.map((r) => [r.id, r]))
  const ruleId = (id: string) => (id === 'f_spec' ? 'f_demo' : id)
  const headRubric = new Map<string, string>()
  for (const it of old.items) {
    const r = rules.get(ruleId(it.rubricId))
    if (it.group && r?.full && r.rubricId) headRubric.set(it.group, r.rubricId)
  }
  const items = old.items.map(({ rubricId, ...it }) => {
    const id = ruleId(rubricId)
    return { ...it, ruleId: id, rubricId: rules.get(id)?.rubricId ?? (it.group ? headRubric.get(it.group) : undefined) ?? null }
  })
  return { ...seed, version: 2, channels: old.channels, items }
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const PREFIX = /^(?:Тизер|Призыв|Анонс|Разборы|Лайфстайл|Тезис|Демо|Технологии|Кейсы|Разработка|Мысли|Исследования|Академия)\s*(?:\/|:)\s*/
const RENAMED: Record<string, string> = {
  'Обновления Landao': 'Что нового в Landao',
  'Дневник разработки Antropolis': 'Antropolis',
  'Новый канал: Antropolis': 'Новый канал Antropolis',
}

/** «Автоматизация 3_8» → «Автоматизация, модуль 3, урок 8» — как пишет генератор. */
export function lessonTitle(name: string, kind?: 'module' | 'course') {
  const m = name.match(/^(.+?) (\d+)(?:_(\d+))?$/)
  if (!m) return kind === 'course' ? `${name} — старт курса` : name
  const t = `${m[1]}, модуль ${m[2]}${m[3] ? `, урок ${m[3]}` : ''}`
  return kind === 'module' ? `${t} — старт` : t
}

/** Название второй версии → тема: без рубрики и формата в начале; уроки Академии и итоги — словами. */
export function cleanTitle(title: string, academy = false): string {
  if (RENAMED[title]) return RENAMED[title]
  let t = title
  for (let i = 0; i < 3 && PREFIX.test(t); i++) t = t.replace(PREFIX, '')
  if (t.trim() === PLACEHOLDER) return PLACEHOLDER
  let m = t.match(/^Новости недели (\d+)$/)
  if (m) return `Итоги недели №${m[1]}`
  if ((m = t.match(/^(\S+) (\d{4})$/)) && MONTHS.includes(m[1])) return `Итоги ${MONTHS_GEN[MONTHS.indexOf(m[1])]} ${m[2]}`
  if (!academy) return t
  if ((m = t.match(/^новый курс (.+)$/))) return `Новый курс ${m[1]}`
  if ((m = t.match(/^старт модуля (.+)$/))) return lessonTitle(m[1], 'module')
  if ((m = t.match(/^(.+) — старт (модуля|курса)$/))) return lessonTitle(m[1], m[2] === 'курса' ? 'course' : 'module')
  return lessonTitle(t)
}

/** Вторая версия → третья: названия — только тема; у правил появляются время и типы контента по площадкам
 *  (из нового исходного плана, для своих форматов — по умолчанию). Правки материалов сохраняются. */
export function migrateV2(old: PlanV2, seed: Plan): Plan {
  const seedRules = new Map(seed.rules.map((r) => [r.id, r]))
  const rules: Rule[] = old.rules.map(({ pattern, ...r }) => {
    const s = seedRules.get(r.id)
    return { ...r, time: r.time ?? s?.time ?? '12:00', types: r.types ?? s?.types ?? {}, bank: r.bank ?? (!!pattern || s?.bank) }
  })
  const clean = old.items.map((it) => ({ ...it, title: cleanTitle(it.title, it.rubricId === 'academy'), derive: it.derive ? '{title}' : undefined }))
  const full = new Set(rules.filter((r) => r.full).map((r) => r.id))
  const heads = new Map<string, Item>()
  for (const it of clean) {
    if (!it.group || it.derive || !it.date) continue
    const k = `${it.group}|${it.date}`
    if (!heads.has(k) || full.has(it.ruleId)) heads.set(k, it)
  }
  const items = clean.map((it) => {
    if (!it.derive) return { ...it, derive: undefined }
    const h = heads.get(`${it.group}|${it.date}`)
    return h ? { ...it, title: h.title } : it
  })
  return { ...old, version: 3, rules, items: items.map(dropUndefined) }
}

const dropUndefined = (it: Item): Item => {
  const out = { ...it }
  for (const k of Object.keys(out) as (keyof Item)[]) if (out[k] === undefined) delete out[k]
  return out
}

export const isV1 = (p: AnyPlan): p is PlanV1 => p.version === 1
export const isV2 = (p: AnyPlan): p is PlanV2 => p.version === 2

/** Любая версия → текущая. Для старых нужен новый исходный план: из него берутся новые поля правил. */
export async function upgradePlan(p: AnyPlan, seed: () => Promise<Plan>): Promise<Plan> {
  if (isV1(p)) return webAndMail(splitDataist(renameAndFormats(migrateV1(p, await seed()))))
  if (isV2(p)) return webAndMail(splitDataist(renameAndFormats(migrateV2(p, await seed()))))
  return webAndMail(splitDataist(renameAndFormats(await addStreams(p, seed))))
}

// Разделы Dataist теперь называются полностью и по умолчанию серые; «Кабинет» стал «Офисом Датаиста»
const SECTION_NAMES: Record<string, string> = { Лаборатория: 'Лаборатория Датаиста', Академия: 'Академия Датаиста', Кабинет: 'Офис Датаиста' }

/** План, сохранённый до новых названий разделов и четырёх форматов: переводится на них, правки не трогаются.
 *  Уже переведённый план возвращается как есть. */
export function renameAndFormats(p: Plan): Plan {
  const oldSections = p.channels.some((c) => c.sections.some((s) => s.web in SECTION_NAMES))
  const oldRules = p.rules.some((r) => !isFormat(r.format) || r.name === 'Анонс в Кабинете')
  const oldItems = p.items.some((it) => !isFormat(it.format))
  if (!oldSections && !oldRules && !oldItems) return p
  return {
    ...p,
    channels: !oldSections
      ? p.channels
      : p.channels.map((c) => ({
          ...c,
          sections: c.sections.map((s) => (s.web in SECTION_NAMES ? { ...s, web: SECTION_NAMES[s.web], color: s.color ?? GRAY } : s)),
        })),
    rules: !oldRules
      ? p.rules
      : p.rules.map((r) => {
          const office = r.name === 'Анонс в Кабинете'
          return {
            ...r,
            format: formatOf(r.format, r.platforms),
            name: office ? 'Анонс в Офисе' : r.name,
            types: office && r.types.Web === 'Анонс · Кабинет' ? { ...r.types, Web: 'Анонс · Офис' } : r.types,
          }
        }),
    items: !oldItems ? p.items : p.items.map((it) => (isFormat(it.format) ? it : { ...it, format: formatOf(it.format, it.platforms) })),
  }
}

/** План, сохранённый до потоков 24/7: какие форматы — поток, берётся из исходного плана; остальные правки не трогаются. */
async function addStreams(p: Plan, seed: () => Promise<Plan>): Promise<Plan> {
  if (p.rules.every((r) => 'stream' in r)) return p
  let src: Plan
  try {
    src = await seed()
  } catch {
    return p // без исходного плана откроем как есть
  }
  const from = new Map(src.rules.map((r) => [r.id, r]))
  return {
    ...p,
    rules: p.rules.map((r) => {
      if ('stream' in r) return r
      const s = from.get(r.id)
      return s?.stream ? { ...r, stream: true, time: s.time, freq: s.freq } : { ...r, stream: false }
    }),
  }
}

/** Датаист — три отдельных канала вместо Dataist с разделами: у формата — канал его раздела, без раздела — по рубрике
 *  (исследования — Лаборатория, Академия — Академия, остальное — Офис). Материал — в канале своего формата.
 *  Свой цвет раздела остаётся; план без Dataist возвращается как есть. */
export function splitDataist(p: Plan): Plan {
  const old = p.channels.find((c) => c.id === 'dataist' && c.sections.length)
  if (!old) return p
  const ids = new Set(old.sections.map((s) => s.id))
  const part = (sectionId: string | undefined, rubricId: string | null) => {
    const want = sectionId && ids.has(sectionId) ? sectionId : rubricId === 'research' ? 'lab' : rubricId === 'academy' ? 'academy' : 'office'
    return `dataist-${ids.has(want) ? want : old.sections[old.sections.length - 1].id}`
  }
  const ruleChannel = new Map<string, string>()
  const rules = p.rules.map((r) => {
    if (r.channelId !== old.id) return r
    const { sectionId, ...rest } = r
    const channelId = part(sectionId, r.rubricId)
    ruleChannel.set(r.id, channelId)
    return { ...rest, channelId }
  })
  const items = p.items.map((it) => {
    if (it.channelId !== old.id) return it
    const { sectionId, ...rest } = it
    return { ...rest, channelId: ruleChannel.get(it.ruleId) ?? part(sectionId, it.rubricId) }
  })
  const made: Channel[] = old.sections.map((s) => {
    const id = `dataist-${s.id}`
    const used = new Set(rules.filter((r) => r.channelId === id).flatMap((r) => r.platforms))
    const platforms = old.platforms.filter((x) => used.has(x))
    return { id, name: s.web, color: s.color ?? GRAY, start: old.start, platforms: platforms.length ? platforms : old.platforms, sections: [] }
  })
  return { ...p, channels: p.channels.flatMap((c) => (c === old ? made : [c])), rules, items }
}

type Part = { kind: 'web' | 'mail' | 'post'; format: string; platforms: string[] }

/** Части материала по формату: страница — только сайт, письмо — только рассылка, остальные площадки — свой формат
 *  (у страницы и письма — пост). «Исследование дня» на сайте, в Telegram, X… и строкой в письме — три части. */
export function partsOf(format: string, platforms: string[]): Part[] {
  const rest = platforms.filter((p) => p !== 'Web' && p !== 'Mail')
  const parts: Part[] = []
  if (platforms.includes('Web')) parts.push({ kind: 'web', format: WEB_PAGE, platforms: ['Web'] })
  if (rest.length) parts.push({ kind: 'post', format: format === WEB_PAGE || format === MAIL ? TEXT_IMAGE : format, platforms: rest })
  if (platforms.includes('Mail')) parts.push({ kind: 'mail', format: MAIL, platforms: ['Mail'] })
  if (!parts.length) return [{ kind: 'post', format, platforms }]
  // главная часть — по формату: у страницы — сайт, у остальных — площадки
  const main = parts.find((x) => x.format === format) ?? parts.find((x) => x.kind === 'post') ?? parts[0]
  return [main, ...parts.filter((x) => x !== main)]
}
const splits = (format: string, platforms: string[]) => {
  const parts = partsOf(format, platforms)
  return parts.length > 1 || parts[0].format !== format
}
const isSlotItem = (it: Item) => it.title.trim() === PLACEHOLDER

/** Сайт и рассылка стали форматами: формат и материал, где они вместе с другими площадками, делятся на части —
 *  одна карточка (группа), тот же день и время; главная часть остаётся со своим id, остальные — «id~mail», «id~post».
 *  Уже разделённый план возвращается как есть. */
export function webAndMail(plan: Plan): Plan {
  // письмо теперь называется «Рассылка»
  const renamed = plan.rules.some((r) => r.format === OLD_MAIL) || plan.items.some((it) => it.format === OLD_MAIL)
  const p = !renamed
    ? plan
    : {
        ...plan,
        rules: plan.rules.map((r) => (r.format === OLD_MAIL ? { ...r, format: MAIL } : r)),
        items: plan.items.map((it) => (it.format === OLD_MAIL ? { ...it, format: MAIL } : it)),
      }
  if (!p.rules.some((r) => splits(r.format, r.platforms)) && !p.items.some((it) => splits(it.format, it.platforms))) return p
  const kinds = new Map<string, Map<Part['kind'], string>>() // формат → часть → id формата
  const rules = p.rules.flatMap((r) => {
    const parts = partsOf(r.format, r.platforms)
    const ids = new Map<Part['kind'], string>()
    kinds.set(r.id, ids)
    if (!splits(r.format, r.platforms)) return [r]
    return parts.map((x, i): Rule => {
      const id = i ? `${r.id}~${x.kind}` : r.id
      ids.set(x.kind, id)
      const types = Object.fromEntries(Object.entries(r.types).filter(([k]) => x.platforms.includes(k)))
      const { bank, ...rest } = r
      // название то же: части одного формата отличаются значком формата, а не подписью
      return { ...rest, ...(i ? {} : bank ? { bank } : {}), id, format: x.format, platforms: x.platforms, types, full: !i && r.full }
    })
  })
  const items = p.items.flatMap((it) => {
    if (!splits(it.format, it.platforms)) return [it]
    const parts = partsOf(it.format, it.platforms)
    const ids = kinds.get(it.ruleId)
    // свой id остаётся у части, что совпала с главной частью формата
    const keep = parts.find((x) => ids?.get(x.kind) === it.ruleId) ?? parts[0]
    // без группы части с той же темой и так одна карточка; у слота темы нет — ему группа
    const group = it.group ?? (parts.length > 1 && isSlotItem(it) ? `g~${it.id}` : undefined)
    return [keep, ...parts.filter((x) => x !== keep)].map((x, i): Item => {
      const id = i ? `${it.id}~${x.kind}` : it.id
      const out: Item = { ...it, id, format: x.format, platforms: x.platforms, ruleId: ids?.get(x.kind) ?? it.ruleId, group }
      if (i) {
        if (group) out.derive = it.derive ?? '{title}'
        delete out.note
        const done = it.done?.filter((d) => x.platforms.some((pl) => d === `${it.id}|${pl}`)).map((d) => `${id}|${d.split('|')[1]}`)
        if (done?.length) out.done = done
        else delete out.done
      }
      if (!out.group) delete out.group
      return out
    })
  })
  return { ...p, rules, items }
}

/** Порядок заголовков в ячейке: канал, его разделы в Telegram, его разделы на сайте. */
export function headerOrder(plan: Plan) {
  return plan.channels.flatMap((c) => [c.name, ...c.sections.map((s) => s.name), ...c.sections.map((s) => s.web)])
}

export function headerOf(plan: Plan, it: Item, platform: string) {
  const c = plan.channels.find((x) => x.id === it.channelId)
  const s = c?.sections.find((x) => x.id === it.sectionId)
  if (platform === 'Web' && s) return s.web
  if (platform === 'Telegram' && s) return s.name
  return c?.name ?? it.channelId
}

/** Строки ячейки календаря: заголовок канала, под ним материалы, между каналами пустая строка. */
export function cellLines(plan: Plan, items: Item[], platform: string, order = headerOrder(plan)) {
  const rules = new Map(plan.rules.map((r) => [r.id, r]))
  const rubrics = new Map(plan.rubrics.map((r) => [r.id, r]))
  const time = (it: Item) => timeOf(it, rules.get(it.ruleId))
  const groups = new Map<string, Item[]>()
  for (const it of items) {
    if (!it.platforms.includes(platform)) continue
    const h = headerOf(plan, it, platform)
    groups.set(h, [...(groups.get(h) ?? []), it])
  }
  const lines: { text: string; head?: boolean; item?: Item }[] = []
  for (const h of [...groups.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
    if (lines.length) lines.push({ text: '' })
    lines.push({ text: h, head: true })
    for (const it of [...groups.get(h)!].sort((a, b) => (time(a) < time(b) ? -1 : time(a) > time(b) ? 1 : a.rank - b.rank))) {
      lines.push({ text: `• ${lineOf(rubrics.get(it.rubricId ?? ''), rules.get(it.ruleId), it.title)}`, item: it })
    }
  }
  return lines
}

const csvField = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

export function calendarCSV(plan: Plan): string {
  const byDate = new Map<ISODate, Item[]>()
  for (const it of plan.items) if (it.date) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it])
  const order = headerOrder(plan)
  const rows = [['#', 'День', 'Дата', ...plan.platforms]]
  let n = 1
  for (let d = plan.start; d <= plan.end; d = addDays(d, 1), n++) {
    const items = byDate.get(d) ?? []
    rows.push([String(n), WEEKDAYS[weekday(d)], d, ...plan.platforms.map((p) => cellLines(plan, items, p, order).map((l) => l.text).join('\n'))])
  }
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n'
}

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
