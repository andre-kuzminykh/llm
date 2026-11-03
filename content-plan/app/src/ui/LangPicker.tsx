// Языки контента — поле со списком: щёлкнули — список языков с галочками, отметили пару (русский и английский) —
// и они стоят у нового контента каждый раз, пока не отметите другие. Хотя бы один язык остаётся.
import { useEffect, useRef, useState } from 'react'
import { LANGS } from '../model/types'
import { useDismiss } from './ChannelEdit'
import { Icon } from './Icon'

export function LangPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, open, () => setOpen(false))
  // список раскрывается под полем, в самой форме — прокрутить, чтобы был виден целиком
  useEffect(() => {
    if (open) ref.current?.querySelector('.cp-langs__pop')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [open])
  const chosen = LANGS.filter((l) => value.includes(l.id))
  const toggle = (id: string) =>
    onChange(value.includes(id) ? (value.length > 1 ? value.filter((x) => x !== id) : value) : LANGS.map((l) => l.id).filter((x) => x === id || value.includes(x)))
  return (
    <div ref={ref} className="cp-langs">
      <button type="button" className="nr-field cp-langs__btn" aria-label={`Языки: ${chosen.map((l) => l.name).join(', ')}`} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="cp-langs__val">
          {chosen.map((l) => (
            <span key={l.id} className="cp-langs__chip">
              <span className="cp-lang__code">{l.code}</span>
              {l.name}
            </span>
          ))}
        </span>
        <Icon name="chev-right" size={16} />
      </button>
      {open && (
        <div className="cp-langs__pop nr-panel nr-scroll" role="group" aria-label="Языки">
          {LANGS.map((l) => {
            const on = value.includes(l.id)
            return (
              <label key={l.id} className="cp-langs__opt">
                <input type="checkbox" checked={on} onChange={() => toggle(l.id)} disabled={on && value.length === 1} aria-label={l.name} />
                <span className="cp-check-row__box" aria-hidden="true">
                  <Icon name="check" size={12} />
                </span>
                <span className="cp-lang__code">{l.code}</span>
                {l.name}
              </label>
            )
          })}
          <p className="cp-hint cp-langs__note">Отмеченные будут стоять у нового контента.</p>
        </div>
      )}
    </div>
  )
}
