// Расписание — рубрики по каналам и категориям: в какие дни (и недели 4-недельного цикла) и во сколько выходят.
// Это как таблица владельца: канал × категория (длинное видео, короткое, блог, пост) × день недели → «10:00 Технологии».
// Рубрика в расписании стоит навсегда, пока её не убрали: слоты «Нужна тема» ставятся сами — план держит их на год вперёд
// и продлевает при каждом открытии; тему, заметку и файлы в слот вписывает человек.
import { addDays, daysBetween, today as todayOf, weekday } from './dates'
import { FULL_VIDEO, MAIL, PLACEHOLDER, SHORT_VIDEO, TEXT_IMAGE, WEB_PAGE, type ISODate, type Item, type Plan, type Rule } from './types'

/** Сколько недель в цикле: I, II, III, IV — и снова I. */
export const CYCLE = 4
export const WEEK_NAMES = ['I', 'II', 'III', 'IV']
/** На сколько дней вперёд стоят слоты. */
export const HORIZON = 365
/** Откуда слоты: так материал помечен, чтобы отличить от вписанного руками. */
export const SCHEDULE_SOURCE = 'расписание'

/** Категории — как в таблице владельца; в программе это форматы. */
export const CATEGORIES: { format: string; label: string }[] = [
  { format: FULL_VIDEO, label: 'Длинное видео' },
  { format: SHORT_VIDEO, label: 'Короткое видео' },
  { format: WEB_PAGE, label: 'Блог' },
  { format: TEXT_IMAGE, label: 'Пост' },
  { format: MAIL, label: 'Рассылка' },
]
export const categoryOf = (format: string) => CATEGORIES.find((c) => c.format === format)?.label ?? format

/** Неделя цикла для даты: 1–4; неделя I начинается в plan.cycleStart (у плана Датаиста — воскресенье 15 ноября). */
export function cycleWeek(plan: Pick<Plan, 'cycleStart' | 'start'>, date: ISODate): number {
  const n = Math.floor(daysBetween(plan.cycleStart ?? plan.start, date) / 7)
  return (((n % CYCLE) + CYCLE) % CYCLE) + 1
}

/** Выходит ли рубрика в этот день: день недели, неделя цикла, не раньше начала расписания и старта канала. */
export function onSchedule(plan: Plan, rule: Rule, date: ISODate): boolean {
  if (!rule.days[weekday(date)]) return false
  if (rule.weeks?.length && !rule.weeks.includes(cycleWeek(plan, date))) return false
  const channel = plan.channels.find((c) => c.id === rule.channelId)
  return date >= (plan.cycleStart ?? plan.start) && (!channel || date >= channel.start)
}

/** Пустой слот: тема ещё не вписана, ни заметки, ни файлов, ни черновика — его можно убрать или переставить. */
export const emptySlot = (it: Item) => it.title.trim() === PLACEHOLDER && it.status === 'planned' && !it.note && !it.files?.length && !it.images?.length && !it.draft

const slotOf = (rule: Rule, date: ISODate): Item => ({
  id: `s-${rule.id}-${date}`,
  date,
  channelId: rule.channelId,
  ruleId: rule.id,
  rubricId: rule.rubricId,
  title: PLACEHOLDER,
  format: rule.format,
  platforms: rule.platforms,
  status: 'planned',
  source: SCHEDULE_SOURCE,
  rank: 50,
})

/** Слоты расписания в периоде: где рубрика выходит, а материала её формата нет, — слот; пустые слоты не по расписанию
 *  (поменяли дни, неделю или убрали рубрику) — убираются. Вписанное руками не трогается. */
export function syncSchedule(plan: Plan, from: ISODate, to: ISODate, only?: Set<string>): Plan {
  const rules = plan.rules.filter((r) => r.scheduled && (!only || only.has(r.id)))
  const ids = new Set(rules.map((r) => r.id))
  const byId = new Map(rules.map((r) => [r.id, r]))
  const taken = new Set<string>()
  const keep: Item[] = []
  let removed = 0
  for (const it of plan.items) {
    const r = it.date && it.date >= from && it.date <= to ? byId.get(it.ruleId) : undefined
    if (r && emptySlot(it) && !onSchedule(plan, r, it.date!)) {
      removed++
      continue
    }
    if (it.date && ids.has(it.ruleId)) taken.add(`${it.ruleId}|${it.date}`)
    keep.push(it)
  }
  const added: Item[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const r of rules) if (onSchedule(plan, r, d) && !taken.has(`${r.id}|${d}`)) added.push(slotOf(r, d))
  }
  if (!removed && !added.length) return plan
  return { ...plan, items: [...keep, ...added] }
}

/** Расписание навсегда: слоты стоят на год вперёд от сегодня; прошло время — план сам дописывает следующие дни. */
export function extendSchedule(plan: Plan, today: ISODate = todayOf()): Plan {
  if (!plan.rules.some((r) => r.scheduled)) return plan
  const horizon = addDays(today, HORIZON)
  if (plan.end >= horizon) return plan
  return { ...syncSchedule(plan, addDays(plan.end, 1), horizon), end: horizon }
}

/** С какого дня правка расписания меняет слоты: с сегодня, а до начала плана — с его начала. */
const fromToday = (plan: Plan, today: ISODate) => (today > (plan.cycleStart ?? plan.start) ? today : plan.cycleStart ?? plan.start)

/** Поставить или поправить рубрику в расписании: дни, недели, время; слоты с сегодня — по новому расписанию. */
export function scheduleRule(plan: Plan, rule: Rule, today: ISODate = todayOf()): Plan {
  const next: Rule = { ...rule, scheduled: true }
  const rules = plan.rules.some((r) => r.id === rule.id) ? plan.rules.map((r) => (r.id === rule.id ? next : r)) : [...plan.rules, next]
  // слоты без своего времени идут за правилом; формат и площадки — тоже за правилом
  const items = plan.items.map((it) => (it.ruleId === rule.id && emptySlot(it) ? { ...it, format: next.format, platforms: next.platforms, channelId: next.channelId, rubricId: next.rubricId } : it))
  return syncSchedule({ ...plan, rules, items }, fromToday(plan, today), plan.end, new Set([rule.id]))
}

/** Убрать рубрику из расписания: будущие пустые слоты уходят; вписанное остаётся в календаре разовым. */
export function unscheduleRule(plan: Plan, id: string, today: ISODate = todayOf()): Plan {
  const from = fromToday(plan, today)
  const items: Item[] = []
  for (const it of plan.items) {
    if (it.ruleId !== id) items.push(it)
    else if (it.date && it.date >= from && emptySlot(it)) continue
    else items.push({ ...it, ruleId: '', offGrid: true })
  }
  return { ...plan, rules: plan.rules.filter((r) => r.id !== id), items }
}

/** Строки расписания: канал → категория → рубрики по времени — как таблица владельца. */
export function scheduleLines(plan: Plan) {
  const rubrics = new Map(plan.rubrics.map((r) => [r.id, r.name]))
  return plan.channels.map((channel) => ({
    channel,
    categories: CATEGORIES.map((cat) => ({
      ...cat,
      rules: plan.rules
        .filter((r) => r.scheduled && r.channelId === channel.id && r.format === cat.format)
        .sort((a, b) => a.time.localeCompare(b.time) || (rubrics.get(a.rubricId ?? '') ?? '').localeCompare(rubrics.get(b.rubricId ?? '') ?? '')),
    })).filter((c) => c.rules.length || c.format !== MAIL),
  }))
}

const SHORT_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
/** Когда выходит, словами: «каждый день», «Пн–Пт», «Вт», «Пн · I неделя», «Ср · I и III недели». */
export function whenText(rule: Pick<Rule, 'days' | 'weeks'>) {
  const on = rule.days.map((x, i) => (x ? i : -1)).filter((i) => i >= 0)
  const days =
    on.length === 7 ? 'каждый день' : on.join() === '0,1,2,3,4' ? 'Пн–Пт' : on.join() === '5,6' ? 'Сб, Вс' : on.map((i) => SHORT_DAYS[i]).join(', ')
  const w = rule.weeks?.length && rule.weeks.length < CYCLE ? rule.weeks.map((n) => WEEK_NAMES[n - 1]) : []
  const weeks = !w.length ? '' : w.length === 1 ? ` · ${w[0]} неделя` : ` · ${w.slice(0, -1).join(', ')} и ${w.at(-1)} недели`
  return `${days}${weeks}`
}
