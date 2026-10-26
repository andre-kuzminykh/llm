import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { shortDate, WEEKDAYS, weekday } from '../model/dates'
import { isSlot, timeOf, titleIsFormat, type Item } from '../model/types'
import { dueOf, leadOf, taskParts, unitsOf, type Unit } from '../model/units'
import { IconButton, mainChannelId, PickText, PlatformIcon, RubricChip, StatusPicker } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'

/** Задача по созданию контента: тема, что сделать на каждой площадке; ниже строкой — когда выход, к какому дню, кто делает.
 *  Открывается по ▶. Правки сохраняются сразу, каждая — шаг истории. */
export function TaskSheet({ id, onClose, onBack }: { id: string; onClose: () => void; onBack?: () => void }) {
  const { plan, byDate, dispatch, rules, rubrics, channels, openItem, setStatus, toast } = usePlan()
  const head = plan.items.find((x) => x.id === id)
  const [title, setTitle] = useState(head && !isSlot(head) ? head.title : '')
  const [owner, setOwner] = useState(head?.owner ?? '')
  const [note, setNote] = useState(head?.note ?? '')
  const [noteOpen, setNoteOpen] = useState(!!head?.note)
  // текст сохраняется, когда поле теряет фокус; если лист закрыли раньше — при закрытии
  const latest = useRef({ head, title, owner, note })
  latest.current = { head, title, owner, note }
  useEffect(
    () => () => {
      const { head: h, title: t, owner: o, note: n } = latest.current
      if (!h) return
      const patch: Partial<Item> = {}
      if (t.trim() && t.trim() !== h.title) patch.title = t.trim()
      if (o.trim() !== (h.owner ?? '')) patch.owner = o.trim() || undefined
      if (n !== (h.note ?? '')) patch.note = n || undefined
      if (Object.keys(patch).length) dispatch({ type: 'update', id: h.id, patch })
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )
  if (!head) return null
  const order = plan.channels.map((c) => c.id)
  const unit: Unit =
    (head.date ? unitsOf(byDate.get(head.date) ?? [], rules, order).find((u) => u.items.some((it) => it.id === id)) : undefined) ??
    { key: head.id, head, items: [head], channelId: head.channelId, date: head.date, time: timeOf(head, rules.get(head.ruleId)), stream: !!rules.get(head.ruleId)?.stream }
  const rule = rules.get(head.ruleId)
  const rubric = rubrics.get(head.rubricId ?? '')
  const channel = channels.get(unit.channelId)
  const format = rule && rule.name !== rubric?.name && !titleIsFormat(head.title, rule) ? rule.name : ''
  const parts = taskParts(unit, rules, plan.platforms)
  const done = new Set(unit.head.done ?? [])
  const doneN = parts.filter((p) => done.has(p.key)).length
  const allDone = parts.length > 0 && doneN === parts.length
  const due = dueOf(head, rule)

  const update = (patch: Partial<Item>) => dispatch({ type: 'update', id: head.id, patch })
  const toggle = (key: string) => update({ done: done.has(key) ? [...done].filter((k) => k !== key) : [...done, key] })
  const commitTitle = () => {
    const t = title.trim()
    if (t && t !== head.title) update({ title: t, source: head.source === 'нужна тема' ? 'вручную' : head.source })
    if (!t && !isSlot(head)) setTitle(head.title)
  }
  const day = (d: string) => `${WEEKDAYS[weekday(d)]}, ${shortDate(d)}`

  return (
    <aside className="cp-sheet cp-task" aria-label="Задача" style={{ '--cp-c': channel?.color } as CSSProperties}>
      <div className="cp-sheet__head">
        {onBack && <IconButton icon="chev-left" label="Назад" onClick={onBack} size="sm" />}
        <input
          className="cp-task__title"
          aria-label="Тема"
          value={title}
          placeholder="Нужна тема"
          autoFocus={isSlot(head)}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <IconButton icon="close" label="Закрыть" onClick={onClose} />
      </div>
      <div className="cp-sheet__body nr-scroll">
        <span className="cp-card__rub cp-task__label">
          {rubric && <RubricChip name={rubric.name} />}
          {format && <span className="cp-card__fmt">{format}</span>}
          {unit.channelId !== mainChannelId(plan) && channel && !format.includes(channel.name) && <span className="cp-card__fmt">{channel.name}</span>}
        </span>

        <div className="cp-field">
          <span className="nr-label">Что сделать · {doneN ? `${doneN} из ${parts.length}` : parts.length}</span>
          <div className="cp-task__parts">
            {parts.map((p) => (
              <label key={p.key} className={`cp-task__part${done.has(p.key) ? ' cp-task__part--done' : ''}`}>
                <input type="checkbox" checked={done.has(p.key)} onChange={() => toggle(p.key)} />
                <span className="cp-check-row__box" aria-hidden="true">
                  <Icon name="check" size={12} />
                </span>
                <PlatformIcon platform={p.platform} />
                <span>
                  {p.platform} — {p.type}
                </span>
              </label>
            ))}
          </div>
          {allDone && head.status !== 'ready' && head.status !== 'published' && (
            <button type="button" className="nr-btn nr-btn--tinted nr-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setStatus(unit, 'ready')}>
              <Icon name="check" size={14} /> Всё сделано — отметить «Готово»
            </button>
          )}
        </div>

        <div className="cp-task__when">
          {head.date && (
            <>
              <PickText
                type="date"
                label="Дата выхода"
                value={head.date}
                text={day(head.date)}
                onChange={(d) => {
                  if (!d || !head.date || d === head.date) return
                  dispatch({ type: 'move', id: head.id, date: d })
                  toast(`Перенесено на ${shortDate(d)}${head.group ? ' вместе с группой' : ''}`, true)
                }}
              />
              {unit.stream ? (
                <span className="cp-task__stream" title="Приходит по вебхуку и выходит сразу">24/7, по вебхуку</span>
              ) : (
                <PickText type="time" label="Время выхода" value={unit.time} text={unit.time} onChange={(t) => t && head.date && dispatch({ type: 'move', id: head.id, date: head.date, time: t })} />
              )}
              <span className="cp-task__sep" aria-hidden="true">·</span>
            </>
          )}
          <span className="cp-task__due" title={head.due ? undefined : `По умолчанию — за ${leadOf(rule)} дн. до выхода`}>
            срок <PickText type="date" label="Подготовить к" value={due ?? ''} text={due ? shortDate(due) : ''} placeholder="—" onChange={(d) => update({ due: d || undefined })} />
          </span>
          <span className="cp-task__sep" aria-hidden="true">·</span>
          <input
            className="cp-inline"
            aria-label="Кто делает"
            placeholder="кто делает"
            value={owner}
            size={Math.max(10, owner.length + 1)}
            onChange={(e) => setOwner(e.target.value)}
            onBlur={() => owner.trim() !== (head.owner ?? '') && update({ owner: owner.trim() || undefined })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </div>

        <div className="cp-task__status">
          <span className="nr-label">Статус</span>
          <StatusPicker size="sm" value={head.status} onChange={(s) => setStatus(unit, s)} label="Статус задачи" />
        </div>

        {noteOpen ? (
          <label className="cp-field">
            <span className="nr-label">Заметка</span>
            <textarea
              className="nr-field"
              rows={4}
              value={note}
              autoFocus={!head.note}
              placeholder="Сценарий, ссылки, что учесть"
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== (head.note ?? '') && update({ note: note || undefined })}
            />
          </label>
        ) : (
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm cp-task__add" onClick={() => setNoteOpen(true)}>
            <Icon name="plus" size={14} /> Заметка
          </button>
        )}
      </div>
      <div className="cp-sheet__foot">
        <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => openItem(head.id)}>
          Открыть материал
        </button>
      </div>
    </aside>
  )
}
