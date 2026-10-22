import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { dayTitle, shortDate } from '../model/dates'
import { isSlot, statusOf, timeOf, titleIsFormat, type Item } from '../model/types'
import { dueOf, leadOf, taskParts, unitsOf, type Unit } from '../model/units'
import { IconButton, PlatformIcon, RubricChip, StatusPicker } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'

/** Задача по созданию контента: что сделать на каждой площадке, к какому дню, кто делает.
 *  Открывается по ▶. Правки сохраняются сразу, каждая — шаг истории. */
export function TaskSheet({ id, onClose, onBack }: { id: string; onClose: () => void; onBack?: () => void }) {
  const { plan, byDate, dispatch, rules, rubrics, channels, openItem, setStatus, toast } = usePlan()
  const head = plan.items.find((x) => x.id === id)
  const [title, setTitle] = useState(head && !isSlot(head) ? head.title : '')
  const [owner, setOwner] = useState(head?.owner ?? '')
  const [note, setNote] = useState(head?.note ?? '')
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
    { key: head.id, head, items: [head], channelId: head.channelId, date: head.date, time: timeOf(head, rules.get(head.ruleId)) }
  const rule = rules.get(head.ruleId)
  const rubric = rubrics.get(head.rubricId ?? '')
  const channel = channels.get(unit.channelId)
  const format = rule && rule.name !== rubric?.name && !titleIsFormat(head.title, rule) ? rule.name : ''
  const parts = taskParts(unit, rules, plan.platforms)
  const done = new Set(unit.head.done ?? [])
  const allDone = parts.length > 0 && parts.every((p) => done.has(p.key))
  const due = dueOf(head, rule)
  const st = statusOf(head.status)

  const update = (patch: Partial<Item>) => dispatch({ type: 'update', id: head.id, patch })
  const toggle = (key: string) => update({ done: done.has(key) ? [...done].filter((k) => k !== key) : [...done, key] })
  const commitTitle = () => {
    const t = title.trim()
    if (t && t !== head.title) update({ title: t, source: head.source === 'нужна тема' ? 'вручную' : head.source })
    if (!t && !isSlot(head)) setTitle(head.title)
  }

  return (
    <aside className="cp-sheet cp-task" aria-label="Задача" style={{ '--cp-c': channel?.color } as CSSProperties}>
      <div className="cp-sheet__head">
        {onBack && <IconButton icon="chev-left" label="Назад к дню" onClick={onBack} size="sm" />}
        <h2 className="cp-sheet__title">Задача · {st.label.toLowerCase()}</h2>
        <IconButton icon="close" label="Закрыть" onClick={onClose} />
      </div>
      <div className="cp-sheet__body nr-scroll">
        <div className="cp-task__what">
          <span className="cp-card__rub">
            {rubric && <RubricChip name={rubric.name} />}
            {format && <span className="cp-card__fmt">{format}</span>}
            <span className="cp-ch" style={{ marginLeft: 'auto' }}>
              <span className="nr-dot" style={{ background: channel?.color }} aria-hidden="true" />
              {channel?.name}
            </span>
          </span>
          <label className="cp-field">
            <span className="nr-label">Тема</span>
            <input
              className="nr-field cp-task__title"
              value={title}
              placeholder={isSlot(head) ? 'Нужна тема — впишите или возьмите из банка' : ''}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
        </div>

        <div className="cp-field">
          <span className="nr-label">Статус</span>
          <StatusPicker value={head.status} onChange={(s) => setStatus(unit, s)} label="Статус задачи" />
        </div>

        <div className="cp-field">
          <span className="nr-label">Что сделать · {done.size ? `${parts.filter((p) => done.has(p.key)).length} из ${parts.length}` : parts.length}</span>
          <div className="cp-task__parts">
            {parts.map((p) => (
              <label key={p.key} className={`cp-task__part${done.has(p.key) ? ' cp-task__part--done' : ''}`}>
                <input type="checkbox" checked={done.has(p.key)} onChange={() => toggle(p.key)} />
                <span className="cp-check-row__box" aria-hidden="true">
                  <Icon name="check" size={12} />
                </span>
                <PlatformIcon platform={p.platform} />
                <span>
                  <b>{p.platform}</b> — {p.type}
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

        <div className="cp-field__row">
          <label className="cp-field">
            <span className="nr-label">Выход · перенести на</span>
            <input
              className="nr-field"
              type="date"
              value={head.date ?? ''}
              onChange={(e) => {
                if (!e.target.value || !head.date) return
                dispatch({ type: 'move', id: head.id, date: e.target.value })
                toast(`Перенесено на ${shortDate(e.target.value)}${head.group ? ' вместе с группой' : ''}`, true)
              }}
            />
          </label>
          <label className="cp-field">
            <span className="nr-label">Время</span>
            <input
              className="nr-field"
              type="time"
              step={900}
              value={unit.time}
              onChange={(e) => e.target.value && head.date && dispatch({ type: 'move', id: head.id, date: head.date, time: e.target.value })}
            />
          </label>
        </div>
        {head.date && <span className="cp-hint">{dayTitle(head.date)}, {unit.time}</span>}

        <div className="cp-field__row">
          <label className="cp-field">
            <span className="nr-label">Подготовить к</span>
            <input className="nr-field" type="date" value={due ?? ''} onChange={(e) => update({ due: e.target.value || undefined })} />
          </label>
          <label className="cp-field">
            <span className="nr-label">Кто делает</span>
            <input className="nr-field" value={owner} placeholder="Имя" onChange={(e) => setOwner(e.target.value)} onBlur={() => owner.trim() !== (head.owner ?? '') && update({ owner: owner.trim() || undefined })} />
          </label>
        </div>
        {!head.due && <span className="cp-hint">По умолчанию — за {leadOf(rule)} дн. до выхода{rule?.full ? ': FULL снимают заранее' : ''}.</span>}

        <label className="cp-field">
          <span className="nr-label">Заметка</span>
          <textarea className="nr-field" rows={4} value={note} placeholder="Сценарий, ссылки, что учесть" onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (head.note ?? '') && update({ note: note || undefined })} />
        </label>
      </div>
      <div className="cp-sheet__foot">
        <button type="button" className="nr-btn nr-btn--ghost" onClick={() => openItem(head.id)}>
          <Icon name="list" size={16} />
          Открыть материал
        </button>
        <span className="cp-top__spacer" />
        <button type="button" className="nr-btn nr-btn--primary" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </aside>
  )
}
