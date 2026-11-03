// Повтор материала — рядом со временем в форме, как в Google Календаре: не повторять, каждый день, по будням, каждую
// неделю, через неделю, раз в месяц или «Другое…» — интервал (дни, недели, месяцы, годы), дни недели и окончание
// (никогда — до конца плана, до даты или после N раз). Материалы повтора создаются сразу, с общим series, — дальше
// каждый правится сам по себе.
import { addDays, mondayOf, shortDate, weekday, WEEKDAYS } from './dates'
import type { ISODate } from './types'

export type RepeatUnit = 'day' | 'week' | 'month' | 'year'
export type RepeatEnd = { kind: 'never' } | { kind: 'date'; date: ISODate } | { kind: 'count'; count: number }

export interface RepeatRule {
  every: number // раз в сколько единиц: 1 — каждую, 2 — через одну
  unit: RepeatUnit
  days: number[] // неделя: дни недели (0 — понедельник)
  monthBy?: 'weekday' | 'date' // месяц: тот же по счёту день недели («4-я ср») или то же число («28-го»)
  end: RepeatEnd
}

/** Готовые варианты в списке у времени; «Другое…» открывает окно повтора. */
export type Preset = 'none' | 'day' | 'weekdays' | 'week' | 'biweek' | 'month' | 'custom'
export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'none', label: 'Не повторять' },
  { id: 'day', label: 'Каждый день' },
  { id: 'weekdays', label: 'По будням' },
  { id: 'week', label: 'Каждую неделю' },
  { id: 'biweek', label: 'Через неделю' },
  { id: 'month', label: 'Раз в месяц' },
  { id: 'custom', label: 'Другое…' },
]

const NEVER: RepeatEnd = { kind: 'never' }

/** Правило готового варианта; дни недели — выбранные или день даты. */
export function presetRule(p: Preset, _start?: ISODate, days?: number[]): RepeatRule | null {
  // дни недели не заданы — день даты (он и подставится, если дату поменяют)
  const wd = days ?? []
  switch (p) {
    case 'day': return { every: 1, unit: 'day', days: [], end: NEVER }
    case 'weekdays': return { every: 1, unit: 'week', days: [0, 1, 2, 3, 4], end: NEVER }
    case 'week': return { every: 1, unit: 'week', days: wd, end: NEVER }
    case 'biweek': return { every: 2, unit: 'week', days: wd, end: NEVER }
    case 'month': return { every: 1, unit: 'month', days: [], monthBy: 'weekday', end: NEVER }
    default: return null
  }
}

/** Какой готовый вариант совпадает с правилом; иначе — «другое». */
export function presetOf(r: RepeatRule | null): Preset {
  if (!r) return 'none'
  if (r.end.kind !== 'never') return 'custom'
  if (r.unit === 'day' && r.every === 1) return 'day'
  if (r.unit === 'week' && r.every === 1 && r.days.join() === '0,1,2,3,4') return 'weekdays'
  if (r.unit === 'week' && r.every === 1) return 'week'
  if (r.unit === 'week' && r.every === 2) return 'biweek'
  if (r.unit === 'month' && r.every === 1 && r.monthBy !== 'date') return 'month'
  return 'custom'
}

/** Какой по счёту в месяце этот день недели: 1-й, 2-й… — «раз в месяц» повторяет его же («2-я чт»). */
export const nthOfMonth = (d: ISODate) => Math.ceil(Number(d.slice(8)) / 7)

const monthAdd = (first: ISODate, n: number): ISODate => {
  const [y, m] = first.split('-').map(Number)
  const k = y * 12 + (m - 1) + n
  return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}-01`
}
const daysIn = (first: ISODate) => Number(addDays(monthAdd(first, 1), -1).slice(8))

/** Даты повтора после start (сам start не входит) до until включительно — и не дальше окончания правила. */
export function repeatDates(start: ISODate, r: RepeatRule | null, until: ISODate): ISODate[] {
  if (!r || r.every < 1) return []
  const last = r.end.kind === 'date' && r.end.date < until ? r.end.date : until
  if (last <= start) return []
  const out: ISODate[] = []
  if (r.unit === 'day') {
    for (let d = addDays(start, r.every); d <= last; d = addDays(d, r.every)) out.push(d)
  } else if (r.unit === 'week') {
    const wds = [...new Set(r.days.length ? r.days : [weekday(start)])].sort()
    for (let mon = mondayOf(start); mon <= last; mon = addDays(mon, 7 * r.every))
      for (const d of wds) {
        const date = addDays(mon, d)
        if (date > start && date <= last) out.push(date)
      }
  } else if (r.unit === 'month') {
    const day = Number(start.slice(8))
    const n = nthOfMonth(start)
    for (let first = `${start.slice(0, 7)}-01`; first <= last; first = monthAdd(first, r.every)) {
      // «28-го» — в коротком месяце пропуск; «5-я ср» — если её нет, тоже
      const dates = r.monthBy === 'date'
        ? day <= daysIn(first) ? [`${first.slice(0, 8)}${String(day).padStart(2, '0')}`] : []
        : [...new Set(r.days.length ? r.days : [weekday(start)])].map((d) => addDays(first, ((d - weekday(first) + 7) % 7) + (n - 1) * 7)).filter((x) => x.slice(0, 7) === first.slice(0, 7))
      for (const date of dates) if (date > start && date <= last) out.push(date)
    }
    out.sort()
  } else {
    for (let y = Number(start.slice(0, 4)) + r.every; ; y += r.every) {
      const date = `${y}${start.slice(4)}`
      if (date > last) break
      if (Number(date.slice(8)) <= daysIn(`${date.slice(0, 8)}01`)) out.push(date) // 29 февраля — только в високосный
    }
  }
  // «после N раз» — считая первый
  return r.end.kind === 'count' ? out.slice(0, Math.max(0, r.end.count - 1)) : out
}

const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10
  const b = n % 100
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many
}
export const UNIT_WORDS: Record<RepeatUnit, [string, string, string]> = {
  day: ['день', 'дня', 'дней'],
  week: ['неделя', 'недели', 'недель'],
  month: ['месяц', 'месяца', 'месяцев'],
  year: ['год', 'года', 'лет'],
}
const ORD_F = ['1-я', '2-я', '3-я', '4-я', '5-я']

/** Подпись повтора: «каждый день», «по будням», «каждую неделю: пн, чт», «раз в месяц: 4-я ср», «раз в 3 дня, 10 раз». */
export function repeatText(r: RepeatRule | null, start: ISODate): string {
  if (!r) return ''
  const names = [...new Set(r.days.length ? r.days : [weekday(start)])].sort().map((d) => WEEKDAYS[d].toLowerCase())
  const n = r.every
  let s: string
  if (r.unit === 'day') s = n === 1 ? 'каждый день' : `раз в ${n} ${plural(n, 'день', 'дня', 'дней')}`
  else if (r.unit === 'week') {
    const head = n === 1 ? 'каждую неделю' : n === 2 ? 'через неделю' : `раз в ${n} ${plural(n, 'неделю', 'недели', 'недель')}`
    s = n === 1 && r.days.join() === '0,1,2,3,4' ? 'по будням' : `${head}: ${names.join(', ')}`
  } else if (r.unit === 'month') {
    const head = n === 1 ? 'раз в месяц' : `раз в ${n} ${plural(n, 'месяц', 'месяца', 'месяцев')}`
    s = r.monthBy === 'date' ? `${head}, ${Number(start.slice(8))}-го` : `${head}: ${names.map((x) => `${ORD_F[nthOfMonth(start) - 1]} ${x}`).join(', ')}`
  } else s = `${n === 1 ? 'раз в год' : `раз в ${n} ${plural(n, 'год', 'года', 'лет')}`}, ${shortDate(start)}`
  if (r.end.kind === 'date') s += `, до ${shortDate(r.end.date)}`
  if (r.end.kind === 'count') s += `, ${r.end.count} ${plural(r.end.count, 'раз', 'раза', 'раз')}`
  return s
}

/** «4 раза», «5 раз». */
export const times = (n: number) => `${n} ${plural(n, 'раз', 'раза', 'раз')}`

/** Слово единицы при числе: 1 неделя, 2 недели, 5 недель. */
export const unitWord = (u: RepeatUnit, n: number) => plural(n, ...UNIT_WORDS[u])
