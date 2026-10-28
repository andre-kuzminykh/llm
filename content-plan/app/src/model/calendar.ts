// Календарь по времени — перенос логики календаря из nr_management (M3 / MCL, core/logic/calendar.ts):
// дни окна, геометрия блоков, колонки пересечений, линия «сейчас», 15-минутная привязка при переносе
// и растягивании, панорамирование листа и правило конца жеста. Чистые функции:
// «сегодня» и «сейчас» передаются снаружи. Отличие одно — вместо задач здесь блоки: начало и конец.
import { addDays, mondayOf } from './dates'
import type { ISODate } from './types'

export type Span = 'day' | '3day' | 'week'
export const SPAN_DAYS: Record<Span, number> = { day: 1, '3day': 3, week: 7 }
export const DAY_MINUTES = 1440
export const DEFAULT_MINUTES = 30 // карточка без конца занимает полчаса
export const SNAP_STEP = 15

/** Дни окна: день, три дня от якоря или неделя Пн–Вс, в которой якорь. */
export function calendarDays(anchor: ISODate, span: Span): ISODate[] {
  if (span === 'day') return [anchor]
  if (span === '3day') return [0, 1, 2].map((n) => addDays(anchor, n))
  const start = mondayOf(anchor)
  return [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(start, n))
}

/** Сдвиг окна на его ширину; неделя — от понедельника. */
export function shiftAnchor(anchor: ISODate, span: Span, dir: 1 | -1): ISODate {
  const base = span === 'week' ? mondayOf(anchor) : anchor
  return addDays(base, SPAN_DAYS[span] * dir)
}

/** «ЧЧ:ММ» → минуты от полуночи (мусор → 0), внутри суток. */
export function minutesFromMidnight(clock: string | undefined): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(clock ?? '')
  if (!m) return 0
  return Math.max(0, Math.min(Number(m[1]) * 60 + Number(m[2]), DAY_MINUTES))
}

/** Минуты → «ЧЧ:ММ». */
export function minutesToClock(min: number): string {
  const m = Math.max(0, Math.min(Math.round(min), DAY_MINUTES))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export interface Geometry {
  topMin: number
  heightMin: number
}

/** Блок на шкале: без конца — час; конец не раньше начала + 15 минут; не вылезает за полночь. */
export function blockGeometry(start: string, end?: string): Geometry {
  const top = minutesFromMidnight(start)
  const rawEnd = end ? minutesFromMidnight(end) : top + DEFAULT_MINUTES
  const clampedTop = Math.min(top, DAY_MINUTES - SNAP_STEP)
  const height = Math.max(SNAP_STEP, Math.min(rawEnd, DAY_MINUTES) - clampedTop)
  return { topMin: clampedTop, heightMin: height }
}

export interface Placed<T> extends Geometry {
  item: T
  col: number // колонка внутри группы пересечений
  cols: number // сколько колонок в группе
}

/** Пересекающиеся блоки — рядом, по колонкам (жадная раскраска интервалов); освободившаяся колонка
 *  занимается снова. Непересекающиеся — во всю ширину. */
export function layoutBlocks<T>(items: T[], geometry: (item: T) => Geometry): Placed<T>[] {
  const blocks = items
    .map((item) => {
      const g = geometry(item)
      return { item, ...g, endMin: g.topMin + g.heightMin, col: 0 }
    })
    .sort((a, b) => a.topMin - b.topMin || a.endMin - b.endMin)
  const out: Placed<T>[] = []
  let group: typeof blocks = []
  let colEnds: number[] = []
  const flush = () => {
    for (const b of group) out.push({ item: b.item, topMin: b.topMin, heightMin: b.heightMin, col: b.col, cols: colEnds.length })
    group = []
    colEnds = []
  }
  for (const b of blocks) {
    if (group.length && b.topMin >= Math.max(...colEnds)) flush()
    let col = colEnds.findIndex((end) => end <= b.topMin)
    if (col === -1) {
      col = colEnds.length
      colEnds.push(b.endMin)
    } else colEnds[col] = b.endMin
    b.col = col
    group.push(b)
  }
  flush()
  return out
}

/** Линия «сейчас» — только в сегодняшней колонке, внутри суток. */
export function nowLine(date: ISODate, now: { date: ISODate; minutes: number }): { show: boolean; topMin: number } {
  return { show: date === now.date, topMin: Math.max(0, Math.min(now.minutes, DAY_MINUTES)) }
}

/** Привязка к сетке 15 минут; блок всегда помещается в сутки. */
export function snapMin(min: number, step = SNAP_STEP): number {
  const snapped = Math.round(min / step) * step
  return Math.max(0, Math.min(snapped, DAY_MINUTES - step))
}

/** Перенос блока на другой день и время с той же длительностью. */
export function reschedule(start: string, end: string | undefined, date: ISODate, topMin: number): { date: ISODate; start: string; end: string } {
  const g = blockGeometry(start, end)
  const s = snapMin(topMin)
  return { date, start: minutesToClock(s), end: minutesToClock(Math.min(s + g.heightMin, DAY_MINUTES)) }
}

/** Растянуть нижний край: конец по сетке, не короче 15 минут, не дальше полуночи. */
export function resizeEnd(start: string, endMin: number): string {
  const s = minutesFromMidnight(start)
  const snapped = Math.round(endMin / SNAP_STEP) * SNAP_STEP
  return minutesToClock(Math.max(s + SNAP_STEP, Math.min(snapped, DAY_MINUTES)))
}

// ── лист тянется рукой: содержимое идёт за пальцем, прокрутка — в обратную сторону ──
export interface ScrollPos {
  left: number
  top: number
}
export function applyPan(scroll: ScrollPos, dx: number, dy: number): ScrollPos {
  return { left: Math.max(0, scroll.left - dx), top: Math.max(0, scroll.top - dy) }
}

// ── конец жеста: что записать, когда палец поднят или ушёл с листа ──
export interface GestureState {
  dragging: boolean // переносят или растягивают блок — правку нужно записать
  panning: boolean // тянут лист — записывать нечего
}
export type GestureEnd = 'commit-drag' | 'end-pan' | 'none'
export function gestureEnd(state: GestureState): GestureEnd {
  if (state.dragging) return 'commit-drag'
  if (state.panning) return 'end-pan'
  return 'none'
}
