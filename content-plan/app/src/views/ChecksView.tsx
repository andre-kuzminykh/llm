import { useState } from 'react'
import { addDays, daysBetween, shortDate, WEEKDAYS, weekday } from '../model/dates'
import { KIND_LABEL, type Violation, type ViolationKind } from '../model/rules'
import type { ISODate, Item } from '../model/types'
import { Seg } from '../ui/bits'
import { usePlan, type Ctx } from '../ui/ctx'
import { TopBar } from '../ui/TopBar'

type Kind = ViolationKind | 'all'

/** Ближайший день, где этот FULL может выйти по сетке и где ещё нет FULL. */
function freeDayFor(it: Item, { plan, byDate, rules }: Pick<Ctx, 'plan' | 'byDate' | 'rules'>): ISODate | null {
  const rule = rules.get(it.ruleId)
  if (!rule || !it.date) return null
  const busy = (d: ISODate) => (byDate.get(d) ?? []).some((x) => rules.get(x.ruleId)?.full && !x.derive && !x.offGrid)
  for (let k = 1; k <= 90; k++)
    for (const d of [addDays(it.date, k), addDays(it.date, -k)])
      if (d >= plan.start && rule.days[weekday(d)] && !busy(d)) return d
  return null
}

/** Нарушения сетки по датам; у каждого — что с ним сделать. */
export function ChecksView() {
  const { violations } = usePlan()
  const [kind, setKind] = useState<Kind>('all')
  const kinds = (['full', 'limit', 'weekday', 'start'] as ViolationKind[]).filter((k) => violations.some((v) => v.kind === k))
  const cur = kinds.includes(kind as ViolationKind) ? kind : 'all'
  const list = violations.filter((v) => cur === 'all' || v.kind === cur)
  return (
    <>
      <TopBar title="Проверка" side={false}>
        {kinds.length > 1 && (
          <Seg
            value={cur}
            onChange={setKind}
            label="Тип нарушения"
            options={[{ id: 'all', label: `Все · ${violations.length}` }, ...kinds.map((k) => ({ id: k, label: `${KIND_LABEL[k]} · ${violations.filter((v) => v.kind === k).length}` }))]}
          />
        )}
      </TopBar>
      <div className="cp-body nr-scroll">
        {list.length === 0 ? (
          <div className="cp-empty">
            <b style={{ color: 'var(--nr-text)' }}>Нарушений нет</b>
            Каждый день соблюдает сетку: один FULL, рубрики в свои дни, каналы после старта.
          </div>
        ) : (
          <div className="cp-checks">
            {list.map((v, i) => (
              <CheckRow key={`${v.date}-${v.kind}-${i}`} v={v} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function CheckRow({ v }: { v: Violation }) {
  const ctx = usePlan()
  const { plan, rules, dispatch, toast, goto, openDay } = ctx
  const items = plan.items.filter((x) => v.itemIds.includes(x.id))
  // какой FULL переносить: у кого ближе свободный день по сетке; при равенстве — тот, что сюда переехал
  const fulls = v.kind === 'full' ? items.filter((x) => rules.get(x.ruleId)?.full && !x.derive) : []
  const options = fulls
    .map((x) => ({ x, d: freeDayFor(x, ctx) }))
    .filter((o): o is { x: Item; d: ISODate } => !!o.d)
    .map((o) => ({ ...o, far: Math.abs(daysBetween(v.date, o.d)) - (o.x.origDate && o.x.origDate !== o.x.date ? 0.5 : 0) }))
    .sort((a, b) => a.far - b.far)
  const mover = options[0]?.x
  const to = options[0]?.d ?? null
  return (
    <div className="cp-check">
      <span className="cp-check__date">
        <b>{shortDate(v.date)}</b> <span className="cp-muted">{WEEKDAYS[weekday(v.date)]} · {v.date.slice(0, 4)}</span>
      </span>
      <span className="cp-check__what">
        <span className="cp-check__kind">{KIND_LABEL[v.kind]}</span>
        <span>{v.text}</span>
      </span>
      <span className="cp-check__acts">
        {to && mover && (
          <button
            type="button"
            className="nr-btn nr-btn--tinted nr-btn--sm"
            onClick={() => {
              dispatch({ type: 'move', id: mover.id, date: to })
              toast(`«${mover.title}» перенесён на ${shortDate(to)}${mover.group ? ' вместе с группой' : ''}`, true)
            }}
          >
            Перенести «{mover.title}» на {WEEKDAYS[weekday(to)]}, {shortDate(to)}
          </button>
        )}
        {v.kind === 'weekday' && (
          <button
            type="button"
            className="nr-btn nr-btn--tinted nr-btn--sm"
            onClick={() => {
              dispatch({ type: 'updateMany', ids: v.itemIds, patch: { offGrid: true } })
              toast('Оставлено вне сетки: проверка его больше не трогает', true)
            }}
          >
            Оставить вне сетки
          </button>
        )}
        <button
          type="button"
          className="nr-btn nr-btn--ghost nr-btn--sm"
          onClick={() => {
            goto('week', v.date)
            openDay(v.date)
          }}
        >
          Открыть
        </button>
      </span>
    </div>
  )
}
