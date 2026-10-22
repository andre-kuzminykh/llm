import { addDays, dayTitle } from '../model/dates'
import { visible } from '../model/filters'
import { KIND_LABEL } from '../model/rules'
import type { ISODate, Item } from '../model/types'
import { ChannelDot, IconButton, ItemCard, useDrop } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'

/** Все материалы дня по каналам; сюда можно бросить материал или тему из банка. */
export function DayPanel({ date, onClose }: { date: ISODate; onClose: () => void }) {
  const { plan, byDate, filters, channels, violByDate, openDay, openNew, dropOn } = usePlan()
  const drop = useDrop((d) => dropOn(date, d))
  const all = byDate.get(date) ?? []
  const items = all.filter((it) => visible(it, filters))
  const hidden = all.length - items.length
  const groups = new Map<string, Item[]>()
  for (const it of items) groups.set(it.channelId, [...(groups.get(it.channelId) ?? []), it])
  const viol = violByDate.get(date) ?? []
  return (
    <aside className={`cp-sheet${drop.over ? ' cp-sheet--drop' : ''}`} aria-label={dayTitle(date)} {...drop.props}>
      <div className="cp-sheet__head">
        <IconButton icon="chev-left" label="Предыдущий день" onClick={() => openDay(addDays(date, -1))} disabled={date <= plan.start} size="sm" />
        <h2 className="cp-sheet__title">{dayTitle(date)}</h2>
        <IconButton icon="chev-right" label="Следующий день" onClick={() => openDay(addDays(date, 1))} disabled={date >= plan.end} size="sm" />
        <IconButton icon="close" label="Закрыть" onClick={onClose} />
      </div>
      <div className="cp-sheet__body nr-scroll">
        {viol.length > 0 && (
          <div className="cp-viol-box" role="alert">
            {viol.map((v, i) => (
              <span key={i}>
                <b>{KIND_LABEL[v.kind]}:</b> {v.text}
              </span>
            ))}
          </div>
        )}
        <p className="cp-hint">Перетащите карточку на день в календаре, чтобы перенести. Тизер, анонсы и письма FULL поедут вместе.</p>
        {[...groups].map(([cid, list]) => {
          const c = channels.get(cid)
          return (
            <section key={cid} className="cp-list" aria-label={c?.name}>
              <div className="cp-group-head" style={{ color: c?.color }}>
                <ChannelDot color={c?.color ?? '#999'} />
                {c?.name}
                <span className="cp-muted" style={{ fontWeight: 500 }}>{list.length}</span>
              </div>
              {list.map((it) => (
                <ItemCard key={it.id} item={it} />
              ))}
            </section>
          )
        })}
        {items.length === 0 && <p className="cp-hint">В этот день ничего нет{hidden ? ' (часть скрыта фильтрами)' : ''}.</p>}
        {hidden > 0 && items.length > 0 && <p className="cp-hint">Скрыто фильтрами: {hidden}.</p>}
      </div>
      <div className="cp-sheet__foot">
        <button type="button" className="nr-btn nr-btn--secondary" onClick={() => openNew({ date })}>
          <Icon name="plus" size={16} />
          Материал на этот день
        </button>
      </div>
    </aside>
  )
}
