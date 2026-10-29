import { useMemo, useState, type CSSProperties } from 'react'
import { dayTitle, shortDate, today } from '../model/dates'
import { planningEnd, planningSlots } from '../model/planning'
import { draftsFor } from '../model/store'
import { colorOf, isSlot, timeOf, type Item } from '../model/types'
import { IconButton } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'

/** Планирование недели: все слоты без темы до конца следующей недели — вписать тему или взять ближайший черновик
 *  той же рубрики. Список не прыгает: уточнённые остаются с галочкой, пока лист открыт. */
export function PlanningSheet({ onClose, onBack }: { onClose: () => void; onBack?: () => void }) {
  const { plan, dispatch, toast } = usePlan()
  const t = today()
  const [ids] = useState(() => planningSlots(plan, t).map((x) => x.id))
  const items = ids.map((id) => plan.items.find((x) => x.id === id)).filter((x): x is Item => !!x)
  const open = items.filter(isSlot)
  const drafts = useMemo(() => draftsFor(plan, open), [plan]) // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = new Map<string, Item[]>()
  for (const it of items) byDay.set(it.date!, [...(byDay.get(it.date!) ?? []), it])
  return (
    <aside className="cp-sheet" aria-label="Планирование недели">
      <div className="cp-sheet__head">
        {onBack && <IconButton icon="chev-left" label="Назад" onClick={onBack} size="sm" />}
        <h2 className="cp-sheet__title">Планирование недели</h2>
        <IconButton icon="close" label="Закрыть" onClick={onClose} />
      </div>
      <div className="cp-sheet__body nr-scroll">
        <p className="cp-hint">
          Слоты без темы до {shortDate(planningEnd(t))}: их ставит периодичность рубрик. Впишите тему (Enter) или возьмите ближайший черновик той же рубрики.
        </p>
        {drafts.size > 0 && (
          <button
            type="button"
            className="nr-btn nr-btn--primary nr-btn--sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              dispatch({ type: 'batch', actions: [...drafts].map(([slotId, d]) => ({ type: 'takeDraft' as const, slotId, draftId: d.id })) })
              toast(`Из черновиков: ${drafts.size}`, true)
            }}
          >
            Подставить из черновиков: {drafts.size}
          </button>
        )}
        {[...byDay].map(([date, list]) => (
          <section key={date} className="cp-planweek__day" aria-label={dayTitle(date)}>
            <h3 className="cp-now__title">{dayTitle(date).replace(/ \d{4}$/, '')}</h3>
            {list.map((it) => (
              <PlanRow key={`${it.id}|${it.title}`} item={it} draft={drafts.get(it.id)} />
            ))}
          </section>
        ))}
        {items.length === 0 && <p className="cp-empty">Все темы на две недели вперёд уточнены.</p>}
        {items.length > 0 && open.length === 0 && <p className="cp-hint"><Icon name="check" size={14} /> Все темы уточнены.</p>}
      </div>
    </aside>
  )
}

function PlanRow({ item, draft }: { item: Item; draft?: Item }) {
  const { dispatch, channels, rubrics, rules } = usePlan()
  const done = !isSlot(item)
  const [v, setV] = useState(done ? item.title : '')
  const rule = rules.get(item.ruleId)
  const rubric = rubrics.get(item.rubricId ?? '')
  const c = channels.get(item.channelId)
  const where = c?.sections.find((s) => s.id === item.sectionId)?.web ?? c?.name
  const tag = rubric ? rubric.name : ''
  const time = timeOf(item, rule)
  const commit = () => {
    const title = v.trim()
    if (title && title !== item.title) dispatch({ type: 'update', id: item.id, patch: { title, source: 'вручную' } })
  }
  return (
    <div className={`cp-planrow${done ? ' cp-planrow--done' : ''}`} style={{ '--cp-c': colorOf(c, item.sectionId) } as CSSProperties}>
      <span className="cp-planrow__time">{time}</span>
      <span className="cp-card__rub">
        {tag && <span className="cp-rub">{tag}</span>}
        {rule && rule.name !== rubric?.name && <span className="cp-card__fmt">{rule.name}</span>}
        <span className="cp-card__fmt">{where}</span>
      </span>
      <input
        className="nr-field nr-field--sm cp-planrow__in"
        aria-label={`Тема: ${shortDate(item.date!)}, ${time}, ${tag}`}
        placeholder="Тема"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {done ? (
        <span className="cp-planrow__ok" aria-label="Тема есть" role="img"><Icon name="check" size={14} /></span>
      ) : (
        draft && (
          <button type="button" className="cp-chip cp-planrow__draft" onClick={() => dispatch({ type: 'takeDraft', slotId: item.id, draftId: draft.id })} aria-label={`Из черновиков: ${draft.title}`} title="Взять ближайший черновик той же рубрики">
            <Icon name="draft" size={12} /> {draft.title}
          </button>
        )
      )}
    </div>
  )
}
