import { useState } from 'react'
import { bankOf } from '../model/store'
import { bankRules, bankTitle } from '../views/BankView'
import { ChannelDot, startDrag, Switch } from './bits'
import { usePlan } from './ctx'

/** Боковая панель календаря: фильтры и банк тем под рукой — темы тянутся на день. */
export function Sidebar({ open, withBank }: { open: boolean; withBank: boolean }) {
  const { plan, filters, setFilters, goto } = usePlan()
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const bank = bankRules(plan)
  const [ruleId, setRuleId] = useState(bank[0]?.id ?? '')
  const topics = ruleId ? bankOf(plan, ruleId) : []
  return (
    <aside className="cp-side nr-scroll" data-open={open} aria-label="Фильтры и банк тем">
      <div className="cp-side__block">
        <span className="nr-label">Каналы</span>
        {plan.channels.map((c) => (
          <button
            key={c.id}
            type="button"
            className="nr-row"
            aria-pressed={!filters.hiddenChannels.includes(c.id)}
            onClick={() => setFilters({ ...filters, hiddenChannels: toggle(filters.hiddenChannels, c.id) })}
          >
            <ChannelDot color={c.color} />
            {c.name}
            {c.start > plan.start && <span className="cp-side__count">с {c.start.slice(8)}.{c.start.slice(5, 7)}</span>}
          </button>
        ))}
      </div>
      <div className="cp-side__block">
        <span className="nr-label">Площадки</span>
        <div className="cp-pills">
          {plan.platforms.map((p) => (
            <button
              key={p}
              type="button"
              className="nr-pill"
              aria-pressed={!filters.hiddenPlatforms.includes(p)}
              onClick={() => setFilters({ ...filters, hiddenPlatforms: toggle(filters.hiddenPlatforms, p) })}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="cp-side__block" style={{ padding: '0 6px' }}>
        <span className="nr-label" style={{ padding: '0 4px 4px' }}>Показывать</span>
        <Switch checked={!filters.hideAuto} onChange={(v) => setFilters({ ...filters, hideAuto: !v })}>
          Ежедневные авто-публикации
        </Switch>
        <Switch checked={filters.onlySlots} onChange={(v) => setFilters({ ...filters, onlySlots: v })}>
          Только без темы
        </Switch>
      </div>
      <div className="cp-side__block">
        <span className="nr-label">Рубрики</span>
        <div className="cp-pills">
          {plan.rubrics.map((r) => (
            <button
              key={r.id}
              type="button"
              className="nr-pill"
              aria-pressed={!filters.hiddenRubrics.includes(r.id)}
              onClick={() => setFilters({ ...filters, hiddenRubrics: toggle(filters.hiddenRubrics, r.id) })}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>
      {withBank && bank.length > 0 && (
        <div className="cp-side__block" style={{ padding: '0 6px' }}>
          <span className="nr-label" style={{ padding: '0 4px 4px' }}>Банк тем</span>
          <select className="nr-field nr-field--sm" aria-label="Рубрика банка" value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
            {bank.map((r) => (
              <option key={r.id} value={r.id}>
                {bankTitle(plan, r)}{r.name !== 'FULL' ? ` · ${r.name}` : ''} · {bankOf(plan, r.id).length}
              </option>
            ))}
          </select>
          <div className="cp-list" style={{ marginTop: 6 }}>
            {topics.slice(0, 20).map((t) => (
              <div key={t.id} className="cp-topic" draggable onDragStart={(e) => startDrag(e, { kind: 'bank', id: t.id })} title="Перетащите на день">
                <span className="cp-topic__text">{t.title}</span>
              </div>
            ))}
            {topics.length === 0 && <span className="cp-hint">Тем нет. Добавьте их в банке.</span>}
            {topics.length > 20 && <span className="cp-hint">и ещё {topics.length - 20}</span>}
          </div>
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => goto('bank')}>
            Открыть банк тем
          </button>
        </div>
      )}
    </aside>
  )
}
