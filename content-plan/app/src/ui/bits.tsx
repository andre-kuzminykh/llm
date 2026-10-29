// Мелкие общие части: карточка материала, площадки, статусы, переключатели, перетаскивание.
import { useRef, useState, type CSSProperties, type DragEvent, type PointerEvent, type ReactNode } from 'react'
import { addDays, daysBetween } from '../model/dates'
import { whereText } from '../model/hint'
import { colorOf, FORMAT_ICON, isHome, isSlot, shownTitle, STATUSES, statusOf, titleIsFormat, type Plan, type Status } from '../model/types'
import { platformTypes, timeText, type Unit } from '../model/units'
import { usePlan, type Drag } from './ctx'
import { grabCard } from './drag'
import { Icon } from './Icon'

const MIME = 'application/x-content-plan'
/** Экран без наведения (палец): кнопки на карточке крупнее. */
const TOUCH = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches

export const PLATFORM_SHORT: Record<string, string> = {
  Web: 'Web', YouTube: 'YT', Instagram: 'IG', TikTok: 'TT', Threads: 'Th', X: 'X', Telegram: 'TG', LinkedIn: 'in', Mail: 'Mail',
}

/** Тему из банка тянут на день (материалы в календаре переносятся указателем — см. drag.ts). */
export function startDrag(e: DragEvent, d: Drag) {
  e.dataTransfer.setData(MIME, JSON.stringify(d))
  e.dataTransfer.setData('text/plain', d.id)
  e.dataTransfer.effectAllowed = 'move'
}

export function readDrag(e: DragEvent): Drag | null {
  try {
    const d = JSON.parse(e.dataTransfer.getData(MIME))
    return d && (d.kind === 'item' || d.kind === 'bank') && typeof d.id === 'string' ? d : null
  } catch {
    return null
  }
}

/** Цель для перетаскивания: подсветка, пока над ней что-то несут. Событие отдаётся, чтобы знать, куда бросили. */
export function useDrop(onDrop: (d: Drag, e: DragEvent) => void) {
  const [over, setOver] = useState(false)
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(MIME)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (!over) setOver(true)
      },
      onDragLeave: (e: DragEvent) => {
        if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setOver(false)
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        setOver(false)
        const d = readDrag(e)
        if (d) onDrop(d, e)
      },
    },
  }
}

export function ChannelDot({ color }: { color: string }) {
  return <span className="nr-dot" style={{ background: color }} aria-hidden="true" />
}

export function PlatformIcon({ platform, size = 14 }: { platform: string; size?: number }) {
  return (
    <span className="cp-pi" title={platform}>
      <Icon name={`p-${platform}`} size={size} />
    </span>
  )
}

/** Рубрика — просто названием: «Демо». Формат и время — рядом мелко. */
export function RubricChip({ name }: { name: string }) {
  return (
    <span className="cp-rub" aria-label={`Рубрика: ${name}`}>
      {name}
    </span>
  )
}

/** Статус значком: ▶ в работе, ⏸ на паузе, ✓ готово, ● вышло; «в плане» — без значка. */
export function StatusIcon({ status }: { status: Status }) {
  const s = statusOf(status)
  if (!s.icon) return null
  return (
    <span className={`cp-st cp-st--${s.id}`} title={s.label} aria-label={s.label} role="img">
      <Icon name={s.icon} size={12} />
    </span>
  )
}

/** Статус кнопками-значками: нажали — поставили, нажали ещё раз — снова в плане. */
export function StatusPicker({ value, onChange, label = 'Статус', size = 'md' }: { value: Status; onChange: (v: Status) => void; label?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={`cp-stp cp-stp--${size}`} role="group" aria-label={label}>
      {STATUSES.filter((s) => s.icon).map((s) => (
        <button
          key={s.id}
          type="button"
          className={`cp-stp__btn cp-st--${s.id}`}
          aria-pressed={value === s.id}
          aria-label={s.label}
          title={value === s.id ? `${s.label} · нажмите ещё раз, чтобы вернуть в план` : s.id === 'progress' ? 'В работе · откроется задача' : s.label}
          onClick={() => onChange(value === s.id ? 'planned' : s.id)}
        >
          <Icon name={s.icon!} size={size === 'sm' ? 14 : 18} />
        </button>
      ))}
    </div>
  )
}

/** Что делает ▶ / ⏸: в плане — «Начать», в работе — «Пауза», на паузе — «Продолжить»; готово и вышло — открыть задачу. */
export function playOf(status: Status): { label: string; icon: string; next?: Status } {
  if (status === 'progress') return { label: 'Пауза', icon: 'pause', next: 'paused' }
  if (status === 'paused') return { label: 'Продолжить', icon: 'play', next: 'progress' }
  if (status === 'planned') return { label: 'Начать', icon: 'play', next: 'progress' }
  return { label: 'Задача', icon: statusOf(status).icon! }
}

/** ▶ / ⏸ рядом с темой — в форме и в задаче: ▶ — в работу, в работе — ⏸ (на паузу), на паузе — снова ▶. */
export function PlayPause({ status, onChange }: { status: Status; onChange: (s: Status) => void }) {
  const p = playOf(status === 'ready' || status === 'published' ? 'planned' : status)
  const st = statusOf(status)
  return (
    <button
      type="button"
      className={`cp-play cp-st--${status === 'planned' ? 'progress' : status}${status === 'progress' || status === 'paused' ? ' cp-play--on' : ''}`}
      aria-label={p.label}
      title={status === 'progress' ? 'В работе · нажмите — на паузу' : status === 'paused' ? 'На паузе · нажмите — снова в работу' : `${st.label} · нажмите — в работу`}
      onClick={() => onChange(p.next!)}
    >
      <Icon name={p.icon} size={18} />
    </button>
  )
}

/** Кнопка на карточке — ▶ / ⏸ рядом с темой: ▶ — в работу (откроется задача), в работе — ⏸ на паузу; готово и вышло — значок, открыть задачу. */
export function TaskButton({ unit }: { unit: Unit }) {
  const { setStatus, openTask, toast } = usePlan()
  const st = statusOf(unit.head.status)
  const p = playOf(unit.head.status)
  return (
    <button
      type="button"
      className={`cp-task-btn cp-st--${st.icon ? st.id : 'progress'}${st.icon ? ' cp-task-btn--on' : ''}`}
      aria-label={`${p.label}: ${shownTitle(unit.head)}${st.icon ? ` (${st.label.toLowerCase()})` : ''}`}
      title={p.next === 'paused' ? 'В работе · нажмите — на паузу' : p.next ? `${p.label}: в работу, откроется задача` : `${st.label} · открыть задачу`}
      onClick={(e) => {
        e.stopPropagation()
        if (!p.next) return openTask(unit.head.id)
        setStatus(unit, p.next)
        if (p.next === 'paused') toast(`На паузе: ${shownTitle(unit.head)}`, true)
      }}
    >
      <Icon name={p.icon} size={11} />
    </button>
  )
}

export type CardVariant = 'mini' | 'compact' | 'line' | 'chip' | 'full'

/** Главный канал плана — у кого больше всего форматов (Офис Датаиста): его имя в строках не повторяется. */
export const mainChannelId = (plan: Plan) =>
  [...plan.channels].sort((x, y) => plan.rules.filter((r) => r.channelId === y.id).length - plan.rules.filter((r) => r.channelId === x.id).length)[0]?.id

/** Карточка материала — тихая строка: полоска слева — цвет канала, рубрика словом, тема.
 *  chip — строка «24/7» над шкалой (время, рубрика, тема одной строкой), compact — шкала времени и лента, line — дорожки недели (время и тема),
 *  full — панель дня: под темой площадки и что на каждой выходит. ▶ в углу — задача. */
export function UnitCard({ unit, variant = 'compact', style, showTime = true, narrow = false, icons = variant === 'compact' || variant === 'line', iconRoom, when, onGrab, className, children }: {
  unit: Unit
  variant?: CardVariant
  style?: CSSProperties
  showTime?: boolean
  narrow?: boolean
  /** Снизу в ряд: значок формата, за ним значки площадок, куда выходит. В месяце — без него: там тесно. */
  icons?: boolean
  /** Ширина ряда значков, px: ряд — одной строкой, что не влезло — «+N». Без неё ряд переносится (лента на телефоне). */
  iconRoom?: number
  /** Время на карточке вместо своего — пока её ведут по шкале, там время, куда она встанет. */
  when?: string
  /** Свои жесты (шкала времени); без них карточку переносят на другой день — drag.ts. */
  onGrab?: (e: PointerEvent<HTMLDivElement>) => void
  className?: string
  children?: ReactNode
}) {
  const { plan, channels, rubrics, rules, badIds, openItem, dropOn, selected, toggleSelect, moveMany, hint } = usePlan()
  const { head } = unit
  const picked = selected.has(head.id)
  const rule = rules.get(head.ruleId)
  const rubric = rubrics.get(head.rubricId ?? '')
  const color = colorOf(channels.get(unit.channelId), head.sectionId)
  const slot = isSlot(head)
  const title = shownTitle(head)
  // в мини-карточке стоят только FULL — подпись «FULL» там лишняя
  const format = rule && rule.name !== rubric?.name && !titleIsFormat(head.title, rule) && !(variant === 'mini' && rule.full) ? rule.name : ''
  const plats = platformTypes(unit, rules, plan.platforms)
  const bad = unit.items.some((it) => badIds.has(it.id))
  const full = !!rule?.full && !head.derive
  // готово и вышло — бледнее сразу; в работе — подсвечена и «дышит»
  const done = head.status === 'ready' || head.status === 'published'
  const st = statusOf(head.status)
  const label = `${rubric?.name ?? ''}${format ? ` · ${format}` : ''}`
  const platLabel = plats.map((p) => `${p.platform} — ${p.parts.map((x) => x.type).join(', ')}`).join(' · ')
  // форматы карточки: главного материала первым, остальные — по порядку (горизонталь, вертикаль, веб, пост)
  const own = new Set(unit.items.map((it) => it.format))
  const formats = [head.format, ...Object.keys(FORMAT_ICON).filter((f) => f !== head.format && own.has(f))].filter((f) => FORMAT_ICON[f])
  // ряд одной строкой: значок с промежутком — 15 px, черта между форматом и площадками — 6; не влезло — «+N»;
  // пальцем кнопка ▶ крупнее — ряду значков остаётся меньше места
  const room = iconRoom === undefined ? Infinity : iconRoom - (TOUCH ? 8 : 0)
  const fit = Math.floor((room + 3 - (formats.length && plats.some((p) => !isHome(p.platform)) ? 6 : 0)) / 15)
  // сайт и письмо — форматы: их значок уже стоит первым
  const where = plats.filter((p) => !isHome(p.platform))
  const shownPlats = formats.length + where.length > fit ? where.slice(0, Math.max(0, fit - formats.length - 1)) : where
  const restPlats = where.slice(shownPlats.length)
  const withIcons = icons && (formats.length > 0 || where.length > 0)
  const cls = ['cp-card', `cp-card--${variant}`, withIcons && 'cp-card--icons', narrow && 'cp-card--narrow', slot && 'cp-card--slot', full && 'cp-card--main', picked && 'cp-card--picked', done && 'cp-card--done', head.status === 'progress' && 'cp-card--progress', className]
    .filter(Boolean)
    .join(' ')
  const line = variant === 'line' || variant === 'chip'
  // растянутая на шкале карточка — с концом: «12:00–13:30»
  const time = when ?? (unit.end && !unit.stream && variant === 'compact' ? `${unit.time}–${unit.end}` : timeText(unit))
  return (
    <div
      className={cls}
      style={{ '--cp-c': color, ...style } as CSSProperties}
      onPointerDown={
        onGrab ??
        ((e) => {
          // выбранную карточку везут вместе с остальными выбранными — на тот же сдвиг
          const many = picked && selected.size > 1 && unit.date ? [...selected] : null
          const movesTo = (date: string) => {
            const dd = daysBetween(unit.date!, date)
            return many ? many.map((id) => ({ id, date: addDays(plan.items.find((x) => x.id === id)?.date ?? date, dd) })) : [{ id: head.id, date }]
          }
          grabCard(e, (d) => (many ? moveMany(many, daysBetween(unit.date!, d.date)) : dropOn(d.date, { kind: 'item', id: head.id }, d.time)), {
            hint: (d) => [
              { text: whereText(d.date, many || unit.stream ? undefined : d.time, many?.length ?? 1, daysBetween(unit.date ?? d.date, d.date)) },
              ...hint(movesTo(d.date)),
            ],
            onSelect: () => toggleSelect(head.id),
          })
        })
      }
      data-unit={head.id}
    >
      <button
        type="button"
        className="cp-card__open"
        onClick={(e) => {
          e.stopPropagation()
          // Shift или ⌘ (Ctrl) — выбрать карточку, а не открыть
          if (e.shiftKey || e.metaKey || e.ctrlKey) return toggleSelect(head.id)
          openItem(head.id)
        }}
        aria-pressed={picked || undefined}
        aria-label={`${label}: ${title}${showTime ? `, ${timeText(unit)}` : ''}${st.icon ? ` — ${st.label.toLowerCase()}` : ''}${picked ? ', выбрано' : ''}`}
        title={variant === 'full' ? undefined : `${label} · ${unit.stream ? 'круглосуточно, по вебхуку' : unit.time}\n${title}\n${platLabel}${head.langs ? `\nЯзыки: ${head.langs.map((l) => l.toUpperCase()).join(', ')}` : ''}${bad ? '\nНарушение сетки — см. «Проверку»' : ''}`}
      >
        {line ? (
          <>
            <span className="cp-card__rub">
              {showTime && <span className="cp-card__time">{time}</span>}
              {rubric && <RubricChip name={rubric.name} />}
              {head.trigger && <span className="cp-auto" title="Версия для другой площадки: создаётся автоматически, когда выйдет оригинал"><Icon name="bolt" size={11} /></span>}
              {bad && <span className="cp-card__bad" aria-hidden="true" />}
            </span>
            <span className="cp-card__title">{title}</span>
          </>
        ) : (
          <>
            <span className="cp-card__rub">
              {rubric && <RubricChip name={rubric.name} />}
              {format && variant !== 'mini' && <span className="cp-card__fmt">{format}</span>}
              {bad && <span className="cp-card__bad" aria-hidden="true" />}
              {head.trigger && <span className="cp-auto" title="Версия для другой площадки: создаётся автоматически, когда выйдет оригинал"><Icon name="bolt" size={11} /></span>}
              {showTime && <span className="cp-card__time" title={unit.stream ? 'Круглосуточно: приходит по вебхуку и выходит сразу' : undefined}>{time}</span>}
            </span>
            <span className="cp-card__title">{title}</span>
          </>
        )}
        {withIcons && (
          <span className={`cp-card__icons${iconRoom === undefined ? '' : ' cp-card__icons--one'}`} aria-hidden="true">
            {formats.map((f) => (
              <span key={f} className="cp-card__f" title={FORMAT_ICON[f].label}>
                <Icon name={FORMAT_ICON[f].icon} size={12} />
              </span>
            ))}
            {shownPlats.map(({ platform }) => (
              <PlatformIcon key={platform} platform={platform} size={12} />
            ))}
            {restPlats.length > 0 && (
              <span className="cp-card__more" title={restPlats.map((p) => p.platform).join(', ')}>
                +{restPlats.length}
              </span>
            )}
          </span>
        )}
        {variant === 'full' && (
          <span className="cp-types" aria-label={`Площадки: ${platLabel}`}>
            {plats.map(({ platform, parts }) => (
              <span key={platform} className="cp-types__p">
                <PlatformIcon platform={platform} size={13} />
                <span className="cp-types__name">{platform}</span>
                <span className="cp-types__dash" aria-hidden="true">—</span>
                <span className="cp-types__list">
                  {parts.map((x) => (
                    <span key={x.type} className="cp-types__t">{x.type}</span>
                  ))}
                </span>
              </span>
            ))}
          </span>
        )}
      </button>
      <TaskButton unit={unit} />
      {children}
    </div>
  )
}

/** Фильтр по статусу словами: «Все», «В работе»… Выбран один; «Все» — без фильтра. */
export function StatusFilter({ value, onChange, options = STATUSES.map((s) => s.id) }: { value: Status[]; onChange: (v: Status[]) => void; options?: Status[] }) {
  const cur = value.length === 1 ? value[0] : value.length ? null : 'all'
  return (
    <div className="cp-stf" role="radiogroup" aria-label="Статус">
      {(['all', ...options] as const).map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={cur === id}
          className="cp-stf__item"
          onClick={() => onChange(id === 'all' ? [] : [id])}
        >
          {id === 'all' ? 'Все' : statusOf(id).label}
        </button>
      ))}
    </div>
  )
}

/** Дата или время текстом («Пн, 26 окт», «12:00»); по нажатию — системный выбор. Поле подписано для диктора. */
export function PickText({ type, value, label, text, onChange, placeholder }: { type: 'date' | 'time'; value: string; label: string; text: string; onChange: (v: string) => void; placeholder?: string }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <span className="cp-pick">
      <button
        type="button"
        className={`cp-pick__btn${value ? '' : ' cp-pick__btn--empty'}`}
        title={label}
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
        {value ? text : placeholder ?? label}
      </button>
      <input ref={input} className="cp-pick__in" type={type} step={type === 'time' ? 900 : undefined} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    </span>
  )
}

export function Switch({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="nr-switch" onClick={() => onChange(!checked)}>
      <span className="nr-switch__track" aria-hidden="true" />
      {children}
    </button>
  )
}

/** Галочка: выбор нескольких из списка (рубрики банка, что показывать). */
export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="cp-check-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="cp-check-row__box" aria-hidden="true">
        <Icon name="check" size={12} />
      </span>
      <span className="cp-check-row__text">{children}</span>
    </label>
  )
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="nr-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className="nr-seg__item" onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function IconButton({ icon, label, onClick, disabled, pressed, size = 'md' }: { icon: string; label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      className={`nr-btn nr-btn--ghost nr-btn--icon${size === 'sm' ? ' nr-btn--sm' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
    >
      <Icon name={icon} size={size === 'sm' ? 16 : 20} />
    </button>
  )
}
