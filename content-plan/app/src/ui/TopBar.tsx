import type { ReactNode } from 'react'
import { IconButton } from './bits'
import { usePlan } from './ctx'
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
      <h1 className="nr-title">{title}</h1>
      {children}
      <span className="cp-top__spacer" />
      <span className={saved === 'memory' || saved === 'error' ? 'nr-tag nr-tag--warn' : 'cp-saved'} role="status">
        {SAVED[saved]}
      </span>
      <IconButton icon="undo" label="Отменить (⌘Z)" onClick={() => dispatch({ type: 'undo' })} disabled={!canUndo} />
      <IconButton icon="redo" label="Повторить (⇧⌘Z)" onClick={() => dispatch({ type: 'redo' })} disabled={!canRedo} />
      <button type="button" className="nr-btn nr-btn--primary" onClick={() => openNew({ date: anchor })}>
        <Icon name="plus" size={16} />
        Материал
      </button>
    </header>
  )
}
