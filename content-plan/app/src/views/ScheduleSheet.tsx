// Расписание — панелью справа: рубрики по каналам и категориям, в какие дни (и недели цикла I–IV) и во сколько выходят,
// как таблица владельца. Рубрика в расписании стоит навсегда, пока её не уберут: слоты «Нужна тема» в календаре ставятся
// сами, тему, заметку и файлы вписывают в слот. Здесь — добавить строку, поправить рубрику, дни, недели и время, убрать.
import { useState, type CSSProperties } from 'react'
import { today, WEEKDAYS } from '../model/dates'
import { newId } from '../model/store'
import { CYCLE, cycleWeek, scheduleLines, WEEK_NAMES, whenText } from '../model/schedule'
import { FORMAT_PLATFORMS, FORMAT_SHORT, type Channel, type Rule } from '../model/types'
import { IconButton } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'
import { TagInput, type TagPick } from '../ui/TagInput'

/** Что правим: строку расписания (правило) или новую — в канале и категории. */
type Editing = { rule: Rule; isNew: boolean } | null

export function ScheduleSheet({ onClose }: { onClose: () => void }) {
  const { plan, dispatch, toast } = usePlan()
  const [editing, setEditing] = useState<Editing>(null)
  const rubrics = new Map(plan.rubrics.map((r) => [r.id, r.name]))
  const lines = scheduleLines(plan)
  const now = today()
  const week = plan.cycleStart && now >= plan.cycleStart ? WEEK_NAMES[cycleWeek(plan, now) - 1] : null
  const blank = (channel: Channel, format: string): Rule => ({
    id: newId('r'),
    rubricId: null,
    name: FORMAT_SHORT[format] ?? format,
    channelId: channel.id,
    channel: channel.name,
    what: '',
    format,
    platforms: (FORMAT_PLATFORMS[format] ?? []).filter((p) => channel.platforms.includes(p) || p === 'Web' || p === 'Mail'),
    days: [true, true, true, true, true, false, false],
    dayNotes: ['', '', '', '', '', '', ''],
    freq: 'по расписанию',
    source: 'расписание',
    full: false,
    limit: 1,
    time: '10:00',
    types: {},
    stream: false,
    scheduled: true,
  })
  const remove = (r: Rule) => {
    dispatch({ type: 'unscheduleRule', id: r.id, today: now })
    toast(`«${rubrics.get(r.rubricId ?? '') ?? r.name}» ${r.time} убрана из расписания: пустые слоты с сегодня сняты`, true)
    setEditing(null)
  }
  return (
    <aside className="cp-sheet cp-sheet--wide" aria-label="Расписание">
      <div className="cp-sheet__head">
        <h2 className="nr-title cp-sheet__title">Расписание</h2>
        <IconButton icon="close" label="Закрыть" onClick={onClose} />
      </div>
      <div className="cp-sheet__body nr-scroll">
        <p className="cp-hint">
          Рубрики по каналам и категориям — когда и во сколько выходят. Слоты «Нужна тема» в календаре ставятся сами, навсегда, пока
          рубрику не уберёте; тему, заметку и фото вписываете в слот.
          {week && ` Сейчас — неделя ${week} цикла.`}
        </p>
        {lines.map(({ channel, categories }) => (
          <section key={channel.id} className="cp-sch" aria-label={channel.name}>
            <h3 className="cp-sch__ch" style={{ '--cp-c': channel.color } as CSSProperties}>
              <span className="cp-sch__dot" aria-hidden="true" />
              {channel.name}
            </h3>
            {categories.map((cat) => (
              <div key={cat.format} className="cp-sch__cat" role="group" aria-label={`${channel.name}: ${cat.label}`}>
                <div className="cp-sch__cathead">{cat.label}</div>
                <ul className="cp-sch__list">
                  {cat.rules.map((r) => (
                    <li key={r.id}>
                      {editing?.rule.id === r.id ? (
                        <LineEditor key={r.id} editing={editing} onCancel={() => setEditing(null)} onRemove={() => remove(r)} onDone={() => setEditing(null)} />
                      ) : (
                        <button type="button" className="cp-sch__line" onClick={() => setEditing({ rule: r, isNew: false })} aria-label={`${rubrics.get(r.rubricId ?? '') ?? '—'}, ${whenText(r)}, ${r.time} — поправить`}>
                          <span className="cp-sch__time">{r.time}</span>
                          <span className="cp-sch__rub">{rubrics.get(r.rubricId ?? '') ?? '—'}</span>
                          <span className="cp-sch__when">{whenText(r)}</span>
                          <Icon name="pencil" size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                  {editing?.isNew && editing.rule.channelId === channel.id && editing.rule.format === cat.format ? (
                    <li>
                      <LineEditor editing={editing} onCancel={() => setEditing(null)} onDone={() => setEditing(null)} />
                    </li>
                  ) : (
                    <li>
                      <button type="button" className="cp-sch__add" onClick={() => setEditing({ rule: blank(channel, cat.format), isNew: true })} aria-label={`Добавить рубрику: ${channel.name}, ${cat.label}`}>
                        <Icon name="plus" size={14} /> Добавить
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </section>
        ))}
        {!lines.length && <p className="cp-hint">Каналов пока нет — заведите канал в фильтрах слева или в форме нового контента.</p>}
      </div>
    </aside>
  )
}

/** Строка расписания в правке: рубрика (тег — из списка или новая), дни недели, недели цикла, время. */
function LineEditor({ editing, onCancel, onRemove, onDone }: { editing: NonNullable<Editing>; onCancel: () => void; onRemove?: () => void; onDone: () => void }) {
  const { plan, dispatch, toast } = usePlan()
  const [rule, setRule] = useState<Rule>(editing.rule)
  const [newTag, setNewTag] = useState('')
  const [error, setError] = useState('')
  const rubricName = newTag || plan.rubrics.find((r) => r.id === rule.rubricId)?.name || ''
  const weeks = rule.weeks?.length ? rule.weeks : [1, 2, 3, 4]
  const toggleDay = (i: number) => setRule({ ...rule, days: rule.days.map((x, j) => (j === i ? !x : x)) })
  const toggleWeek = (w: number) => {
    const next = weeks.includes(w) ? weeks.filter((x) => x !== w) : [...weeks, w].sort()
    setRule({ ...rule, weeks: next.length === CYCLE ? undefined : next })
  }
  const save = () => {
    if (!rubricName) return setError('Выберите рубрику или впишите новую')
    if (!rule.days.some(Boolean)) return setError('Отметьте хотя бы один день')
    if (rule.weeks && !rule.weeks.length) return setError('Отметьте хотя бы одну неделю')
    const actions = []
    let next = rule
    if (newTag) {
      const id = newId('k')
      actions.push({ type: 'addRubric' as const, name: newTag, id })
      next = { ...rule, rubricId: id }
    }
    actions.push({ type: 'scheduleRule' as const, rule: next, today: today() })
    dispatch(actions.length > 1 ? { type: 'batch', actions } : actions[0])
    toast(`Расписание: ${rubricName} — ${whenText(next)}, ${next.time}; слоты в календаре — с сегодня`, true)
    onDone()
  }
  return (
    <div className="cp-sch__edit" role="group" aria-label={editing.isNew ? 'Новая строка расписания' : `Строка расписания: ${rubricName}`}>
      <TagInput
        label="Рубрика"
        value={rubricName}
        options={plan.rubrics}
        onPick={(p: TagPick) => {
          if ('rubric' in p) {
            setNewTag('')
            setRule({ ...rule, rubricId: p.rubric.id })
          } else if ('name' in p) setNewTag(p.name)
          setError('')
        }}
      />
      <div className="cp-sch__days" role="group" aria-label="Дни недели">
        {WEEKDAYS.map((w, i) => (
          <button key={w} type="button" className="cp-repeat__day" aria-pressed={rule.days[i]} onClick={() => toggleDay(i)}>
            {w}
          </button>
        ))}
      </div>
      <div className="cp-sch__row">
        <div className="cp-sch__weeks" role="group" aria-label="Недели цикла" title="4-недельный цикл: неделя I началась 15 ноября">
          {WEEK_NAMES.map((n, i) => (
            <button key={n} type="button" className="cp-repeat__day" aria-pressed={weeks.includes(i + 1)} onClick={() => toggleWeek(i + 1)}>
              {n}
            </button>
          ))}
        </div>
        <label className="cp-sch__timefield">
          <span className="cp-muted">в</span>
          <input className="nr-field" type="time" aria-label="Время" value={rule.time} step={900} onChange={(e) => e.target.value && setRule({ ...rule, time: e.target.value })} />
        </label>
      </div>
      {error && <p className="cp-hint" role="alert" style={{ color: 'var(--nr-danger)' }}>{error}</p>}
      <div className="cp-sch__actions">
        {onRemove && (
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm cp-trash" onClick={onRemove}>
            Убрать из расписания
          </button>
        )}
        <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={onCancel}>
          Отмена
        </button>
        <button type="button" className="nr-btn nr-btn--primary nr-btn--sm" onClick={save}>
          {editing.isNew ? 'Добавить' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}
