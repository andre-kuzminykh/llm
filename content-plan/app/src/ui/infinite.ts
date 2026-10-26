// Бесконечная лента дат: неделя — днями вбок (лента на телефоне — днями вниз). Рисуется только видимое;
// у края лента дорастает, поэтому листать можно без конца. Дата «сейчас на экране» уходит в onFocus.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { addDays, daysBetween, mondayOf } from '../model/dates'
import type { ISODate } from '../model/types'

interface Opts {
  axis: 'x' | 'y'
  step: 1 | 7 // день или неделя на шаг ленты
  size: number // px на шаг
  start: ISODate
  end: ISODate
  anchor: ISODate
  jump: { date: ISODate; n: number }
  onFocus: (d: ISODate) => void // дата, которая сейчас в фокусе экрана
  focusAt?: number // где «фокус» на экране: 0 — у начала, 0.5 — посередине
  overscan?: number
  /** Положение по второй оси для даты — прокручивается тем же движением (на шкале времени — к первому часу недели). */
  cross?: (d: ISODate) => number | undefined
}

const CHUNK = { 1: 56, 7: 26 } // насколько дорастать у края

export function useInfinite({ axis, step, size, start, end, anchor, jump, onFocus, focusAt = 0, overscan = 3, cross }: Opts) {
  const ref = useRef<HTMLDivElement>(null)
  const align = (d: ISODate) => (step === 7 ? mondayOf(d) : d)
  const [range, setRange] = useState(() => {
    const from = addDays(align(start < anchor ? start : anchor), -8 * 7)
    const to = addDays(align(end > anchor ? end : anchor), 8 * 7)
    return { from, count: Math.floor(daysBetween(from, to) / step) + 1 }
  })
  const [view, setView] = useState({ pos: 0, len: 0 })
  const shift = useRef(0)
  const target = useRef<{ date: ISODate; smooth: boolean } | null>(null)
  const guard = useRef<{ pos: number; until: number } | null>(null)
  const focused = useRef<ISODate | null>(null)

  const indexOf = useCallback((d: ISODate) => Math.floor(daysBetween(range.from, align(d)) / step), [range.from, step]) // eslint-disable-line react-hooks/exhaustive-deps
  const dateAt = useCallback((i: number) => addDays(range.from, i * step), [range.from, step])

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const pos = axis === 'y' ? el.scrollTop : el.scrollLeft
    const len = (axis === 'y' ? el.clientHeight : el.clientWidth) || (axis === 'y' ? 900 : 1200) // в jsdom размеров нет
    setView((v) => (v.pos === pos && v.len === len ? v : { pos, len }))
    return { pos, len }
  }, [axis])

  const scrollNow = useCallback(
    (date: ISODate, smooth: boolean) => {
      const el = ref.current
      if (!el) return
      const pos = Math.max(0, indexOf(date) * size)
      guard.current = { pos, until: Date.now() + 1200 }
      focused.current = date
      // вторая ось — в том же вызове: отдельная прокрутка оборвала бы плавную
      const c = cross?.(date)
      if (axis === 'y') el.scrollTo?.({ top: pos, left: c, behavior: smooth ? 'smooth' : 'auto' })
      else el.scrollTo?.({ left: pos, top: c, behavior: smooth ? 'smooth' : 'auto' })
      if (!el.scrollTo || !smooth) {
        if (axis === 'y') el.scrollTop = pos
        else el.scrollLeft = pos
        if (c !== undefined) {
          if (axis === 'y') el.scrollLeft = c
          else el.scrollTop = c
        }
      }
      measure()
    },
    [axis, indexOf, size, measure, cross],
  )

  /** К дате; если её нет в ленте — лента сначала дорастает до неё. */
  const scrollTo = useCallback(
    (date: ISODate, smooth = true) => {
      const i = indexOf(date)
      if (i < 0 || i >= range.count) {
        const from = i < 0 ? addDays(align(date), -8 * 7) : range.from
        const last = i >= range.count ? addDays(align(date), 8 * 7) : dateAt(range.count - 1)
        target.current = { date, smooth: false }
        setRange({ from, count: Math.floor(daysBetween(from, last) / step) + 1 })
        return
      }
      scrollNow(date, smooth)
    },
    [indexOf, range, dateAt, scrollNow, step], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // после того как лента доросла сверху — сдвинуть прокрутку, чтобы картинка не прыгнула; или докрутить к цели
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (shift.current) {
      if (axis === 'y') el.scrollTop += shift.current
      else el.scrollLeft += shift.current
      shift.current = 0
      measure()
    }
    if (target.current) {
      const t = target.current
      target.current = null
      scrollNow(t.date, t.smooth)
    }
  }, [range, axis, measure, scrollNow])

  // первая отрисовка — сразу на дате; переходы «к дате» — плавно
  useLayoutEffect(() => {
    scrollNow(anchor, false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const lastJump = useRef(jump.n)
  useEffect(() => {
    if (jump.n === lastJump.current) return
    lastJump.current = jump.n
    scrollTo(jump.date, true)
  }, [jump, scrollTo])

  const onScroll = () => {
    const m = measure()
    if (!m) return
    const { pos, len } = m
    const g = guard.current
    if (g && (Math.abs(pos - g.pos) < 2 || Date.now() > g.until)) guard.current = null
    if (!guard.current) {
      const d = dateAt(Math.floor((pos + len * focusAt) / size + (focusAt ? 0 : 0.5)))
      if (d !== focused.current) {
        focused.current = d
        onFocus(d)
      }
    }
    const chunk = CHUNK[step]
    if (pos < size * 4) {
      shift.current += chunk * size
      setRange((r) => ({ from: addDays(r.from, -chunk * step), count: r.count + chunk }))
    } else if (pos + len > (range.count - 4) * size) {
      setRange((r) => ({ ...r, count: r.count + chunk }))
    }
  }

  const first = Math.max(0, Math.floor(view.pos / size) - overscan)
  const last = Math.min(range.count - 1, Math.floor((view.pos + (view.len || 900)) / size) + overscan)
  return { ref, onScroll, range, first, last, indexOf, dateAt, scrollTo, view }
}
