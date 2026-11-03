// Аккаунты в соцсетях — свои и конкурентов: список и форма «площадка, название, @аккаунт». Задаются в настройках.
import { useState } from 'react'
import { newId } from '../model/store'
import { realPlatforms, type Account } from '../model/types'
import { PlatformIcon } from './bits'
import { usePlan } from './ctx'
import { Icon } from './Icon'

export function AccountList<T extends Account>({ items, label, onRemove }: { items: T[]; label: string; onRemove?: (a: T) => void }) {
  if (!items.length) return null
  return (
    <ul className="cp-accs" aria-label={label}>
      {items.map((a) => (
        <li key={a.id} className="cp-acc">
          <PlatformIcon platform={a.platform} size={16} />
          <span className="cp-acc__main">
            <b>{a.name}</b>
            <span className="cp-muted">{a.handle || a.platform}</span>
          </span>
          {onRemove && (
            <button type="button" className="nr-btn nr-btn--ghost nr-btn--icon nr-btn--sm" aria-label={`Убрать: ${a.name}`} title="Убрать" onClick={() => onRemove(a)}>
              <Icon name="close" size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Подключить свою соцсеть или следить за конкурентом: площадка, название, @аккаунт. */
export function AddAccount({ label, button, namePlaceholder, onAdd }: { label: string; button: string; namePlaceholder: string; onAdd: (a: Account) => void }) {
  const { plan } = usePlan()
  const options = [...realPlatforms(plan.platforms.length ? plan.platforms : ['YouTube', 'Telegram']), 'Web']
  const [platform, setPlatform] = useState(options[0])
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  return (
    <form
      className="cp-accadd"
      aria-label={label}
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim() && !handle.trim()) return
        onAdd({ id: newId('a'), platform, name: name.trim() || handle.trim(), handle: handle.trim() })
        setName('')
        setHandle('')
      }}
    >
      <select className="nr-field" aria-label="Площадка" value={platform} onChange={(e) => setPlatform(e.target.value)}>
        {options.map((p) => (
          <option key={p} value={p}>{p === 'Web' ? 'Сайт' : p}</option>
        ))}
      </select>
      <input className="nr-field" aria-label="Название" placeholder={namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
      <input className="nr-field" aria-label="@аккаунт или ссылка" placeholder="@аккаунт или ссылка" value={handle} onChange={(e) => setHandle(e.target.value)} />
      <button type="submit" className="nr-btn nr-btn--primary nr-btn--sm" disabled={!name.trim() && !handle.trim()}>
        {button}
      </button>
    </form>
  )
}
