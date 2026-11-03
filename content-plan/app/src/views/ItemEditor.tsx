import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { dateText, dayTitle, shortDate, today, weekday, WEEKDAYS, addDays } from '../model/dates'
import { presetOf, presetRule, PRESETS, repeatDates, repeatText, times, type Preset, type RepeatRule } from '../model/repeat'
import { partsActions, presetOfSource, scheduleRule, scheduleDates, sourceOfItem, VOICES, type Place, type Source, type Voice } from '../model/social'
import { newId, type Action } from '../model/store'
import {
  FORMAT_HOME, FORMAT_ICON, FORMAT_SHORT, FORMATS, FULL_VIDEO, isHome, isSlot, MAX_IMAGES, PLACEHOLDER, platformsFor, presetPlatforms, rubricName, SHORT_VIDEO, shownTitle,
  statusOf, TEXT_IMAGE, timeOf, DEFAULT_LANGS, LANGS, langsOf, type Item, type Rule, type SourceRef, type Status,
} from '../model/types'
import { unitsOf } from '../model/units'
import { IconButton, PickText, PlatformIcon, PlayPause } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'
import { imageFiles, readImage } from '../ui/images'
import { LangPicker } from '../ui/LangPicker'
import { RepeatDialog } from '../ui/RepeatDialog'
import { TagInput, type TagPick } from '../ui/TagInput'
import { CreateTabs } from './BankView'

/** Свои языки — у каждого человека свои, в этом браузере: что отметил в последний раз, то и стоит у нового контента. */
const MY_LANGS = 'cp:langs'
function myLangs(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(MY_LANGS) ?? 'null') as unknown
    return Array.isArray(v) && v.length && v.every((x) => LANGS.some((l) => l.id === x)) ? (v as string[]) : DEFAULT_LANGS
  } catch {
    return DEFAULT_LANGS
  }
}
function rememberLangs(v: string[]) {
  try {
    localStorage.setItem(MY_LANGS, JSON.stringify(v))
  } catch {
    /* не запомнится — в следующий раз снова русский */
  }
}

/** Канал, который заведётся при сохранении. */
const NEW_CHANNEL = '__new'
const VIDEO = new Set([FULL_VIDEO, SHORT_VIDEO])

interface Props {
  id?: string
  draft?: Partial<Item>
  /** «Пересоздать»: пост или видео — контекст для копирования; форма та же, формат выбирают как обычно. */
  source?: Source
  /** С чего начать при пересоздании: формат и на сколько коротких нарезать. */
  preset?: { format: string; count: number }
  onClose: () => void
  onBack?: () => void
}

/** Форма материала: новый, существующий или пересозданный из поста. Вверху — тема и ▶ / ⏸ рядом, под ней — когда и повтор;
 *  дальше: канал, рубрика (обе можно не ставить — главное название), заметка с картинками, формат, площадки, языки.
 *  Площадки, выбранные руками, канал запоминает для формата. Внизу — «Готово». Сохранение — один шаг истории. */
export function ItemEditor({ id, draft, source, preset: startPreset, onClose, onBack }: Props) {
  const { plan, byDate, dispatch, rubrics, rules, channels, toast, openRecreate, setSection, show, openDrafts } = usePlan()
  const existing = id ? plan.items.find((x) => x.id === id) : undefined
  const preset = source ? startPreset ?? presetOfSource(source) : undefined
  const srcItem = source?.itemId ? plan.items.find((x) => x.id === source.itemId) : undefined
  const base: Partial<Item> = existing ?? {
    ...(source
      ? {
          title: source.title,
          format: preset!.format,
          // из материала календаря — его день (если не в прошлом), канал и рубрика; из ленты — сегодня
          date: srcItem?.date && srcItem.date >= today() ? srcItem.date : today(),
          channelId: srcItem?.channelId,
          rubricId: source.rubricId ?? null,
          ref: { title: source.title, summary: source.summary, platform: source.platform, owner: source.owner, url: source.url, itemId: source.itemId },
        }
      : {}),
    ...draft,
  }

  // форматы канала для рубрики: свои форматы рубрики и общие, которые выходят с FULL, — если у рубрики есть FULL
  const hasFull = (rb: string | null) => plan.rules.some((r) => r.rubricId === rb && r.full)
  const rulesFor = (cid: string, rb: string | null) =>
    plan.rules.filter((r) => r.channelId === cid && (r.rubricId === rb || (r.rubricId === null && hasFull(rb))))
      .sort((x, y) => Number(x.rubricId === null) - Number(y.rubricId === null))
  const rubricsFor = (cid: string, keep?: string | null) =>
    plan.rubrics.filter((rb) => rb.id === keep || plan.rules.some((r) => r.channelId === cid && r.rubricId === rb.id))
  // по умолчанию — канал, у которого больше всего форматов; каналов нет — без канала
  const busiest = [...plan.channels].sort((x, y) => plan.rules.filter((r) => r.channelId === y.id).length - plan.rules.filter((r) => r.channelId === x.id).length)[0]
  const firstChannel = base.channelId !== undefined ? base.channelId : source ? '' : busiest?.id ?? ''
  const firstRubricGuess = base.rubricId !== undefined ? base.rubricId : firstChannel ? rubricsFor(firstChannel)[0]?.id ?? null : null
  const firstRule = base.ruleId ?? (firstChannel && firstRubricGuess ? rulesFor(firstChannel, firstRubricGuess).find((r) => !base.format || r.format === base.format) ?? rulesFor(firstChannel, firstRubricGuess)[0] : undefined)?.id ?? ''
  const firstRubric = base.rubricId !== undefined ? base.rubricId : rules.get(firstRule)?.rubricId ?? firstRubricGuess

  const [title, setTitle] = useState(base.title && !isSlot(base as Item) ? base.title : '')
  const [date, setDate] = useState(base.date ?? '')
  const [channelId, setChannelId] = useState(firstChannel)
  const [newChannel, setNewChannel] = useState('')
  const [rubricId, setRubricId] = useState<string | null>(firstRubric)
  const [ruleId, setRuleId] = useState(firstRule)
  const [sectionId, setSectionId] = useState<string | undefined>(base.sectionId ?? rules.get(firstRule)?.sectionId)
  const firstFormat = base.format ?? rules.get(firstRule)?.format ?? TEXT_IMAGE
  const [platforms, setPlatforms] = useState<string[]>(() => base.platforms ?? presetPlatforms(plan, channels.get(firstChannel), firstFormat, rules.get(firstRule)))
  const [status, setStatus] = useState<Status>(base.status ?? 'planned')
  const [note, setNote] = useState(base.note ?? '')
  const [images, setImages] = useState<string[]>(base.images ?? [])
  const [time, setTime] = useState(base.time ?? '')
  const [touched, setTouched] = useState(false) // площадки выбрали руками — канал их запомнит
  const [langs, setLangs] = useState<string[]>(() => (existing ? langsOf(existing) : base.langs ?? myLangs()))
  const [langsTouched, setLangsTouched] = useState(false) // языки отметили — запомним их как свои
  // повтор рядом со временем: готовые варианты и «Другое…» — окно как в Google Календаре
  const [repeat, setRepeat] = useState<RepeatRule | null>(null)
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [error, setError] = useState('')
  const [newTag, setNewTag] = useState('') // рубрика, которой ещё нет: заведётся при сохранении
  const [format, setFormat] = useState(firstFormat)
  // пересоздать: на сколько коротких нарезать, как поставить части и чем озвучить
  const [count, setCount] = useState(preset?.count ?? 1)
  const [place, setPlace] = useState<Place>((preset?.count ?? 1) > 1 ? 'sameDay' : 'drafts')
  const [voice, setVoice] = useState<Voice>(base.voice ?? 'tts')

  const ref: SourceRef | undefined = base.ref
  const realChannel = channelId && channelId !== NEW_CHANNEL ? channelId : ''
  const channel = channels.get(realChannel)
  // в сетке материал, только когда есть и канал, и рубрика; иначе — разовый, без формата рубрики
  const gridded = (!!realChannel || (channelId === NEW_CHANNEL && !!newChannel.trim())) && (!!rubricId || !!newTag)
  const rule = gridded ? rules.get(ruleId) : undefined
  const rubric = rubricId ? rubrics.get(rubricId) : undefined
  // у рубрики в этом канале ещё нет такого формата — при сохранении заведётся, разовый (периодичность — в «Темах»)
  const needRule = gridded && (!rule || rule.channelId !== channelId || (rule.rubricId !== null && rule.rubricId !== rubricId) || !!newTag || (!existing && rule.format !== format))
  // одного формата у рубрики может быть несколько в сетке: «Исследование дня» и «Итоги месяца» — обе страницы на сайте
  const fits = !gridded || needRule ? [] : rulesFor(channelId, rubricId).filter((r) => r.format === format || r.id === ruleId)
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
  const presetFor = (cid: string, f: string, r?: Rule) => presetPlatforms(plan, channels.get(cid), f, r)
  /** Площадки под новый формат: у сайта и письма — своя; у материала — что было, если формат там может выйти. */
  const platformsAfter = (cid: string, f: string, r?: Rule) => {
    if (FORMAT_HOME[f]) return [FORMAT_HOME[f]]
    const can = platformsFor(f, plan.platforms)
    const kept = platforms.filter((p) => can.includes(p))
    return (existing || touched) && kept.length ? kept : presetFor(cid, f, r)
  }
  // тема в заголовке и заметка растут по тексту
  const topicRef = useRef<HTMLTextAreaElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    for (const el of [topicRef.current, noteRef.current]) {
      if (!el) continue
      el.style.height = 'auto'
      if (el.scrollHeight) el.style.height = `${el.scrollHeight + (el === noteRef.current ? 2 : 0)}px`
    }
  }, [title, note])
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
    const list = cid && rb ? rulesFor(cid, rb) : []
    return list.find((r) => r.format === format) ?? (source ? undefined : list[0])
  }
  /** Выбрали формат: есть такой у рубрики в канале — берём его; нет — заведётся при сохранении (у материала — просто формат). */
  const pickFormat = (f: string) => {
    setFormat(f)
    const r = realChannel && rubricId ? rulesFor(realChannel, rubricId).find((x) => x.format === f) : undefined
    if (r) return takeRule(r)
    setPlatforms(platformsAfter(realChannel, f))
  }
  /** Канал — первым: рубрика остаётся, если она есть в канале, иначе — первая рубрика канала; можно и без канала. */
  const pickChannel = (cid: string) => {
    setChannelId(cid)
    const real = cid && cid !== NEW_CHANNEL ? cid : ''
    if (!real) {
      setRuleId('')
      setSectionId(undefined)
      setPlatforms(platformsAfter('', format))
      return
    }
    const inChannel = rubricsFor(real)
    const rb = newTag ? null : inChannel.some((x) => x.id === rubricId) || (rubricId && !inChannel.length) ? rubricId : inChannel[0]?.id ?? rubricId
    if (!newTag) setRubricId(rb)
    const r = newTag ? undefined : ruleFor(real, rb)
    setSectionId(r?.sectionId)
    if (r) return takeRule(r, real)
    setRuleId('')
    setPlatforms(FORMAT_HOME[format] ? [FORMAT_HOME[format]] : touched ? platforms.filter((p) => platformsFor(format, plan.platforms).includes(p)) : presetFor(real, format))
  }
  /** Рубрика из подсказок, новая или «без рубрики»: у рубрики в канале может не быть формата — заведётся при сохранении. */
  const pickTag = (p: TagPick) => {
    if ('none' in p) {
      setRubricId(null)
      setNewTag('')
      setRuleId('')
      return
    }
    if ('rubric' in p) {
      setRubricId(p.rubric.id)
      setNewTag('')
      if (rule?.rubricId !== null) takeRule(ruleFor(realChannel, p.rubric.id))
      return
    }
    setNewTag(p.name)
    setRubricId(null)
    setRuleId('')
  }
  const togglePlatform = (p: string) => {
    setTouched(true)
    setPlatforms((list) => (list.includes(p) ? list.filter((x) => x !== p) : plan.platforms.filter((x) => x === p || list.includes(x))))
  }
  // нарезка: только у нового из источника, короткими видео
  const parts = !existing && !!source && format === SHORT_VIDEO ? Math.max(1, Math.min(20, count)) : 1
  const canRepeat = !!date && !(existing && existing.date === null) && parts === 1
  const repeats = canRepeat ? repeatDates(date, repeat, plan.end) : []
  const presetNow: Preset = presetOf(repeat)
  const rDays = repeat?.days.length ? repeat.days : date ? [weekday(date)] : []
  /** Дни повтора — хотя бы один остаётся. */
  const toggleDay = (d: number) => repeat && setRepeat({ ...repeat, days: rDays.includes(d) ? (rDays.length > 1 ? rDays.filter((x) => x !== d) : rDays) : [...rDays, d].sort() })
  /** Копии повтора: те же поля, свой день; в плане; вне сетки, если формат в этот день по сетке не выходит. */
  const repeatCopies = (from: Item, ruleNow: Rule | undefined, newRule: boolean, series: string): Action[] =>
    repeats.map((d) => {
      const { group: _g, derive: _d, origDate: _o, done: _done, trigger: _t, due: _due, ...rest } = from
      const copy: Item = { ...rest, id: newId(), date: d, status: 'planned', series, offGrid: !ruleNow || newRule || !ruleNow.days[weekday(d)] || undefined }
      if (!copy.offGrid) delete copy.offGrid
      return { type: 'create', item: copy, withFamily: !!ruleNow && !newRule }
    })
  // площадки — по формату; у материала остаются и те, что выбраны раньше, даже если формат там обычно не выходит
  const platformList = FORMAT_HOME[format] ? [] : plan.platforms.filter((p) => platformsFor(format, plan.platforms).includes(p) || (platforms.includes(p) && !isHome(p)))
  const shownPlatforms = FORMAT_HOME[format] ? [FORMAT_HOME[format]] : platforms.filter((p) => !isHome(p))
  // части по расписанию: формат рубрики в канале выходит по дням
  const sched = parts > 1 && realChannel ? scheduleRule(plan, realChannel, rubricId, SHORT_VIDEO) : undefined
  const placeNow: Place = !date ? 'drafts' : place === 'schedule' && !sched ? 'sameDay' : place === 'drafts' ? 'sameDay' : place
  const slots = sched && date ? scheduleDates(plan, sched, date, parts) : []

  const addImages = async (files: File[]) => {
    const room = MAX_IMAGES - images.length
    if (!files.length) return
    if (room <= 0) return setError(`Не больше ${MAX_IMAGES} картинок`)
    const read = await Promise.all(files.slice(0, room).map((f) => readImage(f).catch(() => '')))
    setImages((list) => [...list, ...read.filter(Boolean)].slice(0, MAX_IMAGES))
    setError(files.length > room ? `Не больше ${MAX_IMAGES} картинок — лишние не добавлены` : '')
  }

  const save = (toDrafts = false) => {
    const named = title.trim()
    const t = named || PLACEHOLDER
    const day = toDrafts ? '' : date
    if (toDrafts && !named) return setError('Для черновика нужна тема')
    // без канала или рубрики материал — разовый, ему нужно название (пустой слот бывает только в сетке рубрики)
    if (!gridded && !named) return setError('Впишите название')
    if (channelId === NEW_CHANNEL && !newChannel.trim()) return setError('Впишите название канала или выберите «Без канала»')
    const setup: Action[] = []
    // новый канал — заводим тем же шагом истории
    let cid = realChannel
    if (channelId === NEW_CHANNEL) {
      cid = newId('c')
      setup.push({ type: 'addChannel', name: newChannel.trim(), start: today(), id: cid })
    }
    let ruleNow: Rule | undefined = rule
    if (needRule) {
      // новая рубрика или рубрика без формата в канале
      const rb = newTag ? newId('k') : rubricId
      if (newTag) setup.push({ type: 'addRubric', name: newTag, id: rb! })
      const rid = newId('r')
      const name = FORMAT_SHORT[format] ?? format
      setup.push({ type: 'addRule', rubricId: rb, channelId: cid, sectionId, name, id: rid, days: [false, false, false, false, false, false, false], format })
      ruleNow = { ...(rule ?? plan.rules[0] ?? ({ types: {}, platforms: [], dayNotes: [], freq: '', source: '', what: '', channel: '', limit: 1 } as unknown as Rule)), id: rid, rubricId: rb, channelId: cid, sectionId, name, format, full: false, days: [false, false, false, false, false, false, false], time: rule?.time ?? '12:00' }
    }
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
    const free = !ruleNow
    const patch: Partial<Item> = {
      title: t,
      channelId: cid,
      sectionId: cid ? sectionId : undefined,
      ruleId: ruleNow?.id ?? '',
      rubricId: ruleNow ? ruleNow.rubricId ?? rubricId : rubricId,
      platforms: shownPlatforms,
      status,
      langs,
      note: note || undefined,
      images: images.length ? images : undefined,
      format,
      time: time && time !== timeOf({}, ruleNow) ? time : undefined,
      voice: (source || base.voice) && VIDEO.has(format) ? voice : undefined,
      // у материала флаг остаётся как был; новый на «чужой» день, с новым форматом или без сетки — разовый
      offGrid: (existing && !isBank && !free ? existing.offGrid : free ? !!day : offDay || (needRule && !!day)) || undefined,
    }
    const run = (actions: Action[]) => dispatch(actions.length > 1 ? { type: 'batch', actions } : actions[0])
    if (langsTouched) rememberLangs(langs)
    if (existing && isBank && date) {
      run([...setup, { type: 'update', id: existing.id, patch: { ...patch, title: named || existing.title } }, { type: 'assign', bankId: existing.id, date }])
      toast(`Тема поставлена на ${shortDate(date)}`, true)
    } else if (existing) {
      // повтор от этого материала вперёд: копии со своим днём, общий series
      const series = repeats.length ? existing.series ?? newId('s') : undefined
      const edited = { ...patch, ...(series ? { series } : {}) }
      // карточка — одна: группа переносится вместе
      run([...setup, { type: 'edit', id: existing.id, patch: edited, date: date && date !== existing.date ? date : undefined, withGroup: true }, ...(series ? repeatCopies({ ...existing, ...edited, date } as Item, ruleNow, needRule, series) : [])])
      toast(series ? `Сохранено и повторится ещё ${times(repeats.length)} — ${repeatText(repeat, date)}` : 'Сохранено', true)
    } else {
      const sample = ruleNow ? plan.items.find((x) => x.ruleId === ruleNow!.id && x.date && !x.derive) : undefined
      const item: Item = {
        id: newId(),
        date: day || null,
        channelId: cid,
        sectionId: patch.sectionId,
        ruleId: patch.ruleId!,
        rubricId: patch.rubricId ?? null,
        title: t,
        format,
        platforms: shownPlatforms,
        status,
        langs,
        source: source ? (day ? 'пересоздано' : 'черновик') : t === PLACEHOLDER ? 'нужна тема' : day ? 'вручную' : 'черновик',
        rank: sample?.rank ?? 50,
        note: patch.note,
        images: patch.images,
        time: patch.time,
        offGrid: patch.offGrid,
        voice: patch.voice,
        ref,
      }
      for (const k of Object.keys(item) as (keyof Item)[]) if (item[k] === undefined) delete item[k]
      if (parts > 1) {
        // нарезка: части — в один день, по одному в день или по расписанию; одним шагом истории
        const { actions, dates } = partsActions(plan, item, parts, toDrafts ? 'drafts' : placeNow, placeNow === 'schedule' ? sched : undefined)
        run([...setup, ...actions])
        const first = dates.find(Boolean)
        toast(`Создано: ${parts} коротких — ${partsText(toDrafts ? 'drafts' : placeNow)}`, {
          undo: true,
          actions: [first ? { label: 'В календарь', run: () => (setSection('calendar'), show(first)) } : { label: 'Черновики', run: () => (setSection('calendar'), openDrafts()) }],
        })
      } else {
        const series = day && repeats.length ? newId('s') : undefined
        if (series) item.series = series
        // тизер, анонсы и письма — как у ближайшего материала рубрики, без переключателя; повтор — тем же шагом истории
        run([...setup, { type: 'create', item, withFamily: !!day && !!ruleNow && !needRule }, ...(series ? repeatCopies(item, ruleNow, needRule, series) : [])])
        const msg = day ? `Создано на ${shortDate(day)}${series ? ` и ещё ${times(repeats.length)} — ${repeatText(repeat, day)}` : ''}` : 'Сохранено в черновики'
        // пересоздали с главной — календарь в другом разделе: ссылка туда
        if (source) toast(msg, { undo: true, actions: [day ? { label: 'В календарь', run: () => (setSection('calendar'), show(day)) } : { label: 'Черновики', run: () => (setSection('calendar'), openDrafts()) }] })
        else toast(msg, true)
      }
    }
    onClose()
  }
  const partsText = (p: Place) =>
    p === 'drafts'
      ? 'в черновики'
      : p === 'sameDay'
        ? `все на ${shortDate(date)}`
        : p === 'daily'
          ? `по одному в день, ${shortDate(date)} — ${shortDate(addDays(date, parts - 1))}`
          : `по расписанию: ${slots.map((s) => shortDate(s.date)).join(', ')}`

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
        placeholder={existing && isSlot(existing) ? 'Нужна тема' : 'Название: «Агент продаж»'}
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => e.key === 'Enter' && !(e.metaKey || e.ctrlKey) && e.preventDefault()}
      />
      <PlayPause status={status} onChange={changeStatus} />
    </div>
  )
  const video = VIDEO.has(format)
  return (
    <aside className="cp-sheet" aria-label={heading} onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && save()}>
      <div className="cp-sheet__head">
        {onBack && <IconButton icon="chev-left" label="Назад" onClick={onBack} size="sm" />}
        {existing ? topic : source ? <h2 className="nr-title cp-sheet__title">Пересоздать</h2> : <CreateTabs current="new" />}
        <IconButton icon="close" label="Закрыть" onClick={onClose} />
      </div>
      <div className="cp-sheet__body nr-scroll">
        {!existing && topic}
        {/* из чего пересоздаём: пост или видео — контекстом, чтобы копировать своими словами */}
        {ref && (
          <div className="cp-src" aria-label="Из чего">
            <span className="cp-src__head">
              {ref.platform ? <PlatformIcon platform={ref.platform} size={14} /> : <Icon name="calendar" size={14} />}
              {[ref.owner, ref.platform].filter(Boolean).join(' · ') || 'Материал календаря'}
              {ref.url && (
                <a className="cp-src__link" href={ref.url} target="_blank" rel="noopener noreferrer">
                  оригинал
                </a>
              )}
            </span>
            <b>{ref.title}</b>
            <p className="cp-src__sum">{ref.summary}</p>
            {!note.includes(ref.summary) && (
              <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm cp-src__copy" onClick={() => setNote((n) => (n ? `${n}\n\n${ref.summary}` : ref.summary))}>
                <Icon name="copy" size={14} />В заметку
              </button>
            )}
          </div>
        )}
        <div className="cp-form__when">
          <PickText type="date" label="Дата" value={date} text={date ? dayTitle(date) : ''} placeholder="Без даты — в черновики" onChange={setDate} />
          {date && (
            <>
              <span className="cp-task__sep" aria-hidden="true">·</span>
              {rule?.stream ? (
                <span className="cp-task__stream" title="Приходит по вебхуку и выходит сразу">24/7, по вебхуку</span>
              ) : (
                <PickText type="time" label="Время выхода" value={time || timeOf({}, rule)} text={time || timeOf({}, rule)} onChange={setTime} />
              )}
              {canRepeat && (
                // повтор — плашкой со стрелками по кругу: каждый день, по будням, по неделям, раз в месяц или «Другое…»
                <label className={`cp-repeat__pick${repeat ? ' cp-repeat__pick--on' : ''}`} title="Поставить на регулярку">
                  <Icon name="repeat" size={15} />
                  <select
                    className="cp-repeat__sel"
                    aria-label="Повтор"
                    value={presetNow}
                    onChange={(e) => {
                      const v = e.target.value as Preset | 'edit'
                      if (v === 'edit') return setRepeatOpen(true)
                      setRepeat(presetRule(v as Preset, date, v === 'week' || v === 'biweek' ? repeat?.days : undefined))
                    }}
                  >
                    {PRESETS.filter((p) => p.id !== 'custom').map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                    {presetNow === 'custom' && <option value="custom">{repeatText(repeat, date)}</option>}
                    <option value="edit">Другое…</option>
                  </select>
                </label>
              )}
            </>
          )}
        </div>
        {/* повтор: дни недели (по неделям) и сколько ещё раз */}
        {canRepeat && repeat && (
          <div className="cp-repeat">
            {(presetNow === 'week' || presetNow === 'biweek') && (
              <div className="cp-repeat__days" role="group" aria-label="Дни недели">
                {WEEKDAYS.map((w, i) => (
                  <button key={w} type="button" className="cp-repeat__day" aria-pressed={rDays.includes(i)} onClick={() => toggleDay(i)}>
                    {w}
                  </button>
                ))}
              </div>
            )}
            <p className="cp-hint">
              {repeatText(repeat, date)} — ещё {repeats.length}
              {repeat.end.kind === 'never' && ` до конца плана, ${dateText(plan.end, today())}`}
              {presetNow === 'custom' && (
                <button type="button" className="cp-link" onClick={() => setRepeatOpen(true)}>
                  Изменить
                </button>
              )}
            </p>
          </div>
        )}
        {repeatOpen && date && (
          <RepeatDialog
            start={date}
            rule={repeat ?? presetRule('week', date)}
            planEnd={plan.end}
            onCancel={() => setRepeatOpen(false)}
            onDone={(r) => {
              setRepeat(r)
              setRepeatOpen(false)
            }}
          />
        )}

        <label className="cp-field">
          <span className="nr-label">Канал</span>
          <select className="nr-field" value={channelId} onChange={(e) => pickChannel(e.target.value)} disabled={!!existing?.group && members.length > 0}>
            <option value="">Без канала</option>
            {plan.channels.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value={NEW_CHANNEL}>Новый канал…</option>
          </select>
        </label>
        {channelId === NEW_CHANNEL && (
          <input className="nr-field cp-field__sub" aria-label="Название канала" placeholder="Название канала: «Мой блог»" value={newChannel} autoFocus onChange={(e) => setNewChannel(e.target.value)} />
        )}
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
          {/* поле со списком: рубрики этого канала — первыми, остальные ниже; «Без рубрики» — первой строкой */}
          <TagInput
            label="Рубрика"
            value={newTag ? rubricName(newTag) : rubric ? rubric.name : ''}
            placeholder="Без рубрики"
            options={[...rubricsFor(realChannel), ...plan.rubrics.filter((r) => !rubricsFor(realChannel).includes(r))]}
            primary={realChannel ? new Set(rubricsFor(realChannel).map((r) => r.id)) : undefined}
            onPick={pickTag}
            clearable
            disabled={fromFull}
          />
        </div>

        <div className="cp-field">
          <span className="nr-label">Заметка</span>
          <NoteBox
            note={note}
            setNote={setNote}
            noteRef={noteRef}
            images={images}
            onAdd={addImages}
            onRemove={(i) => setImages((list) => list.filter((_, k) => k !== i))}
          />
        </div>

        <div className="cp-field" title={needRule ? 'У рубрики в этом канале такого формата ещё нет: заведётся, разовый' : rule?.what || undefined}>
          <span className="nr-label">Формат{needRule && <span className="cp-field__new"> · новый</span>}</span>
          {/* значками: горизонталь, вертикаль, пост, веб, рассылка — щёлкнуть один */}
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
        {/* пересоздать: короткими видео — нарезать на N и решить, как поставить части */}
        {!existing && source && format === SHORT_VIDEO && (
          <div className="cp-field">
            <span className="nr-label">Нарезать на</span>
            <div className="cp-count" role="group" aria-label="Сколько коротких">
              <button type="button" className="nr-btn nr-btn--ghost nr-btn--icon nr-btn--sm" aria-label="Меньше" onClick={() => setCount(Math.max(1, count - 1))}>
                −
              </button>
              <output aria-live="polite">{count}</output>
              <button type="button" className="nr-btn nr-btn--ghost nr-btn--icon nr-btn--sm" aria-label="Больше" onClick={() => (setCount(Math.min(20, count + 1)), count === 1 && place === 'drafts' && setPlace('sameDay'))}>
                +
              </button>
            </div>
            {parts > 1 && date && (
              <>
                <div className="nr-seg cp-place" role="radiogroup" aria-label="Как поставить">
                  {(
                    [
                      ['sameDay', 'В один день'],
                      ['daily', 'Ежедневно'],
                      ['schedule', 'По расписанию'],
                    ] as [Place, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={placeNow === id}
                      disabled={id === 'schedule' && !sched}
                      title={id === 'schedule' && !sched ? 'У рубрики в этом канале нет расписания для коротких видео — задайте повтор в календаре' : undefined}
                      className="nr-seg__item"
                      onClick={() => setPlace(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="cp-hint">
                  {placeNow === 'sameDay' && `Все ${parts} — на ${shortDate(date)}; дальше переставите в календаре.`}
                  {placeNow === 'daily' && `По одному в день: ${shortDate(date)} — ${shortDate(addDays(date, parts - 1))}.`}
                  {placeNow === 'schedule' && `Друг за другом в ближайшие дни расписания: ${slots.map((s) => `${shortDate(s.date)}${s.slot ? ' (пустое место)' : ''}`).join(', ')}.`}
                </p>
              </>
            )}
          </div>
        )}
        {(source || base.voice) && video && (
          <div className="cp-field">
            <span className="nr-label">Озвучка</span>
            <div className="cp-plats" role="radiogroup" aria-label="Озвучка">
              {VOICES.map((v) => (
                <button key={v.id} type="button" role="radio" aria-checked={voice === v.id} aria-pressed={voice === v.id} className="cp-plat" title={v.note} onClick={() => setVoice(v.id)}>
                  <span className="cp-lang__code">{v.label}</span>
                  <span className="cp-plat__label">{v.note}</span>
                </button>
              ))}
            </div>
          </div>
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
        {/* языки — списком с галочками; отмеченные стоят у нового контента и в следующий раз */}
        <div className="cp-field">
          <span className="nr-label">Языки</span>
          <LangPicker
            value={langs}
            onChange={(v) => {
              setLangs(v)
              setLangsTouched(true)
            }}
          />
        </div>
        {/* пересоздать этот материал: та же форма с ним как контекстом */}
        {existing && !isBank && (
          <div className="cp-field">
            <span className="nr-label">Пересоздать</span>
            <div className="cp-recreate">
              {format === FULL_VIDEO && (
                <button type="button" className="nr-btn nr-btn--secondary nr-btn--sm" onClick={() => openRecreate(sourceOfItem(existing, channel?.name), { format: SHORT_VIDEO, count: 3 })}>
                  <Icon name="f-vertical" size={15} />
                  Нарезать на короткие…
                </button>
              )}
              {!VIDEO.has(format) && (
                <button type="button" className="nr-btn nr-btn--secondary nr-btn--sm" onClick={() => openRecreate(sourceOfItem(existing, channel?.name), { format: SHORT_VIDEO, count: 1 })}>
                  <Icon name="f-vertical" size={15} />
                  Сделать видео…
                </button>
              )}
              <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => openRecreate(sourceOfItem(existing, channel?.name), { format, count: 1 })}>
                <Icon name="spark" size={15} />
                Пересоздать…
              </button>
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
            <button type="button" className="nr-btn nr-btn--ghost nr-btn--icon cp-trash" onClick={remove} aria-label="Удалить" title="Удалить">
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

/** Заметка: текст любой длины (поле растёт) и до 10 картинок — кнопкой, вставкой из буфера или перетаскиванием. */
function NoteBox({ note, setNote, noteRef, images, onAdd, onRemove }: {
  note: string
  setNote: (v: string) => void
  noteRef: RefObject<HTMLTextAreaElement>
  images: string[]
  onAdd: (files: File[]) => void
  onRemove: (i: number) => void
}) {
  const file = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [big, setBig] = useState<number | null>(null)
  return (
    <div
      className={`cp-note${over ? ' cp-note--drop' : ''}`}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes('Files')) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const files = imageFiles(e.dataTransfer.files)
        setOver(false)
        if (!files.length) return
        e.preventDefault()
        onAdd(files)
      }}
    >
      <textarea
        ref={noteRef}
        className="cp-note__text"
        aria-label="Заметка"
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onPaste={(e) => {
          const files = imageFiles(e.clipboardData.files)
          if (!files.length) return
          e.preventDefault()
          onAdd(files)
        }}
        placeholder="Сценарий, текст поста, ссылки, что учесть — сколько угодно. Картинки можно вставить или перетащить."
      />
      <div className="cp-note__bar">
        {images.length > 0 && (
          <ul className="cp-note__imgs" aria-label="Картинки">
            {images.map((src, i) => (
              <li key={i} className="cp-note__img">
                <button type="button" className="cp-note__thumb" aria-label={`Картинка ${i + 1}`} onClick={() => setBig(i)}>
                  <img src={src} alt="" />
                </button>
                <button type="button" className="cp-note__del" aria-label={`Убрать картинку ${i + 1}`} title="Убрать" onClick={() => onRemove(i)}>
                  <Icon name="close" size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm cp-note__add" disabled={images.length >= MAX_IMAGES} onClick={() => file.current?.click()} title={`До ${MAX_IMAGES} картинок`}>
          <Icon name="image" size={16} />
          {images.length ? `${images.length}/${MAX_IMAGES}` : 'Картинки'}
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="Добавить картинки"
          onChange={(e) => {
            onAdd(imageFiles(e.target.files))
            e.target.value = ''
          }}
        />
      </div>
      {big !== null && images[big] && (
        <div className="cp-dialog__scrim cp-lightbox" role="dialog" aria-modal="true" aria-label="Картинка" onClick={() => setBig(null)} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setBig(null))}>
          <img src={images[big]} alt={`Картинка ${big + 1}`} />
        </div>
      )}
    </div>
  )
}
