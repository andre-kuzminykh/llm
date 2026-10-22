// Мелкие общие части: карточка материала, площадки, переключатели, перетаскивание.
import { useState, type CSSProperties, type DragEvent, type ReactNode } from 'react'
import { isSlot, STATUSES, statusOf, type Item, type Status } from '../model/types'
import { usePlan, type Drag } from './ctx'
import { Icon } from './Icon'

const MIME = 'application/x-content-plan'

export const PLATFORM_SHORT: Record<string, string> = {
  Web: 'Web', YouTube: 'YT', Instagram: 'IG', TikTok: 'TT', Threads: 'Th', X: 'X', Telegram: 'TG', LinkedIn: 'in', Mail: 'Mail',
}

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

/** Цель для перетаскивания: подсветка, пока над ней что-то несут. */
export function useDrop(onDrop: (d: Drag) => void) {
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
        if (d) onDrop(d)
      },
    },
  }
}

export function ChannelDot({ color }: { color: string }) {
  return <span className="nr-dot" style={{ background: color }} aria-hidden="true" />
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
          title={value === s.id ? `${s.label} · нажмите ещё раз, чтобы вернуть в план` : s.label}
          onClick={() => onChange(value === s.id ? 'planned' : s.id)}
        >
          <Icon name={s.icon!} size={size === 'sm' ? 14 : 18} />
        </button>
      ))}
    </div>
  )
}

export function Platforms({ list }: { list: string[] }) {
  return (
    <span className="cp-card__meta" aria-label={`Площадки: ${list.join(', ')}`}>
      {list.map((p) => (
        <span key={p} className="cp-plat" aria-hidden="true">{PLATFORM_SHORT[p] ?? p}</span>
      ))}
    </span>
  )
}

/** Карточка материала: тянется на другой день, по нажатию открывает форму. */
export function ItemCard({ item, compact = false, showRubric = true }: { item: Item; compact?: boolean; showRubric?: boolean }) {
  const { channels, labelOf, badIds, openItem } = usePlan()
  const [dragging, setDragging] = useState(false)
  const color = channels.get(item.channelId)?.color
  const label = labelOf(item)
  const slot = isSlot(item)
  const cls = ['cp-card', slot && 'cp-card--slot', badIds.has(item.id) && 'cp-card--bad', item.format === 'FULL' && 'cp-card--full', dragging && 'cp-card--dragging']
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type="button"
      className={cls}
      style={{ '--cp-c': color } as CSSProperties}
      draggable
      onDragStart={(e) => {
        e.stopPropagation()
        startDrag(e, { kind: 'item', id: item.id })
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
      onClick={(e) => {
        e.stopPropagation()
        openItem(item.id)
      }}
      aria-label={`${label}: ${item.title}${slot ? ' — нужна тема' : ''}${item.status !== 'planned' ? ` — ${statusOf(item.status).label.toLowerCase()}` : ''}`}
    >
      {showRubric && (
        <span className="cp-card__rub">
          <StatusIcon status={item.status} />
          {label}
        </span>
      )}
      <span className="cp-card__title">{item.title}</span>
      {!compact && <Platforms list={item.platforms} />}
    </button>
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
