// «Пересоздать»: из поста, видео (своего или конкурента) или материала календаря — пост, короткие видео (нарезать на N),
// длинное видео или статья. У видео — озвучка: голосом по тексту, аватар (лицо) или сам. Сценарий — заготовка по теме и
// саммери, её правят здесь же. Создаётся в календаре: в черновики или на даты (части — по дням), одним шагом истории.
import { useState } from 'react'
import { addDays, shortDate, today } from '../model/dates'
import { defaultOutput, OUTPUTS, recreateActions, scheduleDates, scheduleRule, scriptOf, VOICES, type Output, type Place, type Source, type Voice } from '../model/social'
import type { Action } from '../model/store'
import { rubricName } from '../model/types'
import { IconButton, PickText, PlatformIcon } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'
import { TagInput, type TagPick } from '../ui/TagInput'

export function RecreateSheet({ source, preset, onClose }: { source: Source; preset?: { output: Output; count: number }; onClose: () => void }) {
  const { plan, dispatch, toast, openDrafts, setSection, show } = usePlan()
  const start = preset ?? defaultOutput(source)
  const [output, setOutput] = useState<Output>(start.output)
  const [count, setCount] = useState(start.count)
  const [voice, setVoice] = useState<Voice>('tts')
  const [channelId, setChannelId] = useState(plan.channels[0]?.id ?? '')
  const [newChannel, setNewChannel] = useState('')
  const [rubricId, setRubricId] = useState<string | null>(source.rubricId && plan.rubrics.some((r) => r.id === source.rubricId) ? source.rubricId : null)
  const [newRubric, setNewRubric] = useState('')
  // несколько рилсов из видео — по умолчанию в тот же день (дальше распихать руками); у материала календаря — его день
  const [place, setPlace] = useState<Place>(start.output === 'shorts' && start.count > 1 ? 'sameDay' : 'drafts')
  const srcDate = source.itemId ? plan.items.find((x) => x.id === source.itemId)?.date : null
  const [date, setDate] = useState<string>(srcDate && srcDate >= today() ? srcDate : today())
  const [title, setTitle] = useState(source.title)
  const [edited, setEdited] = useState<string | null>(null) // сценарий, поправленный руками
  const video = output === 'shorts' || output === 'long'
  const n = output === 'shorts' ? count : 1
  const script = edited ?? scriptOf(source, output, voice, 1, n)
  const rubric = rubricId ? plan.rubrics.find((r) => r.id === rubricId) : undefined
  const inChannel = plan.rubrics.filter((r) => plan.rules.some((x) => x.channelId === channelId && x.rubricId === r.id))
  const label = output === 'shorts' ? `${n} ${n === 1 ? 'короткое видео' : n < 5 ? 'коротких видео' : 'коротких видео'}` : OUTPUTS.find((o) => o.id === output)!.label.toLowerCase()
  const create = () => {
    let cid = channelId
    const pre: Action[] = []
    // каналов нет — заведём из названия
    if (!cid) {
      if (!newChannel.trim()) return
      cid = `ch-${Date.now().toString(36)}`
      pre.push({ type: 'addChannel', name: newChannel.trim(), start: today(), id: cid })
    }
    const after = pre.length ? { ...plan, channels: [...plan.channels, { id: cid, name: newChannel.trim(), color: '#8e8e93', start: today(), platforms: [...plan.platforms], sections: [] }] } : plan
    const { actions, dates } = recreateActions(after, {
      source,
      output,
      count: n,
      voice,
      channelId: cid,
      rubricId,
      newRubric: rubricId ? undefined : newRubric,
      place: placeNow,
      date,
      title: title.trim() || source.title,
      script,
    })
    dispatch({ type: 'batch', actions: [...pre, ...actions] })
    const first = dates.find(Boolean)
    toast(`Создано: ${label} — ${whereText}`, {
      undo: true,
      actions: [
        first
          ? { label: 'В календарь', run: () => (setSection('calendar'), show(first)) }
          : { label: 'Черновики', run: () => (setSection('calendar'), openDrafts()) },
      ],
    })
    onClose()
  }
  const can = (channelId || newChannel.trim()) && (rubricId || newRubric.trim()) && title.trim()
  // расписание — площадка/канал и рубрика (тег): если у рубрики в канале этот формат выходит по дням — ставим по нему
  const format = OUTPUTS.find((o) => o.id === output)!.format
  const sched = channelId ? scheduleRule(plan, channelId, rubricId, format) : undefined
  const slots = sched ? scheduleDates(plan, sched, date, n) : []
  const places: { id: Place; label: string; off?: boolean }[] = [
    { id: 'drafts', label: 'В черновики' },
    { id: 'sameDay', label: n > 1 ? 'В один день' : 'На дату' },
    ...(n > 1 ? [{ id: 'daily' as Place, label: 'Ежедневно' }] : []),
    { id: 'schedule', label: 'По расписанию', off: !sched },
  ]
  const placeNow: Place = place === 'daily' && n < 2 ? 'sameDay' : place === 'schedule' && !sched ? 'sameDay' : place
  const whereText =
    placeNow === 'drafts'
      ? 'в черновики'
      : placeNow === 'sameDay'
        ? `${n > 1 ? 'все ' : ''}на ${shortDate(date)}`
        : placeNow === 'daily'
          ? `по одному в день, ${shortDate(date)} — ${shortDate(addDays(date, n - 1))}`
          : `по расписанию: ${slots.map((s) => shortDate(s.date)).join(', ')}`
  return (
    <aside className="cp-sheet" aria-label="Пересоздать">
      <div className="cp-sheet__head">
        <h2 className="nr-title cp-sheet__title">Пересоздать</h2>
        <IconButton icon="close" label="Закрыть" onClick={onClose} />
      </div>
      <div className="cp-sheet__body nr-scroll">
        <div className="cp-src" aria-label="Из чего">
          <span className="cp-src__head">
            {source.platform ? <PlatformIcon platform={source.platform} size={14} /> : <Icon name="calendar" size={14} />}
            {[source.owner, source.platform].filter(Boolean).join(' · ') || 'Материал календаря'}
          </span>
          <b>{source.title}</b>
          <span className="cp-muted">{source.summary}</span>
        </div>

        <div className="cp-field">
          <span className="nr-label">Что сделать</span>
          <div className="cp-fmt cp-fmt--4" role="radiogroup" aria-label="Что сделать">
            {OUTPUTS.map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={output === o.id} className="cp-fmt__opt" onClick={() => (setOutput(o.id), setEdited(null))}>
                <Icon name={o.icon} size={22} />
                <span className="cp-fmt__label">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
        {output === 'shorts' && (
          <div className="cp-field">
            <span className="nr-label">Нарезать на</span>
            <div className="cp-count" role="group" aria-label="Сколько коротких">
              <button type="button" className="nr-btn nr-btn--ghost nr-btn--icon nr-btn--sm" aria-label="Меньше" onClick={() => (setCount(Math.max(1, count - 1)), setEdited(null))}>
                −
              </button>
              <output aria-live="polite">{count}</output>
              <button type="button" className="nr-btn nr-btn--ghost nr-btn--icon nr-btn--sm" aria-label="Больше" onClick={() => (setCount(Math.min(20, count + 1)), setEdited(null))}>
                +
              </button>
              <span className="cp-muted">коротких — части 1 из {count}, 2 из {count}…</span>
            </div>
          </div>
        )}
        {video && (
          <div className="cp-field">
            <span className="nr-label">Озвучка</span>
            <div className="cp-plats" role="radiogroup" aria-label="Озвучка">
              {VOICES.map((v) => (
                <button key={v.id} type="button" role="radio" aria-checked={voice === v.id} aria-pressed={voice === v.id} className="cp-plat" title={v.note} onClick={() => (setVoice(v.id), setEdited(null))}>
                  <span className="cp-lang__code">{v.label}</span>
                  <span className="cp-plat__label">{v.note}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="cp-field">
          <span className="nr-label">Тема</span>
          <input className="nr-field" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Тема" />
        </label>

        {plan.channels.length ? (
          <label className="cp-field">
            <span className="nr-label">Канал</span>
            <select className="nr-field" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              {plan.channels.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="cp-field">
            <span className="nr-label">Канал — первый, создастся</span>
            <input className="nr-field" value={newChannel} onChange={(e) => setNewChannel(e.target.value)} placeholder="Мой блог" aria-label="Новый канал" />
          </label>
        )}
        <div className="cp-field">
          <span className="nr-label">Рубрика (тег)</span>
          <TagInput
            label="Рубрика"
            value={newRubric ? rubricName(newRubric) : rubric?.name ?? ''}
            options={[...inChannel, ...plan.rubrics.filter((r) => !inChannel.includes(r))]}
            primary={new Set(inChannel.map((r) => r.id))}
            onPick={(p: TagPick) => {
              if ('rubric' in p) {
                setRubricId(p.rubric.id)
                setNewRubric('')
              } else {
                setRubricId(null)
                setNewRubric(p.name)
              }
            }}
          />
        </div>

        <div className="cp-field">
          <span className="nr-label">Куда</span>
          <div className="cp-when">
            <div className="nr-seg cp-place" role="radiogroup" aria-label="Куда">
              {places.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={placeNow === p.id}
                  disabled={p.off}
                  title={p.off ? 'У рубрики в этом канале нет расписания для этого формата — задайте повтор в календаре' : undefined}
                  className="nr-seg__item"
                  onClick={() => setPlace(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {placeNow !== 'drafts' && <PickText type="date" label="С даты" value={date} text={shortDate(date)} onChange={setDate} />}
          </div>
          <p className="cp-hint">
            {placeNow === 'sameDay' && n > 1 && `Все ${n} — на ${shortDate(date)}; дальше переставите в календаре.`}
            {placeNow === 'daily' && `По одному в день: ${shortDate(date)} — ${shortDate(addDays(date, n - 1))}.`}
            {placeNow === 'schedule' && `Друг за другом в ближайшие дни расписания: ${slots.map((s) => `${shortDate(s.date)}${s.slot ? ' (пустое место)' : ''}`).join(', ')}.`}
            {!sched && placeNow !== 'drafts' && ' Расписания у этой рубрики в канале нет — «По расписанию» появится, когда зададите повтор.'}
          </p>
        </div>

        <label className="cp-field">
          <span className="nr-label">{video ? 'Сценарий и речь для озвучки' : 'Черновик текста'}</span>
          <textarea className="nr-field cp-script" rows={8} value={script} onChange={(e) => setEdited(e.target.value)} aria-label="Сценарий" />
          <span className="cp-hint">Заготовка по теме и саммери — в продукте её напишет ИИ; поправьте под себя.</span>
        </label>
      </div>
      <div className="cp-sheet__foot">
        <span className="cp-muted cp-recreate__sum">
          {label}, {whereText}
        </span>
        <span className="cp-top__spacer" />
        <button type="button" className="nr-btn nr-btn--ghost" onClick={onClose}>
          Отмена
        </button>
        <button type="button" className="nr-btn nr-btn--primary" disabled={!can} onClick={create}>
          Создать
        </button>
      </div>
    </aside>
  )
}
