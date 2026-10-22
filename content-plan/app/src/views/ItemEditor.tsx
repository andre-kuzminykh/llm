import { useId, useMemo, useState } from 'react'
import { dayTitle } from '../model/dates'
import { newId, slotTitle } from '../model/store'
import { isSlot, STATUSES, type Item, type Status } from '../model/types'
import { IconButton, Seg, Switch } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'

interface Props {
  id?: string
  draft?: Partial<Item>
  onClose: () => void
  onBack?: () => void
}

/** Форма материала: новый или существующий. Сохранение — один шаг истории. */
export function ItemEditor({ id, draft, onClose, onBack }: Props) {
  const { plan, dispatch, rubrics, channels, toast } = usePlan()
  const existing = id ? plan.items.find((x) => x.id === id) : undefined
  const base: Partial<Item> = existing ?? draft ?? {}
  // по умолчанию — канал, у которого больше всего рубрик (Dataist)
  const busiest = [...plan.channels].sort((a, b) => plan.rubrics.filter((r) => r.channelId === b.id).length - plan.rubrics.filter((r) => r.channelId === a.id).length)[0]
  const firstChannel = base.channelId ?? busiest?.id ?? plan.channels[0].id
  const titleId = useId()
  const rubricsOf = (cid: string, sid?: string) =>
    plan.rubrics.filter((r) => r.channelId === cid && (sid === undefined || !r.sectionId || r.sectionId === sid))
  const firstRubric = base.rubricId ?? rubricsOf(firstChannel, base.sectionId)[0]?.id ?? plan.rubrics[0].id

  const [title, setTitle] = useState(base.title ?? '')
  const [date, setDate] = useState(base.date ?? '')
  const [channelId, setChannelId] = useState(firstChannel)
  const [sectionId, setSectionId] = useState<string | undefined>(base.sectionId ?? rubrics.get(firstRubric)?.sectionId)
  const [rubricId, setRubricId] = useState(firstRubric)
  const [platforms, setPlatforms] = useState<string[]>(base.platforms ?? rubrics.get(firstRubric)?.platforms ?? [])
  const [status, setStatus] = useState<Status>(base.status ?? 'planned')
  const [note, setNote] = useState(base.note ?? '')
  const [withGroup, setWithGroup] = useState(true)
  const [withFamily, setWithFamily] = useState(true)
  const [error, setError] = useState('')

  const channel = channels.get(channelId)
  const rubric = rubrics.get(rubricId)
  const members = useMemo(
    () => (existing?.group && existing.date ? plan.items.filter((x) => x.group === existing.group && x.date === existing.date && x.id !== existing.id) : []),
    [plan.items, existing],
  )
  const isHead = !!existing && !existing.derive && members.some((m) => m.derive)
  const isBank = !!existing && existing.date === null

  const pickChannel = (cid: string) => {
    setChannelId(cid)
    const c = channels.get(cid)
    const r = rubricsOf(cid)[0]
    setSectionId(r?.sectionId)
    setRubricId(r?.id ?? '')
    setPlatforms((r?.platforms ?? c?.platforms ?? []).filter((p) => c?.platforms.includes(p)))
  }
  const pickRubric = (rid: string) => {
    setRubricId(rid)
    const r = rubrics.get(rid)
    if (r?.sectionId) setSectionId(r.sectionId)
    if (!existing) setPlatforms(r?.platforms ?? [])
  }
  const togglePlatform = (p: string) => setPlatforms((list) => (list.includes(p) ? list.filter((x) => x !== p) : plan.platforms.filter((x) => x === p || list.includes(x))))

  const save = () => {
    const t = title.trim() || (rubric ? slotTitle(rubric) : '')
    if (!t) return setError('Нужен заголовок')
    if (!platforms.length) return setError('Выберите хотя бы одну площадку')
    if (!rubric) return setError('Выберите рубрику')
    const patch: Partial<Item> = { title: t, channelId, sectionId, rubricId, platforms, status, note: note || undefined, format: existing?.format ?? rubric.format }
    if (existing && isBank && date) {
      dispatch({ type: 'update', id: existing.id, patch: { ...patch, title: title.trim() || existing.title } })
      dispatch({ type: 'assign', bankId: existing.id, date })
      toast(`Тема поставлена на ${date}`, true)
    } else if (existing) {
      dispatch({ type: 'edit', id: existing.id, patch, date: date && date !== existing.date ? date : undefined, withGroup })
      toast('Сохранено', true)
    } else {
      const sample = plan.items.find((x) => x.rubricId === rubricId && x.date && !x.derive)
      const item: Item = {
        id: newId(),
        date: date || null,
        channelId,
        sectionId,
        rubricId,
        title: t,
        format: rubric.format,
        platforms,
        status,
        source: date ? 'вручную' : 'банк тем',
        rank: sample?.rank ?? 50,
        note: note || undefined,
      }
      dispatch({ type: 'create', item, withFamily: withFamily && !!date })
      toast(date ? `Создано на ${date}` : 'Тема добавлена в банк', true)
    }
    onClose()
  }

  const remove = () => {
    if (!existing) return
    dispatch({ type: 'remove', id: existing.id, withGroup: withGroup && members.length > 0 })
    toast(withGroup && members.length ? `Удалено вместе с группой (${members.length + 1})` : 'Удалено', true)
    onClose()
  }

  const heading = existing ? (isBank ? 'Тема в банке' : 'Материал') : 'Новый материал'
  return (
    <aside className="cp-sheet" aria-label={heading} onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && save()}>
      <div className="cp-sheet__head">
        {onBack && <IconButton icon="chev-left" label="Назад к дню" onClick={onBack} size="sm" />}
        <h2 className="cp-sheet__title">{heading}</h2>
        <IconButton icon="close" label="Закрыть" onClick={onClose} />
      </div>
      <div className="cp-sheet__body nr-scroll">
        <div className="cp-field">
          <label className="nr-label" htmlFor={titleId}>Заголовок</label>
          <textarea
            id={titleId}
            className="nr-field"
            rows={2}
            value={title}
            autoFocus={!existing}
            placeholder={rubric ? slotTitle(rubric) : ''}
            onChange={(e) => setTitle(e.target.value)}
          />
          {existing && isSlot(existing) && <span className="cp-hint">Тема не задана: впишите её вместо «…» или возьмите из банка тем.</span>}
          {isHead && <span className="cp-hint">Тизер, анонсы и письма группы пересоберут заголовок из этого.</span>}
        </div>

        <div className="cp-field__row">
          <label className="cp-field">
            <span className="nr-label">Дата</span>
            <input className="nr-field" type="date" value={date} min={plan.start} max={plan.end} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="cp-field">
            <span className="nr-label">Канал</span>
            <select className="nr-field" value={channelId} onChange={(e) => pickChannel(e.target.value)} disabled={!!existing?.group && members.length > 0}>
              {plan.channels.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>
        {!date && !existing && <span className="cp-hint">Без даты материал попадёт в банк тем рубрики.</span>}
        {date && <span className="cp-hint">{dayTitle(date)}</span>}

        <div className="cp-field__row">
          <label className="cp-field">
            <span className="nr-label">Рубрика</span>
            <select className="nr-field" value={rubricId} onChange={(e) => pickRubric(e.target.value)}>
              {rubricsOf(channelId).map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
          {channel && channel.sections.length > 0 && (
            <label className="cp-field">
              <span className="nr-label">Раздел</span>
              <select className="nr-field" value={sectionId ?? ''} onChange={(e) => setSectionId(e.target.value || undefined)}>
                <option value="">—</option>
                {channel.sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {rubric?.what && <p className="cp-hint">{rubric.what}</p>}

        <div className="cp-field">
          <span className="nr-label">Площадки</span>
          <div className="cp-pills" style={{ padding: 0 }}>
            {plan.platforms.map((p) => {
              const allowed = channel?.platforms.includes(p)
              if (!allowed && !platforms.includes(p)) return null
              return (
                <button key={p} type="button" className="nr-pill" aria-pressed={platforms.includes(p)} onClick={() => togglePlatform(p)}>
                  {p}
                </button>
              )
            })}
          </div>
        </div>

        <div className="cp-field">
          <span className="nr-label">Статус</span>
          <Seg value={status} onChange={setStatus} label="Статус" options={STATUSES} />
        </div>

        <label className="cp-field">
          <span className="nr-label">Заметка</span>
          <textarea className="nr-field" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Сценарий, ссылки, кто делает" />
        </label>

        {members.length > 0 && (
          <div className="cp-field">
            <span className="nr-label">Группа · {members.length + 1}</span>
            <p className="cp-hint">{members.map((m) => rubrics.get(m.rubricId)?.name ?? m.rubricId).join(' · ')}</p>
            <Switch checked={withGroup} onChange={setWithGroup}>Переносить и удалять вместе с группой</Switch>
          </div>
        )}
        {!existing && (
          <Switch checked={withFamily} onChange={setWithFamily}>С сопутствующими публикациями (как у ближайшего материала рубрики)</Switch>
        )}
        {existing?.origDate && <p className="cp-hint">В исходной сетке стоял {existing.origDate}.</p>}
        {error && <p className="cp-hint" style={{ color: 'var(--nr-danger)' }} role="alert">{error}</p>}
      </div>
      <div className="cp-sheet__foot">
        {existing && (
          <>
            <button type="button" className="nr-btn nr-btn--danger nr-btn--icon" onClick={remove} aria-label="Удалить" title="Удалить">
              <Icon name="trash" size={18} />
            </button>
            {!isBank && (
              <button
                type="button"
                className="nr-btn nr-btn--ghost nr-btn--icon"
                onClick={() => {
                  dispatch({ type: 'duplicate', id: existing.id })
                  toast('Дубликат создан на тот же день', true)
                  onClose()
                }}
                aria-label="Дублировать"
                title="Дублировать"
              >
                <Icon name="copy" size={18} />
              </button>
            )}
          </>
        )}
        <span className="cp-top__spacer" />
        <button type="button" className="nr-btn nr-btn--ghost" onClick={onClose}>Отмена</button>
        <button type="button" className="nr-btn nr-btn--primary" onClick={save}>
          {existing ? 'Сохранить' : 'Создать'}
        </button>
      </div>
    </aside>
  )
}
