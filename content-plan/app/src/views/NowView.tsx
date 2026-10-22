import type { CSSProperties } from 'react'
import { addDays, dayTitle, shortDate, today } from '../model/dates'
import { AUTO_RULES } from '../model/filters'
import { shownTitle, titleIsFormat, isSlot, type ISODate, type Status } from '../model/types'
import { daysLeft, dueOf, type Unit } from '../model/units'
import { mainChannelId, RubricChip, StatusFilter } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'
import { TopBar } from '../ui/TopBar'

const AHEAD = 14 // на сколько дней вперёд смотреть
const BACK = 14 // и сколько назад — за просроченным

interface Row {
  unit: Unit
  due: ISODate
}

const FILTER: Status[] = ['progress', 'paused', 'ready']

/** Что делать сейчас: что подготовить в ближайшие две недели. Сверху — просроченное, дальше — по дням выхода.
 *  Авто-рубрики не показываются. */
export function NowView() {
  const { unitsOn, rules, filters, setFilters } = usePlan()
  const t = today()
  const rows: Row[] = []
  for (let d = addDays(t, -BACK); d <= addDays(t, AHEAD); d = addDays(d, 1)) {
    for (const u of unitsOn(d)) {
      if (AUTO_RULES.has(u.head.ruleId) || u.head.status === 'published') continue
      if (d < t && u.head.status === 'ready') continue
      rows.push({ unit: u, due: dueOf(u.head, rules.get(u.head.ruleId))! })
    }
  }
  const late = rows.filter((r) => r.due < t && r.unit.head.status !== 'ready').sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
  const rest = rows.filter((r) => !late.includes(r))
  const byDay = new Map<ISODate, Row[]>()
  for (const r of rest) byDay.set(r.unit.date!, [...(byDay.get(r.unit.date!) ?? []), r])
  const dayName = (d: ISODate) => (d === t ? 'Сегодня' : d === addDays(t, 1) ? 'Завтра' : dayTitle(d).replace(/ \d{4}$/, ''))
  const sections: { id: string; title: string; rows: Row[] }[] = [
    { id: 'late', title: 'Просрочено', rows: late },
    ...[...byDay].sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, list]) => ({ id: d, title: dayName(d), rows: list })),
  ]
  return (
    <>
      <TopBar title="Что делать сейчас">
        <StatusFilter value={filters.statuses} onChange={(statuses) => setFilters({ ...filters, statuses })} options={FILTER} />
      </TopBar>
      <div className="cp-body nr-scroll">
        <div className="cp-now">
          {sections.map((s) =>
            s.rows.length ? (
              <section key={s.id} className={`cp-now__sec cp-now__sec--${s.id === 'late' ? 'late' : 'day'}`} aria-label={s.title}>
                <h2 className="cp-now__title">
                  {s.title} <span className="cp-muted">{s.rows.length}</span>
                </h2>
                {s.rows.map((r) => (
                  <NowRow key={r.unit.key} row={r} late={s.id === 'late'} />
                ))}
              </section>
            ) : null,
          )}
          {rows.length === 0 && (
            <div className="cp-empty">
              <b style={{ color: 'var(--nr-text)' }}>Всё готово</b>
              На две недели вперёд ничего не ждёт работы{filters.statuses.length ? ' (или скрыто фильтром статуса)' : ''}.
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function NowRow({ row, late }: { row: Row; late: boolean }) {
  const { plan, channels, rubrics, rules, setStatus, openTask } = usePlan()
  const { unit, due } = row
  const { head } = unit
  const t = today()
  const left = daysLeft(due, t)
  const c = channels.get(unit.channelId)
  const rule = rules.get(head.ruleId)
  const rubric = rubrics.get(head.rubricId ?? '')
  const format = rule && rule.name !== rubric?.name && !titleIsFormat(head.title, rule) ? rule.name : ''
  const start = head.status === 'planned' || head.status === 'paused'
  const urgent = left <= 0 && head.status !== 'ready'
  const icon = head.status === 'paused' ? 'pause' : head.status === 'ready' ? 'check' : 'play'
  return (
    <div className={`cp-now__row${urgent ? ' cp-now__row--urgent' : ''}`} style={{ '--cp-c': c?.color } as CSSProperties}>
      <span className="cp-now__time">{late ? shortDate(unit.date!) : unit.time}</span>
      <div className="cp-now__main">
        <span className="cp-card__rub">
          {rubric && <RubricChip name={rubric.name} />}
          {format && <span className="cp-card__fmt">{format}</span>}
          {unit.channelId !== mainChannelId(plan) && c && !format.includes(c.name) && <span className="cp-card__fmt">{c.name}</span>}
        </span>
        <button type="button" className={`cp-link cp-now__name${isSlot(head) ? ' cp-slot-text' : ''}`} onClick={() => openTask(head.id)}>
          {shownTitle(head)}
        </button>
      </div>
      <span className="cp-now__meta">
        {head.owner && <span className="cp-now__owner">{head.owner}</span>}
        <span className={`cp-now__due${left < 0 && head.status !== 'ready' ? ' cp-now__due--late' : left === 0 ? ' cp-now__due--today' : ''}`} title="Подготовить к">
          {head.status === 'ready' ? 'готово' : left < 0 ? `срок ${shortDate(due)}` : left === 0 ? 'готовить сегодня' : `к ${shortDate(due)}`}
        </span>
      </span>
      <button
        type="button"
        className={`cp-now__play cp-st--${head.status}${head.status === 'progress' || (urgent && start) ? ' cp-now__play--on' : ''}`}
        aria-label={`${start ? 'Начать' : 'Задача'}: ${shownTitle(head)}`}
        title={start ? 'Начать: откроется задача' : 'Открыть задачу'}
        onClick={() => (start ? setStatus(unit, 'progress') : openTask(head.id))}
      >
        <Icon name={icon} size={14} />
      </button>
    </div>
  )
}
