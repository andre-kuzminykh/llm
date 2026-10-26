import { useLayoutEffect, useMemo, useRef } from 'react'
import { addDays, addMonths, monthKey, monthTitle, SAT, shortDate, today, WEEKDAYS, weekday } from '../model/dates'
import type { ISODate } from '../model/types'
import { IconButton, UnitCard, useDrop } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { useInfinite } from '../ui/infinite'
import { DateJump, TopBar } from '../ui/TopBar'
import { AgendaView } from './AgendaView'
import { CalendarSwitch, writeWeekMode } from './WeekView'

// высота недели: шапка дня и строка на каждую единицу контента самого загруженного дня (с учётом фильтров)
const HEAD_H = 40
const CHIP_H = 21
const MIN_ROW = 140

/** Первая неделя месяца — та, чей четверг уже в нём (как в ISO): к ней ведут стрелки месяцев. */
const firstWeekOf = (month: string) => addDays(`${month}-01`, 3)

/** Календарь месяцем: на телефоне — лента по дням, на большом экране — месяц, который листается неделями без конца. */
export function MonthView() {
  const { phone } = usePlan()
  return phone ? <AgendaView /> : <MonthGrid />
}

function MonthGrid() {
  const { plan, anchor, setAnchor, jump, jumpTo, unitsOn, filters, goto } = usePlan()
  const month = monthKey(anchor)
  // все материалы дня видны строками, поэтому неделя высотой с самый загруженный день плана
  const most = useMemo(() => {
    let n = 1
    for (let d = plan.start; d <= plan.end; d = addDays(d, 1)) n = Math.max(n, unitsOn(d).length)
    return n
  }, [plan, filters]) // eslint-disable-line react-hooks/exhaustive-deps
  const ROW = Math.max(MIN_ROW, HEAD_H + most * CHIP_H + 6)
  const inf = useInfinite({
    axis: 'y',
    step: 7,
    size: ROW,
    start: plan.start,
    end: plan.end,
    anchor,
    jump,
    focusAt: 0.1,
    // дата в фокусе — четверг верхней недели: по нему и месяц в заголовке (как в ISO), и неделя при переходе в «Неделю»
    onFocus: (monday) => setAnchor(addDays(monday, 3)),
  })
  // фильтры поменяли высоту недели — остаться на той же неделе
  const lastRow = useRef(ROW)
  useLayoutEffect(() => {
    const old = lastRow.current
    if (old === ROW) return
    lastRow.current = ROW
    const el = inf.ref.current
    inf.scrollTo(el ? inf.dateAt(Math.round(el.scrollTop / old)) : anchor, false)
  }, [ROW]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows: number[] = []
  for (let i = inf.first; i <= inf.last; i++) rows.push(i)
  return (
    <>
      <TopBar title={<DateJump label={monthTitle(month)} value={anchor} onPick={jumpTo} />}>
        <nav className="cp-top__nav" aria-label="Месяцы">
          <IconButton icon="chev-left" label="Предыдущий месяц" onClick={() => jumpTo(firstWeekOf(addMonths(month, -1)))} />
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => jumpTo(today())}>
            Сегодня
          </button>
          <IconButton icon="chev-right" label="Следующий месяц" onClick={() => jumpTo(firstWeekOf(addMonths(month, 1)))} />
        </nav>
        <CalendarSwitch value="month" onChange={(m) => m !== 'month' && (writeWeekMode(m), goto('week'))} />
      </TopBar>
      <div className="cp-body nr-scroll" ref={inf.ref} onScroll={inf.onScroll}>
        <div className="cp-month" role="grid" aria-label={monthTitle(month)} style={{ height: inf.range.count * ROW + 36 }}>
          <div className="cp-month__head" role="row">
            {WEEKDAYS.map((w) => (
              <div key={w} className="cp-month__wd nr-label" role="columnheader">
                {w}
              </div>
            ))}
          </div>
          {rows.map((i) => {
            const monday = inf.dateAt(i)
            return (
              <div key={monday} className="cp-month__week" role="row" style={{ top: 36 + i * ROW, height: ROW }}>
                {Array.from({ length: 7 }, (_, k) => addDays(monday, k)).map((d) => (
                  <MonthDay key={d} date={d} current={monthKey(d) === month} />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function MonthDay({ date, current }: { date: ISODate; current: boolean }) {
  const { plan, unitsOn, violByDate, openDay, openDayId, dropOn } = usePlan()
  const drop = useDrop((d) => dropOn(date, d))
  const units = unitsOn(date)
  const viol = violByDate.get(date)?.length ?? 0
  const inPlan = date >= plan.start && date <= plan.end
  const day = Number(date.slice(8))
  const cls = [
    'cp-day',
    weekday(date) === SAT && 'cp-day--rest',
    !current && 'cp-day--other',
    !inPlan && 'cp-day--out',
    date === today() && 'cp-day--today',
    drop.over && 'cp-day--drop',
    openDayId === date && 'cp-day--open',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div role="gridcell" className={cls} {...drop.props} onClick={() => openDay(date)} data-date={date} data-drop={date}>
      <div className="cp-day__head">
        <button
          type="button"
          className="cp-day__num"
          onClick={(e) => {
            e.stopPropagation()
            openDay(date)
          }}
          aria-label={`Открыть день ${date}`}
        >
          {day === 1 ? shortDate(date) : day}
        </button>
        {viol > 0 && <span className="cp-viol" title={`Нарушений: ${viol}`} aria-label={`Нарушений: ${viol}`} role="img" />}
      </div>
      {units.map((u) => (
        <UnitCard key={u.key} unit={u} variant="chip" />
      ))}
    </div>
  )
}
