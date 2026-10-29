// Все изменения плана — чистые функции Plan → Plan; reducer добавляет к ним историю
// для отмены. Неизменённые материалы переиспользуются, поэтому снимок истории дешёвый.
import { addDays, daysBetween, fromMin, toMin, weekday } from './dates'
import { FORMAT_HOME, FORMAT_PLATFORMS, isSlot, PLACEHOLDER, rubricKey, rubricName, TEXT_IMAGE, timeOf, type Analytics, type Channel, type ISODate, type Item, type Plan, type Rubric, type Rule } from './types'

let seq = 0
export const newId = (prefix = 'n') => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`

// ── заголовки ────────────────────────────────────────────────────────────────

// Название материала — тема; у тизера, анонсов и писем группы она та же, что у FULL.
const derived = (template: string, head: Item) => template.replace('{title}', head.title).replace('{topic}', head.title)

const ruleOf = (plan: Plan, id: string) => plan.rules.find((r) => r.id === id)

/** Производные члены группы берут у главного заголовок (по шаблону) и рубрику. */
const rederive = (items: Item[], head: Item) =>
  items.map((it) =>
    it.group === head.group && it.date === head.date && it.derive && it.id !== head.id
      ? { ...it, title: derived(it.derive, head), rubricId: head.rubricId }
      : it,
  )

// ── материалы ────────────────────────────────────────────────────────────────

/** Перенос на дату; со временем — вся группа сдвигается на ту же разницу, порядок внутри неё сохраняется. */
export function moveItem(plan: Plan, id: string, date: ISODate, withGroup = true, time?: string): Plan {
  const it = plan.items.find((x) => x.id === id)
  if (!it) return plan
  const shift = time ? toMin(time) - toMin(timeOf(it, ruleOf(plan, it.ruleId))) : 0
  if (it.date === date && !shift) return plan
  const together = withGroup && it.group && it.date ? (x: Item) => x.group === it.group && x.date === it.date : (x: Item) => x.id === id
  // конец, если карточку растягивали, едет вместе с началом — длительность та же
  const at = (x: Item) =>
    shift ? { time: fromMin(toMin(timeOf(x, ruleOf(plan, x.ruleId))) + shift), ...(x.end ? { end: endAt(toMin(x.end) + shift) } : {}) } : {}
  return fitRange({ ...plan, items: plan.items.map((x) => (together(x) ? { ...x, date, ...at(x) } : x)) })
}

/** Карточка материала с группой: группа того же дня, а без группы — сам материал. */
const cardKey = (x: Item) => (x.group && x.date ? `g|${x.group}|${x.date}` : `i|${x.id}`)

/** Много переносов сразу — за один проход (тысячи карточек при сдвиге очереди): каждая карточка с группой — на свою
 *  дату и время; remove — уходят с группой. Это то же, что moveItem и removeItem по очереди, если карточки разные. */
export function moveGroups(plan: Plan, moves: { id: string; date: ISODate; time?: string }[], remove: string[] = []): Plan {
  const rules = new Map(plan.rules.map((r) => [r.id, r]))
  const byId = new Map(plan.items.map((x) => [x.id, x]))
  const go = new Map<string, { date: ISODate; shift: number }>()
  for (const m of moves) {
    const it = byId.get(m.id)
    if (!it) continue
    go.set(cardKey(it), { date: m.date, shift: m.time ? toMin(m.time) - toMin(timeOf(it, rules.get(it.ruleId))) : 0 })
  }
  const gone = new Set(remove.map((id) => byId.get(id)).filter((x): x is Item => !!x).map(cardKey))
  const items: Item[] = []
  for (const x of plan.items) {
    const k = cardKey(x)
    if (gone.has(k)) continue
    const g = go.get(k)
    if (!g) items.push(x)
    else if (!g.shift) items.push({ ...x, date: g.date })
    else items.push({ ...x, date: g.date, time: fromMin(toMin(timeOf(x, rules.get(x.ruleId))) + g.shift), ...(x.end ? { end: endAt(toMin(x.end) + g.shift) } : {}) })
  }
  return fitRange({ ...plan, items })
}

/** Конец блока — не позже полуночи. */
const endAt = (min: number) => (min >= 24 * 60 ? '24:00' : fromMin(min))

/** Если материал встал раньше начала или позже конца плана — план продлевается до него. */
export function fitRange(plan: Plan): Plan {
  let { start, end } = plan
  for (const it of plan.items) {
    if (!it.date) continue
    if (it.date < start) start = it.date
    if (it.date > end) end = it.date
  }
  return start === plan.start && end === plan.end ? plan : { ...plan, start, end }
}

/** Одна правка нескольких материалов — например, статус всей карточки. */
export function updateMany(plan: Plan, ids: string[], patch: Partial<Item>): Plan {
  const set = new Set(ids)
  const next = { ...plan, items: plan.items.map((x) => (set.has(x.id) ? { ...x, ...patch } : x)) }
  return patch.status === 'published' ? fireTriggers(next, set) : next
}

/** Оригинал вышел — версии для других площадок, ждавшие его, становятся задачами «в работе». */
export function fireTriggers(plan: Plan, published: Set<string>): Plan {
  if (!plan.items.some((x) => x.trigger && published.has(x.trigger) && x.status === 'planned')) return plan
  return { ...plan, items: plan.items.map((x) => (x.trigger && published.has(x.trigger) && x.status === 'planned' ? { ...x, status: 'progress' } : x)) }
}

/** Версии материала для других площадок: вместе с оригиналом (в той же карточке) или автоматически —
 *  на следующий день, когда оригинал выйдет. Версия — вне сетки: проверка её не трогает. */
export function addVersions(plan: Plan, id: string, platforms: string[], after: boolean): Plan {
  const it = plan.items.find((x) => x.id === id)
  if (!it || !it.date || !platforms.length) return plan
  const group = after ? undefined : it.group ?? newId('g')
  const versions: Item[] = platforms.map((p) => ({
    id: newId(),
    date: after ? addDays(it.date!, 1) : it.date,
    channelId: it.channelId,
    sectionId: it.sectionId,
    ruleId: it.ruleId,
    rubricId: it.rubricId,
    title: it.title,
    format: it.format,
    platforms: [p],
    status: 'planned',
    source: 'версия',
    rank: it.rank + 1,
    group,
    derive: '{title}',
    offGrid: true,
    ...(after ? { trigger: it.id } : {}),
    ...(it.time ? { time: it.time } : {}),
  }))
  for (const v of versions) for (const k of Object.keys(v) as (keyof Item)[]) if (v[k] === undefined) delete v[k]
  const items = group && !it.group ? plan.items.map((x) => (x.id === id ? { ...x, group } : x)) : plan.items
  return fitRange({ ...plan, items: [...items, ...versions] })
}

export function updateItem(plan: Plan, id: string, patch: Partial<Item>): Plan {
  let head: Item | undefined
  let items = plan.items.map((x) => {
    if (x.id !== id) return x
    head = { ...x, ...patch }
    return head
  })
  if (!head) return plan
  if (head.group && !head.derive && ('title' in patch || 'rubricId' in patch)) items = rederive(items, head)
  const next = { ...plan, items }
  return patch.status === 'published' ? fireTriggers(next, new Set([id])) : next
}

/** Правка из формы: поля, затем дата (с группой или без) — одним шагом истории. */
export function editItem(plan: Plan, id: string, patch: Partial<Item>, date?: ISODate, withGroup = true): Plan {
  const next = updateItem(plan, id, patch)
  return date ? moveItem(next, id, date, withGroup) : fitRange(next)
}

/** Ближайший материал того же правила с группой — образец для новой группы. */
function templateGroup(plan: Plan, ruleId: string, date: ISODate): Item[] {
  const size = new Map<string, number>()
  for (const it of plan.items) if (it.group) size.set(it.group, (size.get(it.group) ?? 0) + 1)
  let best: Item | undefined
  let bestGap = Infinity
  for (const it of plan.items) {
    if (it.ruleId !== ruleId || !it.group || !it.date || it.derive) continue
    // ближе по дате, тот же день недели, и группа, в которой есть что копировать
    const gap = Math.abs(daysBetween(it.date, date)) + (weekday(it.date) === weekday(date) ? 0 : 0.5) +
      (size.get(it.group)! > 1 ? 0 : 10000)
    if (gap < bestGap) {
      best = it
      bestGap = gap
    }
  }
  return best ? plan.items.filter((x) => x.group === best!.group && x.date === best!.date) : []
}

/** Новый материал; with family — копии сопутствующих публикаций по образцу ближайшего. */
export function createItem(plan: Plan, item: Item, withFamily = true): Plan {
  const family = withFamily && item.date ? templateGroup(plan, item.ruleId, item.date) : []
  if (family.length < 2) return fitRange({ ...plan, items: [...plan.items, { ...item, group: undefined }] })
  const group = newId('g')
  const head = { ...item, group }
  const copies = family
    .filter((x) => x.ruleId !== item.ruleId || x.derive)
    .map((x) => ({ ...x, id: newId(), date: item.date, group, status: item.status, source: item.source, origDate: undefined, note: undefined, owner: undefined, due: undefined, done: undefined, offGrid: item.offGrid }))
  return fitRange({ ...plan, items: rederive([...plan.items, head, ...copies], head) })
}

/** Копия материала (с его группой) — на тот же день или на другую дату. */
export function duplicateItem(plan: Plan, id: string, date?: ISODate): Plan {
  const it = plan.items.find((x) => x.id === id)
  if (!it) return plan
  const members = it.group && it.date ? plan.items.filter((x) => x.group === it.group && x.date === it.date) : [it]
  const group = members.length > 1 ? newId('g') : undefined
  const copies = members.map((x) => {
    const c: Item = { ...x, id: newId(), group, origDate: undefined, date: date ?? x.date, status: date ? 'planned' : x.status, done: date ? undefined : x.done }
    if (!c.group) delete c.group
    for (const k of ['origDate', 'done'] as const) if (c[k] === undefined) delete c[k]
    return c
  })
  return fitRange({ ...plan, items: [...plan.items, ...copies] })
}

/** Наверстать: куда встаёт просроченная карточка. Занимает пустой слот — слот (с группой) уходит; вне сетки — с отметкой. */
export interface CatchUpMove {
  id: string
  date: ISODate
  time?: string // своё время слота, если у слота оно было
  slotId?: string
  offGrid?: boolean
}

/** Перенести просроченные карточки, не двигая остальной план: одним шагом истории. */
export function catchUp(plan: Plan, moves: CatchUpMove[]): Plan {
  let next = plan
  for (const m of moves) {
    if (m.slotId) next = removeItem(next, m.slotId, true)
    next = moveItem(next, m.id, m.date, true, m.time)
    if (m.offGrid) next = updateItem(next, m.id, { offGrid: true })
  }
  return next
}

export function removeItem(plan: Plan, id: string, withGroup = true): Plan {
  const it = plan.items.find((x) => x.id === id)
  if (!it) return plan
  const gone = withGroup && it.group && it.date ? (x: Item) => x.group === it.group && x.date === it.date : (x: Item) => x.id === id
  return { ...plan, items: plan.items.filter((x) => !gone(x)) }
}

// ── банк тем ─────────────────────────────────────────────────────────────────

export const bankOf = (plan: Plan, ruleId: string) => plan.items.filter((x) => x.date === null && x.ruleId === ruleId)

export function bankAdd(plan: Plan, ruleId: string, topics: string[]): Plan {
  const rule = ruleOf(plan, ruleId)
  if (!rule) return plan
  const sample = plan.items.find((x) => x.ruleId === ruleId && x.date && !x.derive)
  const add = topics
    .map((t) => t.trim())
    .filter(Boolean)
    .map<Item>((title) => ({
      id: newId('b'),
      date: null,
      channelId: rule.channelId,
      sectionId: rule.sectionId,
      ruleId,
      rubricId: rule.rubricId,
      title,
      format: rule.format,
      platforms: sample?.platforms ?? rule.platforms,
      status: 'planned',
      source: 'банк тем',
      rank: sample?.rank ?? 50,
    }))
  return add.length ? { ...plan, items: [...plan.items, ...add] } : plan
}

/** Переставить тему в банке на место другой темы того же правила. */
export function bankReorder(plan: Plan, id: string, beforeId: string | null): Plan {
  const it = plan.items.find((x) => x.id === id)
  if (!it || id === beforeId) return plan
  const rest = plan.items.filter((x) => x.id !== id)
  const at = beforeId ? rest.findIndex((x) => x.id === beforeId) : rest.length
  rest.splice(at < 0 ? rest.length : at, 0, it)
  return { ...plan, items: rest }
}

const slotsOf = (plan: Plan, ruleId: string, from: ISODate) =>
  plan.items
    .filter((x) => x.ruleId === ruleId && x.date && x.date >= from && !x.derive && isSlot(x))
    .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0))

/** Тема из банка → слот этого правила в этот день, а если слота нет — новый материал. */
export function assignTopic(plan: Plan, bankId: string, date: ISODate): Plan {
  const topic = plan.items.find((x) => x.id === bankId && x.date === null)
  if (!topic) return plan
  const title = topic.title
  const without = { ...plan, items: plan.items.filter((x) => x.id !== bankId) }
  const slot = slotsOf(without, topic.ruleId, date).find((x) => x.date === date)
  if (slot) return updateItem(without, slot.id, { title, source: 'банк тем' })
  return createItem(without, { ...topic, id: newId(), date, title }, true)
}

/** Вернуть тему в банк: материал снова становится слотом «…», тема — в начало банка своего формата. */
export function unassignTopic(plan: Plan, id: string): Plan {
  const it = plan.items.find((x) => x.id === id)
  if (!it || !it.date || isSlot(it) || it.derive) return plan
  const back: Item = { ...it, id: newId('b'), date: null, group: undefined, derive: undefined, origDate: undefined, time: undefined, source: 'банк тем', status: 'planned', done: undefined }
  const next = updateItem(plan, id, { title: PLACEHOLDER, source: 'нужна тема' })
  const first = next.items.findIndex((x) => x.date === null && x.ruleId === it.ruleId)
  const items = [...next.items]
  items.splice(first < 0 ? items.length : first, 0, back)
  return { ...next, items }
}

/** Что встанет куда при «Разложить по слотам»: пары тема → слот, по порядку. */
export function planFill(plan: Plan, ruleId: string, from: ISODate) {
  const bank = bankOf(plan, ruleId)
  const slots = slotsOf(plan, ruleId, from)
  const n = Math.min(bank.length, slots.length)
  return { pairs: bank.slice(0, n).map((b, i) => ({ bank: b, slot: slots[i] })), left: bank.length - n, freeSlots: slots.length }
}

export function fillSlots(plan: Plan, ruleId: string, from: ISODate): Plan {
  let next = plan
  for (const { bank, slot } of planFill(plan, ruleId, from).pairs) {
    next = updateItem(next, slot.id, { title: bank.title, source: 'банк тем' })
    next = { ...next, items: next.items.filter((x) => x.id !== bank.id) }
  }
  return next
}

/** Слоты правила на его дни недели в периоде, где материала этого правила ещё нет. */
export function createSlots(plan: Plan, ruleId: string, from: ISODate, to: ISODate): Plan {
  const rule = ruleOf(plan, ruleId)
  const channel = plan.channels.find((c) => c.id === rule?.channelId)
  if (!rule || !channel) return plan
  const taken = new Set(plan.items.filter((x) => x.ruleId === ruleId && !x.derive && x.date).map((x) => x.date))
  const sample = plan.items.find((x) => x.ruleId === ruleId && x.date && !x.derive)
  let next = plan
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!rule.days[weekday(d)] || taken.has(d) || d < channel.start) continue
    next = createItem(next, {
      id: newId(),
      date: d,
      channelId: rule.channelId,
      sectionId: rule.sectionId,
      ruleId,
      rubricId: rule.rubricId,
      title: PLACEHOLDER,
      format: rule.format,
      platforms: sample?.platforms ?? rule.platforms,
      status: 'planned',
      source: 'нужна тема',
      rank: sample?.rank ?? 50,
    })
  }
  return next
}

// ── рубрики, правила, каналы ─────────────────────────────────────────────────

export const updateRule = (plan: Plan, id: string, patch: Partial<Rule>): Plan => ({
  ...plan,
  rules: plan.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
})

/** Новый формат рубрики в канале; без дней — разовый: периодичность задаётся потом. */
export const addRule = (
  plan: Plan,
  rubricId: string | null,
  channelId: string,
  name: string,
  id = newId('r'),
  days?: boolean[],
  sectionId?: string,
  format = TEXT_IMAGE,
): Plan => {
  const channel = plan.channels.find((c) => c.id === channelId)
  if (!channel || !name.trim() || plan.rules.some((r) => r.id === id)) return plan
  // у сайта и письма площадка своя, у остальных — где формат обычно выходит, если канал там есть
  const where = FORMAT_HOME[format] ? [FORMAT_HOME[format]] : (FORMAT_PLATFORMS[format] ?? []).filter((p) => channel.platforms.includes(p))
  const rule: Rule = {
    id,
    ...(sectionId ? { sectionId } : {}),
    rubricId,
    name: name.trim(),
    channelId,
    channel: channel.name,
    what: '',
    format,
    platforms: where.length ? where : channel.platforms.slice(0, 1),
    days: days ?? [true, true, true, true, true, false, true],
    dayNotes: ['', '', '', '', '', '', ''],
    freq: '',
    source: 'новый формат',
    full: false,
    limit: 1,
    time: '12:00',
    types: {},
  }
  return { ...plan, rules: [...plan.rules, rule] }
}

export const updateRubric = (plan: Plan, id: string, patch: Partial<Rubric>): Plan => ({
  ...plan,
  rubrics: plan.rubrics.map((r) => (r.id === id ? { ...r, ...patch } : r)),
})

/** Новая рубрика; такой уже есть (без «#», без учёта регистра) — план не меняется. */
export const addRubric = (plan: Plan, name: string, what = '', id = newId('k')): Plan => {
  const n = rubricName(name)
  if (!n || plan.rubrics.some((r) => r.id === id || rubricKey(r.name) === rubricKey(n))) return plan
  return { ...plan, rubrics: [...plan.rubrics, { id, name: n, what }] }
}

export const updateChannel = (plan: Plan, id: string, patch: Partial<Channel>): Plan => ({
  ...plan,
  channels: plan.channels.map((c) => (c.id === id ? { ...c, ...patch } : c)),
})

/** Канал — на место to (0 — первым): в фильтрах, дорожках, программе и выгрузке — тот же порядок. */
export const moveChannel = (plan: Plan, id: string, to: number): Plan => {
  const from = plan.channels.findIndex((c) => c.id === id)
  const at = Math.max(0, Math.min(plan.channels.length - 1, to))
  if (from < 0 || from === at) return plan
  const channels = [...plan.channels]
  const [c] = channels.splice(from, 1)
  channels.splice(at, 0, c)
  return { ...plan, channels }
}

/** Строку — рядом с другой: перед ней или после. Порядок тот же, что в дорожках недели, фильтрах и форме. */
export function placeNear<T>(list: T[], key: (x: T) => string, id: string, target: string, after: boolean): T[] {
  const item = list.find((x) => key(x) === id)
  const rest = list.filter((x) => key(x) !== id)
  const at = rest.findIndex((x) => key(x) === target)
  if (!item || at < 0) return list
  rest.splice(at + (after ? 1 : 0), 0, item)
  return rest.every((x, i) => x === list[i]) ? list : rest
}
export type Order = 'channels' | 'rubrics' | 'platforms'
/** Дорожку «Каналов», «Тем» или «Площадок» — выше или ниже: перед другой или после неё. */
export const reorder = (plan: Plan, what: Order, id: string, target: string, after: boolean): Plan => {
  const next =
    what === 'channels'
      ? { channels: placeNear(plan.channels, (c) => c.id, id, target, after) }
      : what === 'rubrics'
        ? { rubrics: placeNear(plan.rubrics, (r) => r.id, id, target, after) }
        : { platforms: placeNear(plan.platforms, (p) => p, id, target, after) }
  const [k, v] = Object.entries(next)[0] as [Order, unknown]
  return v === plan[k] ? plan : { ...plan, ...next }
}

/** Что уйдёт вместе с каналом: его форматы и материалы — и материалы других каналов по этим форматам. */
export function channelParts(plan: Plan, id: string) {
  const rules = new Set(plan.rules.filter((r) => r.channelId === id).map((r) => r.id))
  return { rules, items: plan.items.filter((it) => it.channelId === id || rules.has(it.ruleId)) }
}

/** Удалить канал вместе с его форматами и материалами; последний канал не удаляется. */
export const removeChannel = (plan: Plan, id: string): Plan => {
  if (plan.channels.length <= 1 || !plan.channels.some((c) => c.id === id)) return plan
  const { rules, items } = channelParts(plan, id)
  const gone = new Set(items.map((it) => it.id))
  return {
    ...plan,
    channels: plan.channels.filter((c) => c.id !== id),
    rules: plan.rules.filter((r) => !rules.has(r.id)),
    items: plan.items.filter((it) => !gone.has(it.id)),
  }
}

const COLORS = ['#8854f3', '#0a84ff', '#30b0c7', '#34c759', '#ff9f0a', '#ff375f', '#5e5ce6', '#a2845e']

/** Новый канал: на всех площадках плана (лишние снимаются в форме), цвет — следующий свободный. */
export const addChannel = (plan: Plan, name: string, start: ISODate, id = newId('c')): Plan => {
  const n = name.trim()
  if (!n || plan.channels.some((c) => c.name.toLowerCase() === n.toLowerCase())) return plan
  const color = COLORS.find((c) => !plan.channels.some((x) => x.color.toLowerCase() === c)) ?? COLORS[plan.channels.length % COLORS.length]
  const channel: Channel = { id, name: n, color, start, platforms: [...plan.platforms], sections: [] }
  return { ...plan, channels: [...plan.channels, channel] }
}

/** Новая площадка: в плане и у всех каналов — выбирают её в форме. */
export const addPlatform = (plan: Plan, name: string): Plan => {
  const n = name.trim()
  if (!n || plan.platforms.some((p) => p.toLowerCase() === n.toLowerCase())) return plan
  return { ...plan, platforms: [...plan.platforms, n], channels: plan.channels.map((c) => ({ ...c, platforms: [...c.platforms, n] })) }
}

// ── reducer с историей ───────────────────────────────────────────────────────

export type Action =
  | { type: 'init'; plan: Plan }
  | { type: 'replace'; plan: Plan }
  | { type: 'move'; id: string; date: ISODate; withGroup?: boolean; time?: string }
  | { type: 'update'; id: string; patch: Partial<Item> }
  | { type: 'updateMany'; ids: string[]; patch: Partial<Item> }
  | { type: 'unassign'; id: string }
  | { type: 'edit'; id: string; patch: Partial<Item>; date?: ISODate; withGroup?: boolean }
  | { type: 'create'; item: Item; withFamily?: boolean }
  | { type: 'duplicate'; id: string; date?: ISODate }
  | { type: 'versions'; id: string; platforms: string[]; after: boolean }
  | { type: 'batch'; actions: Action[] } // несколько правок — одним шагом истории
  | { type: 'remove'; id: string; withGroup?: boolean }
  | { type: 'bankAdd'; ruleId: string; topics: string[] }
  | { type: 'bankReorder'; id: string; beforeId: string | null }
  | { type: 'assign'; bankId: string; date: ISODate }
  | { type: 'fillSlots'; ruleId: string; from: ISODate }
  | { type: 'createSlots'; ruleId: string; from: ISODate; to: ISODate }
  | { type: 'rule'; id: string; patch: Partial<Rule> }
  | { type: 'addRule'; rubricId: string | null; channelId: string; name: string; id?: string; days?: boolean[]; sectionId?: string; format?: string }
  | { type: 'rubric'; id: string; patch: Partial<Rubric> }
  | { type: 'addRubric'; name: string; what?: string; id?: string }
  | { type: 'channel'; id: string; patch: Partial<Channel> }
  | { type: 'addChannel'; name: string; start: ISODate; id?: string }
  | { type: 'removeChannel'; id: string }
  | { type: 'moveChannel'; id: string; to: number }
  | { type: 'reorder'; what: Order; id: string; target: string; after: boolean }
  | { type: 'analytics'; patch: Partial<Analytics> }
  | { type: 'catchUp'; moves: CatchUpMove[] }
  | { type: 'moveGroups'; moves: { id: string; date: ISODate; time?: string }[]; remove?: string[] }
  | { type: 'addPlatform'; name: string }
  | { type: 'undo' }
  | { type: 'redo' }

export interface State {
  plan: Plan | null
  past: Plan[]
  future: Plan[]
}

export const HISTORY = 100
export const initialState: State = { plan: null, past: [], future: [] }

function apply(plan: Plan, a: Action): Plan {
  switch (a.type) {
    case 'replace': return a.plan
    case 'move': return moveItem(plan, a.id, a.date, a.withGroup ?? true, a.time)
    case 'update': return updateItem(plan, a.id, a.patch)
    case 'updateMany': return updateMany(plan, a.ids, a.patch)
    case 'unassign': return unassignTopic(plan, a.id)
    case 'edit': return editItem(plan, a.id, a.patch, a.date, a.withGroup ?? true)
    case 'create': return createItem(plan, a.item, a.withFamily ?? true)
    case 'duplicate': return duplicateItem(plan, a.id, a.date)
    case 'versions': return addVersions(plan, a.id, a.platforms, a.after)
    case 'batch': return a.actions.reduce(apply, plan)
    case 'remove': return removeItem(plan, a.id, a.withGroup ?? true)
    case 'bankAdd': return bankAdd(plan, a.ruleId, a.topics)
    case 'bankReorder': return bankReorder(plan, a.id, a.beforeId)
    case 'assign': return assignTopic(plan, a.bankId, a.date)
    case 'fillSlots': return fillSlots(plan, a.ruleId, a.from)
    case 'createSlots': return createSlots(plan, a.ruleId, a.from, a.to)
    case 'rule': return updateRule(plan, a.id, a.patch)
    case 'addRule': return addRule(plan, a.rubricId, a.channelId, a.name, a.id, a.days, a.sectionId, a.format)
    case 'rubric': return updateRubric(plan, a.id, a.patch)
    case 'addRubric': return addRubric(plan, a.name, a.what, a.id)
    case 'channel': return updateChannel(plan, a.id, a.patch)
    case 'addChannel': return addChannel(plan, a.name, a.start, a.id)
    case 'removeChannel': return removeChannel(plan, a.id)
    case 'moveChannel': return moveChannel(plan, a.id, a.to)
    case 'reorder': return reorder(plan, a.what, a.id, a.target, a.after)
    case 'analytics': return { ...plan, analytics: { competitors: [], ...plan.analytics, ...a.patch } }
    case 'catchUp': return catchUp(plan, a.moves)
    case 'moveGroups': return moveGroups(plan, a.moves, a.remove)
    case 'addPlatform': return addPlatform(plan, a.name)
    default: return plan
  }
}

export function reducer(state: State, a: Action): State {
  if (a.type === 'init') return { plan: a.plan, past: [], future: [] }
  if (!state.plan) return state
  if (a.type === 'undo') {
    const prev = state.past[state.past.length - 1]
    return prev ? { plan: prev, past: state.past.slice(0, -1), future: [state.plan, ...state.future] } : state
  }
  if (a.type === 'redo') {
    const [next, ...future] = state.future
    return next ? { plan: next, past: [...state.past, state.plan], future } : state
  }
  const plan = apply(state.plan, a)
  if (plan === state.plan) return state
  return { plan, past: [...state.past, state.plan].slice(-HISTORY), future: [] }
}
