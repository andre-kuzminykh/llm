import { useMemo, useState, type CSSProperties } from 'react'
import { addDays, dayTitle, mondayOf, shortDate, today, WEEKDAYS } from '../model/dates'
import { AUTO_RULES } from '../model/filters'
import { planningEnd, planningSlots } from '../model/planning'
import { newId, setPeriod } from '../model/store'
import { isSlot, shownTitle, tagOf, titleIsFormat, type ISODate, type Rubric, type Rule, type Status } from '../model/types'
import { daysLeft, dueOf, timeText, type Unit } from '../model/units'
import { IconButton, mainChannelId, PickText, RubricChip, StatusFilter } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'
import { TagInput } from '../ui/TagInput'

const AHEAD = 14 // на сколько дней вперёд смотреть
const BACK = 14 // и сколько назад — за просроченным

interface Row {
  unit: Unit
  due: ISODate
}

const FILTER: Status[] = ['progress', 'paused', 'ready']

/** «9–15 ноя»; через границу месяца — «30 ноя – 6 дек». */
const weekRange = (monday: ISODate) => {
  const sun = addDays(monday, 6)
  return monday.slice(0, 7) === sun.slice(0, 7) ? `${Number(monday.slice(8))}–${shortDate(sun)}` : `${shortDate(monday)} – ${shortDate(sun)}`
}

/** Дашборд SMM — панелью справа, календарь остаётся под ним: за неделю — просьба уточнить темы, сводка,
 *  что делать сейчас и темы-хэштеги по каналам с периодичностью. */
export function DashboardSheet({ onClose }: { onClose: () => void }) {
  const { filters, setFilters } = usePlan()
  return (
    <aside className="cp-sheet cp-sheet--dash" aria-label="Дашборд">
      <div className="cp-sheet__head">
        <h2 className="cp-sheet__title">Дашборд</h2>
        <IconButton icon="close" label="Закрыть" onClick={onClose} />
      </div>
      <div className="cp-sheet__body nr-scroll cp-dash">
        <PlanningAsk />
        <Stats />
        <section className="cp-panel" aria-labelledby="todo-h">
          <div className="cp-panel__head">
            <h2 className="cp-panel__title" id="todo-h">Что делать</h2>
            <StatusFilter value={filters.statuses} onChange={(statuses) => setFilters({ ...filters, statuses })} options={FILTER} />
          </div>
          <TodoList />
        </section>
        <TopicsPanel />
      </div>
    </aside>
  )
}

/** За неделю до неё — просьба уточнить темы пустых слотов (их ставит периодичность хэштегов). */
function PlanningAsk() {
  const { plan, openPlanning } = usePlan()
  const t = today()
  const slots = useMemo(() => planningSlots(plan, t), [plan, t])
  if (!slots.length) return null
  const next = addDays(mondayOf(t), 7)
  return (
    <section className="cp-ask" aria-label="Планирование недели">
      <span className="cp-ask__icon" aria-hidden="true"><Icon name="spark" size={18} /></span>
      <span className="cp-ask__text">
        <b>Неделя {weekRange(next)}: уточните темы</b>
        <span className="cp-muted">
          Без темы: {slots.length} до {shortDate(planningEnd(t))}. Подставим ближайшие черновики по хэштегу.
        </span>
      </span>
      <button type="button" className="nr-btn nr-btn--primary nr-btn--sm" onClick={openPlanning}>
        Уточнить
      </button>
    </section>
  )
}

/** Что подготовить в ближайшие две недели: сверху просроченное, дальше — по дням выхода. Авто-рубрики не показываются. */
function useTodo() {
  const { unitsOn, rules } = usePlan()
  const t = today()
  const rows: Row[] = []
  for (let d = addDays(t, -BACK); d <= addDays(t, AHEAD); d = addDays(d, 1)) {
    for (const u of unitsOn(d)) {
      if (AUTO_RULES.has(u.head.ruleId) || u.head.status === 'published') continue
      if (d < t && u.head.status === 'ready') continue
      rows.push({ unit: u, due: dueOf(u.head, rules.get(u.head.ruleId))! })
    }
  }
  return rows
}

function Stats() {
  const { plan } = usePlan()
  const rows = useTodo()
  const t = today()
  const late = rows.filter((r) => r.due < t && r.unit.head.status !== 'ready').length
  const week = rows.filter((r) => r.unit.date! >= t && r.unit.date! <= addDays(t, 6)).length
  const work = rows.filter((r) => r.unit.head.status === 'progress').length
  const ready = rows.filter((r) => r.unit.head.status === 'ready').length
  const slots = plan.items.filter((x) => x.date && x.date >= t && x.date <= addDays(t, 30) && !x.derive && isSlot(x)).length
  const cells: { n: number; label: string; late?: boolean }[] = [
    { n: late, label: 'просрочено', late: late > 0 },
    { n: week, label: 'выходит за 7 дней' },
    { n: work, label: 'в работе' },
    { n: ready, label: 'готово, ждёт выхода' },
    { n: slots, label: 'слотов без темы на месяц' },
  ]
  return (
    <dl className="cp-stats" aria-label="Сводка">
      {cells.map((c) => (
        <div key={c.label} className={`cp-stats__c${c.late ? ' cp-stats__c--late' : ''}`}>
          <dt>{c.label}</dt>
          <dd>{c.n}</dd>
        </div>
      ))}
    </dl>
  )
}

function TodoList() {
  const { filters } = usePlan()
  const rows = useTodo()
  const t = today()
  const late = rows.filter((r) => r.due < t && r.unit.head.status !== 'ready').sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
  const rest = rows.filter((r) => !late.includes(r))
  const byDay = new Map<ISODate, Row[]>()
  for (const r of rest) byDay.set(r.unit.date!, [...(byDay.get(r.unit.date!) ?? []), r])
  const dayName = (d: ISODate) => (d === t ? 'Сегодня' : d === addDays(t, 1) ? 'Завтра' : dayTitle(d).replace(/ \d{4}$/, ''))
  const sections: { id: string; title: string; rows: Row[] }[] = [
    { id: 'late', title: 'Просрочено', rows: late },
    ...[...byDay].sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, list]) => ({ id: d, title: dayName(d), rows: list })),
  ]
  if (!rows.length)
    return (
      <p className="cp-empty">
        На две недели вперёд ничего не ждёт работы{filters.statuses.length ? ' (или скрыто фильтром статуса)' : ''}.
      </p>
    )
  return (
    <div className="cp-now">
      {sections.map((s) =>
        s.rows.length ? (
          <section key={s.id} className={`cp-now__sec cp-now__sec--${s.id === 'late' ? 'late' : 'day'}`} aria-label={s.title}>
            <h3 className="cp-now__title">
              {s.title} <span className="cp-muted">{s.rows.length}</span>
            </h3>
            {s.rows.map((r) => (
              <TodoRow key={r.unit.key} row={r} late={s.id === 'late'} />
            ))}
          </section>
        ) : null,
      )}
    </div>
  )
}

function TodoRow({ row, late }: { row: Row; late: boolean }) {
  const { plan, channels, rubrics, rules, setStatus, openTask } = usePlan()
  const { unit, due } = row
  const { head } = unit
  const t = today()
  const left = daysLeft(due, t)
  const c = channels.get(unit.channelId)
  const rule = rules.get(head.ruleId)
  const rubric = rubrics.get(head.rubricId ?? '')
  const format = rule && rule.name !== rubric?.name && !titleIsFormat(head.title, rule) ? rule.name : ''
  const start = head.status === 'planned' || head.status === 'paused'
  const urgent = left <= 0 && head.status !== 'ready'
  const icon = head.status === 'paused' ? 'pause' : head.status === 'ready' ? 'check' : 'play'
  return (
    <div className={`cp-now__row${urgent ? ' cp-now__row--urgent' : ''}`} style={{ '--cp-c': c?.color } as CSSProperties}>
      <span className="cp-now__time">{late ? shortDate(unit.date!) : timeText(unit)}</span>
      <div className="cp-now__main">
        <span className="cp-card__rub">
          {rubric && <RubricChip name={rubric.name} />}
          {format && <span className="cp-card__fmt">{format}</span>}
          {unit.channelId !== mainChannelId(plan) && c && !format.includes(c.name) && <span className="cp-card__fmt">{c.name}</span>}
          {head.trigger && <span className="cp-auto" title="Версия для другой площадки: началась, когда вышел оригинал"><Icon name="bolt" size={11} /> авто</span>}
        </span>
        <button type="button" className={`cp-link cp-now__name${isSlot(head) ? ' cp-slot-text' : ''}`} onClick={() => openTask(head.id)}>
          {shownTitle(head)}
        </button>
      </div>
      <span className="cp-now__meta">
        {head.owner && <span className="cp-now__owner">{head.owner}</span>}
        <span className={`cp-now__due${left < 0 && head.status !== 'ready' ? ' cp-now__due--late' : left === 0 ? ' cp-now__due--today' : ''}`} title="Подготовить к">
          {head.status === 'ready' ? 'готово' : left < 0 ? `срок ${shortDate(due)}` : left === 0 ? 'готовить сегодня' : `к ${shortDate(due)}`}
        </span>
      </span>
      <button
        type="button"
        className={`cp-now__play cp-st--${head.status}${head.status === 'progress' || (urgent && start) ? ' cp-now__play--on' : ''}`}
        aria-label={`${start ? 'Начать' : 'Задача'}: ${shownTitle(head)}`}
        title={start ? 'Начать: откроется задача' : 'Открыть задачу'}
        onClick={() => (start ? setStatus(unit, 'progress') : openTask(head.id))}
      >
        <Icon name={icon} size={14} />
      </button>
    </div>
  )
}

/** Периодичность словами: «Пн, Чт 12:00», «ежедневно 11:00», «разово». */
export function periodText(rule: Rule) {
  const on = rule.days.map((v, i) => (v ? WEEKDAYS[i] : '')).filter(Boolean)
  const days = on.length === 7 ? 'ежедневно' : on.length ? on.join(', ') : ''
  if (!days) return 'разово'
  return rule.stream ? `${days}, 24/7` : `${days} ${rule.time}`
}

const slotsOf = (items: { ruleId: string; date: ISODate | null; derive?: string; title: string }[], ruleId: string, from: ISODate) =>
  items.filter((x) => x.ruleId === ruleId && x.date && x.date >= from && !x.derive && isSlot(x)).length

/** Периодичность формата хэштега в канале: дни недели кнопками и время. Новые дни ставят в расписание слоты без темы
 *  (до конца плана), снятые — убирают пустые слоты; материалы с темой остаются. */
function PeriodRow({ rule, tag }: { rule: Rule; tag: string }) {
  const { plan, dispatch, toast } = usePlan()
  const set = (days: boolean[], time?: string) => {
    const from = today()
    const next = setPeriod(plan, rule.id, days, time, from)
    const diff = slotsOf(next.items, rule.id, from) - slotsOf(plan.items, rule.id, from)
    dispatch({ type: 'setPeriod', ruleId: rule.id, days, time, from })
    toast(`${tag} · ${rule.name}: ${periodText({ ...rule, days, time: time ?? rule.time })}${diff ? ` · слотов без темы ${diff > 0 ? '+' : '−'}${Math.abs(diff)}` : ''}`, true)
  }
  return (
    <div className="cp-period" role="group" aria-label={`Периодичность: ${tag} · ${rule.name}`}>
      <span className="cp-period__fmt" title={rule.what || undefined}>{rule.name}</span>
      <span className="cp-period__days">
        {WEEKDAYS.map((w, i) => (
          <button
            key={w}
            type="button"
            className="cp-period__day"
            aria-pressed={rule.days[i]}
            aria-label={w}
            onClick={() => set(rule.days.map((v, k) => (k === i ? !v : v)))}
          >
            {w}
          </button>
        ))}
      </span>
      {rule.stream ? (
        <span className="cp-muted">24/7</span>
      ) : (
        <PickText type="time" label={`Время: ${tag} · ${rule.name}`} value={rule.time} text={rule.time} onChange={(v) => v && v !== rule.time && set(rule.days, v)} />
      )}
    </div>
  )
}

/** Хэштег в канал или раздел — с подсказками по уже заведённым; новый появится и в фильтрах. Периодичность — потом, днями. */
function AddTag({ channelId, sectionId, where, have }: { channelId: string; sectionId?: string; where: string; have: string[] }) {
  const { plan, dispatch, toast } = usePlan()
  return (
    <TagInput
      label={`Добавить хэштег: ${where}`}
      value=""
      placeholder={`+ хэштег в ${where}`}
      options={plan.rubrics.filter((r) => !have.includes(r.id))}
      onPick={(p) => {
        const rubricId = 'rubric' in p ? p.rubric.id : newId('k')
        const name = 'rubric' in p ? p.rubric.name : p.name
        dispatch({
          type: 'batch',
          actions: [
            ...('rubric' in p ? [] : [{ type: 'addRubric' as const, name, id: rubricId }]),
            { type: 'addRule', rubricId, channelId, sectionId, name: 'Пост', id: newId('r'), days: [false, false, false, false, false, false, false] },
          ],
        })
        toast(`${tagOf(name)} — в ${where}. Задайте дни: слоты встанут в расписание`, true)
      }}
    />
  )
}

const rulesOf = (rules: Rule[], channelId: string, sectionId: string | undefined, rubricId: string) =>
  rules.filter((r) => r.channelId === channelId && (r.sectionId ?? undefined) === sectionId && r.rubricId === rubricId && !AUTO_RULES.has(r.id))
const tagsOf = (plan: { rules: Rule[]; rubrics: Rubric[] }, channelId: string, sectionId?: string) => {
  const ids = new Set(plan.rules.filter((r) => r.channelId === channelId && (r.sectionId ?? undefined) === sectionId && r.rubricId).map((r) => r.rubricId!))
  return plan.rubrics.filter((r) => ids.has(r.id))
}

/** Хэштеги канала или раздела: кнопками (нажать — календарь только по ним) или, в «Править», с периодичностью. */
function TopicTags({ channelId, sectionId, where, edit, soon }: { channelId: string; sectionId?: string; where: string; edit: boolean; soon: Map<string, number> }) {
  const { plan, filters, setFilters, show, dispatch } = usePlan()
  const tags = tagsOf(plan, channelId, sectionId)
  const only = (r: Rubric) => {
    setFilters({ ...filters, hiddenRubrics: plan.rubrics.filter((x) => x.id !== r.id).map((x) => x.id) })
    show()
  }
  if (!edit)
    return (
      <span className="cp-tags">
        {tags.map((r) => {
          const period = rulesOf(plan.rules, channelId, sectionId, r.id).map((x) => `${x.name}: ${periodText(x)}`).join('\n')
          return (
            <button key={r.id} type="button" className="cp-tag" onClick={() => only(r)} title={`${r.what ? `${r.what}\n` : ''}${period}\nВ ближайший месяц: ${soon.get(r.id) ?? 0}. Нажмите — календарь только по этой теме`}>
              {tagOf(r.name)}
              {soon.get(r.id) ? <span className="cp-muted">{soon.get(r.id)}</span> : null}
            </button>
          )
        })}
      </span>
    )
  return (
    <div className="cp-tagedit__list">
      {tags.map((r) => (
        <div key={r.id} className="cp-tagedit">
          <input
            className="cp-tag-in"
            aria-label={`Хэштег ${tagOf(r.name)}`}
            defaultValue={r.name}
            size={Math.max(6, r.name.length + 1)}
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== r.name && dispatch({ type: 'rubric', id: r.id, patch: { name: e.target.value.trim().replace(/^#/, '') } })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <div className="cp-tagedit__rules">
            {rulesOf(plan.rules, channelId, sectionId, r.id).map((rule) => (
              <PeriodRow key={rule.id} rule={rule} tag={tagOf(r.name)} />
            ))}
          </div>
        </div>
      ))}
      <AddTag channelId={channelId} sectionId={sectionId} where={where} have={tags.map((r) => r.id)} />
    </div>
  )
}

/** Темы-хэштеги по каналам и их разделам (Лаборатория, Академия, Кабинет); нажали — календарь только по этой теме.
 *  «Править»: переименовать, задать периодичность (дни и время), добавить хэштег в канал. */
function TopicsPanel() {
  const { plan } = usePlan()
  const [edit, setEdit] = useState(false)
  const t = today()
  const soon = new Map<string, number>()
  for (const it of plan.items) if (it.rubricId && it.date && it.date >= t && it.date <= addDays(t, 30) && !it.derive) soon.set(it.rubricId, (soon.get(it.rubricId) ?? 0) + 1)
  return (
    <section className="cp-panel" aria-labelledby="topics-h">
      <div className="cp-panel__head">
        <h2 className="cp-panel__title" id="topics-h">Темы</h2>
        <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" aria-pressed={edit} onClick={() => setEdit(!edit)}>
          <Icon name="pencil" size={14} />
          {edit ? 'Готово' : 'Править'}
        </button>
      </div>
      {edit && <p className="cp-hint">Дни недели у хэштега — периодичность: слоты без темы встают в расписание, а за неделю дашборд попросит уточнить темы.</p>}
      <div className="cp-topics">
        {plan.channels.map((c) => {
          const own = tagsOf(plan, c.id)
          const parts = c.sections.filter((s) => edit || tagsOf(plan, c.id, s.id).length)
          if (!edit && !own.length && !parts.length) return null
          return (
            <div key={c.id} className="cp-topics__ch" style={{ '--cp-c': c.color } as CSSProperties} role="group" aria-label={`Темы: ${c.name}`}>
              <span className="cp-topics__name">{c.name}</span>
              {(own.length > 0 || edit) && <TopicTags channelId={c.id} where={c.name} edit={edit} soon={soon} />}
              {parts.map((s) => (
                <div key={s.id} className="cp-topics__sec" role="group" aria-label={`Темы: ${s.web}`}>
                  <span className="cp-topics__name cp-muted" title={s.name}>{s.web}</span>
                  <TopicTags channelId={c.id} sectionId={s.id} where={s.web} edit={edit} soon={soon} />
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}
