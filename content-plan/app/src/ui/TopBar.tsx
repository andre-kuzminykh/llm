import { useRef, type ReactNode } from 'react'
import type { ISODate } from '../model/types'
import { IconButton } from './bits'
import { activeFilters, FilterChips } from './Sidebar'
import { usePlan } from './ctx'
import { today } from '../model/dates'
import { Icon } from './Icon'

// о сохранении шапка молчит, пока всё в порядке
const SAVED: Record<string, string> = {
  memory: 'Без сохранения',
  error: 'Не сохранилось',
}

/** Шапка вида: «Фильтры», заголовок и навигация вида слева, включённые фильтры, отмена и «+» справа.
 *  Повтор — с клавиатуры (⇧⌘Z). */
export function TopBar({ title, children, side = true }: { title: ReactNode; children?: ReactNode; side?: boolean }) {
  const ctx = usePlan()
  const { dispatch, canUndo, openNew, anchor, saved, toggleSide, sideOpen } = ctx
  const n = side ? activeFilters(ctx).length : 0
  return (
    <header className="cp-top">
      {side && (
        <button type="button" className="nr-btn nr-btn--ghost nr-btn--icon cp-top__filter" aria-label="Фильтры" title="Фильтры" aria-pressed={sideOpen} onClick={toggleSide}>
          <Icon name="filter" size={20} />
          {n > 0 && <span className="cp-top__badge" aria-hidden="true">{n}</span>}
        </button>
      )}
      {typeof title === 'string' ? <h1 className="nr-title">{title}</h1> : title}
      {children}
      <span className="cp-top__spacer" />
      {side && <FilterChips />}
      {SAVED[saved] && (
        <span className="cp-saved cp-saved--warn" role="status" title={saved === 'memory' ? 'Хранилище браузера недоступно: правки живут до перезагрузки — выгрузите JSON в меню «Данные и тема»' : undefined}>
          {SAVED[saved]}
        </span>
      )}
      <IconButton icon="undo" label="Отменить (⌘Z)" onClick={() => dispatch({ type: 'undo' })} disabled={!canUndo} />
      <button type="button" className="nr-btn nr-btn--primary nr-btn--icon" aria-label="Новый материал" title="Новый материал" onClick={() => openNew({ date: anchor < today() ? today() : anchor })}>
        <Icon name="plus" size={18} />
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
