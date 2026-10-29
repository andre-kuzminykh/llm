// Рубрика с подсказками при вводе — как Т9: набираете «тез», под полем «Тезисы»; стрелки и Enter — выбрать.
// Такой рубрики нет — последней строкой «Новая рубрика «…»»: она появится в списке и в фильтрах. Решётки нет нигде.
import { useId, useState } from 'react'
import { rubricKey, rubricName, type Rubric } from '../model/types'

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

export function TagInput({ label, value, options, onPick, disabled, placeholder = 'Рубрика', allowNew = true }: {
  label: string
  value: string // что показано, пока не начали печатать: «Тезисы»
  options: Rubric[]
  onPick: (p: TagPick) => void
  disabled?: boolean
  placeholder?: string
  allowNew?: boolean
}) {
  const id = useId()
  const [text, setText] = useState<string | null>(null) // null — не печатают, показано value
  const [active, setActive] = useState(0)
  const open = text !== null
  const list = open ? suggestTags(options, text) : []
  const q = text ? clean(text) : ''
  const exact = options.some((r) => tagName(r) === q)
  const rows: TagPick[] = [...list.map((rubric) => ({ rubric })), ...(allowNew && q && !exact ? [{ name: rubricName(text!) }] : [])]
  const pick = (p: TagPick) => {
    onPick(p)
    setText(null)
  }
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
        onChange={(e) => {
          setText(e.target.value)
          setActive(0)
        }}
        onBlur={() => setText(null)}
        onKeyDown={(e) => {
          if (!open) return
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
            setText(null)
          }
        }}
      />
      {open && rows.length > 0 && (
        <span className="cp-taginput__list" role="listbox" id={`${id}-list`} aria-label={`Подсказки: ${label}`}>
          {rows.map((p, i) => (
            <span
              key={'rubric' in p ? p.rubric.id : 'new'}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              className="cp-taginput__opt"
              onMouseDown={(e) => {
                e.preventDefault() // поле не теряет фокус раньше выбора
                pick(p)
              }}
              onMouseEnter={() => setActive(i)}
            >
              {'rubric' in p ? p.rubric.name : `Новая рубрика «${p.name}»`}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
