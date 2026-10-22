import { useState } from 'react'
import { clampDate, shortDate, today } from '../model/dates'
import { bankOf, planFill } from '../model/store'
import { isSlot, type Item, type Rubric } from '../model/types'
import { ChannelDot, IconButton, startDrag, useDrop } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { TopBar } from '../ui/TopBar'

/** Рубрики, для которых есть смысл вести банк: темы собираются в заголовок или уже лежат в банке. */
export const bankRubrics = (rubrics: Rubric[], items: Item[]) =>
  rubrics.filter((r) => r.pattern || items.some((x) => x.date === null && x.rubricId === r.id))

export function BankView() {
  const { plan } = usePlan()
  const from = clampDate(today(), plan.start, plan.end)
  return (
    <>
      <TopBar title="Банк тем" side={false} />
      <div className="cp-body nr-scroll">
        <p className="cp-hint" style={{ padding: '14px 20px 0' }}>
          Темы без даты. «Разложить по слотам» ставит их по порядку в ближайшие слоты «…» рубрики начиная с {shortDate(from)};
          тему можно и перетащить на день в календаре — из боковой панели.
        </p>
        <div className="cp-bank">
          {bankRubrics(plan.rubrics, plan.items).map((r) => (
            <BankColumn key={r.id} rubric={r} from={from} />
          ))}
        </div>
      </div>
    </>
  )
}

function BankColumn({ rubric, from }: { rubric: Rubric; from: string }) {
  const { plan, dispatch, channels, toast } = usePlan()
  const [text, setText] = useState('')
  const topics = bankOf(plan, rubric.id)
  const fill = planFill(plan, rubric.id, from)
  const nextSlot = plan.items
    .filter((x) => x.rubricId === rubric.id && x.date && x.date >= from && !x.derive && isSlot(x))
    .reduce<string | null>((m, x) => (!m || x.date! < m ? x.date! : m), null)
  const c = channels.get(rubric.channelId)
  const add = () => {
    const list = text.split('\n').map((s) => s.trim()).filter(Boolean)
    if (!list.length) return
    dispatch({ type: 'bankAdd', rubricId: rubric.id, topics: list })
    setText('')
  }
  return (
    <section className="cp-bank__col nr-panel" aria-label={`Банк: ${rubric.name}`}>
      <div className="cp-bank__head">
        <ChannelDot color={c?.color ?? '#999'} />
        {rubric.name}
      </div>
      <span className="cp-muted">
        тем: {topics.length} · свободных слотов: {fill.freeSlots}
        {nextSlot ? ` · ближайший ${shortDate(nextSlot)}` : ''}
      </span>
      <textarea
        className="nr-field"
        rows={2}
        placeholder="Темы, по одной на строку"
        aria-label={`Новые темы: ${rubric.name}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && add()}
      />
      <button type="button" className="nr-btn nr-btn--secondary nr-btn--sm" onClick={add} disabled={!text.trim()}>
        Добавить
      </button>
      <div className="cp-list">
        {topics.map((t) => (
          <Topic key={t.id} item={t} nextSlot={nextSlot} />
        ))}
      </div>
      {topics.length > 0 && (
        <button
          type="button"
          className="nr-btn nr-btn--primary nr-btn--sm"
          disabled={!fill.freeSlots}
          onClick={() => {
            const n = fill.pairs.length
            dispatch({ type: 'fillSlots', rubricId: rubric.id, from })
            toast(`Разложено: ${n}${fill.left ? `, не влезло: ${fill.left}` : ''}`, true)
          }}
        >
          Разложить по слотам
        </button>
      )}
    </section>
  )
}

function Topic({ item, nextSlot }: { item: Item; nextSlot: string | null }) {
  const { dispatch, toast, openItem } = usePlan()
  const drop = useDrop((d) => d.kind === 'bank' && dispatch({ type: 'bankReorder', id: d.id, beforeId: item.id }))
  return (
    <div className={`cp-topic${drop.over ? ' cp-topic--drop' : ''}`} draggable onDragStart={(e) => startDrag(e, { kind: 'bank', id: item.id })} {...drop.props}>
      <button type="button" className="cp-topic__text cp-link" style={{ border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }} onClick={() => openItem(item.id)}>
        {item.title}
      </button>
      {nextSlot && (
        <IconButton
          icon="arrow"
          size="sm"
          label={`В ближайший слот (${nextSlot})`}
          onClick={() => {
            dispatch({ type: 'assign', bankId: item.id, date: nextSlot })
            toast(`Поставлено на ${nextSlot}`, true)
          }}
        />
      )}
      <IconButton icon="trash" size="sm" label="Удалить тему" onClick={() => dispatch({ type: 'remove', id: item.id })} />
    </div>
  )
}
