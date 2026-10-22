import type { CSSProperties } from 'react'
import { addMonths, clampDate, monthGrid, monthKey, monthTitle, SAT, today, WEEKDAYS, weekday } from '../model/dates'
import { visible } from '../model/filters'
import { isSlot, type ISODate } from '../model/types'
import { ChannelDot, IconButton, ItemCard, useDrop } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { TopBar } from '../ui/TopBar'

export function MonthView() {
  const { plan, anchor, setAnchor } = usePlan()
  const month = monthKey(anchor)
  const prev = addMonths(month, -1)
  const next = addMonths(month, 1)
  return (
    <>
      <TopBar title={monthTitle(month)}>
        <nav className="cp-top__nav" aria-label="Месяцы">
          <IconButton icon="chev-left" label="Предыдущий месяц" onClick={() => setAnchor(`${prev}-01`)} disabled={prev < monthKey(plan.start)} />
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => setAnchor(clampDate(today(), plan.start, plan.end))}>
            Сегодня
          </button>
          <IconButton icon="chev-right" label="Следующий месяц" onClick={() => setAnchor(`${next}-01`)} disabled={next > monthKey(plan.end)} />
        </nav>
      </TopBar>
      <div className="cp-body nr-scroll">
        <div className="cp-month" role="grid" aria-label={monthTitle(month)}>
          {WEEKDAYS.map((w) => (
            <div key={w} className="cp-month__wd nr-label" role="columnheader">
              {w}
            </div>
          ))}
          {monthGrid(month).flat().map((d) => (
            <MonthDay key={d} date={d} inMonth={monthKey(d) === month} />
          ))}
        </div>
      </div>
    </>
  )
}

function MonthDay({ date, inMonth }: { date: ISODate; inMonth: boolean }) {
  const { plan, byDate, filters, rules, channels, violByDate, openDay, openDayId, dropOn } = usePlan()
  const drop = useDrop((d) => dropOn(date, d))
  const items = (byDate.get(date) ?? []).filter((it) => visible(it, filters))
  const fulls = items.filter((it) => rules.get(it.ruleId)?.full && !it.derive)
  const slots = items.filter((it) => isSlot(it) && !it.derive).length
  const counts = new Map<string, number>()
  for (const it of items) counts.set(it.channelId, (counts.get(it.channelId) ?? 0) + 1)
  const viol = violByDate.get(date)?.length ?? 0
  const inPlan = date >= plan.start && date <= plan.end
  const day = Number(date.slice(8))
  const cls = [
    'cp-day',
    weekday(date) === SAT && 'cp-day--rest',
    (!inMonth || !inPlan) && 'cp-day--out',
    date === today() && 'cp-day--today',
    drop.over && 'cp-day--drop',
    openDayId === date && 'cp-day--open',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div role="gridcell" className={cls} {...drop.props} onClick={() => inPlan && openDay(date)} data-date={date}>
      <div className="cp-day__head">
        <button
          type="button"
          className="cp-day__num"
          onClick={(e) => {
            e.stopPropagation()
            if (inPlan) openDay(date)
          }}
          aria-label={`Открыть день ${date}`}
        >
          {day}
        </button>
        {weekday(date) === SAT && inPlan && <span className="nr-tag nr-tag--rest">отдых</span>}
        {slots > 0 && <span className="nr-tag nr-tag--warn" title="Слотов без темы">{slots} без темы</span>}
        {viol > 0 && <span className="cp-viol" title={`Нарушений: ${viol}`} aria-label={`Нарушений: ${viol}`} role="img" />}
      </div>
      {fulls.map((it) => (
        <ItemCard key={it.id} item={it} compact />
      ))}
      {fulls.map((it) => (
        <span key={`m-${it.id}`} className="cp-day__mark" style={{ '--cp-c': channels.get(it.channelId)?.color } as CSSProperties} aria-hidden="true" />
      ))}
      {items.length > 0 && (
        <div className="cp-day__counts" aria-label="Публикаций по каналам">
          {[...counts].map(([cid, n]) => {
            const c = channels.get(cid)
            return (
              <span key={cid} title={c?.name}>
                <ChannelDot color={c?.color ?? '#999'} />
                {n}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
