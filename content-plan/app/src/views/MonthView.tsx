// Месяц: недели строками, в каждом дне — все его карточки по времени (ничего не прячется: строка растёт по самому
// полному дню). Карточку переносят на другой день как в неделе, щелчок по пустому месту дня — новый контент на этот день.
// Стрелки — соседний месяц, заголовок — перейти к дате. «Неделя / Месяц» — переключатель в шапке.
import { MONTHS, WEEKDAYS, addDays, mondayOf, SAT, today, weekday } from '../model/dates'
import { type ISODate } from '../model/types'
import { IconButton, UnitCard, useDrop } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { DateJump, TopBar } from '../ui/TopBar'

/** Первое число соседнего месяца. */
const monthStep = (d: ISODate, dir: 1 | -1): ISODate => {
  const [y, m] = d.split('-').map(Number)
  const n = y * 12 + (m - 1) + dir
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}-01`
}

/** Недели месяца — с понедельника до воскресенья, захватывая края соседних месяцев. */
export function monthWeeks(anchor: ISODate): ISODate[][] {
  const first = `${anchor.slice(0, 7)}-01`
  const last = addDays(monthStep(first, 1), -1)
  const weeks: ISODate[][] = []
  for (let d = mondayOf(first); d <= last; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)))
  return weeks
}

export function MonthView() {
  const { anchor, jumpTo } = usePlan()
  const month = anchor.slice(0, 7)
  const [y, m] = month.split('-').map(Number)
  const weeks = monthWeeks(anchor)
  return (
    <>
      <TopBar title={<DateJump label={`${MONTHS[m - 1]} ${y}`} value={anchor} onPick={jumpTo} />}>
        <nav className="cp-top__nav" aria-label="Месяцы">
          <IconButton icon="chev-left" label="Предыдущий месяц" onClick={() => jumpTo(monthStep(anchor, -1))} />
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => jumpTo(today())}>
            Сегодня
          </button>
          <IconButton icon="chev-right" label="Следующий месяц" onClick={() => jumpTo(monthStep(anchor, 1))} />
        </nav>
      </TopBar>
      <div className="cp-body nr-scroll">
        <div className="cp-month" role="grid" aria-label={`Месяц: ${MONTHS[m - 1]} ${y}`}>
          <div className="cp-month__head" role="row">
            {WEEKDAYS.map((w, i) => (
              <span key={w} role="columnheader" className={`cp-month__wd${i === SAT ? ' cp-month__wd--rest' : ''}`}>
                {w}
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0]} className="cp-month__week" role="row">
              {week.map((date) => (
                <MonthDay key={date} date={date} out={date.slice(0, 7) !== month} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/** День месяца: число (открыть день) и все карточки; пустое место — новый контент на этот день. */
function MonthDay({ date, out }: { date: ISODate; out: boolean }) {
  const { unitsOn, dropOn, openNew, openDay, violByDate } = usePlan()
  const drop = useDrop((d) => dropOn(date, d))
  const units = unitsOn(date)
  const viol = violByDate.get(date)?.length ?? 0
  const t = today()
  const cls = ['cp-month__day', out && 'cp-month__day--out', weekday(date) === SAT && 'cp-month__day--rest', date === t && 'cp-month__day--today', drop.over && 'cp-month__day--drop']
    .filter(Boolean)
    .join(' ')
  return (
    <div
      className={cls}
      role="gridcell"
      {...drop.props}
      data-date={date}
      data-drop={date}
      title="Щёлкнуть по пустому месту — новый контент на этот день"
      onClick={(e) => e.target === e.currentTarget && openNew({ date })}
    >
      <span className="cp-month__top">
        <button type="button" className="cp-month__num" onClick={() => openDay(date)} aria-label={`Открыть день ${date}`}>
          {Number(date.slice(8))}
        </button>
        {viol > 0 && <span className="cp-viol" title={`Нарушений: ${viol}`} aria-label={`Нарушений: ${viol}`} role="img" />}
        {units.length > 0 && <span className="cp-month__n" aria-hidden="true">{units.length}</span>}
      </span>
      {units.map((u) => (
        <UnitCard key={u.key} unit={u} variant="line" />
      ))}
    </div>
  )
}
