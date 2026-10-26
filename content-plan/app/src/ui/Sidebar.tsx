import { useState } from 'react'
import { today } from '../model/dates'
import { NO_FILTERS, type Filters } from '../model/filters'
import { statusOf, tagOf } from '../model/types'
import { ChannelDot, IconButton, StatusFilter, Switch } from './bits'
import { usePlan, type Ctx, type Mode } from './ctx'
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
  if (f.hiddenSections?.length) {
    const sections = plan.channels.flatMap((c) => c.sections)
    out.push({ id: 'sec', label: `Без ${names(f.hiddenSections.map((id) => sections.find((x) => x.id === id)?.web ?? id))}`, clear: () => set({ hiddenSections: [] }) })
  }
  if (f.hiddenPlatforms.length) out.push({ id: 'pl', label: `Без ${names(f.hiddenPlatforms)}`, clear: () => set({ hiddenPlatforms: [] }) })
  if (f.hiddenRubrics.length)
    out.push({
      id: 'rb',
      label:
        f.hiddenRubrics.length === plan.rubrics.length - 1
          ? `Только ${tagOf(plan.rubrics.find((r) => !f.hiddenRubrics.includes(r.id))?.name ?? '')}`
          : f.hiddenRubrics.length > 2
            ? `Скрыто хэштегов: ${f.hiddenRubrics.length}`
            : `Без ${names(f.hiddenRubrics.map((id) => tagOf(plan.rubrics.find((r) => r.id === id)?.name ?? id)))}`,
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

const MODES: { id: Mode; label: string; icon: string; phone?: boolean }[] = [
  { id: 'time', label: 'Время', icon: 'clock' },
  { id: 'channels', label: 'Каналы', icon: 'channels' },
  { id: 'platforms', label: 'Площадки', icon: 'platforms' },
  { id: 'topics', label: 'Темы', icon: 'hash' },
  { id: 'feed', label: 'Лента по дням', icon: 'list', phone: true },
]

/** Поле «добавить» под заголовком блока: Enter — добавить, Esc — передумать. */
function AddInline({ label, placeholder, onAdd, onDone }: { label: string; placeholder: string; onAdd: (v: string) => void; onDone: () => void }) {
  const [v, setV] = useState('')
  return (
    <form
      className="cp-side__add"
      onSubmit={(e) => {
        e.preventDefault()
        if (v.trim()) onAdd(v.trim())
        onDone()
      }}
    >
      <input
        className="nr-field nr-field--sm"
        aria-label={label}
        placeholder={placeholder}
        value={v}
        autoFocus
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onDone())}
      />
      <button type="submit" className="nr-btn nr-btn--ghost nr-btn--sm" disabled={!v.trim()}>
        Добавить
      </button>
    </form>
  )
}

/** Заголовок блока фильтров с «+»: каналы, площадки и хэштеги можно добавлять прямо здесь. */
function BlockHead({ label, add, adding, onAdd }: { label: string; add: string; adding: boolean; onAdd: () => void }) {
  return (
    <div className="cp-side__label">
      <span className="nr-label">{label}</span>
      <IconButton icon="plus" size="sm" label={add} pressed={adding} onClick={onAdd} />
    </div>
  )
}

/** Панель слева — рядом с отделами, на большом экране всегда открыта: «Показать» (время, каналы, площадки, темы —
 *  выбирается как фильтр) и фильтры — каналы с разделами, площадки, хэштеги, статус. На узком экране — за кнопкой «Фильтры». */
export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { plan, filters, setFilters, mode, setMode, phone, dispatch, toast } = usePlan()
  const [adding, setAdding] = useState<'channel' | 'platform' | 'tag' | null>(null)
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const changed = activeFilters({ plan, filters, setFilters }).length > 0
  const open = (k: typeof adding) => setAdding(adding === k ? null : k)
  return (
    <aside className="cp-side nr-scroll" aria-label="Вид и фильтры">
      {onClose && (
        <div className="cp-side__head">
          <span className="cp-side__title">Вид и фильтры</span>
          <IconButton icon="close" label="Закрыть фильтры" onClick={onClose} size="sm" />
        </div>
      )}
      <div className="cp-side__block">
        <span className="nr-label">Показать</span>
        <div className="cp-modes" role="radiogroup" aria-label="Показать">
          {MODES.filter((m) => !m.phone || phone).map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              className="nr-row cp-mode"
              onClick={() => {
                setMode(m.id)
                onClose?.()
              }}
            >
              <Icon name={m.icon} size={18} />
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="cp-side__head">
        <span className="cp-side__title">Фильтры</span>
        {changed && (
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Сбросить
          </button>
        )}
      </div>
      <div className="cp-side__block">
        <BlockHead label="Каналы" add="Добавить канал" adding={adding === 'channel'} onAdd={() => open('channel')} />
        {adding === 'channel' && (
          <AddInline
            label="Новый канал"
            placeholder="Название канала"
            onDone={() => setAdding(null)}
            onAdd={(name) => {
              dispatch({ type: 'addChannel', name, start: today() })
              toast(`Канал «${name}» добавлен`, true)
            }}
          />
        )}
        {plan.channels.map((c) => {
          const off = filters.hiddenChannels.includes(c.id)
          return (
            <div key={c.id} className="cp-side__ch">
              <button
                type="button"
                className="nr-row"
                aria-pressed={!off}
                onClick={() => setFilters({ ...filters, hiddenChannels: toggle(filters.hiddenChannels, c.id) })}
              >
                <ChannelDot color={c.color} />
                {c.name}
                {c.start > plan.start && <span className="cp-side__count">с {c.start.slice(8)}.{c.start.slice(5, 7)}</span>}
              </button>
              {!off &&
                c.sections.map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    className="nr-row cp-side__sec"
                    aria-pressed={!filters.hiddenSections?.includes(sec.id)}
                    title={sec.name}
                    onClick={() => setFilters({ ...filters, hiddenSections: toggle(filters.hiddenSections ?? [], sec.id) })}
                  >
                    {sec.web}
                  </button>
                ))}
            </div>
          )
        })}
      </div>
      <div className="cp-side__block">
        <BlockHead label="Площадки" add="Добавить площадку" adding={adding === 'platform'} onAdd={() => open('platform')} />
        {adding === 'platform' && (
          <AddInline
            label="Новая площадка"
            placeholder="Например, VK"
            onDone={() => setAdding(null)}
            onAdd={(name) => {
              dispatch({ type: 'addPlatform', name })
              toast(`Площадка «${name}» добавлена`, true)
            }}
          />
        )}
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
        <BlockHead label="Хэштеги" add="Добавить хэштег" adding={adding === 'tag'} onAdd={() => open('tag')} />
        {adding === 'tag' && (
          <AddInline
            label="Новый хэштег"
            placeholder="#хэштег"
            onDone={() => setAdding(null)}
            onAdd={(name) => {
              dispatch({ type: 'addRubric', name })
              toast(`Хэштег ${tagOf(name.replace(/^#/, ''))} добавлен — периодичность в канале задаётся в дашборде, в «Темах»`, true)
            }}
          />
        )}
        <div className="cp-pills">
          {plan.rubrics.map((r) => (
            <button
              key={r.id}
              type="button"
              className="nr-pill"
              aria-pressed={!filters.hiddenRubrics.includes(r.id)}
              onClick={() => setFilters({ ...filters, hiddenRubrics: toggle(filters.hiddenRubrics, r.id) })}
            >
              {tagOf(r.name)}
            </button>
          ))}
        </div>
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
    </aside>
  )
}
