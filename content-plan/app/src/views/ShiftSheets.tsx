// Наверстать и перенести период — листы справа. Сначала видно, что куда встанет, потом «Перенести» — одним шагом,
// ⌘Z возвращает. Остальной план не двигается (или сдвигается очередью — по выбору в «Перенести период»).
import { useMemo, useState, type CSSProperties } from 'react'
import { addDays, today } from '../model/dates'
import { plural } from '../model/hint'
import { catchUpPlan, overdueOf, shiftPeriod, type CatchUpHow, type CatchUpStep, type PeriodMode } from '../model/catchup'
import { dateText } from '../model/schedule'
import { colorOf, isSlot, shownTitle, timeOf, type Item } from '../model/types'
import { IconButton, PickText, Seg } from '../ui/bits'
import { usePlan } from '../ui/ctx'

const HOW: Record<CatchUpHow, string> = {
  slot: 'в пустой слот',
  free: 'свободный день',
  off: 'вне сетки — лишним в этот день',
  queue: 'следующий слот',
  later: 'за концом сетки',
  group: 'вместе со своей группой',
}
const cards = (n: number) => `${n} ${plural(n, 'карточка', 'карточки', 'карточек')}`

/** Строка: канал, хэштег и формат, тема; ниже — «26 окт → 2 ноя 12:00 · в пустой слот». */
function StepRow({ it, step, t, check }: { it: Item; step?: CatchUpStep; t: string; check?: { on: boolean; toggle: () => void } }) {
  const { channels, rules, labelOf } = usePlan()
  const c = channels.get(it.channelId)
  const label = `${labelOf(it)}: ${shownTitle(it)}`
  return (
    <li className="cp-shift__row" style={{ '--cp-c': colorOf(c, it.sectionId) } as CSSProperties}>
      {check && <input type="checkbox" className="cp-sched__check" aria-label={`Перенести: ${label}`} checked={check.on} onChange={check.toggle} />}
      <span className="cp-shift__main">
        <span className="cp-shift__where">
          {c?.name} · {labelOf(it)}
        </span>
        <span className={isSlot(it) ? 'cp-sched__title--slot' : undefined}>{shownTitle(it)}</span>
        <span className="cp-shift__when">
          {step ? (
            <>
              {dateText(step.from, t)} → <b>{dateText(step.date, t)} {step.time ?? timeOf(it, rules.get(it.ruleId))}</b> · {HOW[step.how]}
            </>
          ) : (
            <>{dateText(it.date!, t)} · остаётся</>
          )}
        </span>
      </span>
    </li>
  )
}

/** Наверстать: просроченное — дата прошла, «Вышло» не отмечено. Список не прыгает, пока лист открыт. */
export function CatchUpSheet({ onClose, onBack }: { onClose: () => void; onBack?: () => void }) {
  const { plan, dispatch, toast } = usePlan()
  const t = today()
  const [ids] = useState(() => overdueOf(plan, t).map((x) => x.id))
  const [off, setOff] = useState<Set<string>>(new Set())
  const items = ids.map((id) => plan.items.find((x) => x.id === id)).filter((x): x is Item => !!x && !!x.date && x.date < t)
  const chosen = items.filter((x) => !off.has(x.id)).map((x) => x.id)
  const steps = useMemo(() => catchUpPlan(plan, chosen, t), [plan, chosen.join('|'), t]) // eslint-disable-line react-hooks/exhaustive-deps
  const byId = new Map(steps.map((s) => [s.id, s]))
  const toggle = (id: string) => setOff((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)))
  return (
    <aside className="cp-sheet" aria-label="Наверстать">
      <div className="cp-sheet__head">
        {onBack && <IconButton icon="chev-left" label="Назад" onClick={onBack} size="sm" />}
        <h2 className="cp-sheet__title">Наверстать</h2>
        <IconButton icon="close" label="Закрыть" onClick={onClose} />
      </div>
      <div className="cp-sheet__body nr-scroll">
        <p className="cp-hint">
          Просрочено — дата прошла, а «Вышло» не отмечено. Остальной план не двигается: карточка встаёт в ближайший пустой слот своего формата, нет
          слота — на ближайший день, где сетка не против, нет и такого — вне сетки, лишней в день. Снимите галочку, если вышло или не нужно.
        </p>
        {!items.length && <p className="cp-empty">Просроченного нет.</p>}
        <ol className="cp-shift">
          {items.map((it) => (
            <StepRow key={it.id} it={it} step={byId.get(it.id)} t={t} check={{ on: !off.has(it.id), toggle: () => toggle(it.id) }} />
          ))}
        </ol>
        {items.length > 0 && (
          <button
            type="button"
            className="nr-btn nr-btn--primary nr-btn--sm cp-shift__go"
            disabled={!steps.length}
            onClick={() => {
              dispatch({ type: 'catchUp', moves: steps.filter((s) => s.how !== 'group') })
              toast(`Наверстали: ${cards(steps.length)} — остальной план на месте`, true)
              ;(onBack ?? onClose)()
            }}
          >
            Перенести: {steps.length}
          </button>
        )}
      </div>
    </aside>
  )
}

const MODES: { id: PeriodMode; label: string }[] = [
  { id: 'queue', label: 'На следующие слоты' },
  { id: 'free', label: 'В свободные места' },
]
const MODE_HINT: Record<PeriodMode, string> = {
  queue: 'Темы с этих дней встают в следующие слоты своего формата, за ними по очереди сдвигается остальное. Сетка дней на месте, в периоде — пусто.',
  free: 'Только материалы периода — в пустые слоты и свободные по сетке дни после него (нет — вне сетки). Остальной план не двигается; пустые слоты периода убираются.',
}

/** Перенести период — например, отпуск: всё запланированное с выбранных дней выбранных каналов. */
export function PeriodSheet({ onClose, onBack }: { onClose: () => void; onBack?: () => void }) {
  const { plan, dispatch, toast } = usePlan()
  const t = today()
  const [from, setFrom] = useState(addDays(t, 1))
  const [to, setTo] = useState(addDays(t, 7))
  const [channels, setChannels] = useState(() => plan.channels.map((c) => c.id))
  const [mode, setMode] = useState<PeriodMode>('queue')
  const r = useMemo(() => shiftPeriod(plan, from, to, channels, mode), [plan, from, to, channels, mode])
  const byId = new Map(plan.items.map((x) => [x.id, x]))
  // в предпросмотре — материалы периода с темой: они и интересны; пустые слоты — числом
  const shown = r.moved.filter((m) => m.from <= to && !isSlot(byId.get(m.id)!))
  const toggle = (id: string) => setChannels((list) => (list.includes(id) ? list.filter((x) => x !== id) : plan.channels.map((c) => c.id).filter((x) => x === id || list.includes(x))))
  return (
    <aside className="cp-sheet" aria-label="Перенести период">
      <div className="cp-sheet__head">
        {onBack && <IconButton icon="chev-left" label="Назад" onClick={onBack} size="sm" />}
        <h2 className="cp-sheet__title">Перенести период</h2>
        <IconButton icon="close" label="Закрыть" onClick={onClose} />
      </div>
      <div className="cp-sheet__body nr-scroll">
        <p className="cp-hint">Например, отпуск: в эти дни ничего не выходит. Ежедневные авто-публикации и потоки 24/7 идут сами — их не трогаем.</p>
        <div className="cp-form__when">
          <PickText type="date" label="С" value={from} text={`с ${dateText(from, t)}`} onChange={(d) => d && setFrom(d)} />
          <PickText type="date" label="По" value={to} text={`по ${dateText(to, t)}`} onChange={(d) => d && setTo(d)} />
        </div>
        <div className="cp-field">
          <span className="nr-label">Каналы</span>
          <div className="cp-pills cp-pills--flush">
            {plan.channels.map((c) => (
              <button key={c.id} type="button" className="nr-pill" aria-pressed={channels.includes(c.id)} onClick={() => toggle(c.id)}>
                <span className="nr-dot" style={{ background: c.color }} aria-hidden="true" />
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="cp-field">
          <span className="nr-label">Куда</span>
          <Seg label="Куда перенести" value={mode} options={MODES} onChange={setMode} />
          <p className="cp-hint">{MODE_HINT[mode]}</p>
        </div>
        {to < from && <p className="cp-hint">«По» раньше, чем «с».</p>}
        <p className="cp-shift__sum" role="status">
          {r.actions.length
            ? `Из периода — ${cards(shown.length)} с темой${r.cleared ? `, пустых слотов уберётся: ${r.cleared}` : ''}${mode === 'queue' ? `; по очереди сдвинется: ${cards(r.moved.length - shown.length)}` : ''}.`
            : 'В эти дни у выбранных каналов ничего не запланировано.'}
        </p>
        <ol className="cp-shift">
          {shown.slice(0, 60).map((m) => (
            <StepRow key={m.id} it={byId.get(m.id)!} step={m} t={t} />
          ))}
        </ol>
        {shown.length > 60 && <p className="cp-hint">…и ещё {shown.length - 60}.</p>}
        <button
          type="button"
          className="nr-btn nr-btn--primary nr-btn--sm cp-shift__go"
          disabled={!r.actions.length}
          onClick={() => {
            dispatch({ type: 'batch', actions: r.actions })
            toast(`Период ${dateText(from, t)} – ${dateText(to, t)} свободен: перенесено ${cards(shown.length)}`, true)
            ;(onBack ?? onClose)()
          }}
        >
          Перенести
        </button>
      </div>
    </aside>
  )
}
