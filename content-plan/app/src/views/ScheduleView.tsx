// Программа в дашборде — что выпускаем. «Хэштеги»: каналы, в них хэштеги, по каждому — темы материалов, справа время,
// дата и площадки значками. «Темы»: общая тема над несколькими материалами разных форматов — что и когда по ней выходит.
// Не шкала времени. Отметили строки — над ними ставится общая тема. Учитывает фильтры слева.
import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { addDays, shortDate, today } from '../model/dates'
import { plural } from '../model/hint'
import { daysText, scheduleOf, themesOf, timesText, type SchedRow } from '../model/schedule'
import { FORMAT_SHORT } from '../model/types'
import type { Unit } from '../model/units'
import { IconButton, PlatformIcon, Seg, StatusIcon } from '../ui/bits'
import { usePlan } from '../ui/ctx'

type Span = '7' | '30'
const SPANS: { id: Span; label: string }[] = [
  { id: '7', label: 'Неделя' },
  { id: '30', label: 'Месяц' },
]
type By = 'tags' | 'themes'
const BYS: { id: By; label: string }[] = [
  { id: 'tags', label: 'Хэштеги' },
  { id: 'themes', label: 'Темы' },
]

function read<T extends string>(key: string, ok: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T
    return ok.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* выбор проживёт до перезагрузки */
  }
}

const many = (n: number) => `${n} ${plural(n, 'материал', 'материала', 'материалов')}`
const clean = (s: string) => s.trim().replace(/\s+/g, ' ')

export function Schedule() {
  const { plan, unitsOn, dispatch, toast } = usePlan()
  const [span, setSpan] = useState<Span>(() => read('cp:sched-span', ['7', '30'], '7'))
  const [by, setBy] = useState<By>(() => read('cp:sched-by', ['tags', 'themes'], 'tags'))
  const [picked, setPicked] = useState<Map<string, string[]>>(new Map()) // строка → её материалы
  const [none, setNone] = useState(false) // «Без темы» развёрнуто
  const t = today()
  const n = Number(span)
  const days = Array.from({ length: n }, (_, i) => addDays(t, i))
  const units = days.flatMap(unitsOn)
  const known = [...new Set(plan.items.map((x) => x.theme).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'ru'))

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
  const rowProps = (r: SchedRow, where: boolean) => ({ row: r, span: n, where, picked: picked.has(r.key), onToggle: () => toggle(r) })

  return (
    <div className="cp-sched">
      <div className="cp-sched__head">
        <Seg label="Программа" value={by} options={BYS} onChange={(v) => (setBy(v), write('cp:sched-by', v))} />
        <Seg label="Период программы" value={span} options={SPANS} onChange={(v) => (setSpan(v), write('cp:sched-span', v))} />
        <span className="cp-muted">
          {shortDate(days[0])} – {shortDate(days[n - 1])}
        </span>
      </div>
      <p className="cp-hint">Отметьте строки — над ними можно поставить общую тему: у нескольких материалов разных форматов одна тема.</p>

      {by === 'tags' ? (
        <ByTags units={units} rowProps={rowProps} />
      ) : (
        <ByThemes units={units} rowProps={rowProps} none={none} setNone={setNone} known={known} setTheme={setTheme} />
      )}

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

type RowProps = { row: SchedRow; span: number; where: boolean; picked: boolean; onToggle: () => void }

function ByTags({ units, rowProps }: { units: Unit[]; rowProps: (r: SchedRow, where: boolean) => RowProps }) {
  const { plan, rules, rubrics } = usePlan()
  const groups = scheduleOf(plan.channels, units, rules, rubrics, plan.platforms)
  if (!groups.length) return <p className="cp-empty">На эти дни ничего нет — или всё скрыто фильтрами.</p>
  return (
    <>
      {groups.map((g) => (
        <section key={g.id} className="cp-sched__ch" style={{ '--cp-c': g.color } as CSSProperties} aria-label={`Программа: ${g.name}`}>
          <h3 className="cp-sched__name">{g.name}</h3>
          {g.tags.map((tag) => (
            <div key={tag.id} className="cp-sched__tag" role="group" aria-label={`${g.name}: ${tag.tag}`}>
              <div className="cp-sched__tagname">
                {tag.tag}
                <span className="cp-side__count">{tag.rows.reduce((s, r) => s + r.days.length, 0)}</span>
              </div>
              <ol className="cp-sched__rows">
                {tag.rows.map((r) => (
                  <ScheduleRow key={r.key} {...rowProps(r, false)} />
                ))}
              </ol>
            </div>
          ))}
        </section>
      ))}
    </>
  )
}

function ByThemes({ units, rowProps, none, setNone, known, setTheme }: {
  units: Unit[]
  rowProps: (r: SchedRow, where: boolean) => RowProps
  none: boolean
  setNone: (v: boolean) => void
  known: string[]
  setTheme: (ids: string[], theme: string | undefined, msg: string) => void
}) {
  const { plan, rules, rubrics } = usePlan()
  const { themes, none: rest } = themesOf(plan.channels, units, rules, rubrics, plan.platforms)
  const all = (theme: string) => plan.items.filter((x) => x.theme === theme).map((x) => x.id) // вся тема, не только за период
  return (
    <>
      {!themes.length && <p className="cp-empty">Общих тем на эти дни нет: отметьте строки и поставьте тему.</p>}
      {themes.map((g) => (
        <ThemeBlock
          key={g.theme}
          theme={g.theme}
          count={g.rows.reduce((s, r) => s + r.days.length, 0)}
          onRename={(name) => {
            if (name === g.theme) return
            if (known.includes(name)) return setTheme(all(g.theme), name, `Тема «${g.theme}» объединена с «${name}»`)
            setTheme(all(g.theme), name, `Тема переименована: «${name}»`)
          }}
          onRemove={() => setTheme(all(g.theme), undefined, `Тема «${g.theme}» снята`)}
        >
          {g.rows.map((r) => (
            <ScheduleRow key={r.key} {...rowProps(r, true)} />
          ))}
        </ThemeBlock>
      ))}
      {rest.length > 0 && (
        <section className="cp-sched__none" aria-label="Без темы">
          <button type="button" className="cp-sched__more" aria-expanded={none} onClick={() => setNone(!none)}>
            Без темы <span className="cp-side__count">{rest.reduce((s, r) => s + r.days.length, 0)}</span>
          </button>
          {none && (
            <ol className="cp-sched__rows">
              {rest.map((r) => (
                <ScheduleRow key={r.key} {...rowProps(r, true)} />
              ))}
            </ol>
          )}
        </section>
      )}
    </>
  )
}

/** Тема — заголовком над своими материалами: переименовать (в уже существующую — объединить) или снять. */
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
            <input className="nr-field nr-field--sm" aria-label={`Новое название темы «${theme}»`} value={v} autoFocus onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEdit(false))} />
            <button type="submit" className="nr-btn nr-btn--ghost nr-btn--sm">Готово</button>
          </form>
        ) : (
          <>
            <h3 className="cp-sched__name">
              <span className="cp-sched__kind">Тема</span>
              {theme}
            </h3>
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

function ScheduleRow({ row, span, where, picked, onToggle }: RowProps) {
  const { openItem } = usePlan()
  // справа — «21 окт 10:00»; слитая строка — «каждый день 09:00»
  const when = row.days.length > 1 ? daysText(row.days, span) : shortDate(row.date)
  const times = timesText(row.days, span)
  const label = `${when} ${row.time}: ${row.title}${times ? `, ${times}` : ''}`
  const format = FORMAT_SHORT[row.format] ?? row.format
  return (
    <li className={`cp-sched__item${picked ? ' cp-sched__item--picked' : ''}`}>
      <input type="checkbox" className="cp-sched__check" aria-label={`Выбрать: ${label}`} checked={picked} onChange={onToggle} />
      <button type="button" className="cp-sched__row" onClick={() => openItem(row.id)} aria-label={label} title={format}>
        <span className="cp-sched__main">
          {where && (
            <span className="cp-sched__where">
              <span className="cp-sched__dot" style={{ background: row.color }} aria-hidden="true" />
              {row.channel} · {row.tag} · {format}
            </span>
          )}
          <span className={`cp-sched__title${row.slot ? ' cp-sched__title--slot' : ''}`}>
            {row.title}
            {times && <span className="cp-sched__n"> · {times}</span>}
          </span>
          {!where && row.theme && <span className="cp-sched__theme">Тема: {row.theme}</span>}
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
