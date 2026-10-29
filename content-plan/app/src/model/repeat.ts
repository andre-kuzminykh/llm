// Повтор материала — рядом со временем в форме: каждую неделю, через неделю или раз в месяц, по выбранным дням недели.
// Материалы повтора создаются сразу, до конца плана, с общим series — дальше каждый правится сам по себе.
import { addDays, mondayOf, weekday, WEEKDAYS } from './dates'
import type { ISODate } from './types'

export type Repeat = 'none' | 'week' | 'biweek' | 'month'

export const REPEATS: { id: Repeat; label: string }[] = [
  { id: 'none', label: 'Не повторять' },
  { id: 'week', label: 'Каждую неделю' },
  { id: 'biweek', label: 'Через неделю' },
  { id: 'month', label: 'Раз в месяц' },
]

/** Какой по счёту в месяце этот день недели: 1-й, 2-й… — «раз в месяц» повторяет его же («2-й чт»). */
export const nthOfMonth = (d: ISODate) => Math.ceil(Number(d.slice(8)) / 7)

const nextMonth = (first: ISODate): ISODate => {
  const [y, m] = first.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

/** Даты повтора после start (сам start не входит) до until включительно; days — дни недели (0 — понедельник). */
export function repeatDates(start: ISODate, kind: Repeat, days: number[], until: ISODate): ISODate[] {
  if (kind === 'none' || !days.length || until <= start) return []
  const wds = [...new Set(days)].sort()
  const out: ISODate[] = []
  if (kind === 'month') {
    const n = nthOfMonth(start)
    for (let first = `${start.slice(0, 7)}-01`; first <= until; first = nextMonth(first)) {
      for (const d of wds) {
        const date = addDays(first, ((d - weekday(first) + 7) % 7) + (n - 1) * 7)
        // пятого четверга в месяце может не быть — тогда в этом месяце пропуск
        if (date.slice(0, 7) === first.slice(0, 7) && date > start && date <= until) out.push(date)
      }
    }
    return out.sort()
  }
  const step = kind === 'week' ? 7 : 14
  for (let mon = mondayOf(start); mon <= until; mon = addDays(mon, step)) {
    for (const d of wds) {
      const date = addDays(mon, d)
      if (date > start && date <= until) out.push(date)
    }
  }
  return out
}

/** Подпись повтора: «каждую неделю: пн, чт», «раз в месяц: 2-й чт». */
export function repeatText(kind: Repeat, days: number[], start: ISODate): string {
  if (kind === 'none') return ''
  const names = [...new Set(days)].sort().map((d) => WEEKDAYS[d].toLowerCase())
  if (kind === 'month') return `раз в месяц: ${names.map((x) => `${nthOfMonth(start)}-й ${x}`).join(', ')}`
  return `${kind === 'week' ? 'каждую неделю' : 'через неделю'}: ${names.join(', ')}`
}
