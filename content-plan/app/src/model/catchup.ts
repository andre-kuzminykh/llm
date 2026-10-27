// Наверстать и перенести период, не ломая остальной план.
// Наверстать: просроченное — дата прошла, а «Вышло» не отмечено — встаёт в ближайший пустой слот того же формата
// (слот уходит); нет слота — на ближайший день, где проверка сетки ничего не отметит; нет и такого — на ближайший день
// «вне сетки», не больше одной лишней карточки формата в день.
// Перенести период (отпуск): «очередь» — темы с этих дней встают в следующие слоты своего формата, за ними сдвигается вся
// очередь, сетка на месте, в периоде пусто; «в свободные места» — материалы периода — как при «Наверстать», после периода.
// Ежедневные авто-публикации и потоки 24/7 не переносятся: они выходят сами.
import { addDays, daysBetween } from './dates'
import { AUTO_RULES, indexByDate } from './filters'
import { moveHint } from './hint'
import { catchUp, moveGroups, removeItem, type Action, type CatchUpMove } from './store'
import { isSlot, timeOf, type ISODate, type Item, type Plan } from './types'

export type CatchUpHow = 'slot' | 'free' | 'off' | 'queue' | 'later' | 'group'

export interface CatchUpStep extends CatchUpMove {
  from: ISODate
  how: CatchUpHow
}

const HORIZON = 21 // дней вперёд, где ищем пустой слот и свободный по сетке день: дальше — уже не «наверстать»

const movable = (plan: Plan) => {
  const fixed = new Set(plan.rules.filter((r) => r.stream || AUTO_RULES.has(r.id)).map((r) => r.id))
  return (it: Item) => !!it.date && !it.derive && it.status !== 'published' && !fixed.has(it.ruleId)
}

/** Просроченные карточки (главные материалы с темой), старые — первыми. */
export function overdueOf(plan: Plan, today: ISODate): Item[] {
  const ok = movable(plan)
  return plan.items.filter((it) => ok(it) && it.date! < today && !isSlot(it)).sort((a, b) => a.date!.localeCompare(b.date!) || a.rank - b.rank)
}

/** Куда встанет каждая карточка, начиная с from: по очереди, на плане после предыдущих переносов.
 *  Уехавшая с группой другой карточки — «вместе со своей группой»; карточки с датой не раньше from, тизеры и анонсы
 *  (едут со своим FULL), слоты и вышедшее — пропускаются. */
export function catchUpPlan(plan: Plan, ids: string[], from: ISODate): CatchUpStep[] {
  let p = plan
  const ok = movable(plan)
  const out: CatchUpStep[] = []
  const extra = new Set<string>() // формат|день — уже стоит лишняя карточка вне сетки
  for (const id of ids) {
    const it = p.items.find((x) => x.id === id)
    if (!it || !ok(it) || isSlot(it)) continue
    const orig = plan.items.find((x) => x.id === id)?.date
    if (it.date! >= from) {
      if (orig && orig < from) out.push({ id, date: it.date!, from: orig, how: 'group' }) // уехала с группой другой карточки
      continue
    }
    const was = it.date!
    let step: CatchUpStep | undefined
    const until = addDays(from, HORIZON - 1)
    const slot = p.items
      .filter((x) => x.ruleId === it.ruleId && x.date && x.date >= from && x.date <= until && !x.derive && isSlot(x) && x.status === 'planned')
      .sort((a, b) => a.date!.localeCompare(b.date!))[0]
    if (slot) step = { id, date: slot.date!, time: slot.time, slotId: slot.id, from: was, how: 'slot' }
    if (!step) {
      const byDate = indexByDate(p)
      for (let i = 0; i < HORIZON && !step; i++) {
        const date = addDays(from, i)
        if (!moveHint(p, byDate, [{ id, date }], from).some((l) => l.warn)) step = { id, date, from: was, how: 'free' }
      }
    }
    if (!step) {
      let date = from
      while (extra.has(`${it.ruleId}|${date}`)) date = addDays(date, 1)
      extra.add(`${it.ruleId}|${date}`)
      step = { id, date, offGrid: true, from: was, how: 'off' }
    }
    p = catchUp(p, [step])
    out.push(step)
  }
  return out
}

export type PeriodMode = 'queue' | 'free'

export interface PeriodResult {
  plan: Plan // план после переноса — для предпросмотра
  moved: CatchUpStep[]
  cleared: number // пустых слотов в периоде убрано
  actions: Action[] // те же правки — одним шагом истории (batch)
}

/** Перенести всё запланированное из периода [from, to] выбранных каналов, чтобы в нём ничего не выходило. */
export function shiftPeriod(plan: Plan, from: ISODate, to: ISODate, channels: string[], mode: PeriodMode): PeriodResult {
  if (to < from) return { plan, moved: [], cleared: 0, actions: [] }
  const ok = movable(plan)
  const inChannels = (it: Item) => channels.includes(it.channelId)
  const inPeriod = (it: Item) => ok(it) && inChannels(it) && it.date! >= from && it.date! <= to
  if (mode === 'free') {
    const ids = plan.items.filter((it) => inPeriod(it) && !isSlot(it)).sort((a, b) => a.date!.localeCompare(b.date!) || a.rank - b.rank).map((x) => x.id)
    const moved = catchUpPlan(plan, ids, addDays(to, 1))
    let p = catchUp(plan, moved.filter((m) => m.how !== 'group'))
    const go = moved.filter((m) => m.how !== 'group') // уехавшие с группой двигать не нужно
    const actions: Action[] = go.length ? [{ type: 'catchUp', moves: go }] : []
    // пустые слоты периода — убрать: в отпуске ничего не выходит и тем не просит
    const empty = p.items.filter((it) => inPeriod(it) && isSlot(it))
    for (const it of empty) {
      p = removeItem(p, it.id, true)
      actions.push({ type: 'remove', id: it.id, withGroup: true })
    }
    return { plan: p, moved, cleared: empty.length, actions }
  }
  // очередь: у каждого формата карточки с from по порядку встают на место той, что на N позиций дальше,
  // где N — сколько карточек формата было в периоде; последние — за конец сетки на длину периода, пустые — убираются.
  // Места считаются по плану до переноса, а применяется всё одним проходом. Карточка, которую уже везёт группа
  // другого формата (FULL «Новости» и дайджест в письме), второй раз не двигается.
  const days = daysBetween(from, to) + 1
  const rules = new Map(plan.rules.map((r) => [r.id, r]))
  const key = (x: Item) => (x.group ? `g|${x.group}|${x.date}` : `i|${x.id}`)
  const taken = new Set<string>()
  const moves: { id: string; date: ISODate; time?: string }[] = []
  const remove: string[] = []
  const moved: CatchUpStep[] = []
  for (const rule of plan.rules) {
    const line = plan.items
      .filter((it) => it.ruleId === rule.id && ok(it) && inChannels(it) && it.date! >= from && !taken.has(key(it)))
      .sort((a, b) => a.date!.localeCompare(b.date!) || timeOf(a, rule).localeCompare(timeOf(b, rule)) || a.rank - b.rank)
    const n = line.filter((it) => it.date! <= to).length
    if (!n) continue
    const grid = rule.days.some(Boolean)
    line.forEach((it, k) => {
      if (!grid && it.date! > to) return // разовые после периода остаются
      taken.add(key(it))
      const next = grid ? line[k + n] : undefined
      if (next) {
        const time = timeOf(next, rules.get(next.ruleId))
        moves.push({ id: it.id, date: next.date!, time })
        moved.push({ id: it.id, date: next.date!, time, from: it.date!, how: 'queue' })
      } else if (isSlot(it)) remove.push(it.id)
      else {
        const date = addDays(it.date!, days)
        moves.push({ id: it.id, date })
        moved.push({ id: it.id, date, from: it.date!, how: 'later' })
      }
    })
  }
  const actions: Action[] = moves.length || remove.length ? [{ type: 'moveGroups', moves, remove }] : []
  return { plan: moveGroups(plan, moves, remove), moved, cleared: remove.length, actions }
}

