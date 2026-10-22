import { useRef, type ReactNode } from 'react'
import type { ISODate } from '../model/types'
import { IconButton } from './bits'
import { usePlan } from './ctx'
import { today } from '../model/dates'
import { Icon } from './Icon'

const SAVED: Record<string, string> = {
  idle: '',
  saving: 'Сохраняю…',
  saved: 'Сохранено',
  memory: 'Без сохранения: хранилище браузера недоступно',
  error: 'Не сохранилось',
}

/** Шапка вида: заголовок и навигация вида слева, отмена/повтор и «Новый материал» справа. */
export function TopBar({ title, children, side = true }: { title: ReactNode; children?: ReactNode; side?: boolean }) {
  const { dispatch, canUndo, canRedo, openNew, anchor, saved, toggleSide } = usePlan()
  return (
    <header className="cp-top">
      {side && (
        <span className="cp-only-phone">
          <IconButton icon="filter" label="Фильтры" onClick={toggleSide} />
        </span>
      )}
      {typeof title === 'string' ? <h1 className="nr-title">{title}</h1> : title}
      {children}
      <span className="cp-top__spacer" />
      <span className={saved === 'memory' || saved === 'error' ? 'nr-tag nr-tag--warn' : 'cp-saved'} role="status">
        {SAVED[saved]}
      </span>
      <IconButton icon="undo" label="Отменить (⌘Z)" onClick={() => dispatch({ type: 'undo' })} disabled={!canUndo} />
      <span className="cp-no-phone">
        <IconButton icon="redo" label="Повторить (⇧⌘Z)" onClick={() => dispatch({ type: 'redo' })} disabled={!canRedo} />
      </span>
      <button type="button" className="nr-btn nr-btn--primary" onClick={() => openNew({ date: anchor < today() ? today() : anchor })}>
        <Icon name="plus" size={16} />
        <span className="cp-btn-text">Материал</span>
      </button>
    </header>
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
