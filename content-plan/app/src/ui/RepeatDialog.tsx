// «Другое…» у повтора — окно как в Google Календаре: повторять с интервалом N (дней, недель, месяцев, лет), дни недели,
// у месяца — то же число или тот же по счёту день недели; окончание — никогда (до конца плана), дата или после N раз.
import { useEffect, useRef, useState } from 'react'
import { addDays, shortDate, weekday, WEEKDAYS } from '../model/dates'
import { nthOfMonth, unitWord, type RepeatEnd, type RepeatRule, type RepeatUnit } from '../model/repeat'
import type { ISODate } from '../model/types'

const UNITS: RepeatUnit[] = ['day', 'week', 'month', 'year']
// «в 4-ю среду», «в 1-й понедельник», «в 2-е воскресенье»
const DAY_ACC = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье']
const DAY_END = ['й', 'й', 'ю', 'й', 'ю', 'ю', 'е']

export function RepeatDialog({ start, rule, planEnd, onDone, onCancel }: {
  start: ISODate
  rule: RepeatRule | null
  planEnd: ISODate
  onDone: (r: RepeatRule) => void
  onCancel: () => void
}) {
  const wd = weekday(start)
  const [every, setEvery] = useState(rule?.every ?? 1)
  const [unit, setUnit] = useState<RepeatUnit>(rule?.unit ?? 'week')
  const [days, setDays] = useState<number[]>(rule?.days.length ? rule.days : [wd])
  const [monthBy, setMonthBy] = useState<'weekday' | 'date'>(rule?.monthBy ?? 'weekday')
  const [endKind, setEndKind] = useState<RepeatEnd['kind']>(rule?.end.kind ?? 'never')
  const [endDate, setEndDate] = useState<ISODate>(rule?.end.kind === 'date' ? rule.end.date : addDays(start, 91))
  const [count, setCount] = useState(rule?.end.kind === 'count' ? rule.end.count : 13)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => box.current?.querySelector<HTMLInputElement>('input')?.focus(), [])
  const toggle = (d: number) => setDays(days.includes(d) ? (days.length > 1 ? days.filter((x) => x !== d) : days) : [...days, d].sort())
  const done = () =>
    onDone({
      every: Math.max(1, Math.min(99, every || 1)),
      unit,
      days: unit === 'week' ? days : unit === 'month' && monthBy === 'weekday' ? [wd] : [],
      ...(unit === 'month' ? { monthBy } : {}),
      end: endKind === 'date' ? { kind: 'date', date: endDate } : endKind === 'count' ? { kind: 'count', count: Math.max(1, Math.min(999, count || 1)) } : { kind: 'never' },
    })
  return (
    <div className="cp-dialog__scrim" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        ref={box}
        className="cp-dialog nr-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Повтор"
        onKeyDown={(e) => {
          // Esc закрывает только окно повтора, форма остаётся
          if (e.key === 'Escape') {
            e.stopPropagation()
            onCancel()
          }
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
            e.preventDefault()
            e.stopPropagation()
            done()
          }
        }}
      >
        <h2 className="cp-dialog__title">Повтор</h2>
        <div className="cp-dialog__row">
          <span>Повторять с интервалом</span>
          <input className="nr-field cp-dialog__num" type="number" min={1} max={99} aria-label="Интервал" value={every} onChange={(e) => setEvery(Number(e.target.value))} />
          <select className="nr-field cp-dialog__unit" aria-label="Единица" value={unit} onChange={(e) => setUnit(e.target.value as RepeatUnit)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>{unitWord(u, every || 1)}</option>
            ))}
          </select>
        </div>
        {unit === 'week' && (
          <div className="cp-dialog__block">
            <span className="cp-dialog__label">Дни повторения</span>
            <div className="cp-dialog__days" role="group" aria-label="Дни повторения">
              {WEEKDAYS.map((w, i) => (
                <button key={w} type="button" className="cp-dialog__day" aria-pressed={days.includes(i)} onClick={() => toggle(i)}>
                  {w}
                </button>
              ))}
            </div>
          </div>
        )}
        {unit === 'month' && (
          <select className="nr-field" aria-label="Какой день месяца" value={monthBy} onChange={(e) => setMonthBy(e.target.value as 'weekday' | 'date')}>
            <option value="weekday">В {nthOfMonth(start)}-{DAY_END[wd]} {DAY_ACC[wd]} месяца</option>
            <option value="date">{Number(start.slice(8))}-го числа</option>
          </select>
        )}
        <fieldset className="cp-dialog__block cp-dialog__end">
          <legend className="cp-dialog__label">Окончание</legend>
          <label className="cp-dialog__opt">
            <input type="radio" name="repeat-end" checked={endKind === 'never'} onChange={() => setEndKind('never')} />
            Никогда <span className="cp-muted">— до конца плана, {shortDate(planEnd)} {planEnd.slice(0, 4)}</span>
          </label>
          <label className="cp-dialog__opt">
            <input type="radio" name="repeat-end" checked={endKind === 'date'} onChange={() => setEndKind('date')} />
            Дата
            <input className="nr-field cp-dialog__in" type="date" aria-label="Дата окончания" min={addDays(start, 1)} value={endDate} disabled={endKind !== 'date'} onChange={(e) => e.target.value && setEndDate(e.target.value)} />
          </label>
          <label className="cp-dialog__opt">
            <input type="radio" name="repeat-end" checked={endKind === 'count'} onChange={() => setEndKind('count')} />
            После
            <input className="nr-field cp-dialog__num" type="number" min={1} max={999} aria-label="Сколько раз" value={count} disabled={endKind !== 'count'} onChange={(e) => setCount(Number(e.target.value))} />
            <span className="cp-muted">повторов</span>
          </label>
        </fieldset>
        <div className="cp-dialog__foot">
          <button type="button" className="nr-btn nr-btn--ghost" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className="nr-btn nr-btn--primary" onClick={done}>
            Готово
          </button>
        </div>
      </div>
    </div>
  )
}
