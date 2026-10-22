import { addDays, dayTitle } from '../model/dates'
import { KIND_LABEL } from '../model/rules'
import { shownTitle, type ISODate } from '../model/types'
import type { Unit } from '../model/units'
import { ChannelDot, IconButton, StatusPicker, UnitCard, useDrop } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'

/** Все материалы дня по каналам и по времени; сюда можно бросить материал или тему из банка. */
export function DayPanel({ date, onClose }: { date: ISODate; onClose: () => void }) {
  const { byDate, unitsOn, channels, labelOf, violByDate, openDay, openNew, dropOn, setStatus, goto, phone } = usePlan()
  const drop = useDrop((d) => dropOn(date, d))
  const units = unitsOn(date)
  const total = (byDate.get(date) ?? []).length
  const shown = units.reduce((n, u) => n + u.items.length, 0)
  const hidden = total - shown
  const groups = new Map<string, Unit[]>()
  for (const u of units) groups.set(u.channelId, [...(groups.get(u.channelId) ?? []), u])
  const viol = violByDate.get(date) ?? []
  return (
    <aside className={`cp-sheet${drop.over ? ' cp-sheet--drop' : ''}`} aria-label={dayTitle(date)} {...drop.props}>
      <div className="cp-sheet__head">
        <IconButton icon="chev-left" label="Предыдущий день" onClick={() => openDay(addDays(date, -1))} size="sm" />
        <h2 className="cp-sheet__title">{dayTitle(date)}</h2>
        <IconButton icon="chev-right" label="Следующий день" onClick={() => openDay(addDays(date, 1))} size="sm" />
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
        {!phone && <p className="cp-hint">Перетащите карточку на день в календаре, чтобы перенести. Тизер, анонсы и письма FULL поедут вместе. ▶ — начать и открыть задачу.</p>}
        {[...groups].map(([cid, list]) => {
          const c = channels.get(cid)
          return (
            <section key={cid} className="cp-list" aria-label={c?.name}>
              <div className="cp-group-head" style={{ color: c?.color }}>
                <ChannelDot color={c?.color ?? '#999'} />
                {c?.name}
                <span className="cp-muted" style={{ fontWeight: 500 }}>{list.length}</span>
              </div>
              {list.map((u) => (
                <div key={u.key} className="cp-day-item">
                  <UnitCard unit={u} variant="full" />
                  <StatusPicker
                    size="sm"
                    label={`Статус: ${labelOf(u.head)}: ${shownTitle(u.head)}`}
                    value={u.head.status}
                    onChange={(s) => setStatus(u, s)}
                  />
                </div>
              ))}
            </section>
          )
        })}
        {units.length === 0 && <p className="cp-hint">В этот день ничего нет{hidden ? ' (часть скрыта фильтрами)' : ''}.</p>}
        {hidden > 0 && units.length > 0 && <p className="cp-hint">Скрыто фильтрами: {hidden}.</p>}
      </div>
      <div className="cp-sheet__foot">
        <button type="button" className="nr-btn nr-btn--secondary" onClick={() => openNew({ date })}>
          <Icon name="plus" size={16} />
          Материал на этот день
        </button>
        <span className="cp-top__spacer" />
        <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => goto('week', date)}>
          <Icon name="week" size={16} />
          Открыть неделю
        </button>
      </div>
    </aside>
  )
}
