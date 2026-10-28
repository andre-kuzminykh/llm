import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { today } from '../model/dates'
import { NO_FILTERS, type Filters } from '../model/filters'
import { FORMAT_ICON, FORMATS, GRAY, statusOf, tagOf, type Channel } from '../model/types'
import { IconButton, PlatformIcon, StatusFilter, Switch } from './bits'
import { AddInline, ChannelMenu, ChannelRename, useDismiss } from './ChannelEdit'
import { usePlan, type Ctx } from './ctx'
import { SLOP, swallowClick } from './drag'
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
  if (f.hiddenFormats?.length)
    out.push({
      id: 'fm',
      label: f.hiddenFormats.length === 1 ? `Скрыт формат: ${f.hiddenFormats[0].toLowerCase()}` : `Скрыто форматов: ${f.hiddenFormats.length}`,
      clear: () => set({ hiddenFormats: [] }),
    })
  const picked = plan.rubrics.filter((r) => f.pickedRubrics?.includes(r.id))
  if (picked.length && picked.length < plan.rubrics.length)
    out.push({
      id: 'rb',
      label: picked.length > 2 ? `Рубрик: ${picked.length}` : `Только ${names(picked.map((r) => tagOf(r.name)))}`,
      clear: () => set({ pickedRubrics: [] }),
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

/** Цвета на выбор: серый — первым, им по умолчанию отмечены разделы. */
const PALETTE: { color: string; name: string }[] = [
  { color: GRAY, name: 'Серый' },
  { color: '#7b2cbf', name: 'Фиолетовый' },
  { color: '#1a56b8', name: 'Синий' },
  { color: '#0a84ff', name: 'Голубой' },
  { color: '#0b7a75', name: 'Бирюзовый' },
  { color: '#34c759', name: 'Зелёный' },
  { color: '#ff9f0a', name: 'Жёлтый' },
  { color: '#d35400', name: 'Оранжевый' },
  { color: '#ff375f', name: 'Красный' },
  { color: '#c2185b', name: 'Малиновый' },
  { color: '#5e5ce6', name: 'Индиго' },
  { color: '#a2845e', name: 'Коричневый' },
]

/** Точка цвета у канала или раздела: нажали — палитра, выбрали — карточки перекрасились. Esc или щелчок мимо — закрыть. */
function ColorPick({ label, color, onPick, reset }: { label: string; color: string; onPick: (c: string) => void; reset?: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useDismiss(ref, open, () => setOpen(false))
  const pick = (c: string) => {
    onPick(c)
    setOpen(false)
  }
  return (
    <span ref={ref} className={`cp-colorpick${open ? ' cp-colorpick--open' : ''}`}>
      <button type="button" className="cp-colorpick__btn" aria-label={label} aria-expanded={open} title="Сменить цвет" onClick={() => setOpen(!open)}>
        <span className="cp-colorpick__dot" style={{ background: color }} />
      </button>
      {open && (
        <span className="cp-colorpick__pop nr-panel" role="group" aria-label={label}>
          {PALETTE.map((p) => (
            <button
              key={p.color}
              type="button"
              className="cp-colorpick__sw"
              style={{ background: p.color }}
              aria-label={p.name}
              title={p.name}
              aria-pressed={p.color.toLowerCase() === color.toLowerCase()}
              onClick={() => pick(p.color)}
            />
          ))}
          {reset && (
            <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm cp-colorpick__reset" onClick={() => (reset(), setOpen(false))}>
              Как у канала
            </button>
          )}
        </span>
      )}
    </span>
  )
}

/** Строка канала: точка цвета, фильтр, «⋯» (переименовать, выше, ниже, удалить); мышью строку можно перетащить. */
function ChannelRow({ c, off, onToggle, onGrab, drag, children }: {
  c: Channel
  off: boolean
  onToggle: () => void
  onGrab: (e: ReactPointerEvent) => void
  drag?: { dy?: number; before?: boolean; after?: boolean }
  children?: ReactNode
}) {
  const [renaming, setRenaming] = useState(false)
  const [open, setOpen] = useState(false)
  if (renaming) return <ChannelRename c={c} onDone={() => setRenaming(false)} />
  const cls = [
    'cp-side__row',
    off && 'cp-side__row--off',
    open && 'cp-side__row--open',
    drag?.dy !== undefined && 'cp-side__row--drag',
    drag?.before && 'cp-side__row--before',
    drag?.after && 'cp-side__row--after',
  ]
  return (
    <div className={cls.filter(Boolean).join(' ')} data-reorder={c.id} style={drag?.dy !== undefined ? { transform: `translateY(${drag.dy}px)` } : undefined}>
      {children}
      <button type="button" className="nr-row" aria-pressed={!off} onClick={onToggle} onPointerDown={onGrab} title="Щёлкнуть — показать или скрыть; потянуть — поменять порядок">
        {c.name}
      </button>
      <ChannelMenu c={c} onRename={() => setRenaming(true)} onOpen={setOpen} className="cp-side__more" />
    </div>
  )
}

/** Перетащить строку мышью: она едет за указателем, линия показывает, куда встанет; отпустили — порядок поменялся. */
function useReorder(onMove: (id: string, to: number) => void) {
  const list = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ id: string; dy: number; to: number } | null>(null)
  const start = (e: ReactPointerEvent, id: string) => {
    if (e.button !== 0 || e.pointerType !== 'mouse') return // пальцем — «⋯» → «Выше» / «Ниже»: панель листается
    const rows = [...(list.current?.querySelectorAll<HTMLElement>('[data-reorder]') ?? [])]
    const from = rows.findIndex((r) => r.dataset.reorder === id)
    if (from < 0) return
    const mids = rows.map((r) => {
      const b = r.getBoundingClientRect()
      return b.top + b.height / 2
    })
    const y0 = e.clientY
    let live = false
    let to = from
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - y0
      if (!live && Math.abs(dy) <= SLOP) return
      live = true
      to = mids.filter((m, i) => i !== from && m < mids[from] + dy).length
      setDrag({ id, dy, to })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDrag(null)
      if (!live) return
      swallowClick() // отпущенная кнопка — не щелчок по фильтру
      if (to !== from) onMove(id, to)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return { list, drag, start }
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

/** Фильтры — панелью слева, рядом с отделами: каналы с разделами, площадки, хэштеги, статус. Сворачивается и разворачивается
 *  кнопкой «Фильтры» в шапке; на узком экране — поверх календаря. «+» у каналов, площадок и хэштегов — добавить новый. */
export function Sidebar({ onClose }: { onClose: () => void }) {
  const { plan, filters, setFilters, narrow, dispatch, toast } = usePlan()
  const reorder = useReorder((id, to) => {
    dispatch({ type: 'moveChannel', id, to })
    toast(`«${plan.channels.find((c) => c.id === id)?.name}» — на ${to + 1}-м месте`, true)
  })
  const [adding, setAdding] = useState<'channel' | 'platform' | 'tag' | null>(null)
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const changed = activeFilters({ plan, filters, setFilters }).length > 0
  const open = (k: typeof adding) => setAdding(adding === k ? null : k)
  return (
    <aside className="cp-side nr-scroll" aria-label="Фильтры">
      <div className="cp-side__head">
        <span className="cp-side__title">Фильтры</span>
        {changed && (
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Сбросить
          </button>
        )}
        {narrow ? (
          <IconButton icon="close" label="Закрыть фильтры" onClick={onClose} size="sm" />
        ) : (
          <IconButton icon="chev-left" label="Свернуть фильтры" onClick={onClose} size="sm" />
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
        <div ref={reorder.list} className="cp-side__list">
        {plan.channels.map((c, i) => {
          const off = filters.hiddenChannels.includes(c.id)
          const setSection = (id: string, color?: string) =>
            dispatch({ type: 'channel', id: c.id, patch: { sections: c.sections.map((s) => (s.id === id ? { ...s, color } : s)) } })
          // куда встанет перетаскиваемый: линия над строкой с этим местом среди остальных (или под последней)
          const d = reorder.drag
          const from = d ? plan.channels.findIndex((x) => x.id === d.id) : -1
          const place = i > from ? i - 1 : i
          const mark = d && (d.id === c.id ? { dy: d.dy } : { before: place === d.to, after: place === plan.channels.length - 2 && d.to === plan.channels.length - 1 })
          return (
            <div key={c.id} className="cp-side__ch">
              <ChannelRow
                c={c}
                off={off}
                onToggle={() => setFilters({ ...filters, hiddenChannels: toggle(filters.hiddenChannels, c.id) })}
                onGrab={(e) => reorder.start(e, c.id)}
                drag={mark || undefined}
              >
                <ColorPick label={`Цвет: ${c.name}`} color={c.color} onPick={(color) => dispatch({ type: 'channel', id: c.id, patch: { color } })} />
              </ChannelRow>
              {!off &&
                c.sections.map((sec) => {
                  const hidden = !!filters.hiddenSections?.includes(sec.id)
                  return (
                    <div key={sec.id} className={`cp-side__row cp-side__row--sec${hidden ? ' cp-side__row--off' : ''}`}>
                      <ColorPick
                        label={`Цвет: ${sec.web}`}
                        color={sec.color ?? c.color}
                        onPick={(color) => setSection(sec.id, color)}
                        reset={sec.color ? () => setSection(sec.id, undefined) : undefined}
                      />
                      <button
                        type="button"
                        className="nr-row cp-side__sec"
                        aria-pressed={!hidden}
                        title={sec.name}
                        onClick={() => setFilters({ ...filters, hiddenSections: toggle(filters.hiddenSections ?? [], sec.id) })}
                      >
                        {sec.web}
                      </button>
                    </div>
                  )
                })}
            </div>
          )
        })}
        </div>
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
              <PlatformIcon platform={p} />
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="cp-side__block">
        <span className="nr-label">Форматы</span>
        {FORMATS.map((g) => (
          <div key={g.group} className="cp-side__group" role="group" aria-label={g.group}>
            <span className="cp-side__sub">{g.group}</span>
            {g.items.map((f) => (
              <button
                key={f}
                type="button"
                className="nr-row cp-side__sec"
                aria-pressed={!filters.hiddenFormats?.includes(f)}
                onClick={() => setFilters({ ...filters, hiddenFormats: toggle(filters.hiddenFormats ?? [], f) })}
              >
                <Icon name={FORMAT_ICON[f].icon} size={16} />
                {f}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="cp-side__block">
        <BlockHead label="Рубрики" add="Добавить рубрику" adding={adding === 'tag'} onAdd={() => open('tag')} />
        {adding === 'tag' && (
          <AddInline
            label="Новая рубрика"
            placeholder="#рубрика"
            onDone={() => setAdding(null)}
            onAdd={(name) => {
              dispatch({ type: 'addRubric', name })
              toast(`Рубрика ${tagOf(name.replace(/^#/, ''))} добавлена — периодичность в канале задаётся в дашборде, в «Темах»`, true)
            }}
          />
        )}
        {/* щелчок выделяет рубрику — видны только выделенные; ничего не выделено — видны все */}
        <div className="cp-pills cp-side__rubrics" role="group" aria-label="Рубрики">
          {plan.rubrics.map((r) => (
            <button
              key={r.id}
              type="button"
              className="nr-pill"
              aria-pressed={!!filters.pickedRubrics?.includes(r.id)}
              onClick={() => setFilters({ ...filters, pickedRubrics: toggle(filters.pickedRubrics ?? [], r.id) })}
            >
              {tagOf(r.name)}
            </button>
          ))}
        </div>
        <div className="cp-side__picks">
          <button
            type="button"
            className="nr-btn nr-btn--ghost nr-btn--sm"
            disabled={plan.rubrics.every((r) => filters.pickedRubrics?.includes(r.id))}
            onClick={() => setFilters({ ...filters, pickedRubrics: plan.rubrics.map((r) => r.id) })}
          >
            Выделить все
          </button>
          {!!filters.pickedRubrics?.length && (
            <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => setFilters({ ...filters, pickedRubrics: [] })}>
              Снять выделение
            </button>
          )}
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
