import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { dayTitle, shortDate, weekday } from '../model/dates'
import { newId, type Action } from '../model/store'
import { FORMAT_HOME, FORMAT_ICON, FORMAT_PLATFORMS, FORMAT_SHORT, FORMATS, isHome, isSlot, PLACEHOLDER, platformsFor, rubricName, shownTitle, statusOf, TEXT_IMAGE, timeOf, type Channel, type Item, type Plan, type Rule, type Status } from '../model/types'
import { unitsOf } from '../model/units'
import { IconButton, PickText, PlatformIcon, PlayPause } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'
import { TagInput, type TagPick } from '../ui/TagInput'
import { CreateTabs } from './BankView'

/** Какие площадки выбраны сразу: у сайта и письма — своя; иначе те, что канал запомнил для формата, или как у формата
 *  рубрики в канале, или где формат обычно выходит, — из тех, где он может выйти. */
function presetPlatforms(plan: Plan, c: Channel | undefined, f: string, r?: Rule) {
  if (FORMAT_HOME[f]) return [FORMAT_HOME[f]]
  const can = platformsFor(f, plan.platforms)
  const tries = [c?.picks?.[f] ?? [], r?.format === f ? r.platforms : [], (FORMAT_PLATFORMS[f] ?? []).filter((p) => c?.platforms.includes(p)), c?.platforms ?? []]
  return tries.map((list) => list.filter((p) => can.includes(p))).find((list) => list.length) ?? []
}

interface Props {
  id?: string
  draft?: Partial<Item>
  onClose: () => void
  onBack?: () => void
}

/** Форма материала: новый или существующий. Вверху — тема (вписывается прямо в заголовке) и ▶ / ⏸ рядом, под ней — когда;
 *  дальше по порядку: канал, рубрика (рубрики канала — первыми), заметка, формат, площадки (по формату; у сайта и письма
 *  их нет). Площадки, выбранные руками, канал запоминает для формата. Внизу — «Готово».
 *  Сохранение — один шаг истории; ▶ / ⏸ и «Готово» у материала — сразу, всей карточке. */
export function ItemEditor({ id, draft, onClose, onBack }: Props) {
  const { plan, byDate, dispatch, rubrics, rules, channels, toast } = usePlan()
  const existing = id ? plan.items.find((x) => x.id === id) : undefined
  const base: Partial<Item> = existing ?? draft ?? {}

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
  const firstFormat = base.format ?? rules.get(firstRule)?.format ?? TEXT_IMAGE
  const [platforms, setPlatforms] = useState<string[]>(() => base.platforms ?? presetPlatforms(plan, channels.get(firstChannel), firstFormat, rules.get(firstRule)))
  const [status, setStatus] = useState<Status>(base.status ?? 'planned')
  const [note, setNote] = useState(base.note ?? '')
  const [time, setTime] = useState(base.time ?? '')
  const [touched, setTouched] = useState(false) // площадки выбрали руками — канал их запомнит
  const [error, setError] = useState('')
  const [newTag, setNewTag] = useState('') // рубрика, которой ещё нет: заведётся при сохранении
  const [format, setFormat] = useState(firstFormat)

  const channel = channels.get(channelId)
  const rule = rules.get(ruleId)
  const rubric = rubricId ? rubrics.get(rubricId) : undefined
  // у рубрики в этом канале ещё нет такого формата — при сохранении заведётся, разовый (периодичность — в «Темах»)
  const needRule = !rule || rule.channelId !== channelId || (rule.rubricId !== null && rule.rubricId !== rubricId) || !!newTag || (!existing && rule.format !== format)
  // одного формата у рубрики может быть несколько в сетке: «Исследование дня» и «Итоги месяца» — обе страницы на сайте
  const fits = needRule ? [] : rulesFor(channelId, rubricId).filter((r) => r.format === format || r.id === ruleId)
  const members = useMemo(
    () => (existing?.group && existing.date ? plan.items.filter((x) => x.group === existing.group && x.date === existing.date && x.id !== existing.id) : []),
    [plan.items, existing],
  )
  const isBank = !!existing && existing.date === null
  // вся карточка материала: статус ставится и тизеру, и анонсам — как кнопкой на карточке
  const cardIds = useMemo(() => {
    if (!existing?.date) return existing ? [existing.id] : []
    const unit = unitsOf(byDate.get(existing.date) ?? [], rules, plan.channels.map((c) => c.id)).find((u) => u.items.some((it) => it.id === existing.id))
    return unit ? unit.items.map((x) => x.id) : [existing.id]
  }, [existing, byDate, rules, plan.channels])
  /** ▶ / ⏸ и «Готово»: у материала — сразу, всей карточке, с отменой; у нового — при создании. */
  const changeStatus = (s: Status) => {
    setStatus(s)
    if (!existing) return
    dispatch({ type: 'updateMany', ids: cardIds, patch: { status: s } })
    toast(`${statusOf(s).label}: ${shownTitle(existing)}`, true)
  }
  const preset = (cid: string, f: string, r?: Rule) => presetPlatforms(plan, channels.get(cid), f, r)
  /** Площадки под новый формат: у сайта и письма — своя; у материала — что было, если формат там может выйти. */
  const platformsAfter = (cid: string, f: string, r?: Rule) => {
    if (FORMAT_HOME[f]) return [FORMAT_HOME[f]]
    const can = platformsFor(f, plan.platforms)
    const kept = platforms.filter((p) => can.includes(p))
    return (existing || touched) && kept.length ? kept : preset(cid, f, r)
  }
  // тема в заголовке растёт по тексту
  const topicRef = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = topicRef.current
    if (!el) return
    el.style.height = 'auto'
    if (el.scrollHeight) el.style.height = `${el.scrollHeight}px`
  }, [title])
  const fromFull = !!existing?.derive // рубрика берётся у FULL группы
  // новый материал на «чужой» день — разовый: проверка сетки его не трогает
  const offDay = !!date && !!rule && !rule.days[weekday(date)]

  const takeRule = (r: Rule | undefined, cid = channelId) => {
    setRuleId(r?.id ?? '')
    if (r?.sectionId) setSectionId(r.sectionId)
    if (!r) return
    setFormat(r.format)
    setPlatforms(platformsAfter(cid, r.format, r))
  }
  /** Формат рубрики в канале: такой же, как выбран, если есть, иначе первый. */
  const ruleFor = (cid: string, rb: string | null) => {
    const list = rulesFor(cid, rb)
    return list.find((r) => r.format === format) ?? list[0]
  }
  /** Выбрали формат: есть такой у рубрики в канале — берём его; нет — заведётся при сохранении (у материала — просто формат). */
  const pickFormat = (f: string) => {
    setFormat(f)
    const r = rulesFor(channelId, rubricId).find((x) => x.format === f)
    if (r) return takeRule(r)
    setPlatforms(platformsAfter(channelId, f))
  }
  /** Канал — первым: рубрика остаётся, если она есть в канале, иначе — первая рубрика канала; площадки — как канал помнит. */
  const pickChannel = (cid: string) => {
    setChannelId(cid)
    const inChannel = rubricsFor(cid)
    const rb = !newTag && inChannel.some((x) => x.id === rubricId) ? rubricId : newTag ? null : inChannel[0]?.id ?? null
    if (!newTag) setRubricId(rb)
    const r = newTag ? undefined : ruleFor(cid, rb)
    setSectionId(r?.sectionId)
    if (r) return takeRule(r, cid)
    setRuleId('')
    setPlatforms(FORMAT_HOME[format] ? [FORMAT_HOME[format]] : touched ? platforms.filter((p) => platformsFor(format, plan.platforms).includes(p)) : preset(cid, format))
  }
  const pickRubric = (rb: string) => {
    setRubricId(rb)
    setNewTag('')
    if (rule?.rubricId !== null) takeRule(ruleFor(channelId, rb))
  }
  /** Рубрика из подсказок или новая: у такой в канале может не быть формата — тогда он заведётся при сохранении. */
  const pickTag = (p: TagPick) => {
    if ('rubric' in p) return pickRubric(p.rubric.id)
    setNewTag(p.name)
    setRubricId(null)
    setRuleId('')
  }
  const togglePlatform = (p: string) => {
    setTouched(true)
    setPlatforms((list) => (list.includes(p) ? list.filter((x) => x !== p) : plan.platforms.filter((x) => x === p || list.includes(x))))
  }
  // площадки — по формату; у материала остаются и те, что выбраны раньше, даже если формат там обычно не выходит
  const platformList = FORMAT_HOME[format] ? [] : plan.platforms.filter((p) => platformsFor(format, plan.platforms).includes(p) || (platforms.includes(p) && !isHome(p)))
  const shownPlatforms = FORMAT_HOME[format] ? [FORMAT_HOME[format]] : platforms.filter((p) => !isHome(p))

  const save = (toDrafts = false) => {
    const t = title.trim() || PLACEHOLDER
    const day = toDrafts ? '' : date
    if (!shownPlatforms.length) return setError('Выберите хотя бы одну площадку')
    if (toDrafts && t === PLACEHOLDER) return setError('Для черновика нужна тема')
    // новая рубрика или рубрика без формата в канале: заводим их тем же шагом истории
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
    // площадки, которых у канала ещё не было, появятся у канала; выбранные руками — канал запомнит для формата
    const added = shownPlatforms.filter((p) => channel && !channel.platforms.includes(p))
    const remember = touched && !FORMAT_HOME[format] && channel && channel.picks?.[format]?.join() !== shownPlatforms.join()
    if (channel && (added.length || remember))
      setup.push({
        type: 'channel',
        id: channel.id,
        patch: {
          ...(added.length ? { platforms: plan.platforms.filter((p) => channel.platforms.includes(p) || added.includes(p)) } : {}),
          ...(remember ? { picks: { ...channel.picks, [format]: shownPlatforms } } : {}),
        },
      })
    const patch: Partial<Item> = {
      title: t,
      channelId,
      sectionId,
      ruleId: ruleNow.id,
      rubricId: ruleNow.rubricId ?? rubricId,
      platforms: shownPlatforms,
      status,
      note: note || undefined,
      format,
      time: time && time !== ruleNow.time ? time : undefined,
      // у материала флаг остаётся как был; новый на «чужой» день или с новым форматом — разовый
      offGrid: (existing && !isBank ? existing.offGrid : offDay || (needRule && !!day)) || undefined,
    }
    const run = (actions: Action[]) => dispatch(actions.length > 1 ? { type: 'batch', actions } : actions[0])
    if (existing && isBank && date) {
      run([...setup, { type: 'update', id: existing.id, patch: { ...patch, title: title.trim() || existing.title } }, { type: 'assign', bankId: existing.id, date }])
      toast(`Тема поставлена на ${shortDate(date)}`, true)
    } else if (existing) {
      // карточка — одна: группа переносится вместе
      run([...setup, { type: 'edit', id: existing.id, patch, date: date && date !== existing.date ? date : undefined, withGroup: true }])
      toast('Сохранено', true)
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
        platforms: shownPlatforms,
        status,
        source: t === PLACEHOLDER ? 'нужна тема' : day ? 'вручную' : 'черновик',
        rank: sample?.rank ?? 50,
        note: patch.note,
        time: patch.time,
        offGrid: patch.offGrid,
      }
      for (const k of Object.keys(item) as (keyof Item)[]) if (item[k] === undefined) delete item[k]
      // тизер, анонсы и письма — как у ближайшего материала рубрики, без переключателя
      run([...setup, { type: 'create', item, withFamily: !!day && !needRule }])
      toast(day ? `Создано на ${shortDate(day)}` : 'Сохранено в черновики', true)
    }
    onClose()
  }

  const remove = () => {
    if (!existing) return
    // карточка удаляется целиком: тизер, анонсы и письма группы — вместе, «Отменить» вернёт
    dispatch({ type: 'remove', id: existing.id, withGroup: members.length > 0 })
    toast(members.length ? `Удалено: карточка целиком (${members.length + 1})` : 'Удалено', true)
    onClose()
  }

  const heading = existing ? (isBank ? 'Черновик' : 'Материал') : 'Новый контент'
  // тема — вместо заголовка «Материал»: вписывается прямо здесь; рядом ▶ / ⏸
  const topic = (
    <div className="cp-headline">
      <textarea
        ref={topicRef}
        className="cp-task__title cp-headline__in"
        aria-label="Тема"
        rows={1}
        value={title}
        autoFocus={!existing || isSlot(existing)}
        placeholder={existing && isSlot(existing) ? 'Нужна тема' : 'Тема: «Агент продаж»'}
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => e.key === 'Enter' && !(e.metaKey || e.ctrlKey) && e.preventDefault()}
      />
      <PlayPause status={status} onChange={changeStatus} />
    </div>
  )
  return (
    <aside className="cp-sheet" aria-label={heading} onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && save()}>
      <div className="cp-sheet__head">
        {onBack && <IconButton icon="chev-left" label="Назад" onClick={onBack} size="sm" />}
        {existing ? topic : <CreateTabs current="new" />}
        <IconButton icon="close" label="Закрыть" onClick={onClose} />
      </div>
      <div className="cp-sheet__body nr-scroll">
        {!existing && topic}
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

        <div className="cp-field" title={rubric?.what || undefined}>
          <span className="nr-label">Рубрика</span>
          {/* поле со списком: рубрики этого канала — первыми, остальные ниже; набрать — подсказки, новая заведётся */}
          <TagInput
            label="Рубрика"
            value={newTag ? rubricName(newTag) : rubric ? rubric.name : ''}
            options={[...rubricsFor(channelId), ...plan.rubrics.filter((r) => !rubricsFor(channelId).includes(r))]}
            primary={new Set(rubricsFor(channelId).map((r) => r.id))}
            onPick={pickTag}
            disabled={fromFull}
          />
        </div>

        <label className="cp-field">
          <span className="nr-label">Заметка</span>
          <textarea className="nr-field" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Сценарий, ссылки, что учесть" />
        </label>

        <div className="cp-field" title={needRule ? 'У рубрики в этом канале такого формата ещё нет: заведётся, разовый' : rule?.what || undefined}>
          <span className="nr-label">Формат{needRule && <span className="cp-field__new"> · новый</span>}</span>
          {/* значками: горизонталь, вертикаль, пост, письмо, веб — щёлкнуть один */}
          <div className="cp-fmt" role="radiogroup" aria-label="Формат">
            {FORMATS.flatMap((g) => g.items).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={format === f} aria-label={f} title={f} className="cp-fmt__opt" onClick={() => pickFormat(f)}>
                <Icon name={FORMAT_ICON[f].icon} size={22} />
                <span className="cp-fmt__label">{FORMAT_ICON[f].label}</span>
              </button>
            ))}
          </div>
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

        {/* площадки — по формату: у сайта и письма их нет; выбранные руками канал запомнит */}
        {platformList.length > 0 && (
          <div className="cp-field">
            <span className="nr-label">Площадки</span>
            {/* одной строкой, плитками как форматы: значок и название */}
            <div className="cp-plats" role="group" aria-label="Площадки">
              {platformList.map((p) => (
                <button key={p} type="button" className="cp-plat" aria-pressed={platforms.includes(p)} onClick={() => togglePlatform(p)} title={p}>
                  <PlatformIcon platform={p} size={18} />
                  <span className="cp-plat__label">{p}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <p className="cp-hint" style={{ color: 'var(--nr-danger)' }} role="alert">{error}</p>}
      </div>
      <div className="cp-sheet__foot">
        {/* галочка «сделал» — статус «Готово»; снять — снова в плане */}
        <label className="cp-done" title="Сделано — статус «Готово»; снять галочку — снова в плане">
          <input type="checkbox" checked={status === 'ready' || status === 'published'} onChange={(e) => changeStatus(e.target.checked ? 'ready' : 'planned')} />
          <span className="cp-check-row__box" aria-hidden="true">
            <Icon name="check" size={12} />
          </span>
          {status === 'published' ? 'Вышло' : 'Готово'}
        </label>
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
