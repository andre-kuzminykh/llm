// Даты как строки ISO, арифметика в UTC — часовой пояс браузера не сдвигает день.
import type { ISODate } from './types'

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
export const SAT = 5
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август',
  'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа',
  'сентября', 'октября', 'ноября', 'декабря']

const toDate = (d: ISODate) => new Date(`${d}T00:00:00Z`)
const fromDate = (d: Date): ISODate => d.toISOString().slice(0, 10)

export const addDays = (d: ISODate, n: number): ISODate => {
  const x = toDate(d)
  x.setUTCDate(x.getUTCDate() + n)
  return fromDate(x)
}

/** День недели, Пн = 0 … Вс = 6. */
export const weekday = (d: ISODate) => (toDate(d).getUTCDay() + 6) % 7

export const mondayOf = (d: ISODate) => addDays(d, -weekday(d))

export const daysBetween = (a: ISODate, b: ISODate) =>
  Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000)

export const today = (): ISODate => {
  const n = new Date()
  return fromDate(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())))
}

export const monthKey = (d: ISODate) => d.slice(0, 7)

export const weekDays = (d: ISODate): ISODate[] => {
  const m = mondayOf(d)
  return Array.from({ length: 7 }, (_, i) => addDays(m, i))
}

export const monthTitle = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

/** «26 окт», а не в этом году — «26 окт 2027». */
export const dateText = (d: ISODate, today: ISODate) => (d.slice(0, 4) === today.slice(0, 4) ? shortDate(d) : `${shortDate(d)} ${d.slice(0, 4)}`)

export const dayTitle = (d: ISODate) => {
  const [y, m, day] = d.split('-').map(Number)
  return `${WEEKDAYS[weekday(d)]}, ${day} ${MONTHS_GEN[m - 1]} ${y}`
}

export const shortDate = (d: ISODate) => {
  const [, m, day] = d.split('-').map(Number)
  return `${day} ${MONTHS_GEN[m - 1].slice(0, 3)}`
}

export const clampDate = (d: ISODate, min: ISODate, max: ISODate) => (d < min ? min : d > max ? max : d)

/** Время «ЧЧ:ММ» ↔ минуты от полуночи; за пределы суток не выходит. */
export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
export const fromMin = (n: number) => {
  const v = Math.min(Math.max(Math.round(n), 0), 23 * 60 + 59)
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}
