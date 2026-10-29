// «Не вышло вовремя» — плашкой под шапкой календаря, когда есть просроченное (дата прошла, «Вышло» не отмечено).
// «Наверстать» — одной кнопкой: просроченное встаёт на ближайшие места сетки, остальное сдвигается по очереди;
// «Отменить» во всплывашке возвращает всё. ✕ прячет плашку, пока просроченного не станет больше.
import { useMemo, useState } from 'react'
import { catchUpQueue, overdueOf } from '../model/catchup'
import { shortDate, today } from '../model/dates'
import { plural } from '../model/hint'
import { usePlan } from './ctx'
import { Icon } from './Icon'

const KEY = 'cp:late-hidden'
const readHidden = () => {
  try {
    return Number(sessionStorage.getItem(KEY) ?? 0)
  } catch {
    return 0
  }
}

export function LateBar() {
  const { plan, dispatch, toast } = usePlan()
  const t = today()
  const n = useMemo(() => overdueOf(plan, t).length, [plan, t])
  const [hidden, setHidden] = useState(readHidden) // сколько было, когда спрятали
  if (!n || n <= hidden) return null
  const catchUp = () => {
    const r = catchUpQueue(plan, t)
    if (!r.actions.length) return toast('Нечего переносить')
    dispatch({ type: 'batch', actions: r.actions })
    const first = [...r.moved].sort((a, b) => a.date.localeCompare(b.date))[0]
    toast(
      `Наверстали: ${r.moved.length} ${plural(r.moved.length, 'карточка', 'карточки', 'карточек')} с ${shortDate(first.date)}` +
        (r.shifted.length ? `, дальше по очереди сдвинулось ${r.shifted.length}` : '') +
        (r.filled ? `, занято пустых слотов: ${r.filled}` : ''),
      true,
    )
  }
  const hide = () => {
    setHidden(n)
    try {
      sessionStorage.setItem(KEY, String(n))
    } catch {
      /* спрячется до перезагрузки */
    }
  }
  return (
    <section className="cp-late" aria-label="Не вышло вовремя">
      <Icon name="alert" size={16} />
      <span className="cp-late__text">
        <b>Не вышло вовремя: {n}</b>
        <span className="cp-muted"> — дата прошла, а «Вышло» не отмечено</span>
      </span>
      <button type="button" className="nr-btn nr-btn--primary nr-btn--sm" onClick={catchUp} title="Просроченное — на ближайшие дни, остальное сдвинется по очереди; «Отменить» вернёт">
        Наверстать
      </button>
      <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm nr-btn--icon" aria-label="Скрыть" title="Скрыть, пока просроченного не станет больше" onClick={hide}>
        <Icon name="close" size={14} />
      </button>
    </section>
  )
}
