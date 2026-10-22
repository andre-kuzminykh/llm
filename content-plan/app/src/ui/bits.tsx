// Мелкие общие части: карточка материала, площадки, статусы, переключатели, перетаскивание.
import { useState, type CSSProperties, type DragEvent, type ReactNode } from 'react'
import { isSlot, shownTitle, STATUSES, statusOf, titleIsFormat, type Status } from '../model/types'
import { platformTypes, type Unit } from '../model/units'
import { usePlan, type Drag } from './ctx'
import { Icon } from './Icon'

const MIME = 'application/x-content-plan'

export const PLATFORM_SHORT: Record<string, string> = {
  Web: 'Web', YouTube: 'YT', Instagram: 'IG', TikTok: 'TT', Threads: 'Th', X: 'X', Telegram: 'TG', LinkedIn: 'in', Mail: 'Mail',
}

/** За какое место карточку взяли: на шкале времени она встаёт верхним краем туда, куда её опустили. */
export const grab = { y: 0 }

export function startDrag(e: DragEvent, d: Drag) {
  grab.y = e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top
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

/** Рубрика — меткой: «ДЕМО». Формат и время — рядом мелко. */
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

/** Кнопка задачи на карточке: показывает статус; ▶ — начать работу и открыть задачу. */
export function TaskButton({ unit }: { unit: Unit }) {
  const { setStatus, openTask } = usePlan()
  const st = statusOf(unit.head.status)
  const start = unit.head.status === 'planned' || unit.head.status === 'paused'
  return (
    <button
      type="button"
      className={`cp-task-btn cp-st--${st.icon ? st.id : 'progress'}${st.icon ? ' cp-task-btn--on' : ''}`}
      aria-label={`${start ? 'Начать' : 'Задача'}: ${shownTitle(unit.head)}${st.icon ? ` (${st.label.toLowerCase()})` : ''}`}
      title={start ? 'Начать: откроется задача по созданию контента' : `${st.label} · открыть задачу`}
      onClick={(e) => {
        e.stopPropagation()
        if (start) setStatus(unit, 'progress')
        else openTask(unit.head.id)
      }}
    >
      <Icon name={st.icon && !start ? st.icon : 'play'} size={11} />
    </button>
  )
}

export type CardVariant = 'mini' | 'compact' | 'full'

/** Карточка материала: рубрика меткой, тема, площадки (в полном виде — что выходит на каждой).
 *  Полоска слева — цвет канала. Тянется на другой день, по нажатию открывает форму. */
export function UnitCard({ unit, variant = 'compact', style, showTime = true, narrow = false }: { unit: Unit; variant?: CardVariant; style?: CSSProperties; showTime?: boolean; narrow?: boolean }) {
  const { plan, channels, rubrics, rules, badIds, openItem } = usePlan()
  const [dragging, setDragging] = useState(false)
  const { head } = unit
  const rule = rules.get(head.ruleId)
  const rubric = rubrics.get(head.rubricId ?? '')
  const color = channels.get(unit.channelId)?.color
  const slot = isSlot(head)
  const title = shownTitle(head)
  // в месяце стоят только FULL — подпись «FULL» там лишняя
  const format = rule && rule.name !== rubric?.name && !titleIsFormat(head.title, rule) && !(variant === 'mini' && rule.full) ? rule.name : ''
  const plats = platformTypes(unit, rules, plan.platforms)
  const bad = unit.items.some((it) => badIds.has(it.id))
  const full = !!rule?.full && !head.derive
  const cls = ['cp-card', `cp-card--${variant}`, narrow && 'cp-card--narrow', slot && 'cp-card--slot', bad && 'cp-card--bad', full && 'cp-card--full', dragging && 'cp-card--dragging']
    .filter(Boolean)
    .join(' ')
  const st = statusOf(head.status)
  const platLabel = plats.map((p) => `${p.platform}: ${p.parts.map((x) => x.type).join(', ')}`).join('; ')
  return (
    <div
      className={cls}
      style={{ '--cp-c': color, ...style } as CSSProperties}
      draggable
      onDragStart={(e) => {
        e.stopPropagation()
        startDrag(e, { kind: 'item', id: head.id })
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
      data-unit={head.id}
    >
      <button
        type="button"
        className="cp-card__open"
        onClick={(e) => {
          e.stopPropagation()
          openItem(head.id)
        }}
        aria-label={`${rubric?.name ?? ''}${format ? ` · ${format}` : ''}: ${title}${showTime ? `, ${unit.time}` : ''}${st.icon ? ` — ${st.label.toLowerCase()}` : ''}`}
        title={variant === 'full' ? undefined : `${rubric?.name ?? ''}${format ? ` · ${format}` : ''} · ${unit.time}\n${title}\n${platLabel}`}
      >
        <span className="cp-card__rub">
          {rubric && <RubricChip name={rubric.name} />}
          {format && <span className="cp-card__fmt">{format}</span>}
          {showTime && <span className="cp-card__time">{unit.time}</span>}
        </span>
        <span className="cp-card__title">{title}</span>
        {variant === 'full' ? (
          <span className="cp-plats" aria-label={`Площадки: ${platLabel}`}>
            {plats.map(({ platform, parts }) => (
              <span key={platform} className="cp-plats__p">
                <span className="cp-plats__head">
                  <PlatformIcon platform={platform} />
                  {platform}
                </span>
                {parts.map((x) => (
                  <span key={x.type} className="cp-plats__t">{x.type}</span>
                ))}
              </span>
            ))}
          </span>
        ) : (
          <span className="cp-card__icons" aria-label={`Площадки: ${platLabel}`}>
            {plats.map(({ platform }) => (
              <PlatformIcon key={platform} platform={platform} size={12} />
            ))}
          </span>
        )}
      </button>
      <TaskButton unit={unit} />
    </div>
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
