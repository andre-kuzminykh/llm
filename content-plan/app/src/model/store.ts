// Все изменения плана — чистые функции Plan → Plan; reducer добавляет к ним историю
// для отмены. Неизменённые материалы переиспользуются, поэтому снимок истории дешёвый.
import { addDays, daysBetween, weekday } from './dates'
import { isSlot, PLACEHOLDER, type Channel, type ISODate, type Item, type Plan, type Rubric } from './types'

let seq = 0
export const newId = (prefix = 'n') => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`

// ── заголовки ────────────────────────────────────────────────────────────────

/** Тема заголовка: «Демо / Стратегия» → «Стратегия», «Разборы: HR» → «HR». */
export const topicOf = (title: string) => {
  const m = title.match(/^[^/:]+?(?: \/ |: )(.+)$/)
  return m ? m[1] : title
}

export const titleFromTopic = (rubric: Rubric | undefined, topic: string) =>
  rubric?.pattern ? rubric.pattern.replace('{topic}', topic) : topic

export const slotTitle = (rubric: Rubric) =>
  rubric.pattern ? titleFromTopic(rubric, PLACEHOLDER) : `${rubric.name}: ${PLACEHOLDER}`

const derived = (template: string, head: Item) =>
  template.replace('{title}', head.title).replace('{topic}', topicOf(head.title))

/** Главный материал группы — тот, от которого собираются остальные. */
export const headOf = (items: Item[], group: string) => {
  const members = items.filter((it) => it.group === group)
  return members.find((it) => !it.derive && members.some((m) => m.derive)) ?? members.find((it) => !it.derive)
}

const rubricOf = (plan: Plan, id: string) => plan.rubrics.find((r) => r.id === id)

const rederive = (items: Item[], head: Item) =>
  items.map((it) =>
    it.group === head.group && it.derive && it.id !== head.id ? { ...it, title: derived(it.derive, head) } : it,
  )

// ── материалы ────────────────────────────────────────────────────────────────

export function moveItem(plan: Plan, id: string, date: ISODate, withGroup = true): Plan {
  const it = plan.items.find((x) => x.id === id)
  if (!it || it.date === date) return plan
  const together = withGroup && it.group && it.date ? (x: Item) => x.group === it.group && x.date === it.date : (x: Item) => x.id === id
  return { ...plan, items: plan.items.map((x) => (together(x) ? { ...x, date } : x)) }
}

export function updateItem(plan: Plan, id: string, patch: Partial<Item>): Plan {
  let head: Item | undefined
  let items = plan.items.map((x) => {
    if (x.id !== id) return x
    head = { ...x, ...patch }
    return head
  })
  if (!head) return plan
  if (head.group && !head.derive && 'title' in patch) items = rederive(items, head)
  return { ...plan, items }
}

/** Правка из формы: поля, затем дата (с группой или без) — одним шагом истории. */
export function editItem(plan: Plan, id: string, patch: Partial<Item>, date?: ISODate, withGroup = true): Plan {
  const next = updateItem(plan, id, patch)
  return date ? moveItem(next, id, date, withGroup) : next
}

/** Ближайший материал рубрики с группой — образец для новой группы. */
function templateGroup(plan: Plan, rubricId: string, date: ISODate): Item[] {
  const size = new Map<string, number>()
  for (const it of plan.items) if (it.group) size.set(it.group, (size.get(it.group) ?? 0) + 1)
  let best: Item | undefined
  let bestGap = Infinity
  for (const it of plan.items) {
    if (it.rubricId !== rubricId || !it.group || !it.date || it.derive) continue
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
  const family = withFamily && item.date ? templateGroup(plan, item.rubricId, item.date) : []
  if (family.length < 2) return { ...plan, items: [...plan.items, { ...item, group: undefined }] }
  const group = newId('g')
  const head = { ...item, group }
  const copies = family
    .filter((x) => x.rubricId !== item.rubricId || x.derive)
    .map((x) => ({ ...x, id: newId(), date: item.date, group, status: item.status, source: item.source, origDate: undefined, note: undefined }))
  return { ...plan, items: rederive([...plan.items, head, ...copies], head) }
}

export function duplicateItem(plan: Plan, id: string): Plan {
  const it = plan.items.find((x) => x.id === id)
  if (!it) return plan
  const members = it.group && it.date ? plan.items.filter((x) => x.group === it.group && x.date === it.date) : [it]
  const group = members.length > 1 ? newId('g') : undefined
  const copies = members.map((x) => ({ ...x, id: newId(), group, origDate: undefined }))
  return { ...plan, items: [...plan.items, ...copies] }
}

export function removeItem(plan: Plan, id: string, withGroup = true): Plan {
  const it = plan.items.find((x) => x.id === id)
  if (!it) return plan
  const gone = withGroup && it.group && it.date ? (x: Item) => x.group === it.group && x.date === it.date : (x: Item) => x.id === id
  return { ...plan, items: plan.items.filter((x) => !gone(x)) }
}

// ── банк тем ─────────────────────────────────────────────────────────────────

export const bankOf = (plan: Plan, rubricId: string) =>
  plan.items.filter((x) => x.date === null && x.rubricId === rubricId)

export function bankAdd(plan: Plan, rubricId: string, topics: string[]): Plan {
  const rubric = rubricOf(plan, rubricId)
  if (!rubric) return plan
  const sample = plan.items.find((x) => x.rubricId === rubricId && x.date && !x.derive)
  const add = topics
    .map((t) => t.trim())
    .filter(Boolean)
    .map<Item>((title) => ({
      id: newId('b'),
      date: null,
      channelId: rubric.channelId,
      sectionId: rubric.sectionId,
      rubricId,
      title,
      format: rubric.format,
      platforms: sample?.platforms ?? rubric.platforms,
      status: 'planned',
      source: 'банк тем',
      rank: sample?.rank ?? 50,
    }))
  return add.length ? { ...plan, items: [...plan.items, ...add] } : plan
}

/** Переставить тему в банке на место другой темы той же рубрики. */
export function bankReorder(plan: Plan, id: string, beforeId: string | null): Plan {
  const it = plan.items.find((x) => x.id === id)
  if (!it || id === beforeId) return plan
  const rest = plan.items.filter((x) => x.id !== id)
  const at = beforeId ? rest.findIndex((x) => x.id === beforeId) : rest.length
  rest.splice(at < 0 ? rest.length : at, 0, it)
  return { ...plan, items: rest }
}

const slotsOf = (plan: Plan, rubricId: string, from: ISODate) =>
  plan.items
    .filter((x) => x.rubricId === rubricId && x.date && x.date >= from && !x.derive && isSlot(x))
    .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0))

/** Тема из банка → слот этой рубрики в этот день, а если слота нет — новый материал. */
export function assignTopic(plan: Plan, bankId: string, date: ISODate): Plan {
  const topic = plan.items.find((x) => x.id === bankId && x.date === null)
  if (!topic) return plan
  const rubric = rubricOf(plan, topic.rubricId)
  const title = titleFromTopic(rubric, topic.title)
  const without = { ...plan, items: plan.items.filter((x) => x.id !== bankId) }
  const slot = slotsOf(without, topic.rubricId, date).find((x) => x.date === date)
  if (slot) return updateItem(without, slot.id, { title, source: 'банк тем' })
  return createItem(without, { ...topic, id: newId(), date, title }, true)
}

/** Что встанет куда при «Разложить по слотам»: пары тема → слот, по порядку. */
export function planFill(plan: Plan, rubricId: string, from: ISODate) {
  const bank = bankOf(plan, rubricId)
  const slots = slotsOf(plan, rubricId, from)
  const n = Math.min(bank.length, slots.length)
  return { pairs: bank.slice(0, n).map((b, i) => ({ bank: b, slot: slots[i] })), left: bank.length - n, freeSlots: slots.length }
}

export function fillSlots(plan: Plan, rubricId: string, from: ISODate): Plan {
  const rubric = rubricOf(plan, rubricId)
  let next = plan
  for (const { bank, slot } of planFill(plan, rubricId, from).pairs) {
    next = updateItem(next, slot.id, { title: titleFromTopic(rubric, bank.title), source: 'банк тем' })
    next = { ...next, items: next.items.filter((x) => x.id !== bank.id) }
  }
  return next
}

/** Слоты рубрики на её дни недели в периоде, где материала этой рубрики ещё нет. */
export function createSlots(plan: Plan, rubricId: string, from: ISODate, to: ISODate): Plan {
  const rubric = rubricOf(plan, rubricId)
  const channel = plan.channels.find((c) => c.id === rubric?.channelId)
  if (!rubric || !channel) return plan
  const taken = new Set(plan.items.filter((x) => x.rubricId === rubricId && !x.derive && x.date).map((x) => x.date))
  const sample = plan.items.find((x) => x.rubricId === rubricId && x.date && !x.derive)
  let next = plan
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!rubric.days[weekday(d)] || taken.has(d) || d < channel.start) continue
    next = createItem(next, {
      id: newId(),
      date: d,
      channelId: rubric.channelId,
      sectionId: rubric.sectionId,
      rubricId,
      title: slotTitle(rubric),
      format: rubric.format,
      platforms: sample?.platforms ?? rubric.platforms,
      status: 'planned',
      source: 'нужна тема',
      rank: sample?.rank ?? 50,
    })
  }
  return next
}

// ── сетка и каналы ───────────────────────────────────────────────────────────

export const updateRubric = (plan: Plan, id: string, patch: Partial<Rubric>): Plan => ({
  ...plan,
  rubrics: plan.rubrics.map((r) => (r.id === id ? { ...r, ...patch } : r)),
})

export const addRubric = (plan: Plan, channelId: string, name: string): Plan => {
  const channel = plan.channels.find((c) => c.id === channelId)
  if (!channel || !name.trim()) return plan
  const rubric: Rubric = {
    id: newId('r'),
    channelId,
    channel: channel.name,
    name: name.trim(),
    what: '',
    format: 'Пост',
    platforms: channel.platforms.slice(0, 1),
    days: [true, true, true, true, true, false, true],
    dayNotes: ['', '', '', '', '', '', ''],
    freq: '',
    source: 'новая рубрика',
    full: false,
    limit: 1,
  }
  return { ...plan, rubrics: [...plan.rubrics, rubric] }
}

export const updateChannel = (plan: Plan, id: string, patch: Partial<Channel>): Plan => ({
  ...plan,
  channels: plan.channels.map((c) => (c.id === id ? { ...c, ...patch } : c)),
})

export const addChannel = (plan: Plan, name: string, start: ISODate): Plan => {
  if (!name.trim()) return plan
  const channel: Channel = { id: newId('c'), name: name.trim(), color: '#8854f3', start, platforms: ['Telegram'], sections: [] }
  return { ...plan, channels: [...plan.channels, channel] }
}

// ── reducer с историей ───────────────────────────────────────────────────────

export type Action =
  | { type: 'init'; plan: Plan }
  | { type: 'replace'; plan: Plan }
  | { type: 'move'; id: string; date: ISODate; withGroup?: boolean }
  | { type: 'update'; id: string; patch: Partial<Item> }
  | { type: 'edit'; id: string; patch: Partial<Item>; date?: ISODate; withGroup?: boolean }
  | { type: 'create'; item: Item; withFamily?: boolean }
  | { type: 'duplicate'; id: string }
  | { type: 'remove'; id: string; withGroup?: boolean }
  | { type: 'bankAdd'; rubricId: string; topics: string[] }
  | { type: 'bankReorder'; id: string; beforeId: string | null }
  | { type: 'assign'; bankId: string; date: ISODate }
  | { type: 'fillSlots'; rubricId: string; from: ISODate }
  | { type: 'createSlots'; rubricId: string; from: ISODate; to: ISODate }
  | { type: 'rubric'; id: string; patch: Partial<Rubric> }
  | { type: 'addRubric'; channelId: string; name: string }
  | { type: 'channel'; id: string; patch: Partial<Channel> }
  | { type: 'addChannel'; name: string; start: ISODate }
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
    case 'move': return moveItem(plan, a.id, a.date, a.withGroup ?? true)
    case 'update': return updateItem(plan, a.id, a.patch)
    case 'edit': return editItem(plan, a.id, a.patch, a.date, a.withGroup ?? true)
    case 'create': return createItem(plan, a.item, a.withFamily ?? true)
    case 'duplicate': return duplicateItem(plan, a.id)
    case 'remove': return removeItem(plan, a.id, a.withGroup ?? true)
    case 'bankAdd': return bankAdd(plan, a.rubricId, a.topics)
    case 'bankReorder': return bankReorder(plan, a.id, a.beforeId)
    case 'assign': return assignTopic(plan, a.bankId, a.date)
    case 'fillSlots': return fillSlots(plan, a.rubricId, a.from)
    case 'createSlots': return createSlots(plan, a.rubricId, a.from, a.to)
    case 'rubric': return updateRubric(plan, a.id, a.patch)
    case 'addRubric': return addRubric(plan, a.channelId, a.name)
    case 'channel': return updateChannel(plan, a.id, a.patch)
    case 'addChannel': return addChannel(plan, a.name, a.start)
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
