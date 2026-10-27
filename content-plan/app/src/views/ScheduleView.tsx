// Программа в дашборде — что выпускаем: каналы, в них хэштеги, по каждому — темы материалов по порядку, справа дата
// и время («21 окт 10:00») и площадки значками. Общая тема — заголовком над несколькими материалами хэштега разных
// форматов: отметили строки — поставили. Период — неделя, месяц или всё. Не шкала времени. Учитывает фильтры слева.
import { useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { addDays, daysBetween, today } from '../model/dates'
import { plural } from '../model/hint'
import { dateText, daysText, entriesOf, scheduleOf, timesText, type SchedRow, type SchedTag } from '../model/schedule'
import { FORMAT_SHORT } from '../model/types'
import { IconButton, PlatformIcon, Seg, StatusIcon } from '../ui/bits'
import { usePlan } from '../ui/ctx'

type Span = '7' | '30' | 'all'
const SPANS: { id: Span; label: string }[] = [
  { id: '7', label: 'Неделя' },
  { id: '30', label: 'Месяц' },
  { id: 'all', label: 'Все' },
]
const FIRST = 10 // за всё время у хэштега сначала столько строк, дальше — «Показать ещё»

function readSpan(): Span {
  try {
    const v = localStorage.getItem('cp:sched-span')
    return SPANS.some((s) => s.id === v) ? (v as Span) : '7'
  } catch {
    return '7'
  }
}

const many = (n: number) => `${n} ${plural(n, 'материал', 'материала', 'материалов')}`
const clean = (s: string) => s.trim().replace(/\s+/g, ' ')

export function Schedule() {
  const { plan, filters, unitsOn, rules, rubrics, dispatch, toast } = usePlan()
  const [span, setSpan] = useState<Span>(readSpan)
  const [picked, setPicked] = useState<Map<string, string[]>>(new Map()) // строка → её материалы
  const [open, setOpen] = useState<Set<string>>(new Set()) // хэштеги, где показаны все строки
  const t = today()
  const n = span === 'all' ? Math.max(0, daysBetween(t, plan.end) + 1) : Number(span)
  // за всё время карточек тысячи: пересчёт — только когда меняется план, фильтры или период, не от галочек
  const groups = useMemo(
    () => scheduleOf(plan.channels, Array.from({ length: n }, (_, i) => addDays(t, i)).flatMap(unitsOn), rules, rubrics, plan.platforms),
    [plan, filters, n, t], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const known = useMemo(() => [...new Set(plan.items.map((x) => x.theme).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'ru')), [plan.items])

  const pick = (s: Span) => {
    setSpan(s)
    try {
      localStorage.setItem('cp:sched-span', s)
    } catch {
      /* период проживёт до перезагрузки */
    }
  }
  const toggle = (r: SchedRow) =>
    setPicked((m) => {
      const next = new Map(m)
      if (next.has(r.key)) next.delete(r.key)
      else next.set(r.key, r.ids)
      return next
    })
  /** Общая тема — всем материалам: одним шагом истории. Пусто — тема снимается. */
  const setTheme = (ids: string[], theme: string | undefined, msg: string) => {
    dispatch({ type: 'updateMany', ids, patch: { theme } })
    toast(msg, true)
  }
  const all = (theme: string) => plan.items.filter((x) => x.theme === theme).map((x) => x.id) // вся тема, не только за период
  const rowProps = (r: SchedRow): RowProps => ({ row: r, span: n, today: t, picked: picked.has(r.key), onToggle: () => toggle(r) })

  return (
    <div className="cp-sched">
      <div className="cp-sched__head">
        <Seg label="Период программы" value={span} options={SPANS} onChange={pick} />
        {n > 0 && (
          <span className="cp-muted">
            {dateText(t, t)} – {dateText(addDays(t, n - 1), t)}
          </span>
        )}
      </div>
      <p className="cp-hint">Отметьте строки — над ними можно поставить общую тему: у нескольких материалов разных форматов одна тема.</p>

      {!groups.length && <p className="cp-empty">На эти дни ничего нет — или всё скрыто фильтрами.</p>}
      {groups.map((g) => (
        <section key={g.id} className="cp-sched__ch" style={{ '--cp-c': g.color } as CSSProperties} aria-label={`Программа: ${g.name}`}>
          <h3 className="cp-sched__name">{g.name}</h3>
          {g.tags.map((tag) => (
            <TagBlock
              key={tag.id}
              group={g.name}
              tag={tag}
              limit={span === 'all' && !open.has(`${g.id}|${tag.id}`) ? FIRST : Infinity}
              onMore={() => setOpen((s) => new Set(s).add(`${g.id}|${tag.id}`))}
              rowProps={rowProps}
              onRename={(theme, name) => {
                if (name === theme) return
                setTheme(all(theme), name, known.includes(name) ? `Тема «${theme}» объединена с «${name}»` : `Тема переименована: «${name}»`)
              }}
              onRemove={(theme) => setTheme(all(theme), undefined, `Тема «${theme}» снята`)}
            />
          ))}
        </section>
      ))}

      {picked.size > 0 && (
        <PickBar
          count={picked.size}
          known={known}
          themed={[...picked.values()].flat().some((id) => plan.items.find((x) => x.id === id)?.theme)}
          onSet={(theme) => {
            setTheme([...picked.values()].flat(), theme, `Тема «${theme}»: ${many(picked.size)}`)
            setPicked(new Map())
          }}
          onClear={() => {
            setTheme([...picked.values()].flat(), undefined, `Тема снята: ${many(picked.size)}`)
            setPicked(new Map())
          }}
          onCancel={() => setPicked(new Map())}
        />
      )}
    </div>
  )
}

type RowProps = { row: SchedRow; span: number; today: string; picked: boolean; onToggle: () => void }

/** Хэштег: строки по порядку, общие темы — заголовком над своими строками. За всё время — сначала FIRST, дальше «Показать ещё». */
function TagBlock({ group, tag, limit, onMore, rowProps, onRename, onRemove }: {
  group: string
  tag: SchedTag
  limit: number
  onMore: () => void
  rowProps: (r: SchedRow) => RowProps
  onRename: (theme: string, name: string) => void
  onRemove: (theme: string) => void
}) {
  const entries = entriesOf(tag.rows)
  const shown = entries.slice(0, limit)
  return (
    <div className="cp-sched__tag" role="group" aria-label={`${group}: ${tag.tag}`}>
      <div className="cp-sched__tagname">
        {tag.tag}
        <span className="cp-side__count">{tag.rows.reduce((s, r) => s + r.days.length, 0)}</span>
      </div>
      <ol className="cp-sched__rows">
        {shown.map((e) =>
          'row' in e ? (
            <ScheduleRow key={e.row.key} {...rowProps(e.row)} />
          ) : (
            <li key={`theme:${e.theme}`} className="cp-sched__theme-li">
              <ThemeBlock theme={e.theme} count={e.rows.reduce((s, r) => s + r.days.length, 0)} onRename={(name) => onRename(e.theme, name)} onRemove={() => onRemove(e.theme)}>
                {e.rows.map((r) => (
                  <ScheduleRow key={r.key} {...rowProps(r)} />
                ))}
              </ThemeBlock>
            </li>
          ),
        )}
      </ol>
      {entries.length > shown.length && (
        <button type="button" className="cp-sched__more" onClick={onMore}>
          Показать ещё {entries.length - shown.length}
        </button>
      )}
    </div>
  )
}

/** Общая тема — заголовком над своими материалами: переименовать (в уже существующую — объединить) или снять. */
function ThemeBlock({ theme, count, onRename, onRemove, children }: { theme: string; count: number; onRename: (name: string) => void; onRemove: () => void; children: ReactNode }) {
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState(theme)
  return (
    <section className="cp-sched__theme-g" aria-label={`Тема: ${theme}`}>
      <div className="cp-sched__theme-head">
        {edit ? (
          <form
            className="cp-sched__rename"
            onSubmit={(e) => {
              e.preventDefault()
              const name = clean(v)
              if (name) onRename(name)
              setEdit(false)
            }}
          >
            <input
              className="nr-field nr-field--sm"
              aria-label={`Новое название темы «${theme}»`}
              value={v}
              autoFocus
              onChange={(e) => setV(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEdit(false))}
            />
            <button type="submit" className="nr-btn nr-btn--ghost nr-btn--sm">
              Готово
            </button>
          </form>
        ) : (
          <>
            <h4 className="cp-sched__theme-name">
              <span className="cp-sched__kind">Тема</span>
              {theme}
            </h4>
            <span className="cp-side__count">{count}</span>
            <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => (setV(theme), setEdit(true))}>
              Переименовать
            </button>
            <IconButton icon="close" size="sm" label={`Снять тему «${theme}»`} onClick={onRemove} />
          </>
        )}
      </div>
      <ol className="cp-sched__rows">{children}</ol>
    </section>
  )
}

/** Выбранные строки: общая тема — из уже заведённых (подсказкой) или новая. */
function PickBar({ count, known, themed, onSet, onClear, onCancel }: { count: number; known: string[]; themed: boolean; onSet: (t: string) => void; onClear: () => void; onCancel: () => void }) {
  const [v, setV] = useState('')
  const list = useId()
  return (
    <form
      className="cp-sched__bar"
      role="toolbar"
      aria-label="Выбранные строки"
      onSubmit={(e) => {
        e.preventDefault()
        if (clean(v)) onSet(clean(v))
      }}
    >
      <span className="cp-selbar__n">Выбрано: {count}</span>
      <input
        className="nr-field nr-field--sm cp-sched__bar-in"
        list={list}
        aria-label="Общая тема выбранных"
        placeholder="Общая тема: «ИИ-агенты в продажах»"
        value={v}
        autoFocus
        onChange={(e) => setV(e.target.value)}
      />
      <datalist id={list}>
        {known.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <button type="submit" className="nr-btn nr-btn--primary nr-btn--sm" disabled={!clean(v)}>
        Поставить тему
      </button>
      {themed && (
        <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={onClear}>
          Снять тему
        </button>
      )}
      <IconButton icon="close" size="sm" label="Снять выбор" onClick={onCancel} />
    </form>
  )
}

function ScheduleRow({ row, span, today: t, picked, onToggle }: RowProps) {
  const { openItem } = usePlan()
  // справа — «21 окт 10:00»; слитая строка — «каждый день 09:00»
  const when = row.days.length > 1 ? daysText(row.days, span, t) : dateText(row.date, t)
  const times = timesText(row.days, span)
  const label = `${when} ${row.time}: ${row.title}${times ? `, ${times}` : ''}`
  return (
    <li className={`cp-sched__item${picked ? ' cp-sched__item--picked' : ''}`}>
      <input type="checkbox" className="cp-sched__check" aria-label={`Выбрать: ${label}`} checked={picked} onChange={onToggle} />
      <button type="button" className="cp-sched__row" onClick={() => openItem(row.id)} aria-label={label} title={FORMAT_SHORT[row.format] ?? row.format}>
        <span className="cp-sched__main">
          <span className={`cp-sched__title${row.slot ? ' cp-sched__title--slot' : ''}`}>
            {row.title}
            {times && <span className="cp-sched__n"> · {times}</span>}
          </span>
        </span>
        <span className="cp-sched__when">
          {when} <span className="cp-sched__time">{row.time}</span>
        </span>
        <span className="cp-sched__plats" aria-label={`Площадки: ${row.platforms.join(', ')}`}>
          {row.platforms.map((p) => (
            <PlatformIcon key={p} platform={p} size={13} />
          ))}
        </span>
        <StatusIcon status={row.status} />
      </button>
    </li>
  )
}
