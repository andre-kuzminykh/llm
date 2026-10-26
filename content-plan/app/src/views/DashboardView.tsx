import { useState, type CSSProperties } from 'react'
import { addDays, dayTitle, shortDate, today } from '../model/dates'
import { AUTO_RULES, visible } from '../model/filters'
import { isSlot, shownTitle, tagOf, titleIsFormat, type ISODate, type Rubric, type Status } from '../model/types'
import { daysLeft, dueOf, timeText, unitsOf, type Unit } from '../model/units'
import { mainChannelId, RubricChip, StatusFilter, StatusPicker } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'
import { TopBar } from '../ui/TopBar'
import { BankPanel } from './BankView'

const AHEAD = 14 // на сколько дней вперёд смотреть
const BACK = 14 // и сколько назад — за просроченным
const LIMIT = 300 // строк поиска

interface Row {
  unit: Unit
  due: ISODate
}

const FILTER: Status[] = ['progress', 'paused', 'ready']

/** Дашборд SMM: что делать сейчас, банк идей и темы-хэштеги по каналам; поиск — по всему плану. */
export function DashboardView() {
  const { filters, setFilters } = usePlan()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  return (
    <>
      <TopBar title="Дашборд">
        <input
          className="nr-field nr-field--sm cp-search"
          type="search"
          placeholder="Найти тему во всём плане"
          aria-label="Поиск по плану"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </TopBar>
      <div className="cp-body nr-scroll">
        {q ? (
          <SearchResults q={q} />
        ) : (
          <div className="cp-dash">
            <Stats />
            <div className="cp-dash__cols">
              <section className="cp-panel cp-dash__todo" aria-labelledby="todo-h">
                <div className="cp-panel__head">
                  <h2 className="cp-panel__title" id="todo-h">Что делать</h2>
                  <StatusFilter value={filters.statuses} onChange={(statuses) => setFilters({ ...filters, statuses })} options={FILTER} />
                </div>
                <TodoList />
              </section>
              <div className="cp-dash__side">
                <BankPanel />
                <TopicsPanel />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

/** Что подготовить в ближайшие две недели: сверху просроченное, дальше — по дням выхода. Авто-рубрики не показываются. */
function useTodo() {
  const { unitsOn, rules } = usePlan()
  const t = today()
  const rows: Row[] = []
  for (let d = addDays(t, -BACK); d <= addDays(t, AHEAD); d = addDays(d, 1)) {
    for (const u of unitsOn(d)) {
      if (AUTO_RULES.has(u.head.ruleId) || u.head.status === 'published') continue
      if (d < t && u.head.status === 'ready') continue
      rows.push({ unit: u, due: dueOf(u.head, rules.get(u.head.ruleId))! })
    }
  }
  return rows
}

function Stats() {
  const { plan } = usePlan()
  const rows = useTodo()
  const t = today()
  const late = rows.filter((r) => r.due < t && r.unit.head.status !== 'ready').length
  const week = rows.filter((r) => r.unit.date! >= t && r.unit.date! <= addDays(t, 6)).length
  const work = rows.filter((r) => r.unit.head.status === 'progress').length
  const ready = rows.filter((r) => r.unit.head.status === 'ready').length
  const slots = plan.items.filter((x) => x.date && x.date >= t && x.date <= addDays(t, 30) && !x.derive && isSlot(x)).length
  const cells: { n: number; label: string; late?: boolean }[] = [
    { n: late, label: 'просрочено', late: late > 0 },
    { n: week, label: 'выходит за 7 дней' },
    { n: work, label: 'в работе' },
    { n: ready, label: 'готово, ждёт выхода' },
    { n: slots, label: 'слотов без темы на месяц' },
  ]
  return (
    <dl className="cp-stats" aria-label="Сводка">
      {cells.map((c) => (
        <div key={c.label} className={`cp-stats__c${c.late ? ' cp-stats__c--late' : ''}`}>
          <dt>{c.label}</dt>
          <dd>{c.n}</dd>
        </div>
      ))}
    </dl>
  )
}

function TodoList() {
  const { filters } = usePlan()
  const rows = useTodo()
  const t = today()
  const late = rows.filter((r) => r.due < t && r.unit.head.status !== 'ready').sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
  const rest = rows.filter((r) => !late.includes(r))
  const byDay = new Map<ISODate, Row[]>()
  for (const r of rest) byDay.set(r.unit.date!, [...(byDay.get(r.unit.date!) ?? []), r])
  const dayName = (d: ISODate) => (d === t ? 'Сегодня' : d === addDays(t, 1) ? 'Завтра' : dayTitle(d).replace(/ \d{4}$/, ''))
  const sections: { id: string; title: string; rows: Row[] }[] = [
    { id: 'late', title: 'Просрочено', rows: late },
    ...[...byDay].sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, list]) => ({ id: d, title: dayName(d), rows: list })),
  ]
  if (!rows.length)
    return (
      <p className="cp-empty">
        На две недели вперёд ничего не ждёт работы{filters.statuses.length ? ' (или скрыто фильтром статуса)' : ''}.
      </p>
    )
  return (
    <div className="cp-now">
      {sections.map((s) =>
        s.rows.length ? (
          <section key={s.id} className={`cp-now__sec cp-now__sec--${s.id === 'late' ? 'late' : 'day'}`} aria-label={s.title}>
            <h3 className="cp-now__title">
              {s.title} <span className="cp-muted">{s.rows.length}</span>
            </h3>
            {s.rows.map((r) => (
              <TodoRow key={r.unit.key} row={r} late={s.id === 'late'} />
            ))}
          </section>
        ) : null,
      )}
    </div>
  )
}

function TodoRow({ row, late }: { row: Row; late: boolean }) {
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
      <span className="cp-now__time">{late ? shortDate(unit.date!) : timeText(unit)}</span>
      <div className="cp-now__main">
        <span className="cp-card__rub">
          {rubric && <RubricChip name={rubric.name} />}
          {format && <span className="cp-card__fmt">{format}</span>}
          {unit.channelId !== mainChannelId(plan) && c && !format.includes(c.name) && <span className="cp-card__fmt">{c.name}</span>}
          {head.trigger && <span className="cp-auto" title="Версия для другой площадки: началась, когда вышел оригинал"><Icon name="bolt" size={11} /> авто</span>}
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

/** Темы-хэштеги по каналам и их разделам (Лаборатория, Академия, Кабинет); нажали — календарь только по этой теме. */
function TopicsPanel() {
  const { plan, filters, setFilters, goto, dispatch, rubrics } = usePlan()
  const [edit, setEdit] = useState(false)
  const [name, setName] = useState('')
  const t = today()
  const soon = new Map<string, number>()
  for (const it of plan.items) if (it.rubricId && it.date && it.date >= t && it.date <= addDays(t, 30) && !it.derive) soon.set(it.rubricId, (soon.get(it.rubricId) ?? 0) + 1)
  const tagsOf = (channelId: string, sectionId?: string) => {
    const ids = new Set(plan.rules.filter((r) => r.channelId === channelId && (r.sectionId ?? undefined) === sectionId && r.rubricId).map((r) => r.rubricId!))
    return plan.rubrics.filter((r) => ids.has(r.id))
  }
  const only = (r: Rubric) => {
    setFilters({ ...filters, hiddenRubrics: plan.rubrics.filter((x) => x.id !== r.id).map((x) => x.id) })
    goto('week')
  }
  const Tag = ({ r }: { r: Rubric }) =>
    edit ? (
      <input
        className="cp-tag-in"
        aria-label={`Хэштег ${tagOf(r.name)}`}
        defaultValue={r.name}
        size={Math.max(6, r.name.length + 1)}
        onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== r.name && dispatch({ type: 'rubric', id: r.id, patch: { name: e.target.value.trim() } })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    ) : (
      <button type="button" className="cp-tag" onClick={() => only(r)} title={`${rubrics.get(r.id)?.what ?? ''}\nВ ближайший месяц: ${soon.get(r.id) ?? 0}. Нажмите — календарь только по этой теме`}>
        {tagOf(r.name)}
        {soon.get(r.id) ? <span className="cp-muted">{soon.get(r.id)}</span> : null}
      </button>
    )
  return (
    <section className="cp-panel" aria-labelledby="topics-h">
      <div className="cp-panel__head">
        <h2 className="cp-panel__title" id="topics-h">Темы</h2>
        <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" aria-pressed={edit} onClick={() => setEdit(!edit)}>
          <Icon name="pencil" size={14} />
          {edit ? 'Готово' : 'Править'}
        </button>
      </div>
      <div className="cp-topics">
        {plan.channels.map((c) => {
          const own = tagsOf(c.id)
          const parts = c.sections.map((s) => ({ s, tags: tagsOf(c.id, s.id) })).filter((x) => x.tags.length)
          if (!own.length && !parts.length) return null
          return (
            <div key={c.id} className="cp-topics__ch" style={{ '--cp-c': c.color } as CSSProperties} role="group" aria-label={`Темы: ${c.name}`}>
              <span className="cp-topics__name">{c.name}</span>
              <span className="cp-tags">{own.map((r) => <Tag key={r.id} r={r} />)}</span>
              {parts.map(({ s, tags }) => (
                <div key={s.id} className="cp-topics__sec" role="group" aria-label={`Темы: ${s.web}`}>
                  <span className="cp-topics__name cp-muted" title={s.name}>{s.web}</span>
                  <span className="cp-tags">{tags.map((r) => <Tag key={r.id} r={r} />)}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
      {edit && (
        <form
          className="cp-bank__add"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            dispatch({ type: 'addRubric', name: name.trim().replace(/^#/, '') })
            setName('')
          }}
        >
          <input className="nr-field nr-field--sm" placeholder="Новый хэштег" aria-label="Новый хэштег" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="nr-btn nr-btn--ghost nr-btn--sm" disabled={!name.trim()}>Добавить</button>
        </form>
      )}
    </section>
  )
}

/** Поиск темы по всему плану: строки по дням, статус значком. */
function SearchResults({ q }: { q: string }) {
  const { plan, filters, rules } = usePlan()
  const hits = plan.items.filter((it) => it.date && visible(it, filters) && it.title.toLowerCase().includes(q))
  const byDay = new Map<ISODate, typeof hits>()
  for (const it of hits) byDay.set(it.date!, [...(byDay.get(it.date!) ?? []), it])
  const order = plan.channels.map((c) => c.id)
  const all = [...byDay].sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, list]) => [d, unitsOf(list, rules, order)] as [ISODate, Unit[]])
  const total = all.reduce((n, [, u]) => n + u.length, 0)
  const days: [ISODate, Unit[]][] = []
  let n = 0
  for (const [d, u] of all) {
    if (n >= LIMIT) break
    days.push([d, u])
    n += u.length
  }
  return (
    <div className="cp-plan">
      <p className="cp-muted">Найдено: {total}{total > LIMIT ? `, показаны первые ${LIMIT}` : ''}</p>
      {days.map(([d, list]) => (
        <section key={d} aria-label={dayTitle(d)}>
          <div className="cp-plan__day">{dayTitle(d)}</div>
          {list.map((u) => (
            <SearchRow key={u.key} unit={u} />
          ))}
        </section>
      ))}
      {days.length === 0 && <p className="cp-empty">Ничего не найдено.</p>}
    </div>
  )
}

function SearchRow({ unit }: { unit: Unit }) {
  const { channels, labelOf, openItem, setStatus } = usePlan()
  const { head } = unit
  const c = channels.get(unit.channelId)
  const section = c?.sections.find((s) => s.id === head.sectionId)
  return (
    <div className="cp-plan__row" style={{ '--cp-c': c?.color } as CSSProperties}>
      <span className="cp-plan__time">{timeText(unit)}</span>
      <span className="cp-plan__ch">{section?.web ?? c?.name}</span>
      <span className="cp-plan__label">{labelOf(head)}</span>
      <button type="button" className={`cp-link cp-plan__title${isSlot(head) ? ' cp-slot-text' : ''}`} onClick={() => openItem(head.id)}>
        {shownTitle(head)}
      </button>
      <StatusPicker size="sm" label={`Статус: ${labelOf(head)}: ${shownTitle(head)}`} value={head.status} onChange={(s) => setStatus(unit, s)} />
    </div>
  )
}
