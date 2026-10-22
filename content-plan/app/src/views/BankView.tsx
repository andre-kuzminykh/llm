import { useState } from 'react'
import { clampDate, shortDate, today } from '../model/dates'
import { bankOf, planFill } from '../model/store'
import { isSlot, type Item, type Plan, type Rule } from '../model/types'
import { ChannelDot, IconButton, startDrag, useDrop } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { TopBar } from '../ui/TopBar'

/** Форматы, для которых есть смысл вести банк: тема собирается в заголовок или уже лежит в банке. */
export const bankRules = (plan: Plan) =>
  plan.rules.filter((r) => r.pattern || plan.items.some((x: Item) => x.date === null && x.ruleId === r.id))

/** Подпись банка — рубрика; формат — мелко, если у рубрики их несколько. */
export const bankTitle = (plan: Plan, rule: Rule) => plan.rubrics.find((r) => r.id === rule.rubricId)?.name ?? rule.name

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
          {bankRules(plan).map((r) => (
            <BankColumn key={r.id} rule={r} from={from} />
          ))}
        </div>
      </div>
    </>
  )
}

function BankColumn({ rule, from }: { rule: Rule; from: string }) {
  const { plan, dispatch, channels, toast } = usePlan()
  const [text, setText] = useState('')
  const topics = bankOf(plan, rule.id)
  const fill = planFill(plan, rule.id, from)
  const title = bankTitle(plan, rule)
  const nextSlot = plan.items
    .filter((x) => x.ruleId === rule.id && x.date && x.date >= from && !x.derive && isSlot(x))
    .reduce<string | null>((m, x) => (!m || x.date! < m ? x.date! : m), null)
  const c = channels.get(rule.channelId)
  const add = () => {
    const list = text.split('\n').map((s) => s.trim()).filter(Boolean)
    if (!list.length) return
    dispatch({ type: 'bankAdd', ruleId: rule.id, topics: list })
    setText('')
  }
  return (
    <section className="cp-bank__col nr-panel" aria-label={`Банк: ${title}`}>
      <div className="cp-bank__head">
        <ChannelDot color={c?.color ?? '#999'} />
        {title}
        <span className="nr-tag">{rule.name}</span>
      </div>
      <span className="cp-muted">
        тем: {topics.length} · свободных слотов: {fill.freeSlots}
        {nextSlot ? ` · ближайший ${shortDate(nextSlot)}` : ''}
      </span>
      <textarea
        className="nr-field"
        rows={2}
        placeholder="Темы, по одной на строку"
        aria-label={`Новые темы: ${title}`}
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
            dispatch({ type: 'fillSlots', ruleId: rule.id, from })
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
