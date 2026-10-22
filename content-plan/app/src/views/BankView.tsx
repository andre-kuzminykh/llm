import { useState } from 'react'
import { shortDate, today } from '../model/dates'
import { bankOf, planFill } from '../model/store'
import { isSlot, type ISODate, type Item, type Plan, type Rule } from '../model/types'
import { IconButton, startDrag, useDrop } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { TopBar } from '../ui/TopBar'

/** Форматы с банком тем: темы к ним придумывают заранее, или в банке уже что-то лежит. */
export const bankRules = (plan: Plan) =>
  plan.rules.filter((r) => r.bank || plan.items.some((x: Item) => x.date === null && x.ruleId === r.id))

/** Подпись банка — рубрика; формат — мелко, если у рубрики их несколько. */
export const bankTitle = (plan: Plan, rule: Rule) => plan.rubrics.find((r) => r.id === rule.rubricId)?.name ?? rule.name
export const bankLabel = (plan: Plan, rule: Rule) => `${bankTitle(plan, rule)}${rule.name !== 'FULL' && rule.name !== bankTitle(plan, rule) ? ` · ${rule.name}` : ''}`

/** Какие банки выбраны галочками; пусто в хранилище — все. */
export function useBankChoice(key: string, plan: Plan) {
  const all = bankRules(plan).map((r) => r.id)
  const [chosen, setChosen] = useState<string[] | null>(() => {
    try {
      const v = localStorage.getItem(key)
      return v ? (JSON.parse(v) as string[]) : null
    } catch {
      return null
    }
  })
  const list = chosen ?? all
  const set = (next: string[]) => {
    setChosen(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      /* выбор живёт до перезагрузки */
    }
  }
  return { list, toggle: (id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : all.filter((x) => x === id || list.includes(x))), all: () => set(all), none: () => set([]) }
}

// куда недавно легли темы — до перезагрузки страницы
const recent = new Map<string, { id: string; title: string; date: ISODate }[]>()

const range = (dates: ISODate[]) => {
  const s = [...dates].sort()
  if (!s.length) return ''
  return s.length === 1 || s[0] === s[s.length - 1] ? shortDate(s[0]) : `${shortDate(s[0])} – ${shortDate(s[s.length - 1])} ${s[s.length - 1].slice(0, 4)}`
}

export function BankView() {
  const { plan } = usePlan()
  const from = today() < plan.start ? plan.start : today()
  const rules = bankRules(plan)
  const [sel, setSel] = useState<string>(() => {
    try {
      return localStorage.getItem('cp:bank-sel') ?? ''
    } catch {
      return ''
    }
  })
  const pick = (id: string) => {
    setSel(id)
    try {
      localStorage.setItem('cp:bank-sel', id)
    } catch {
      /* до перезагрузки */
    }
  }
  const rule = rules.find((r) => r.id === sel) ?? rules[0]
  const slots = (r: Rule) => plan.items.filter((x) => x.ruleId === r.id && x.date && x.date >= from && !x.derive && isSlot(x)).length
  return (
    <>
      <TopBar title="Банк тем" side={false} />
      <div className="cp-body nr-scroll">
        <div className="cp-bank">
          <nav className="cp-bank__list" aria-label="Рубрики банка">
            {rules.map((r) => {
              const n = bankOf(plan, r.id).length
              return (
                <button
                  key={r.id}
                  type="button"
                  className="nr-row"
                  aria-current={r.id === rule?.id ? 'true' : undefined}
                  title={`Тем в банке: ${n} · пустых слотов: ${slots(r)}`}
                  onClick={() => pick(r.id)}
                >
                  <span className="cp-bank__name">{bankLabel(plan, r)}</span>
                  {n > 0 && <span className="cp-side__count">{n}</span>}
                </button>
              )
            })}
          </nav>
          {rule && <BankColumn key={rule.id} rule={rule} from={from} />}
        </div>
      </div>
    </>
  )
}

function BankColumn({ rule, from }: { rule: Rule; from: string }) {
  const { plan, dispatch, toast, goto } = usePlan()
  const [text, setText] = useState('')
  const [, rerender] = useState(0)
  const topics = bankOf(plan, rule.id)
  const fill = planFill(plan, rule.id, from)
  const title = bankLabel(plan, rule)
  const nextSlot = plan.items
    .filter((x) => x.ruleId === rule.id && x.date && x.date >= from && !x.derive && isSlot(x))
    .reduce<string | null>((m, x) => (!m || x.date! < m ? x.date! : m), null)
  // недавно разложенные, которые всё ещё стоят на своих местах с этой темой
  const placed = (recent.get(rule.id) ?? []).filter((r) => plan.items.some((x) => x.id === r.id && x.date === r.date && x.title === r.title))
  const remember = (list: { id: string; title: string; date: ISODate }[]) => {
    recent.set(rule.id, [...list, ...placed].slice(0, 30))
    rerender((n) => n + 1)
  }
  const add = () => {
    const list = text.split('\n').map((s) => s.trim()).filter(Boolean)
    if (!list.length) return
    dispatch({ type: 'bankAdd', ruleId: rule.id, topics: list })
    setText('')
  }
  const slotWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'слот ждёт' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'слота ждут' : 'слотов ждут')
  return (
    <section className="cp-bank__col" aria-label={`Банк: ${title}`}>
      <div className="cp-bank__head">
        <h2 className="cp-bank__title">{title}</h2>
        <span className="cp-muted">
          {fill.freeSlots ? `${fill.freeSlots} ${slotWord(fill.freeSlots)} тему${nextSlot ? `, ближайший — ${shortDate(nextSlot)}` : ''}` : 'пустых слотов нет'}
        </span>
      </div>
      <div className="cp-bank__add">
        <textarea
          className="nr-field"
          rows={2}
          placeholder="Новые темы, по одной на строку"
          aria-label={`Новые темы: ${title}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && add()}
        />
        <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={add} disabled={!text.trim()}>
          Добавить
        </button>
      </div>
      <div className="cp-list cp-bank__topics">
        {topics.map((t) => (
          <Topic
            key={t.id}
            item={t}
            nextSlot={nextSlot}
            onPlaced={(date) => {
              const slot = plan.items.find((x) => x.ruleId === rule.id && x.date === date && isSlot(x) && !x.derive)
              if (slot) remember([{ id: slot.id, title: t.title, date }])
            }}
          />
        ))}
        {topics.length === 0 && <p className="cp-hint">Тем пока нет.</p>}
      </div>
      {topics.length > 0 && (
        <button
          type="button"
          className="nr-btn nr-btn--primary nr-btn--sm"
          style={{ alignSelf: 'flex-start' }}
          disabled={!fill.freeSlots}
          onClick={() => {
            const pairs = fill.pairs.map((p) => ({ id: p.slot.id, title: p.bank.title, date: p.slot.date! }))
            dispatch({ type: 'fillSlots', ruleId: rule.id, from })
            remember(pairs)
            const first = pairs.map((p) => p.date).sort()[0]
            toast(`Разложено: ${pairs.length} · ${range(pairs.map((p) => p.date))}${fill.left ? `, не влезло: ${fill.left}` : ''}`, {
              undo: true,
              actions: first ? [{ label: 'Показать', run: () => goto('plan', first) }] : undefined,
            })
          }}
        >
          Разложить по слотам
        </button>
      )}
      {placed.length > 0 && (
        <div className="cp-bank__placed">
          <span className="nr-label">Недавно разложены</span>
          {placed.map((r) => (
            <div key={r.id} className="cp-topic cp-topic--placed">
              <span className="cp-topic__text">{r.title}</span>
              <button type="button" className="cp-link cp-muted" onClick={() => goto('plan', r.date)} title="Показать в плане">
                {shortDate(r.date)}
              </button>
              <IconButton
                icon="undo"
                size="sm"
                label={`Вернуть в банк: ${r.title}`}
                onClick={() => {
                  dispatch({ type: 'unassign', id: r.id })
                  toast(`«${r.title}» снова в банке, слот ${shortDate(r.date)} свободен`, true)
                }}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Topic({ item, nextSlot, onPlaced }: { item: Item; nextSlot: string | null; onPlaced: (date: ISODate) => void }) {
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
            onPlaced(nextSlot)
            dispatch({ type: 'assign', bankId: item.id, date: nextSlot })
            toast(`Поставлено на ${shortDate(nextSlot)}`, true)
          }}
        />
      )}
      <IconButton icon="trash" size="sm" label="Удалить тему" onClick={() => dispatch({ type: 'remove', id: item.id })} />
    </div>
  )
}
