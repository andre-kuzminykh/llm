import type { CSSProperties } from 'react'
import { addDays, shortDate, today, WEEKDAYS, weekday } from '../model/dates'
import { AUTO_RULES } from '../model/filters'
import { shownTitle, STATUSES, titleIsFormat, type ISODate, type Status } from '../model/types'
import { daysLeft, dueOf, platformTypes, type Unit } from '../model/units'
import { PlatformIcon, RubricChip, StatusIcon } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'
import { TopBar } from '../ui/TopBar'

const AHEAD = 14 // на сколько дней вперёд смотреть
const BACK = 14 // и сколько назад — за просроченным

interface Row {
  unit: Unit
  due: ISODate
}

/** Что делать сейчас: что подготовить в ближайшие две недели, по сроку подготовки. Авто-рубрики не показываются. */
export function NowView() {
  const { unitsOn, rules, filters, setFilters } = usePlan()
  const t = today()
  const rows: Row[] = []
  for (let d = addDays(t, -BACK); d <= addDays(t, AHEAD); d = addDays(d, 1)) {
    for (const u of unitsOn(d)) {
      if (AUTO_RULES.has(u.head.ruleId) || u.head.status === 'published') continue
      const due = dueOf(u.head, rules.get(u.head.ruleId))!
      if (d < t && u.head.status === 'ready') continue
      rows.push({ unit: u, due })
    }
  }
  rows.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.unit.date! < b.unit.date! ? -1 : a.unit.date! > b.unit.date! ? 1 : a.unit.time < b.unit.time ? -1 : 1))
  const ready = rows.filter((r) => r.unit.head.status === 'ready')
  const todo = rows.filter((r) => r.unit.head.status !== 'ready')
  const sections: { id: string; title: string; rows: Row[] }[] = [
    { id: 'late', title: 'Просрочено', rows: todo.filter((r) => r.due < t) },
    { id: 'today', title: 'Сегодня', rows: todo.filter((r) => r.due === t) },
    { id: 'tomorrow', title: 'Завтра', rows: todo.filter((r) => r.due === addDays(t, 1)) },
    { id: 'week', title: 'На неделе', rows: todo.filter((r) => r.due > addDays(t, 1) && r.due <= addDays(t, 7)) },
    { id: 'later', title: 'Дальше', rows: todo.filter((r) => r.due > addDays(t, 7)) },
    { id: 'ready', title: 'Готово, ждёт выхода', rows: ready },
  ]
  const toggle = (s: Status) => setFilters({ ...filters, statuses: filters.statuses.includes(s) ? filters.statuses.filter((x) => x !== s) : [...filters.statuses, s] })
  return (
    <>
      <TopBar title="Что делать сейчас">
        <StatusFilter value={filters.statuses} onToggle={toggle} />
      </TopBar>
      <div className="cp-body nr-scroll">
        <div className="cp-now">
          <p className="cp-hint">
            Что подготовить на две недели вперёд, без ежедневных авто-публикаций. Срок — когда материал должен быть готов: FULL — за 3 дня до выхода, остальное — за день.
            ▶ — начать и открыть задачу.
          </p>
          {sections.map((s) =>
            s.rows.length ? (
              <section key={s.id} className={`cp-now__sec cp-now__sec--${s.id}`} aria-label={s.title}>
                <h2 className="cp-now__title">
                  {s.title} <span className="cp-muted">{s.rows.length}</span>
                </h2>
                {s.rows.map((r) => (
                  <NowRow key={r.unit.key} row={r} />
                ))}
              </section>
            ) : null,
          )}
          {rows.length === 0 && (
            <div className="cp-empty">
              <span className="nr-logo">✓</span>
              <b style={{ color: 'var(--nr-text)' }}>Всё готово</b>
              На две недели вперёд ничего не ждёт работы{filters.statuses.length ? ' (или скрыто фильтром статусов)' : ''}.
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/** Фильтр по статусу значками: нажатые — показываются; ничего не нажато — видно всё. */
export function StatusFilter({ value, onToggle }: { value: Status[]; onToggle: (s: Status) => void }) {
  return (
    <div className="cp-stp cp-stp--md cp-stp--filter" role="group" aria-label="Показывать статусы">
      {STATUSES.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`cp-stp__btn cp-st--${s.id}`}
          aria-pressed={value.includes(s.id)}
          aria-label={`Только «${s.label}»`}
          title={`Показывать «${s.label}»`}
          onClick={() => onToggle(s.id)}
        >
          {s.icon ? <Icon name={s.icon} size={16} /> : <span className="cp-st-none" aria-hidden="true" />}
        </button>
      ))}
    </div>
  )
}

function NowRow({ row }: { row: Row }) {
  const { plan, channels, rubrics, rules, setStatus, openTask } = usePlan()
  const { unit, due } = row
  const { head } = unit
  const t = today()
  const left = daysLeft(due, t)
  const c = channels.get(unit.channelId)
  const rule = rules.get(head.ruleId)
  const rubric = rubrics.get(head.rubricId ?? '')
  const format = rule && rule.name !== rubric?.name && !titleIsFormat(head.title, rule) ? rule.name : ''
  const plats = platformTypes(unit, rules, plan.platforms)
  const start = head.status === 'planned' || head.status === 'paused'
  const date = unit.date!
  return (
    <div className="cp-now__row" style={{ '--cp-c': c?.color } as CSSProperties}>
      <button
        type="button"
        className={`cp-now__play cp-st--${start ? 'progress' : head.status}`}
        aria-label={`${start ? 'Начать' : 'Задача'}: ${shownTitle(head)}`}
        title={start ? 'Начать: откроется задача' : 'Открыть задачу'}
        onClick={() => (start ? setStatus(unit, 'progress') : openTask(head.id))}
      >
        <Icon name={start ? 'play' : head.status === 'progress' ? 'play' : head.status === 'ready' ? 'check' : 'published'} size={18} />
      </button>
      <div className="cp-now__main">
        <span className="cp-card__rub">
          {rubric && <RubricChip name={rubric.name} />}
          {format && <span className="cp-card__fmt">{format}</span>}
          <StatusIcon status={head.status} />
        </span>
        <button type="button" className="cp-link cp-now__name" onClick={() => openTask(head.id)}>
          {shownTitle(head)}
        </button>
        <span className="cp-now__meta">
          <span className="cp-ch">
            <span className="nr-dot" style={{ background: c?.color }} aria-hidden="true" />
            {c?.name}
          </span>
          <span className="cp-card__icons" aria-label={`Площадки: ${plats.map((p) => p.platform).join(', ')}`}>
            {plats.map(({ platform }) => (
              <PlatformIcon key={platform} platform={platform} size={12} />
            ))}
          </span>
          {head.owner && (
            <span className="cp-now__owner">
              <Icon name="user" size={12} />
              {head.owner}
            </span>
          )}
        </span>
      </div>
      <div className="cp-now__when">
        <span className={`cp-now__due${left < 0 ? ' cp-now__due--late' : left === 0 ? ' cp-now__due--today' : ''}`}>
          <Icon name="flag" size={12} />
          {left < 0 ? `просрочено на ${-left} дн.` : left === 0 ? 'сегодня' : `до ${shortDate(due)}`}
        </span>
        <span className="cp-muted">
          выход {WEEKDAYS[weekday(date)]}, {shortDate(date)}, {unit.time}
        </span>
      </div>
    </div>
  )
}
