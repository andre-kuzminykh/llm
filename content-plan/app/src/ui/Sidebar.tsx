import { NO_FILTERS, type Filters } from '../model/filters'
import { bankOf } from '../model/store'
import { statusOf } from '../model/types'
import { bankLabel, bankRules, useBankChoice } from '../views/BankView'
import { ChannelDot, Check, IconButton, startDrag, StatusFilter, Switch } from './bits'
import { usePlan, type Ctx } from './ctx'
import { Icon } from './Icon'

/** Фильтры по умолчанию: видно всё, и ежедневные авто-публикации тоже. */
export const DEFAULT_FILTERS: Filters = { ...NO_FILTERS }

const names = (list: string[], max = 2) => (list.length <= max ? list.join(', ') : `${list.slice(0, max).join(', ')} и ещё ${list.length - max}`)

/** Включённые фильтры словами — для меток в шапке; каждую можно снять. */
export function activeFilters({ plan, filters: f, setFilters }: Pick<Ctx, 'plan' | 'filters' | 'setFilters'>) {
  const set = (patch: Partial<Filters>) => setFilters({ ...f, ...patch })
  const out: { id: string; label: string; clear: () => void }[] = []
  if (f.hiddenChannels.length)
    out.push({ id: 'ch', label: `Без ${names(f.hiddenChannels.map((id) => plan.channels.find((c) => c.id === id)?.name ?? id))}`, clear: () => set({ hiddenChannels: [] }) })
  if (f.hiddenPlatforms.length) out.push({ id: 'pl', label: `Без ${names(f.hiddenPlatforms)}`, clear: () => set({ hiddenPlatforms: [] }) })
  if (f.hiddenRubrics.length)
    out.push({
      id: 'rb',
      label: f.hiddenRubrics.length > 2 ? `Скрыто рубрик: ${f.hiddenRubrics.length}` : `Без ${names(f.hiddenRubrics.map((id) => plan.rubrics.find((r) => r.id === id)?.name ?? id))}`,
      clear: () => set({ hiddenRubrics: [] }),
    })
  if (f.statuses.length) out.push({ id: 'st', label: `Только «${f.statuses.map((s) => statusOf(s).label).join('», «')}»`, clear: () => set({ statuses: [] }) })
  if (f.onlySlots) out.push({ id: 'slots', label: 'Только без темы', clear: () => set({ onlySlots: false }) })
  if (f.hideAuto) out.push({ id: 'auto', label: 'Без авто-публикаций', clear: () => set({ hideAuto: false }) })
  return out
}

/** Метки включённых фильтров в шапке: ✕ снимает фильтр. */
export function FilterChips() {
  const ctx = usePlan()
  const list = activeFilters(ctx)
  if (!list.length) return null
  return (
    <span className="cp-chips" aria-label="Включённые фильтры" role="group">
      {list.map((c) => (
        <button key={c.id} type="button" className="cp-chip" onClick={c.clear} aria-label={`Снять фильтр: ${c.label}`} title="Снять фильтр">
          {c.label}
          <Icon name="close" size={12} />
        </button>
      ))}
    </span>
  )
}

/** Боковая панель за кнопкой «Фильтры»: каналы, площадки, статус, рубрики и банк тем под рукой — темы тянутся на день. */
export function Sidebar({ open, withBank, onClose }: { open: boolean; withBank: boolean; onClose: () => void }) {
  const { plan, filters, setFilters, goto } = usePlan()
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const banks = useBankChoice('cp:side-banks', plan)
  const rules = bankRules(plan)
  const chosen = rules.filter((r) => banks.list.includes(r.id))
  const changed = activeFilters({ plan, filters, setFilters }).length > 0
  return (
    <aside className="cp-side nr-scroll" data-open={open} aria-label="Фильтры и банк тем">
      <div className="cp-side__head">
        <span className="cp-side__title">Фильтры</span>
        {changed && (
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Сбросить
          </button>
        )}
        <IconButton icon="close" label="Закрыть фильтры" onClick={onClose} size="sm" />
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
        <span className="nr-label">Статус</span>
        <StatusFilter value={filters.statuses} onChange={(statuses) => setFilters({ ...filters, statuses })} />
      </div>
      <div className="cp-side__block cp-side__block--pad">
        <Switch checked={!filters.hideAuto} onChange={(v) => setFilters({ ...filters, hideAuto: !v })}>
          Ежедневные авто-публикации
        </Switch>
        <Switch checked={filters.onlySlots} onChange={(v) => setFilters({ ...filters, onlySlots: v })}>
          Только без темы
        </Switch>
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
        <div className="cp-side__block cp-side__block--pad">
          <span className="nr-label">Банк тем</span>
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
            {chosen.every((r) => !bankOf(plan, r.id).length) && <span className="cp-hint">{chosen.length ? 'В отмеченных рубриках тем нет.' : 'Отметьте рубрики галочками.'}</span>}
          </div>
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => goto('bank')}>
            Открыть банк тем
          </button>
        </div>
      )}
    </aside>
  )
}
