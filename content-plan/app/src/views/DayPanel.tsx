import { addDays, dayTitle } from '../model/dates'
import type { ISODate } from '../model/types'
import type { Unit } from '../model/units'
import { IconButton, UnitCard, useDrop } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'

/** Все материалы дня по каналам и по времени; сюда можно бросить материал или тему из банка.
 *  Статус — значком в углу карточки: ▶ начинает задачу. */
export function DayPanel({ date, onClose }: { date: ISODate; onClose: () => void }) {
  const { byDate, unitsOn, channels, violByDate, openDay, openNew, dropOn, goto } = usePlan()
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
                <span className="cp-viol" aria-hidden="true" /> {v.text}
              </span>
            ))}
          </div>
        )}
        {[...groups].map(([cid, list]) => {
          const c = channels.get(cid)
          return (
            <section key={cid} className="cp-day-group" aria-label={c?.name}>
              <div className="cp-group-head">
                {c?.name}
                <span className="cp-muted">{list.length}</span>
              </div>
              {list.map((u) => (
                <UnitCard key={u.key} unit={u} variant="full" />
              ))}
            </section>
          )
        })}
        {units.length === 0 && <p className="cp-hint">В этот день ничего нет{hidden ? ' (часть скрыта фильтрами)' : ''}.</p>}
        {hidden > 0 && units.length > 0 && <p className="cp-hint">Скрыто фильтрами: {hidden}.</p>}
      </div>
      <div className="cp-sheet__foot">
        <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => openNew({ date })}>
          <Icon name="plus" size={16} />
          Материал на этот день
        </button>
        <span className="cp-top__spacer" />
        <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => goto('week', date)}>
          Неделя этого дня
        </button>
      </div>
    </aside>
  )
}
