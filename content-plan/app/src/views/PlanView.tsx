import { useState } from 'react'
import { addDays, addMonths, clampDate, dayTitle, monthKey, monthTitle, today } from '../model/dates'
import { visible } from '../model/filters'
import { isSlot, STATUSES, type ISODate, type Item, type Status } from '../model/types'
import { ChannelDot, IconButton, Platforms } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { TopBar } from '../ui/TopBar'

const LIMIT = 300

/** Контент-план списком: по дням месяца или поиском по всему плану. */
export function PlanView() {
  const { plan, anchor, setAnchor, byDate, filters, violByDate } = usePlan()
  const [query, setQuery] = useState('')
  const month = monthKey(anchor)
  const q = query.trim().toLowerCase()

  let days: [ISODate, Item[]][] = []
  let total = 0
  if (q) {
    const hits = plan.items.filter((it) => it.date && visible(it, filters) && it.title.toLowerCase().includes(q))
    total = hits.length
    const map = new Map<ISODate, Item[]>()
    for (const it of hits.sort((a, b) => (a.date! < b.date! ? -1 : 1)).slice(0, LIMIT)) map.set(it.date!, [...(map.get(it.date!) ?? []), it])
    days = [...map]
  } else {
    for (let d = `${month}-01`; monthKey(d) === month; d = addDays(d, 1)) {
      const list = (byDate.get(d) ?? []).filter((it) => visible(it, filters))
      if (list.length) days.push([d, list])
    }
  }

  return (
    <>
      <TopBar title={q ? 'Поиск по плану' : `План · ${monthTitle(month)}`}>
        {!q && (
          <nav className="cp-top__nav" aria-label="Месяцы">
            <IconButton icon="chev-left" label="Предыдущий месяц" onClick={() => setAnchor(`${addMonths(month, -1)}-01`)} disabled={addMonths(month, -1) < monthKey(plan.start)} />
            <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => setAnchor(clampDate(today(), plan.start, plan.end))}>
              Сегодня
            </button>
            <IconButton icon="chev-right" label="Следующий месяц" onClick={() => setAnchor(`${addMonths(month, 1)}-01`)} disabled={addMonths(month, 1) > monthKey(plan.end)} />
          </nav>
        )}
        <input
          className="nr-field nr-field--sm"
          style={{ width: 240 }}
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
                {(violByDate.get(d)?.length ?? 0) > 0 && <span className="nr-tag nr-tag--danger">нарушений: {violByDate.get(d)!.length}</span>}
              </div>
              {list.map((it) => (
                <PlanRow key={it.id} item={it} />
              ))}
            </section>
          ))}
          {days.length === 0 && <p className="cp-empty">Ничего не найдено.</p>}
        </div>
      </div>
    </>
  )
}

function PlanRow({ item }: { item: Item }) {
  const { channels, labelOf, openItem, dispatch } = usePlan()
  const c = channels.get(item.channelId)
  const section = c?.sections.find((s) => s.id === item.sectionId)
  return (
    <div className="cp-plan__row">
      <span className="cp-ch">
        <ChannelDot color={c?.color ?? '#999'} />
        {section?.name ?? c?.name}
      </span>
      <span className="cp-muted">{labelOf(item)}</span>
      <button type="button" className={`cp-link${isSlot(item) ? ' cp-slot-text' : ''}`} onClick={() => openItem(item.id)}>
        {item.title}
      </button>
      <Platforms list={item.platforms} />
      <select
        className="nr-field nr-field--sm"
        aria-label={`Статус: ${item.title}`}
        value={item.status}
        onChange={(e) => dispatch({ type: 'update', id: item.id, patch: { status: e.target.value as Status } })}
      >
        {STATUSES.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
    </div>
  )
}
