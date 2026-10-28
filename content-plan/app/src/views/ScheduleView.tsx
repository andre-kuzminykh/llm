// Программа в дашборде — что выпускаем: каналы, в них рубрики, по каждой — темы материалов по порядку, справа дата
// и время («21 окт 10:00») и площадки значками. Период — неделя, месяц или всё. Не шкала времени. Учитывает фильтры слева.
import { useMemo, useState, type CSSProperties } from 'react'
import { addDays, daysBetween, today } from '../model/dates'
import { dateText, daysText, scheduleOf, timesText, type SchedRow, type SchedTag } from '../model/schedule'
import { FORMAT_SHORT } from '../model/types'
import { PlatformIcon, Seg, StatusIcon } from '../ui/bits'
import { usePlan } from '../ui/ctx'

type Span = '7' | '30' | 'all'
const SPANS: { id: Span; label: string }[] = [
  { id: '7', label: 'Неделя' },
  { id: '30', label: 'Месяц' },
  { id: 'all', label: 'Все' },
]
const FIRST = 10 // за всё время у рубрики сначала столько строк, дальше — «Показать ещё»

function readSpan(): Span {
  try {
    const v = localStorage.getItem('cp:sched-span')
    return SPANS.some((s) => s.id === v) ? (v as Span) : '7'
  } catch {
    return '7'
  }
}

export function Schedule() {
  const { plan, filters, unitsOn, rules, rubrics } = usePlan()
  const [span, setSpan] = useState<Span>(readSpan)
  const [open, setOpen] = useState<Set<string>>(new Set()) // рубрики, где показаны все строки
  const t = today()
  const n = span === 'all' ? Math.max(0, daysBetween(t, plan.end) + 1) : Number(span)
  // за всё время карточек тысячи: пересчёт — только когда меняется план, фильтры или период
  const groups = useMemo(
    () => scheduleOf(plan.channels, Array.from({ length: n }, (_, i) => addDays(t, i)).flatMap(unitsOn), rules, rubrics, plan.platforms),
    [plan, filters, n, t], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const pick = (s: Span) => {
    setSpan(s)
    try {
      localStorage.setItem('cp:sched-span', s)
    } catch {
      /* период проживёт до перезагрузки */
    }
  }

  return (
    <div className="cp-sched">
      <div className="cp-sched__head">
        <Seg label="Период программы" value={span} options={SPANS} onChange={pick} />
        {n > 0 && (
          <span className="cp-muted">
            {dateText(t, t)} – {dateText(addDays(t, n - 1), t)}
          </span>
        )}
      </div>

      {!groups.length && <p className="cp-empty">На эти дни ничего нет — или всё скрыто фильтрами.</p>}
      {groups.map((g) => (
        <section key={g.id} className="cp-sched__ch" style={{ '--cp-c': g.color } as CSSProperties} aria-label={`Программа: ${g.name}`}>
          <h3 className="cp-sched__name">{g.name}</h3>
          {g.tags.map((tag) => (
            <TagBlock
              key={tag.id}
              group={g.name}
              tag={tag}
              span={n}
              today={t}
              limit={span === 'all' && !open.has(`${g.id}|${tag.id}`) ? FIRST : Infinity}
              onMore={() => setOpen((s) => new Set(s).add(`${g.id}|${tag.id}`))}
            />
          ))}
        </section>
      ))}
    </div>
  )
}

/** Рубрика: строки по порядку. За всё время — сначала FIRST, дальше «Показать ещё». */
function TagBlock({ group, tag, span, today: t, limit, onMore }: { group: string; tag: SchedTag; span: number; today: string; limit: number; onMore: () => void }) {
  const shown = tag.rows.slice(0, limit)
  return (
    <div className="cp-sched__tag" role="group" aria-label={`${group}: ${tag.tag}`}>
      <div className="cp-sched__tagname">
        {tag.tag}
        <span className="cp-side__count">{tag.rows.reduce((s, r) => s + r.days.length, 0)}</span>
      </div>
      <ol className="cp-sched__rows">
        {shown.map((r) => (
          <ScheduleRow key={r.key} row={r} span={span} today={t} />
        ))}
      </ol>
      {tag.rows.length > shown.length && (
        <button type="button" className="cp-sched__more" onClick={onMore}>
          Показать ещё {tag.rows.length - shown.length}
        </button>
      )}
    </div>
  )
}

function ScheduleRow({ row, span, today: t }: { row: SchedRow; span: number; today: string }) {
  const { openItem } = usePlan()
  // справа — «21 окт 10:00»; слитая строка — «каждый день 09:00»
  const when = row.days.length > 1 ? daysText(row.days, span, t) : dateText(row.date, t)
  const times = timesText(row.days, span)
  const label = `${when} ${row.time}: ${row.title}${times ? `, ${times}` : ''}`
  return (
    <li className="cp-sched__item">
      <button type="button" className="cp-sched__row" onClick={() => openItem(row.id)} aria-label={label} title={FORMAT_SHORT[row.format] ?? row.format}>
        <span className="cp-sched__main">
          <span className={`cp-sched__title${row.slot ? ' cp-sched__title--slot' : ''}`}>
            {row.title}
            {times && <span className="cp-sched__n"> · {times}</span>}
          </span>
        </span>
        <span className="cp-sched__when">
          {when} <span className="cp-sched__time">{row.time}</span>
        </span>
        <span className="cp-sched__plats" aria-label={`Площадки: ${row.platforms.join(', ')}`}>
          {row.platforms.map((p) => (
            <PlatformIcon key={p} platform={p} size={13} />
          ))}
        </span>
        <StatusIcon status={row.status} />
      </button>
    </li>
  )
}
