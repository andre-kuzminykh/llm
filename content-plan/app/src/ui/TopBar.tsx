import { useMemo, useRef, useState, type ReactNode } from 'react'
import { shortDate, today } from '../model/dates'
import { visible } from '../model/filters'
import { planningSlots } from '../model/planning'
import { shownTitle, tagOf, timeOf, type ISODate } from '../model/types'
import { IconButton } from './bits'
import { activeFilters, FilterChips } from './Sidebar'
import { usePlan, type Mode, type Span } from './ctx'
import { Icon } from './Icon'
import { useMedia } from './theme'

// о сохранении шапка молчит, пока всё в порядке
const SAVED: Record<string, string> = {
  memory: 'Без сохранения',
  error: 'Не сохранилось',
}

/** Шапка календаря: слева «Фильтры» (сворачивает и разворачивает панель слева), заголовок с датой и стрелки; посередине —
 *  поиск, «Неделя / Месяц» и вид недели (время, каналы, площадки, темы); справа в углу — значок дашборда (открывается панелью справа).
 *  «+» — круглая кнопка справа внизу. Отмена — ⌘Z и кнопкой во всплывашке после правки. */
export function TopBar({ title, children }: { title: ReactNode; children?: ReactNode }) {
  const ctx = usePlan()
  const { plan, saved, toggleSide, sideOpen, phone, panel, openDashboard, show, span } = ctx
  // фильтры свёрнуты — сколько включено, видно на кнопке и метками в шапке
  const n = sideOpen ? 0 : activeFilters(ctx).length
  // за неделю календарь просит уточнить темы: точка на значке дашборда
  const need = useMemo(() => planningSlots(plan, today()).length, [plan])
  return (
    <header className="cp-top">
      <div className="cp-top__left">
      <button
        type="button"
        className="nr-btn nr-btn--ghost nr-btn--icon cp-top__filter"
        aria-label="Фильтры"
        title={sideOpen ? 'Свернуть фильтры' : 'Развернуть фильтры'}
        aria-pressed={sideOpen}
        aria-expanded={sideOpen}
        onClick={toggleSide}
      >
        <Icon name="filter" size={20} />
        {n > 0 && <span className="cp-top__badge" aria-hidden="true">{n}</span>}
      </button>
      {typeof title === 'string' ? <h1 className="nr-title">{title}</h1> : title}
      {children}
      </div>
      {/* поиск, неделя или месяц и вид недели — посередине шапки (если слева тесно — сразу за датой); справа в углу — дашборд */}
      <div className="cp-top__mid">
        <Search />
        <div className="cp-top__views">
          {!phone && <SpanSwitch />}
          {span === 'week' && <ViewSwitch />}
        </div>
      </div>
      <div className="cp-top__right">
      {!sideOpen && <FilterChips />}
      {SAVED[saved] && (
        <span className="cp-saved cp-saved--warn" role="status" title={saved === 'memory' ? 'Хранилище браузера недоступно: правки живут до перезагрузки — выгрузите JSON в меню профиля' : undefined}>
          {SAVED[saved]}
        </span>
      )}
      {!phone && (
        <button
          type="button"
          className="nr-btn nr-btn--ghost nr-btn--icon cp-top__dash"
          aria-label="Дашборд"
          title={need ? `Дашборд · пора уточнить темы на неделю: ${need}` : 'Дашборд'}
          aria-pressed={panel === 'dashboard'}
          onClick={() => (panel === 'dashboard' ? show() : openDashboard())}
        >
          <Icon name="dashboard" size={20} />
          {need > 0 && <span className="cp-top__dot" aria-hidden="true" />}
        </button>
      )}
      </div>
    </header>
  )
}

const SPANS: { id: Span; label: string; icon: string }[] = [
  { id: 'week', label: 'Неделя', icon: 'week' },
  { id: 'month', label: 'Месяц', icon: 'calendar' },
]

/** Неделя или месяц — значками, выбран один. */
function SpanSwitch() {
  const { span, setSpan } = usePlan()
  return (
    <div className="nr-seg cp-views cp-span" role="radiogroup" aria-label="Неделя или месяц">
      {SPANS.map((v) => (
        <button key={v.id} type="button" role="radio" aria-checked={span === v.id} aria-label={v.label} title={v.label} className="nr-seg__item cp-views__item" onClick={() => setSpan(v.id)}>
          <Icon name={v.icon} size={16} />
        </button>
      ))}
    </div>
  )
}

const VIEWS: { id: Mode; label: string; icon: string; phone?: boolean }[] = [
  { id: 'time', label: 'Время', icon: 'clock' },
  { id: 'channels', label: 'Каналы', icon: 'channels' },
  { id: 'platforms', label: 'Площадки', icon: 'platforms' },
  { id: 'topics', label: 'Темы', icon: 'hash' },
  { id: 'feed', label: 'Лента по дням', icon: 'list', phone: true },
]

/** Вид календаря — справа от поиска: иконка и подпись (если тесно — только иконка). Где совсем тесно — меню «Вид»,
 *  на телефоне в нём ещё лента по дням. */
function ViewSwitch() {
  const { mode, setMode, phone } = usePlan()
  const tight = useMedia('(max-width: 1100px)')
  const [open, setOpen] = useState(false)
  const list = VIEWS.filter((v) => !v.phone || phone)
  if (!tight)
    return (
      <div className="nr-seg cp-views" role="radiogroup" aria-label="Вид календаря">
        {list.map((v) => (
          <button key={v.id} type="button" role="radio" aria-checked={mode === v.id} aria-label={v.label} title={v.label} className="nr-seg__item cp-views__item" onClick={() => setMode(v.id)}>
            <Icon name={v.icon} size={16} />
            <span className="cp-views__label" aria-hidden="true">{v.label}</span>
          </button>
        ))}
      </div>
    )
  const cur = list.find((v) => v.id === mode) ?? list[0]
  return (
    <span className="cp-pop" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}>
      <button type="button" className="nr-btn nr-btn--ghost nr-btn--icon" aria-label="Вид" title={`Вид: ${cur.label}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <Icon name={cur.icon} size={20} />
      </button>
      {open && (
        <span className="cp-pop__menu nr-glass" role="menu" aria-label="Вид календаря">
          {list.map((v) => (
            <button
              key={v.id}
              type="button"
              role="menuitemradio"
              aria-checked={mode === v.id}
              className="cp-menu__item"
              onClick={() => {
                setMode(v.id)
                setOpen(false)
              }}
            >
              <span className="cp-views__row">
                <Icon name={v.icon} size={18} />
                {v.label}
              </span>
              {mode === v.id && <Icon name="check" size={14} />}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

const LIMIT = 30

/** Поиск темы по всему плану, вверху: под полем — найденное по датам (и черновики); нажать — календарь на этой дате и материал открыт. */
function Search() {
  const { plan, filters, rules, rubrics, jumpTo, openItem } = usePlan()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  // где шапке тесно (и на телефоне) поиск — значком; нажали — поле поверх шапки
  const compact = useMedia('(max-width: 1180px)')
  const [shown, setShown] = useState(false)
  const query = q.trim().toLowerCase()
  const hits = useMemo(() => {
    if (query.length < 2) return []
    const key = (d: ISODate | null) => d ?? '9999'
    return plan.items
      .filter((it) => !it.derive && (it.date === null || visible(it, filters)) && it.title.toLowerCase().includes(query))
      .sort((a, b) => (key(a.date) < key(b.date) ? -1 : key(a.date) > key(b.date) ? 1 : a.rank - b.rank))
  }, [plan.items, filters, query])
  const pick = (id: string, date: ISODate | null) => {
    if (date) jumpTo(date)
    openItem(id)
    setQ('')
    setOpen(false)
    setShown(false)
  }
  if (compact && !shown) return <IconButton icon="search" label="Поиск" onClick={() => setShown(true)} />
  return (
    <div
      className={`cp-search${compact ? ' cp-search--float' : ''}`}
      role="search"
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setOpen(false)
        if (!q) setShown(false)
      }}
    >
      <Icon name="search" size={16} />
      <input
        className="cp-search__in"
        type="search"
        placeholder="Поиск темы"
        aria-label="Поиск по плану"
        autoFocus={compact}
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            setQ('')
            setOpen(false)
            setShown(false)
          }
          if (e.key === 'Enter' && hits[0]) pick(hits[0].id, hits[0].date)
        }}
      />
      {open && query.length >= 2 && (
        <div className="cp-search__pop" role="region" aria-label="Найдено">
          <span className="cp-search__count">{hits.length ? `Найдено: ${hits.length}` : 'Ничего не найдено'}</span>
          {hits.slice(0, LIMIT).map((it) => {
            const r = rubrics.get(it.rubricId ?? '')
            const when = it.date ? `${shortDate(it.date)}, ${timeOf(it, rules.get(it.ruleId))}` : 'черновик'
            return (
              <button key={it.id} type="button" className="cp-search__row" onClick={() => pick(it.id, it.date)} aria-label={`${when} · ${r ? tagOf(r.name) : ''}: ${shownTitle(it)}`}>
                <span className="cp-search__when">{when}</span>
                {r && <span className="cp-rub">{tagOf(r.name)}</span>}
                <span className="cp-search__title">{shownTitle(it)}</span>
              </button>
            )
          })}
          {hits.length > LIMIT && <span className="cp-search__count">и ещё {hits.length - LIMIT} — уточните запрос</span>}
        </div>
      )}
    </div>
  )
}

/** Заголовок вида, по нажатию — выбор даты: календарь сразу переходит к ней. */
export function DateJump({ label, value, onPick }: { label: string; value: ISODate; onPick: (d: ISODate) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <span className="cp-jump">
      <button
        type="button"
        className="cp-jump__btn"
        title="Перейти к дате"
        onClick={() => {
          const el = input.current
          if (!el) return
          try {
            el.showPicker()
          } catch {
            el.focus()
          }
        }}
      >
        <h1 className="nr-title">{label}</h1>
        <Icon name="chev-right" size={16} />
      </button>
      <input
        ref={input}
        className="cp-jump__input"
        type="date"
        aria-label="Перейти к дате"
        value={value}
        onChange={(e) => e.target.value && onPick(e.target.value)}
      />
    </span>
  )
}
