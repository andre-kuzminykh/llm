// Рубрика — поле со списком: щелчок открывает все рубрики (рубрики канала — первыми, остальные ниже), набор — подсказки
// как Т9: «тез» → «Тезисы»; стрелки и Enter — выбрать. Такой рубрики нет — последней строкой «Новая рубрика «…»»:
// она появится в списке и в фильтрах. Решётки нет нигде.
import { useId, useState } from 'react'
import { rubricKey, rubricName, type Rubric } from '../model/types'
import { Icon } from './Icon'

export type TagPick = { rubric: Rubric } | { name: string }

// сравниваем без регистра и решётки: «#кейсы_клиентов» — это «Кейсы клиентов»
const clean = (s: string) => rubricKey(s)
const tagName = (r: Rubric) => rubricKey(r.name)

/** Подсказки: сначала те, что начинаются с набранного, потом те, где оно внутри; порядок options — приоритет. */
export function suggestTags(options: Rubric[], text: string, max = 6): Rubric[] {
  const q = clean(text)
  if (!q) return options.slice(0, max)
  const starts = options.filter((r) => tagName(r).startsWith(q))
  const inside = options.filter((r) => !tagName(r).startsWith(q) && tagName(r).includes(q))
  return [...starts, ...inside].slice(0, max)
}

export function TagInput({ label, value, options, primary, onPick, disabled, placeholder = 'Рубрика', allowNew = true }: {
  label: string
  value: string // что показано, пока не начали печатать: «Тезисы»
  options: Rubric[]
  /** Рубрики, которые идут первыми своей группой («В канале»); остальные — ниже, под «Другие». */
  primary?: Set<string>
  onPick: (p: TagPick) => void
  disabled?: boolean
  placeholder?: string
  allowNew?: boolean
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState<string | null>(null) // null — не печатают, показано value
  const [active, setActive] = useState(0)
  // поле со списком: открыли — видны все рубрики; печатают — подсказки как Т9
  const list = !open ? [] : text ? suggestTags(options, text, 8) : options
  const first = primary ? list.filter((r) => primary.has(r.id)) : list
  const rest = primary ? list.filter((r) => !primary.has(r.id)) : []
  const q = text ? clean(text) : ''
  const exact = options.some((r) => tagName(r) === q)
  const rows: TagPick[] = [...[...first, ...rest].map((rubric) => ({ rubric })), ...(allowNew && q && !exact ? [{ name: rubricName(text!) }] : [])]
  const close = () => {
    setOpen(false)
    setText(null)
  }
  const pick = (p: TagPick) => {
    onPick(p)
    close()
  }
  const show = (on: boolean) => {
    setOpen(on)
    if (on) setActive(Math.max(0, rows.findIndex((p) => 'rubric' in p && p.rubric.name === value)))
  }
  const option = (p: TagPick, i: number) => (
    <span
      key={'rubric' in p ? p.rubric.id : 'new'}
      id={`${id}-${i}`}
      role="option"
      aria-selected={i === active}
      className={`cp-taginput__opt${'rubric' in p && p.rubric.name === value ? ' cp-taginput__opt--cur' : ''}`}
      onMouseDown={(e) => {
        e.preventDefault() // поле не теряет фокус раньше выбора
        pick(p)
      }}
      onMouseEnter={() => setActive(i)}
    >
      {'rubric' in p ? p.rubric.name : `Новая рубрика «${p.name}»`}
    </span>
  )
  return (
    <span className="cp-taginput">
      <input
        className="nr-field"
        role="combobox"
        aria-label={label}
        aria-expanded={open && rows.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && rows[active] ? `${id}-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={text ?? value}
        onFocus={(e) => e.target.select()}
        onMouseDown={() => !disabled && show(!open)}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onBlur={close}
        onKeyDown={(e) => {
          if (!open) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              show(true)
            }
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, rows.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (rows[active]) pick(rows[active])
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            close()
          }
        }}
      />
      <span className="cp-taginput__chev" aria-hidden="true">
        <Icon name="chev-right" size={16} />
      </span>
      {open && rows.length > 0 && (
        <span className="cp-taginput__list nr-scroll" role="listbox" id={`${id}-list`} aria-label={`Подсказки: ${label}`}>
          {primary && first.length > 0 && rest.length > 0 && <span className="cp-taginput__head" aria-hidden="true">В этом канале</span>}
          {rows.slice(0, first.length).map((p, i) => option(p, i))}
          {primary && rest.length > 0 && <span className="cp-taginput__head" aria-hidden="true">{first.length ? 'Другие' : 'В этом канале таких нет'}</span>}
          {rows.slice(first.length).map((p, i) => option(p, first.length + i))}
        </span>
      )}
    </span>
  )
}
