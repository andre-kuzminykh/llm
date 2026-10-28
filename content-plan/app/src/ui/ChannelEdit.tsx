// Каналы правят там же, где их видно: в фильтрах и в дорожках «Каналы». «⋯» — переименовать, выше, ниже, удалить
// (с подтверждением; вернуть — ⌘Z). Поле «добавить» — общее для каналов, площадок и рубрик.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { plural } from '../model/hint'
import { channelParts } from '../model/store'
import type { Channel } from '../model/types'
import { usePlan } from './ctx'
import { Icon } from './Icon'

/** Всплывающее закрывается щелчком мимо и Esc — на уровне документа: в Safari кнопки фокус не получают. */
export function useDismiss(ref: RefObject<HTMLElement>, open: boolean, close: () => void) {
  const last = useRef(close)
  last.current = close
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && last.current()
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation() // панель фильтров на узком экране не закрывается
      last.current()
    }
    document.addEventListener('pointerdown', away)
    window.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open, ref])
}

/** Поле «добавить»: Enter — добавить, Esc — передумать. */
export function AddInline({ label, placeholder, onAdd, onDone, className = 'cp-side__add' }: { label: string; placeholder: string; onAdd: (v: string) => void; onDone: () => void; className?: string }) {
  const [v, setV] = useState('')
  return (
    <form
      className={className}
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

/** Новое имя канала — в строке: Enter сохраняет, Esc — отмена; имя другого канала не даёт. */
export function ChannelRename({ c, onDone, className = 'cp-side__rename' }: { c: Channel; onDone: () => void; className?: string }) {
  const { plan, dispatch, toast } = usePlan()
  const [name, setName] = useState(c.name)
  const save = () => {
    const n = name.trim().replace(/\s+/g, ' ')
    if (!n || n === c.name) return onDone()
    if (plan.channels.some((x) => x.id !== c.id && x.name.toLowerCase() === n.toLowerCase())) return toast(`Канал «${n}» уже есть`)
    dispatch({ type: 'channel', id: c.id, patch: { name: n } })
    toast(`Канал переименован: «${n}»`, true)
    onDone()
  }
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <input
        className="nr-field nr-field--sm"
        aria-label={`Новое название канала «${c.name}»`}
        value={name}
        autoFocus
        onFocus={(e) => e.target.select()}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onDone())}
      />
      <button type="submit" className="nr-btn nr-btn--ghost nr-btn--sm">
        Готово
      </button>
    </form>
  )
}

/** «⋯» у канала: переименовать, выше, ниже, удалить. Удаление — с подтверждением: сколько материалов уйдёт. */
export function ChannelMenu({ c, onRename, onOpen, className = '' }: { c: Channel; onRename: () => void; onOpen?: (open: boolean) => void; className?: string }) {
  const { plan, dispatch, toast, filters, setFilters } = usePlan()
  const [mode, setModeRaw] = useState<'closed' | 'menu' | 'delete'>('closed')
  const setMode = (m: typeof mode) => {
    setModeRaw(m)
    onOpen?.(m !== 'closed')
  }
  const ref = useRef<HTMLSpanElement>(null)
  useDismiss(ref, mode !== 'closed', () => setMode('closed'))
  const at = plan.channels.findIndex((x) => x.id === c.id)
  const last = plan.channels.length <= 1
  const move = (to: number) => {
    dispatch({ type: 'moveChannel', id: c.id, to })
    setMode('closed')
  }
  const remove = () => {
    const n = channelParts(plan, c.id).items.length
    dispatch({ type: 'removeChannel', id: c.id })
    if (filters.hiddenChannels.includes(c.id)) setFilters({ ...filters, hiddenChannels: filters.hiddenChannels.filter((x) => x !== c.id) })
    toast(`Канал «${c.name}» удалён${n ? ` вместе с ${n} ${plural(n, 'материалом', 'материалами', 'материалами')}` : ''}`, true)
    setMode('closed')
  }
  const parts = mode === 'delete' ? channelParts(plan, c.id) : null
  return (
    <span ref={ref} className={`cp-chmenu${mode !== 'closed' ? ' cp-chmenu--open' : ''} ${className}`}>
      <button
        type="button"
        className="cp-chmenu__btn"
        aria-label={`Ещё: ${c.name}`}
        title="Переименовать, выше, ниже, удалить"
        aria-haspopup="menu"
        aria-expanded={mode === 'menu'}
        onClick={() => setMode(mode === 'menu' ? 'closed' : 'menu')}
      >
        <Icon name="more" size={16} />
      </button>
      {mode === 'menu' && (
        <span className="cp-chmenu__pop" role="menu" aria-label={`Канал «${c.name}»`}>
          <button type="button" role="menuitem" className="cp-menu__item" onClick={() => (setMode('closed'), onRename())}>
            <Icon name="pencil" size={16} />
            Переименовать
          </button>
          <button type="button" role="menuitem" className="cp-menu__item" disabled={at <= 0} onClick={() => move(at - 1)}>
            <span className="cp-ico-up" aria-hidden="true">
              <Icon name="chev-left" size={16} />
            </span>
            Выше
          </button>
          <button type="button" role="menuitem" className="cp-menu__item" disabled={at >= plan.channels.length - 1} onClick={() => move(at + 1)}>
            <span className="cp-ico-down" aria-hidden="true">
              <Icon name="chev-left" size={16} />
            </span>
            Ниже
          </button>
          <button
            type="button"
            role="menuitem"
            className="cp-menu__item cp-menu__item--danger"
            disabled={last}
            title={last ? 'Последний канал не удалить' : undefined}
            onClick={() => setMode('delete')}
          >
            <Icon name="trash" size={16} />
            Удалить
          </button>
        </span>
      )}
      {parts && (
        <span className="cp-chmenu__pop cp-side__confirm" role="group" aria-label={`Удалить канал «${c.name}»?`}>
          <p>
            Удалить «{c.name}»?{' '}
            {parts.items.length ? `Уйдут ${parts.items.length} ${plural(parts.items.length, 'материал', 'материала', 'материалов')} и форматы канала.` : 'Материалов в нём нет.'} Вернуть
            — ⌘Z.
          </p>
          <span className="cp-side__confirm-btns">
            <button type="button" className="nr-btn nr-btn--danger nr-btn--sm" onClick={remove}>
              Удалить
            </button>
            <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => setMode('closed')}>
              Отмена
            </button>
          </span>
        </span>
      )}
    </span>
  )
}
