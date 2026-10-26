import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { addDays, dayTitle, monthKey, monthTitle, SAT, today, weekday } from '../model/dates'
import type { ISODate } from '../model/types'
import { UnitCard } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { DateJump, TopBar } from '../ui/TopBar'
import { CalendarSwitch, writeWeekMode } from './WeekView'

/** Календарь на телефоне: лента по дням, листается без конца вверх и вниз; ▶ на карточке — задача. */
export function AgendaView() {
  const { anchor, setAnchor, jump, jumpTo, goto } = usePlan()
  const [win, setWin] = useState({ from: addDays(anchor, -2), to: addDays(anchor, 21) })
  const body = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const keep = useRef<{ day: string; top: number } | null>(null) // какой день был наверху до того, как лента доросла сверху
  const target = useRef<ISODate | null>(anchor)

  const days: ISODate[] = []
  for (let d = win.from; d <= win.to; d = addDays(d, 1)) days.push(d)

  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    if (keep.current) {
      const sec = el.querySelector<HTMLElement>(`[data-day="${keep.current.day}"]`)
      if (sec) el.scrollTop += sec.getBoundingClientRect().top - el.getBoundingClientRect().top - keep.current.top
      keep.current = null
    }
    if (target.current) {
      el.querySelector(`[data-day="${target.current}"]`)?.scrollIntoView?.({ block: 'start' })
      target.current = null
    }
  }, [win])

  const lastJump = useRef(jump.n)
  useEffect(() => {
    if (jump.n === lastJump.current) return
    lastJump.current = jump.n
    target.current = jump.date
    setWin({ from: addDays(jump.date, -2), to: addDays(jump.date, 21) })
  }, [jump])

  // у краёв лента дорастает
  useEffect(() => {
    if (typeof IntersectionObserver !== 'function' || !top.current || !bottom.current) return
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        if (e.target === top.current) {
          const el = body.current
          const first = el ? [...el.querySelectorAll<HTMLElement>('[data-day]')].find((x) => x.getBoundingClientRect().bottom > el.getBoundingClientRect().top) : undefined
          if (el && first) keep.current = { day: first.dataset.day!, top: first.getBoundingClientRect().top - el.getBoundingClientRect().top }
          setWin((w) => ({ ...w, from: addDays(w.from, -14) }))
        } else {
          setWin((w) => ({ ...w, to: addDays(w.to, 21) }))
        }
      }
    }, { root: body.current, rootMargin: '400px 0px' })
    io.observe(top.current)
    io.observe(bottom.current)
    return () => io.disconnect()
  }, [])

  const onScroll = () => {
    const el = body.current
    if (!el) return
    const y = el.getBoundingClientRect().top + 8
    for (const sec of el.querySelectorAll<HTMLElement>('[data-day]')) {
      if (sec.getBoundingClientRect().bottom > y) {
        const d = sec.dataset.day!
        if (monthKey(d) !== monthKey(anchor)) setAnchor(d)
        break
      }
    }
  }

  return (
    <>
      <TopBar title={<DateJump label={monthTitle(monthKey(anchor))} value={anchor} onPick={jumpTo} />}>
        <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => jumpTo(today())}>
          Сегодня
        </button>
        <CalendarSwitch value="month" onChange={(m) => m !== 'month' && (writeWeekMode(m), goto('week'))} />
      </TopBar>
      <div className="cp-body nr-scroll cp-agenda" ref={body} onScroll={onScroll} role="feed" aria-label="Лента по дням">
        <div ref={top} className="cp-agenda__edge" />
        {days.map((d) => (
          <AgendaDay key={d} date={d} />
        ))}
        <div ref={bottom} className="cp-agenda__edge" />
      </div>
    </>
  )
}

function AgendaDay({ date }: { date: ISODate }) {
  const { unitsOn, openDay } = usePlan()
  const units = unitsOn(date)
  return (
    <section className={`cp-agenda__day${weekday(date) === SAT ? ' cp-agenda__day--rest' : ''}`} data-day={date} data-drop={date} aria-label={dayTitle(date)}>
      <button type="button" className={`cp-agenda__head${date === today() ? ' cp-agenda__head--today' : ''}`} onClick={() => openDay(date)} aria-label={`Открыть день ${date}`}>
        {dayTitle(date)}
      </button>
      <div className="cp-list">
        {units.map((u) => (
          <UnitCard key={u.key} unit={u} variant="compact" />
        ))}
        {units.length === 0 && <span className="cp-hint">Пусто</span>}
      </div>
    </section>
  )
}
