import { useState, type CSSProperties } from 'react'
import { addDays, addMonths, dayTitle, monthKey, monthTitle, today } from '../model/dates'
import { visible } from '../model/filters'
import { isSlot, shownTitle, type ISODate } from '../model/types'
import { timeText, unitsOf, type Unit } from '../model/units'
import { IconButton, StatusPicker } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { DateJump, TopBar } from '../ui/TopBar'

const LIMIT = 300

/** Контент-план списком: по дням месяца или поиском по всему плану. Одна строка — одна карточка. */
export function PlanView() {
  const { plan, anchor, jumpTo, unitsOn, filters, violByDate, rules } = usePlan()
  const [query, setQuery] = useState('')
  const month = monthKey(anchor)
  const q = query.trim().toLowerCase()

  let days: [ISODate, Unit[]][] = []
  let total = 0
  if (q) {
    const hits = plan.items.filter((it) => it.date && visible(it, filters) && it.title.toLowerCase().includes(q))
    const byDay = new Map<ISODate, typeof hits>()
    for (const it of hits) byDay.set(it.date!, [...(byDay.get(it.date!) ?? []), it])
    const order = plan.channels.map((c) => c.id)
    const all = [...byDay].sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, list]) => [d, unitsOf(list, rules, order)] as [ISODate, Unit[]])
    total = all.reduce((n, [, u]) => n + u.length, 0)
    let n = 0
    for (const [d, u] of all) {
      if (n >= LIMIT) break
      days.push([d, u])
      n += u.length
    }
  } else {
    days = []
    for (let d = `${month}-01`; monthKey(d) === month; d = addDays(d, 1)) {
      const list = unitsOn(d)
      if (list.length) days.push([d, list])
    }
  }

  return (
    <>
      <TopBar title={q ? 'Поиск по плану' : <DateJump label={`План · ${monthTitle(month)}`} value={anchor} onPick={jumpTo} />}>
        {!q && (
          <nav className="cp-top__nav" aria-label="Месяцы">
            <IconButton icon="chev-left" label="Предыдущий месяц" onClick={() => jumpTo(`${addMonths(month, -1)}-01`)} />
            <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => jumpTo(today())}>
              Сегодня
            </button>
            <IconButton icon="chev-right" label="Следующий месяц" onClick={() => jumpTo(`${addMonths(month, 1)}-01`)} />
          </nav>
        )}
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
        <div className="cp-plan">
          {q && <p className="cp-muted">Найдено: {total}{total > LIMIT ? `, показаны первые ${LIMIT}` : ''}</p>}
          {days.map(([d, list]) => (
            <section key={d} aria-label={dayTitle(d)}>
              <div className="cp-plan__day">
                {dayTitle(d)}
                {(violByDate.get(d)?.length ?? 0) > 0 && <span className="cp-viol" role="img" aria-label={`Нарушений: ${violByDate.get(d)!.length}`} title={violByDate.get(d)!.map((v) => v.text).join('\n')} />}
              </div>
              {list.map((u) => (
                <PlanRow key={u.key} unit={u} />
              ))}
            </section>
          ))}
          {days.length === 0 && <p className="cp-empty">Ничего не найдено.</p>}
        </div>
      </div>
    </>
  )
}

function PlanRow({ unit }: { unit: Unit }) {
  const { channels, labelOf, openItem, setStatus } = usePlan()
  const { head } = unit
  const c = channels.get(unit.channelId)
  const section = c?.sections.find((s) => s.id === head.sectionId)
  return (
    <div className="cp-plan__row" style={{ '--cp-c': c?.color } as CSSProperties}>
      <span className="cp-plan__time">{timeText(unit)}</span>
      <span className="cp-plan__ch">{section?.name ?? c?.name}</span>
      <span className="cp-plan__label">{labelOf(head)}</span>
      <button type="button" className={`cp-link cp-plan__title${isSlot(head) ? ' cp-slot-text' : ''}`} onClick={() => openItem(head.id)}>
        {shownTitle(head)}
      </button>
      <StatusPicker size="sm" label={`Статус: ${labelOf(head)}: ${shownTitle(head)}`} value={head.status} onChange={(s) => setStatus(unit, s)} />
    </div>
  )
}
