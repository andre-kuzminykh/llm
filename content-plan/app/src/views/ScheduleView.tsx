// Расписание в дашборде — тот же план, перевёрнутый в план повествования: каналы, в них хэштеги,
// по каждому — что и когда выходит. Время подписью, а не шкалой. Учитывает фильтры слева.
import { useState, type CSSProperties } from 'react'
import { addDays, shortDate, today, WEEKDAYS, weekday } from '../model/dates'
import { daysText, scheduleOf, timesText, type SchedRow } from '../model/schedule'
import { FORMAT_SHORT } from '../model/types'
import { Seg, StatusIcon } from '../ui/bits'
import { usePlan } from '../ui/ctx'

type Span = '7' | '14' | '30'
const SPANS: { id: Span; label: string }[] = [
  { id: '7', label: 'Неделя' },
  { id: '14', label: '2 недели' },
  { id: '30', label: 'Месяц' },
]
const KEY = 'cp:sched-span'

function readSpan(): Span {
  try {
    const v = localStorage.getItem(KEY)
    return SPANS.some((s) => s.id === v) ? (v as Span) : '14'
  } catch {
    return '14'
  }
}

const dayText = (d: string) => `${WEEKDAYS[weekday(d)]}, ${shortDate(d)}`

export function Schedule() {
  const { plan, unitsOn, rules, rubrics } = usePlan()
  const [span, setSpan] = useState<Span>(readSpan)
  const t = today()
  const n = Number(span)
  const days = Array.from({ length: n }, (_, i) => addDays(t, i))
  const groups = scheduleOf(plan.channels, days.flatMap(unitsOn), rules, rubrics)
  const pick = (s: Span) => {
    setSpan(s)
    try {
      localStorage.setItem(KEY, s)
    } catch {
      /* период проживёт до перезагрузки */
    }
  }
  return (
    <div className="cp-sched">
      <div className="cp-sched__head">
        <Seg label="Период расписания" value={span} options={SPANS} onChange={pick} />
        <span className="cp-muted">
          {shortDate(days[0])} – {shortDate(days[n - 1])}
        </span>
      </div>
      {!groups.length && <p className="cp-empty">На эти дни ничего нет — или всё скрыто фильтрами.</p>}
      {groups.map((g) => (
        <section key={g.id} className="cp-sched__ch" style={{ '--cp-c': g.color } as CSSProperties} aria-label={`Расписание: ${g.name}`}>
          <h3 className="cp-sched__name">{g.name}</h3>
          {g.tags.map((tag) => (
            <div key={tag.id} className="cp-sched__tag" role="group" aria-label={`${g.name}: ${tag.tag}`}>
              <div className="cp-sched__tagname">
                {tag.tag}
                <span className="cp-side__count">{tag.rows.reduce((s, r) => s + r.days.length, 0)}</span>
              </div>
              <ol className="cp-sched__rows">
                {tag.rows.map((r) => (
                  <ScheduleRow key={r.key} row={r} span={n} />
                ))}
              </ol>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

function ScheduleRow({ row, span }: { row: SchedRow; span: number }) {
  const { openItem } = usePlan()
  const when = row.days.length > 1 ? daysText(row.days, span) : dayText(row.date)
  const times = timesText(row.days, span)
  return (
    <li>
      <button type="button" className="cp-sched__row" onClick={() => openItem(row.id)} aria-label={`${when}, ${row.time}: ${row.title}${times ? `, ${times}` : ''}`}>
        <span className="cp-sched__when">{when}</span>
        <span className="cp-sched__time">{row.time}</span>
        <span className={`cp-sched__title${row.slot ? ' cp-sched__title--slot' : ''}`}>
          {row.title}
          {times && <span className="cp-sched__n"> · {times}</span>}
        </span>
        <span className="cp-sched__fmt">{FORMAT_SHORT[row.format] ?? row.format}</span>
        <StatusIcon status={row.status} />
      </button>
    </li>
  )
}
