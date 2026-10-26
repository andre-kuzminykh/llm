import { useId, useMemo, useState } from 'react'
import { addDays, dayTitle, shortDate, WEEKDAYS, weekday } from '../model/dates'
import { newId, type Action } from '../model/store'
import { FORMAT_PLATFORMS, FORMAT_SHORT, FORMATS, isSlot, PLACEHOLDER, tagOf, TEXT_IMAGE, timeOf, type ISODate, type Item, type Rule, type Status } from '../model/types'
import { dueOf, leadOf } from '../model/units'
import { IconButton, PickText, Seg, StatusPicker, Switch } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'
import { TagInput, type TagPick } from '../ui/TagInput'
import { CreateTabs } from './BankView'

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
  // по умолчанию — канал, у которого больше всего форматов (Офис Датаиста)
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
  const [more, setMore] = useState(!existing) // новый контент — все поля сразу
  const [copies, setCopies] = useState<ISODate[]>([]) // копии на другие даты
  const [versions, setVersions] = useState<string[]>([]) // пересоздать для этих площадок
  const [after, setAfter] = useState(false) // версии — автоматически, когда оригинал выйдет
  const [newTag, setNewTag] = useState('') // хэштег, которого ещё нет: заведётся при сохранении
  const [format, setFormat] = useState(base.format ?? rules.get(firstRule)?.format ?? TEXT_IMAGE)

  const channel = channels.get(channelId)
  const rule = rules.get(ruleId)
  const rubric = rubricId ? rubrics.get(rubricId) : undefined
  // у хэштега в этом канале ещё нет такого формата — при сохранении заведётся, разовый (периодичность — в «Темах»)
  const needRule = !rule || rule.channelId !== channelId || (rule.rubricId !== null && rule.rubricId !== rubricId) || !!newTag || (!existing && rule.format !== format)
  // одного формата у хэштега может быть несколько в сетке: «Исследование дня» и «Итоги месяца» — обе страницы на сайте
  const fits = needRule ? [] : rulesFor(channelId, rubricId).filter((r) => r.format === format || r.id === ruleId)
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
    if (r) setFormat(r.format)
    if (!existing && r) setPlatforms(r.platforms)
  }
  /** Формат хэштега в канале: такой же, как выбран, если есть, иначе первый. */
  const ruleFor = (cid: string, rb: string | null) => {
    const list = rulesFor(cid, rb)
    return list.find((r) => r.format === format) ?? list[0]
  }
  /** Выбрали формат: есть такой у хэштега в канале — берём его; нет — заведётся при сохранении (у материала — просто формат). */
  const pickFormat = (f: string) => {
    setFormat(f)
    const r = rulesFor(channelId, rubricId).find((x) => x.format === f)
    if (r) return takeRule(r)
    const where = (FORMAT_PLATFORMS[f] ?? []).filter((p) => channel?.platforms.includes(p))
    if (!existing && where.length) setPlatforms(where)
  }
  const pickChannel = (cid: string) => {
    setChannelId(cid)
    const rb = rubricsFor(cid)[0]?.id ?? null
    setRubricId(rb)
    const r = ruleFor(cid, rb)
    setSectionId(r?.sectionId)
    takeRule(r)
    const c = channels.get(cid)
    setPlatforms((r?.platforms ?? c?.platforms ?? []).filter((p) => c?.platforms.includes(p)))
  }
  const pickRubric = (rb: string) => {
    setRubricId(rb)
    setNewTag('')
    if (rule?.rubricId !== null) takeRule(ruleFor(channelId, rb))
  }
  /** Хэштег из подсказок или новый: у такого в канале может не быть формата — тогда он заведётся при сохранении. */
  const pickTag = (p: TagPick) => {
    if ('rubric' in p) return pickRubric(p.rubric.id)
    setNewTag(p.name)
    setRubricId(null)
    setRuleId('')
  }
  const togglePlatform = (p: string) => setPlatforms((list) => (list.includes(p) ? list.filter((x) => x !== p) : plan.platforms.filter((x) => x === p || list.includes(x))))

  const save = (toDrafts = false) => {
    const t = title.trim() || PLACEHOLDER
    const day = toDrafts ? '' : date
    if (!platforms.length) {
      setMore(true)
      return setError('Выберите хотя бы одну площадку')
    }
    if (toDrafts && t === PLACEHOLDER) return setError('Для черновика нужна тема')
    // новый хэштег или хэштег без формата в канале: заводим их тем же шагом истории
    const setup: Action[] = []
    let ruleNow: Rule | undefined = rule
    if (needRule) {
      const rb = newTag ? newId('k') : rubricId
      if (newTag) setup.push({ type: 'addRubric', name: newTag, id: rb! })
      const id = newId('r')
      const name = FORMAT_SHORT[format] ?? format
      setup.push({ type: 'addRule', rubricId: rb, channelId, sectionId, name, id, days: [false, false, false, false, false, false, false], format })
      ruleNow = { ...(rule ?? plan.rules[0]), id, rubricId: rb, channelId, sectionId, name, format, full: false, days: [false, false, false, false, false, false, false], time: rule?.time ?? '12:00' }
    }
    if (!ruleNow) return setError('Выберите формат')
    const patch: Partial<Item> = {
      title: t,
      channelId,
      sectionId,
      ruleId: ruleNow.id,
      rubricId: ruleNow.rubricId ?? rubricId,
      platforms,
      status,
      note: note || undefined,
      format,
      time: time && time !== ruleNow.time ? time : undefined,
      owner: owner.trim() || undefined,
      due: due || undefined,
      offGrid: (isOffGrid || (needRule && !!day)) || undefined,
    }
    // копии и версии — в том же шаге истории, что и сам материал
    const extra = (id: string): Action[] => [
      ...copies.map((d): Action => ({ type: 'duplicate', id, date: d })),
      ...(versions.length && day ? [{ type: 'versions', id, platforms: versions, after } as Action] : []),
    ]
    const also = [copies.length && !!day && `копий: ${copies.length}`, versions.length && day && `версий: ${versions.length}${after ? ', после выхода' : ''}`].filter(Boolean).join(', ')
    const run = (actions: Action[]) => dispatch(actions.length > 1 ? { type: 'batch', actions } : actions[0])
    if (existing && isBank && date) {
      run([...setup, { type: 'update', id: existing.id, patch: { ...patch, title: title.trim() || existing.title } }, { type: 'assign', bankId: existing.id, date }, ...extra(existing.id)])
      toast(`Тема поставлена на ${date}${also ? ` · ${also}` : ''}`, true)
    } else if (existing) {
      run([...setup, { type: 'edit', id: existing.id, patch, date: date && date !== existing.date ? date : undefined, withGroup }, ...extra(existing.id)])
      toast(`Сохранено${also ? ` · ${also}` : ''}`, true)
    } else {
      const sample = plan.items.find((x) => x.ruleId === ruleNow!.id && x.date && !x.derive)
      const item: Item = {
        id: newId(),
        date: day || null,
        channelId,
        sectionId,
        ruleId: ruleNow.id,
        rubricId: patch.rubricId ?? null,
        title: t,
        format,
        platforms,
        status,
        source: t === PLACEHOLDER ? 'нужна тема' : day ? 'вручную' : 'черновик',
        rank: sample?.rank ?? 50,
        note: patch.note,
        time: patch.time,
        owner: patch.owner,
        due: patch.due,
        offGrid: patch.offGrid,
      }
      for (const k of Object.keys(item) as (keyof Item)[]) if (item[k] === undefined) delete item[k]
      run([...setup, { type: 'create', item, withFamily: withFamily && !!day && !needRule }, ...(day ? extra(item.id) : [])])
      toast(day ? `Создано на ${shortDate(day)}${also ? ` · ${also}` : ''}` : 'Сохранено в черновики', true)
    }
    onClose()
  }

  const remove = () => {
    if (!existing) return
    dispatch({ type: 'remove', id: existing.id, withGroup: withGroup && members.length > 0 })
    toast(withGroup && members.length ? `Удалено вместе с группой (${members.length + 1})` : 'Удалено', true)
    onClose()
  }

  const heading = existing ? (isBank ? 'Черновик' : 'Материал') : 'Новый контент'
  const offGridField = (
    <div className="cp-field">
      <Switch checked={isOffGrid} onChange={setOffGrid}>Вне сетки — разовый, проверка его не трогает</Switch>
      {offDay && rule && <span className="cp-hint">По сетке «{labelOf({ rubricId, ruleId })}» не выходит в {WEEKDAYS[weekday(date)]}.</span>}
    </div>
  )
  return (
    <aside className="cp-sheet" aria-label={heading} onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && save()}>
      <div className="cp-sheet__head">
        {onBack && <IconButton icon="chev-left" label="Назад" onClick={onBack} size="sm" />}
        {existing ? <h2 className="cp-sheet__title">{heading}</h2> : <CreateTabs current="new" />}
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
          <PickText type="date" label="Дата" value={date} text={date ? dayTitle(date) : ''} placeholder="Без даты — в черновики" onChange={setDate} />
          {date && (
            <>
              <span className="cp-task__sep" aria-hidden="true">·</span>
              {rule?.stream ? (
                <span className="cp-task__stream" title="Приходит по вебхуку и выходит сразу">24/7, по вебхуку</span>
              ) : (
                <PickText type="time" label="Время выхода" value={time || (rule ? timeOf({}, rule) : '')} text={time || (rule ? timeOf({}, rule) : '')} onChange={setTime} />
              )}
            </>
          )}
        </div>

        <div className="cp-field__row cp-field__row--fmt">
          <div className="cp-field" title={rubric?.what || undefined}>
            <span className="nr-label">Хэштег</span>
            <TagInput
              label="Хэштег"
              value={newTag ? tagOf(newTag) : rubric ? tagOf(rubric.name) : ''}
              // хэштеги этого канала — первыми, потом остальные
              options={[...rubricsFor(channelId, rubricId), ...plan.rubrics.filter((r) => !rubricsFor(channelId, rubricId).includes(r))]}
              onPick={pickTag}
              disabled={fromFull}
            />
          </div>
          <label className="cp-field" title={needRule ? 'У хэштега в этом канале такого формата ещё нет: заведётся, разовый' : rule?.what || undefined}>
            <span className="nr-label">Формат{needRule && <span className="cp-field__new"> · новый</span>}</span>
            <select className="nr-field" value={format} onChange={(e) => pickFormat(e.target.value)}>
              {FORMATS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
        {fits.length > 1 && (
          <label className="cp-field" title={rule?.what || undefined}>
            <span className="nr-label">Что именно</span>
            <select className="nr-field" value={ruleId} onChange={(e) => takeRule(rules.get(e.target.value))}>
              {fits.map((r) => (
                <option key={r.id} value={r.id}>{r.rubricId ? r.name : `${r.name} (с FULL)`}</option>
              ))}
            </select>
          </label>
        )}

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
                    value={due || (existing ? dueOf({ ...existing, date }, rule) ?? '' : addDays(date, -leadOf(rule)))}
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
            {date && !isBank && (
              <div className="cp-field">
                <span className="nr-label">Копии на другие даты</span>
                <div className="cp-chips cp-chips--wrap" role="group" aria-label="Копии на другие даты">
                  {copies.map((d) => (
                    <button key={d} type="button" className="cp-chip" aria-label={`Убрать копию на ${shortDate(d)}`} onClick={() => setCopies(copies.filter((x) => x !== d))}>
                      {WEEKDAYS[weekday(d)]}, {shortDate(d)}
                      <Icon name="close" size={12} />
                    </button>
                  ))}
                  <PickText type="date" label="Копия на дату" value="" text="" placeholder="+ дата" onChange={(d) => d && d !== date && !copies.includes(d) && setCopies([...copies, d].sort())} />
                </div>
              </div>
            )}
            {date && !isBank && (
              <div className="cp-field">
                <span className="nr-label">Пересоздать для площадок</span>
                <div className="cp-pills" style={{ padding: 0 }} role="group" aria-label="Пересоздать для площадок">
                  {plan.platforms
                    .filter((p) => !platforms.includes(p))
                    .map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="nr-pill"
                        aria-pressed={versions.includes(p)}
                        aria-label={`Версия для ${p}`}
                        onClick={() => setVersions(versions.includes(p) ? versions.filter((x) => x !== p) : plan.platforms.filter((x) => x === p || versions.includes(x)))}
                      >
                        {p}
                      </button>
                    ))}
                </div>
                {versions.length > 0 && (
                  <Seg
                    value={after ? 'after' : 'with'}
                    onChange={(v) => setAfter(v === 'after')}
                    label="Когда пересоздать"
                    options={[
                      { id: 'with', label: 'Вместе с оригиналом' },
                      { id: 'after', label: 'Автоматически после выхода' },
                    ]}
                  />
                )}
                {versions.length > 0 && (
                  <span className="cp-hint">
                    {after
                      ? 'Когда оригинал отметят «Вышло», версии на следующий день станут задачами «в работе».'
                      : 'Версии выйдут в тот же день и встанут в ту же карточку.'}
                  </span>
                )}
              </div>
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
        {existing ? (
          <button type="button" className="nr-btn nr-btn--ghost" onClick={onClose}>Отмена</button>
        ) : (
          <button type="button" className="nr-btn nr-btn--ghost" onClick={() => save(true)} title="Без даты — в банк идей">
            <Icon name="draft" size={16} />
            В черновики
          </button>
        )}
        <button type="button" className="nr-btn nr-btn--primary" onClick={() => save()}>
          {existing ? 'Сохранить' : 'Создать'}
        </button>
      </div>
    </aside>
  )
}
