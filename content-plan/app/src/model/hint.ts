// Подсказка при переносе — словами, а не цветом: куда встанет карточка, что едет вместе с ней
// и что скажет проверка сетки на новом месте, ещё до того как её отпустили.
import { shortDate, WEEKDAYS, weekday } from './dates'
import { checkDay } from './rules'
import { labelOf, type ISODate, type Item, type Plan } from './types'

export interface HintLine {
  text: string
  warn?: boolean // предупреждение: на новом месте проверка что-то отметит
}

/** Куда переносят: материал (главный в карточке) и новая дата. */
export interface Move {
  id: string
  date: ISODate
}

const dayLabel = (d: ISODate) => `${WEEKDAYS[weekday(d)]}, ${shortDate(d)}`

/** Строка «куда»: «Ср, 11 ноя · 13:00»; несколько карточек — «3 карточки · +2 дня · +1 ч». */
export function whereText(date: ISODate, time: string | undefined, n: number, dDays = 0, dMin = 0): string {
  if (n <= 1) return `${dayLabel(date)}${time ? ` · ${time}` : ''}`
  const days = dDays === 0 ? 'тот же день' : `${dDays > 0 ? '+' : '−'}${Math.abs(dDays)} ${plural(Math.abs(dDays), 'день', 'дня', 'дней')}`
  const h = Math.floor(Math.abs(dMin) / 60)
  const m = Math.abs(dMin) % 60
  const shift = dMin ? ` · ${dMin > 0 ? '+' : '−'}${h ? `${h} ч` : ''}${h && m ? ' ' : ''}${m ? `${m} мин` : ''}` : ''
  return `${n} ${plural(n, 'карточка', 'карточки', 'карточек')} · ${days}${shift}`
}

export const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many

/** Что едет вместе и что отметит проверка на новом месте. Материалы, которые остаются на своём дне, не проверяются заново. */
export function moveHint(plan: Plan, byDate: Map<ISODate, Item[]>, moves: Move[], today: ISODate): HintLine[] {
  const rules = new Map(plan.rules.map((r) => [r.id, r]))
  const rubrics = new Map(plan.rubrics.map((r) => [r.id, r]))
  const label = (it: Item) => labelOf(rubrics.get(it.rubricId ?? ''), rules.get(it.ruleId))
  const out: HintLine[] = []
  // что едет: материал со своей группой того же дня
  const moving = new Map<string, Item>() // id → материал уже на новой дате
  for (const m of moves) {
    const it = plan.items.find((x) => x.id === m.id)
    if (!it?.date || it.date === m.date) continue
    const members = it.group ? (byDate.get(it.date) ?? []).filter((x) => x.group === it.group) : [it]
    for (const x of members) moving.set(x.id, { ...x, date: m.date })
  }
  if (moves.length === 1) {
    const it = plan.items.find((x) => x.id === moves[0].id)
    const others = it?.group && it.date ? (byDate.get(it.date) ?? []).filter((x) => x.group === it.group && x.id !== it.id) : []
    if (others.length) out.push({ text: `Вместе с группой: ${[...new Set(others.map((x) => rules.get(x.ruleId)?.name ?? x.format))].join(', ')}` })
  }
  if (!moving.size) return out
  const dates = [...new Set([...moving.values()].map((x) => x.date!))].sort()
  if (dates[0] < today) out.push({ text: 'Дата уже прошла', warn: true })
  const seen = new Set<string>()
  for (const date of dates) {
    const here = (byDate.get(date) ?? []).filter((x) => !moving.has(x.id))
    const arriving = [...moving.values()].filter((x) => x.date === date)
    for (const v of checkDay(plan, date, [...here, ...arriving])) {
      if (!v.itemIds.some((id) => moving.has(id))) continue // нарушение было и без переноса
      let text: string
      if (v.kind === 'full') {
        const there = here.filter((x) => rules.get(x.ruleId)?.full && !x.derive && !x.offGrid)
        text = `Здесь уже FULL: ${there.map((x) => `${label(x)} «${x.title}»`).join(', ')}${moves.length === 1 ? ' — после переноса можно поменять местами' : ''}`
      } else if (v.kind === 'limit') {
        text = `Сверх лимита в день: ${v.text}`
      } else if (v.kind === 'weekday') {
        text = `По сетке ${v.text.replace(' — не выходит в ', ' не выходит в ')}`
      } else {
        const c = plan.channels.find((x) => arriving.some((a) => a.channelId === x.id) && date < x.start)
        text = c ? `${c.name} ещё не запущен: стартует ${shortDate(c.start)}` : v.text
      }
      if (seen.has(text)) continue
      seen.add(text)
      out.push({ text, warn: true })
    }
  }
  return out
}
