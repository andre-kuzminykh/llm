import { useId, useMemo, useState } from 'react'
import { addDays, dayTitle, shortDate, WEEKDAYS, weekday } from '../model/dates'
import { newId } from '../model/store'
import { isSlot, PLACEHOLDER, timeOf, type Item, type Rule, type Status } from '../model/types'
import { dueOf, leadOf } from '../model/units'
import { IconButton, PickText, StatusPicker, Switch } from '../ui/bits'
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
  const { plan, dispatch, rubrics, rules, channels, toast, openItem, labelOf } = usePlan()
  const existing = id ? plan.items.find((x) => x.id === id) : undefined
  const base: Partial<Item> = existing ?? draft ?? {}
  const titleId = useId()

  // форматы канала для рубрики: свои форматы рубрики и общие, которые выходят с FULL, — если у рубрики есть FULL
  const hasFull = (rb: string | null) => plan.rules.some((r) => r.rubricId === rb && r.full)
  const rulesFor = (cid: string, rb: string | null) =>
    plan.rules.filter((r) => r.channelId === cid && (r.rubricId === rb || (r.rubricId === null && hasFull(rb))))
      .sort((x, y) => Number(x.rubricId === null) - Number(y.rubricId === null))
  const rubricsFor = (cid: string, keep?: string | null) =>
    plan.rubrics.filter((rb) => rb.id === keep || plan.rules.some((r) => r.channelId === cid && r.rubricId === rb.id))
  // по умолчанию — канал, у которого больше всего форматов (Dataist)
  const busiest = [...plan.channels].sort((x, y) => plan.rules.filter((r) => r.channelId === y.id).length - plan.rules.filter((r) => r.channelId === x.id).length)[0]
  const firstChannel = base.channelId ?? busiest?.id ?? plan.channels[0].id
  const firstRule = base.ruleId ?? rulesFor(firstChannel, base.rubricId ?? rubricsFor(firstChannel)[0]?.id ?? null)[0]?.id ?? plan.rules[0].id
  const firstRubric = base.rubricId !== undefined ? base.rubricId : rules.get(firstRule)?.rubricId ?? null

  const [title, setTitle] = useState(base.title && !isSlot(base as Item) ? base.title : '')
  const [date, setDate] = useState(base.date ?? '')
  const [channelId, setChannelId] = useState(firstChannel)
  const [rubricId, setRubricId] = useState<string | null>(firstRubric)
  const [ruleId, setRuleId] = useState(firstRule)
  const [sectionId, setSectionId] = useState<string | undefined>(base.sectionId ?? rules.get(firstRule)?.sectionId)
  const [platforms, setPlatforms] = useState<string[]>(base.platforms ?? rules.get(firstRule)?.platforms ?? [])
  const [status, setStatus] = useState<Status>(base.status ?? 'planned')
  const [note, setNote] = useState(base.note ?? '')
  const [time, setTime] = useState(base.time ?? '')
  const [owner, setOwner] = useState(base.owner ?? '')
  const [due, setDue] = useState(base.due ?? '')
  const [offGrid, setOffGrid] = useState<boolean | null>(base.offGrid ?? (existing ? false : null))
  const [withGroup, setWithGroup] = useState(true)
  const [withFamily, setWithFamily] = useState(true)
  const [error, setError] = useState('')
  const [more, setMore] = useState(false)

  const channel = channels.get(channelId)
  const rule = rules.get(ruleId)
  const rubric = rubricId ? rubrics.get(rubricId) : undefined
  const members = useMemo(
    () => (existing?.group && existing.date ? plan.items.filter((x) => x.group === existing.group && x.date === existing.date && x.id !== existing.id) : []),
    [plan.items, existing],
  )
  const isBank = !!existing && existing.date === null
  const fromFull = !!existing?.derive // рубрика берётся у FULL группы
  // разовый материал на «чужой» день — сразу вне сетки, чтобы проверка не ругалась; можно выключить
  const offDay = !!date && !!rule && !rule.days[weekday(date)]
  const isOffGrid = offGrid ?? offDay

  const takeRule = (r: Rule | undefined) => {
    setRuleId(r?.id ?? '')
    if (r?.sectionId) setSectionId(r.sectionId)
    if (!existing && r) setPlatforms(r.platforms)
  }
  const pickChannel = (cid: string) => {
    setChannelId(cid)
    const rb = rubricsFor(cid)[0]?.id ?? null
    setRubricId(rb)
    const r = rulesFor(cid, rb)[0]
    setSectionId(r?.sectionId)
    takeRule(r)
    const c = channels.get(cid)
    setPlatforms((r?.platforms ?? c?.platforms ?? []).filter((p) => c?.platforms.includes(p)))
  }
  const pickRubric = (rb: string) => {
    setRubricId(rb)
    if (rule?.rubricId !== null) takeRule(rulesFor(channelId, rb)[0])
  }
  const togglePlatform = (p: string) => setPlatforms((list) => (list.includes(p) ? list.filter((x) => x !== p) : plan.platforms.filter((x) => x === p || list.includes(x))))

  const save = () => {
    const t = title.trim() || PLACEHOLDER
    if (!platforms.length) {
      setMore(true)
      return setError('Выберите хотя бы одну площадку')
    }
    if (!rule) return setError('Выберите формат')
    const patch: Partial<Item> = {
      title: t,
      channelId,
      sectionId,
      ruleId,
      rubricId,
      platforms,
      status,
      note: note || undefined,
      format: existing?.format ?? rule.format,
      time: time && time !== rule.time ? time : undefined,
      owner: owner.trim() || undefined,
      due: due || undefined,
      offGrid: isOffGrid || undefined,
    }
    if (existing && isBank && date) {
      dispatch({ type: 'update', id: existing.id, patch: { ...patch, title: title.trim() || existing.title } })
      dispatch({ type: 'assign', bankId: existing.id, date })
      toast(`Тема поставлена на ${date}`, true)
    } else if (existing) {
      dispatch({ type: 'edit', id: existing.id, patch, date: date && date !== existing.date ? date : undefined, withGroup })
      toast('Сохранено', true)
    } else {
      const sample = plan.items.find((x) => x.ruleId === ruleId && x.date && !x.derive)
      const item: Item = {
        id: newId(),
        date: date || null,
        channelId,
        sectionId,
        ruleId,
        rubricId,
        title: t,
        format: rule.format,
        platforms,
        status,
        source: t === PLACEHOLDER ? 'нужна тема' : date ? 'вручную' : 'банк тем',
        rank: sample?.rank ?? 50,
        note: patch.note,
        time: patch.time,
        owner: patch.owner,
        due: patch.due,
        offGrid: patch.offGrid,
      }
      for (const k of Object.keys(item) as (keyof Item)[]) if (item[k] === undefined) delete item[k]
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
  const offGridField = (
    <div className="cp-field">
      <Switch checked={isOffGrid} onChange={setOffGrid}>Вне сетки — разовый, проверка его не трогает</Switch>
      {offDay && rule && <span className="cp-hint">По сетке «{labelOf({ rubricId, ruleId })}» не выходит в {WEEKDAYS[weekday(date)]}.</span>}
    </div>
  )
  return (
    <aside className="cp-sheet" aria-label={heading} onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && save()}>
      <div className="cp-sheet__head">
        {onBack && <IconButton icon="chev-left" label="Назад к дню" onClick={onBack} size="sm" />}
        <h2 className="cp-sheet__title">{heading}</h2>
        <IconButton icon="close" label="Закрыть" onClick={onClose} />
      </div>
      <div className="cp-sheet__body nr-scroll">
        <div className="cp-field">
          <label className="nr-label" htmlFor={titleId}>Тема</label>
          <textarea
            id={titleId}
            className="nr-field"
            rows={2}
            value={title}
            autoFocus={!existing}
            placeholder={existing && isSlot(existing) ? 'Нужна тема' : 'Только тема, без рубрики: «Агент продаж»'}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="cp-form__when">
          <PickText type="date" label="Дата" value={date} text={date ? dayTitle(date) : ''} placeholder="Без даты — в банк тем" onChange={setDate} />
          {date && (
            <>
              <span className="cp-task__sep" aria-hidden="true">·</span>
              <PickText type="time" label="Время выхода" value={time || (rule ? timeOf({}, rule) : '')} text={time || (rule ? timeOf({}, rule) : '')} onChange={setTime} />
            </>
          )}
        </div>

        <div className="cp-field__row">
          <label className="cp-field" title={rubric?.what || undefined}>
            <span className="nr-label">Рубрика</span>
            <select className="nr-field" value={rubricId ?? ''} onChange={(e) => pickRubric(e.target.value)} disabled={fromFull}>
              {rubricsFor(channelId, rubricId).map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
          <label className="cp-field" title={rule?.what || undefined}>
            <span className="nr-label">Формат</span>
            <select className="nr-field" value={ruleId} onChange={(e) => takeRule(rules.get(e.target.value))}>
              {rulesFor(channelId, rubricId).map((r) => (
                <option key={r.id} value={r.id}>{r.rubricId ? r.name : `${r.name} (с FULL)`}</option>
              ))}
            </select>
          </label>
        </div>

        {date && offDay && offGridField}

        <button type="button" className="cp-more-btn" aria-expanded={more} onClick={() => setMore(!more)}>
          <Icon name="chev-right" size={14} />
          Подробнее
        </button>
        {more && (
          <div className="cp-form__more">
            <label className="cp-field">
              <span className="nr-label">Канал</span>
              <select className="nr-field" value={channelId} onChange={(e) => pickChannel(e.target.value)} disabled={!!existing?.group && members.length > 0}>
                {plan.channels.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            {channel && channel.sections.length > 0 && (rule?.sectionId || sectionId) && (
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

            <div className="cp-task__status">
              <span className="nr-label">Статус</span>
              <StatusPicker size="sm" value={status} onChange={setStatus} />
            </div>

            <div className="cp-field__row">
              <label className="cp-field">
                <span className="nr-label">Кто делает</span>
                <input className="nr-field" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Имя" />
              </label>
              {date && (
                <div className="cp-field">
                  <span className="nr-label">Подготовить к</span>
                  <PickText
                    type="date"
                    label="Подготовить к"
                    value={due || (existing ? dueOf({ ...existing, date }, rule) ?? '' : '')}
                    text={shortDate(due || (existing ? dueOf({ ...existing, date }, rule) ?? date : addDays(date, -leadOf(rule))))}
                    onChange={setDue}
                  />
                </div>
              )}
            </div>

            <label className="cp-field">
              <span className="nr-label">Заметка</span>
              <textarea className="nr-field" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Сценарий, ссылки, что учесть" />
            </label>

            {date && !offDay && offGridField}

            {members.length > 0 && (
              <div className="cp-field">
                <span className="nr-label">Группа · {members.length + 1}</span>
                <div className="cp-members">
                  {members.map((m) => (
                    <button key={m.id} type="button" className="nr-pill" onClick={() => openItem(m.id)} title="Открыть этот материал">
                      {rules.get(m.ruleId)?.name ?? m.ruleId}
                      {m.channelId !== existing?.channelId && <span className="cp-muted">· {channels.get(m.channelId)?.name}</span>}
                    </button>
                  ))}
                </div>
                <Switch checked={withGroup} onChange={setWithGroup}>Переносить и удалять вместе с группой</Switch>
              </div>
            )}
            {!existing && (
              <Switch checked={withFamily} onChange={setWithFamily}>С сопутствующими публикациями, как у ближайшего материала рубрики</Switch>
            )}
            {existing?.origDate && <p className="cp-hint">В исходной сетке стоял {shortDate(existing.origDate)}.</p>}
          </div>
        )}
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
