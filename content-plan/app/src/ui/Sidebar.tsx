import { bankOf } from '../model/store'
import type { Status } from '../model/types'
import { bankLabel, bankRules, useBankChoice } from '../views/BankView'
import { StatusFilter } from '../views/NowView'
import { ChannelDot, Check, IconButton, startDrag, Switch } from './bits'
import { usePlan } from './ctx'

/** Боковая панель: фильтры (каналы, площадки, статусы, рубрики) и банк тем под рукой — темы тянутся на день. */
export function Sidebar({ open, withBank, onClose }: { open: boolean; withBank: boolean; onClose: () => void }) {
  const { plan, filters, setFilters, goto } = usePlan()
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const banks = useBankChoice('cp:side-banks', plan)
  const rules = bankRules(plan)
  const chosen = rules.filter((r) => banks.list.includes(r.id))
  return (
    <aside className="cp-side nr-scroll" data-open={open} aria-label="Фильтры и банк тем">
      <div className="cp-only-phone" style={{ justifyContent: 'flex-end', marginBottom: -12 }}>
        <IconButton icon="close" label="Закрыть фильтры" onClick={onClose} />
      </div>
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
        <span className="nr-label" style={{ padding: '0 4px 4px' }}>Статус</span>
        <StatusFilter value={filters.statuses} onToggle={(s: Status) => setFilters({ ...filters, statuses: toggle(filters.statuses, s) })} />
        <span className="cp-hint" style={{ padding: '2px 4px 0' }}>{filters.statuses.length ? 'Показаны только отмеченные' : 'Ничего не отмечено — видно все'}</span>
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
      {withBank && rules.length > 0 && (
        <div className="cp-side__block" style={{ padding: '0 6px' }}>
          <span className="nr-label" style={{ padding: '0 4px 4px' }}>Банк тем</span>
          <div className="cp-side__banks" role="group" aria-label="Рубрики банка">
            {rules.map((r) => (
              <Check key={r.id} checked={banks.list.includes(r.id)} onChange={() => banks.toggle(r.id)}>
                {bankLabel(plan, r)} <span className="cp-muted">{bankOf(plan, r.id).length}</span>
              </Check>
            ))}
          </div>
          <div className="cp-list" style={{ marginTop: 6 }}>
            {chosen.map((r) => {
              const topics = bankOf(plan, r.id)
              if (!topics.length) return null
              return (
                <div key={r.id} className="cp-list" aria-label={`Темы: ${bankLabel(plan, r)}`} role="group">
                  {chosen.length > 1 && <span className="cp-side__sub">{bankLabel(plan, r)}</span>}
                  {topics.slice(0, 12).map((t) => (
                    <div key={t.id} className="cp-topic" draggable onDragStart={(e) => startDrag(e, { kind: 'bank', id: t.id })} title="Перетащите на день">
                      <span className="cp-topic__text">{t.title}</span>
                    </div>
                  ))}
                  {topics.length > 12 && <span className="cp-hint">и ещё {topics.length - 12}</span>}
                </div>
              )
            })}
            {chosen.every((r) => !bankOf(plan, r.id).length) && <span className="cp-hint">{chosen.length ? 'В отмеченных рубриках тем нет. Добавьте их в банке.' : 'Отметьте рубрики галочками.'}</span>}
          </div>
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => goto('bank')}>
            Открыть банк тем
          </button>
        </div>
      )}
    </aside>
  )
}
