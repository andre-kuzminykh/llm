import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { addDays, fromMin, mondayOf, SAT, shortDate, toMin, today, WEEKDAYS, weekday } from '../model/dates'
import { shownTitle, type ISODate, type Item, type Plan } from '../model/types'
import { platformTypes, type Unit } from '../model/units'
import { grab, IconButton, Seg, UnitCard, useDrop } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'
import { useInfinite } from '../ui/infinite'
import { DateJump, TopBar } from '../ui/TopBar'

type Mode = 'time' | 'channels' | 'platforms'

interface Lane {
  id: string
  label: string
  color?: string
  channelId?: string
  sectionId?: string
  match: (it: Item) => boolean
}

/** Дорожки по каналам; у Dataist — по разделам и форматам, чтобы не было одной огромной строки. */
export function channelLanes(plan: Plan, hidden: string[]): Lane[] {
  const out: Lane[] = []
  for (const c of plan.channels) {
    if (hidden.includes(c.id)) continue
    if (!c.sections.length) {
      out.push({ id: c.id, label: c.name, color: c.color, channelId: c.id, match: (it) => it.channelId === c.id })
      continue
    }
    const inSection = (it: Item) => !!it.sectionId && c.sections.some((s) => s.id === it.sectionId)
    out.push({ id: `${c.id}:full`, label: `${c.name} · FULL`, color: c.color, channelId: c.id, match: (it) => it.channelId === c.id && it.format === 'FULL' })
    out.push({ id: `${c.id}:shorts`, label: `${c.name} · Shorts`, color: c.color, channelId: c.id, match: (it) => it.channelId === c.id && it.format === 'Shorts' })
    for (const s of c.sections) {
      out.push({ id: `${c.id}:${s.id}`, label: s.name, color: c.color, channelId: c.id, sectionId: s.id, match: (it) => it.channelId === c.id && it.sectionId === s.id })
    }
    out.push({
      id: `${c.id}:text`,
      label: `${c.name} · тексты и письма`,
      color: c.color,
      channelId: c.id,
      match: (it) => it.channelId === c.id && it.format !== 'FULL' && it.format !== 'Shorts' && !inSection(it),
    })
  }
  return out
}

const readMode = (): Mode => {
  try {
    const m = localStorage.getItem('cp:week-mode')
    return m === 'channels' || m === 'platforms' ? m : 'time'
  } catch {
    return 'time'
  }
}

/** Запомнить вид недели: «Время», «Каналы» или «Площадки». */
export const writeWeekMode = (m: Mode) => {
  try {
    localStorage.setItem('cp:week-mode', m)
  } catch {
    /* только на эту сессию */
  }
}

/** Вид календаря: неделя по времени, дорожками по каналам или площадкам — или месяц (на телефоне — лента по дням). */
export type CalendarMode = Mode | 'month'

/** Переключатель вида календаря — в шапке и недели, и месяца. На телефоне — меню «Вид», чтобы шапка была в одну строку. */
export function CalendarSwitch({ value, onChange }: { value: CalendarMode; onChange: (m: CalendarMode) => void }) {
  const { phone } = usePlan()
  const modes: { id: CalendarMode; label: string }[] = [
    { id: 'time', label: 'Время' },
    { id: 'channels', label: 'Каналы' },
    { id: 'platforms', label: 'Площадки' },
    { id: 'month', label: phone ? 'Лента' : 'Месяц' },
  ]
  const [open, setOpen] = useState(false)
  if (!phone) return <Seg value={value} onChange={onChange} label="Вид календаря" options={modes} />
  return (
    <span className="cp-pop">
      <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        Вид
      </button>
      {open && (
        <span className="cp-pop__menu nr-glass" role="menu" aria-label="Вид календаря">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              role="menuitemradio"
              aria-checked={value === m.id}
              className="cp-menu__item"
              onClick={() => {
                onChange(m.id)
                setOpen(false)
              }}
            >
              {m.label}
              {value === m.id && <Icon name="check" size={14} />}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

const HOUR = 64 // px на час
const DUR = 60 // сколько минут карточка занимает на шкале
const HEAD = 52 // высота шапки дней
const GUT = 56 // колонка часов

/** Календарь по неделям — вид по умолчанию: дни листаются вбок без конца. «Время» — по часам, совпадающие стоят рядом, как в Google Календаре;
 *  «Каналы» и «Площадки» — дорожками, как в исходной таблице. */
export function WeekView() {
  const { plan, anchor, setAnchor, jump, jumpTo, filters, phone, unitsOn, goto } = usePlan()
  const [mode, setModeState] = useState<Mode>(readMode)
  const setMode = (m: Mode) => {
    setModeState(m)
    writeWeekMode(m)
  }
  const gutter = mode === 'time' ? GUT : phone ? 96 : 132
  // неделя целиком по ширине экрана: колонка дня — седьмая часть (на телефоне — два дня)
  const [width, setWidth] = useState(1200)
  const perScreen = phone ? 2 : 7
  const col = Math.max(120, Math.floor((width - gutter) / perScreen))
  // неделя открывается с понедельника; «Сегодня» и стрелки — тоже к понедельнику
  const weekJump = useMemo(() => ({ date: mondayOf(jump.date), n: jump.n }), [jump])
  // шкала времени открывается за полчаса до первого материала недели, дорожки — сверху
  const crossRef = useRef<(d: ISODate) => number | undefined>(() => undefined)
  crossRef.current = (d: ISODate) => {
    if (mode !== 'time') return 0
    const from = mondayOf(d)
    let first: number | null = null
    for (let k = 0; k < 7; k++) for (const u of unitsOn(addDays(from, k))) if (!u.stream) first = Math.min(first ?? 24 * 60, toMin(u.time))
    // за полчаса до часа первого материала: подпись этого часа видна целиком
    return Math.max(0, (Math.floor((first ?? 8 * 60) / 60) - 0.5) * HOUR)
  }
  const cross = useCallback((d: ISODate) => crossRef.current(d), [])
  const inf = useInfinite({ axis: 'x', step: 1, size: col, start: plan.start, end: plan.end, anchor: mondayOf(anchor), jump: weekJump, onFocus: setAnchor, overscan: 4, cross })
  const shownDays = Math.max(1, Math.floor(((inf.view.len || width) - gutter) / col))
  const firstDay = inf.dateAt(Math.round(inf.view.pos / col))
  const lastDay = addDays(firstDay, shownDays - 1)
  // «9–15 ноя 2026»; через границу месяца — «30 ноя – 6 дек 2026»; на телефоне без года
  const year = phone ? '' : ` ${lastDay.slice(0, 4)}`
  const title = firstDay.slice(0, 7) === lastDay.slice(0, 7)
    ? `${Number(firstDay.slice(8))}–${shortDate(lastDay)}${year}`
    : `${shortDate(firstDay)} – ${shortDate(lastDay)}${year}`
  const days: { date: ISODate; i: number }[] = []
  for (let i = inf.first; i <= inf.last; i++) days.push({ date: inf.dateAt(i), i })

  useLayoutEffect(() => {
    const el = inf.ref.current
    if (!el) return
    if (el.clientWidth) setWidth(el.clientWidth)
    if (typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver(() => el.clientWidth && setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [inf.ref])
  // ширина колонки поменялась — остаться на том же дне: он считается по старой ширине, пока лента не сдвинулась
  const lastCol = useRef(col)
  useLayoutEffect(() => {
    const old = lastCol.current
    if (old === col) return
    lastCol.current = col
    const el = inf.ref.current
    inf.scrollTo(el ? inf.dateAt(Math.round(el.scrollLeft / old)) : mondayOf(anchor), false)
  }, [col]) // eslint-disable-line react-hooks/exhaustive-deps
  // смена вида: шкала — к первому часу недели, дорожки — наверх (при переходе к дате это делает сама лента)
  useEffect(() => {
    const el = inf.ref.current
    if (el) el.scrollTop = crossRef.current(mondayOf(anchor)) ?? 0
  }, [mode, inf.ref]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <TopBar title={<DateJump label={title} value={anchor} onPick={jumpTo} />}>
        <nav className="cp-top__nav" aria-label="Недели">
          <IconButton icon="chev-left" label="Предыдущая неделя" onClick={() => jumpTo(addDays(firstDay, -7))} />
          {!phone && (
            <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => jumpTo(today())}>
              Сегодня
            </button>
          )}
          <IconButton icon="chev-right" label="Следующая неделя" onClick={() => jumpTo(addDays(firstDay, 7))} />
        </nav>
        <CalendarSwitch value={mode} onChange={(m) => (m === 'month' ? goto('month') : setMode(m))} />
      </TopBar>
      <div className="cp-body nr-scroll" ref={inf.ref} onScroll={inf.onScroll}>
        {mode === 'time' ? (
          <TimeGrid days={days} count={inf.range.count} col={col} />
        ) : (
          <LaneGrid days={days} count={inf.range.count} col={col} gutter={gutter} mode={mode} hidden={filters.hiddenChannels} shown={[firstDay, lastDay]} />
        )}
      </div>
    </>
  )
}

function DayHead({ date }: { date: ISODate }) {
  const { violByDate, openDay } = usePlan()
  const viol = violByDate.get(date)?.length ?? 0
  return (
    <>
      <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm cp-week__daybtn" onClick={() => openDay(date)} aria-label={`Открыть день ${date}`}>
        <span className="cp-week__wd">{WEEKDAYS[weekday(date)]}</span>
        <span className={`cp-week__date${date === today() ? ' cp-week__date--today' : ''}`}>{shortDate(date)}</span>
      </button>
      {viol > 0 && <span className="cp-viol" title={`Нарушений: ${viol}`} />}
    </>
  )
}

// ── по времени ───────────────────────────────────────────────────────────────

/** Раскладка как в Google Календаре: пересекающиеся по времени карточки делят ширину поровну. */
export function layoutDay(units: Unit[]) {
  const items = units.map((u) => ({ u, start: toMin(u.time), end: toMin(u.time) + DUR, lane: 0, lanes: 1, cluster: 0 }))
  let cluster: typeof items = []
  let clusterEnd = -1
  let n = 0
  const flush = () => {
    n++
    const ends: number[] = []
    for (const it of cluster) {
      let lane = ends.findIndex((e) => e <= it.start)
      if (lane < 0) lane = ends.length
      ends[lane] = it.end
      it.lane = lane
    }
    for (const it of cluster) {
      it.lanes = ends.length
      it.cluster = n
    }
    cluster = []
  }
  for (const it of items) {
    if (it.start >= clusterEnd && cluster.length) flush()
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.end)
  }
  flush()
  return items
}

/** Если совпавшие по времени не помещаются рядом (уже ~140 px), видна первая карточка, а остальные — «+N» на ней. */
export function stackDay(units: Unit[], maxLanes: number) {
  const placed = layoutDay(units).map((it) => ({ ...it, more: [] as Unit[] }))
  const out: typeof placed = []
  for (const c of new Set(placed.map((it) => it.cluster))) {
    const group = placed.filter((it) => it.cluster === c)
    if (group[0].lanes <= maxLanes) {
      out.push(...group)
      continue
    }
    const shown = group.filter((it) => it.lane === 0)
    for (const it of group) {
      if (it.lane === 0) continue
      const host = [...shown].reverse().find((s) => s.start <= it.start) ?? shown[0]
      host.more.push(it.u)
    }
    out.push(...shown.map((s) => ({ ...s, lanes: 1 })))
  }
  return out
}

const STREAM_ROW = 26 // строка потока над шкалой

function TimeGrid({ days, count, col }: { days: { date: ISODate; i: number }[]; count: number; col: number }) {
  const { unitsOn } = usePlan()
  const width = GUT + count * col
  // поток 24/7 (лента Neuronium) — как событие на весь день: строкой над шкалой часов
  const streams = new Map(days.map(({ date }) => [date, unitsOn(date).filter((u) => u.stream)]))
  const rows = Math.max(0, ...[...streams.values()].map((l) => l.length))
  const head = HEAD + (rows ? rows * STREAM_ROW + 4 : 0)
  return (
    <div className="cp-tg" role="grid" aria-label="Неделя по времени" style={{ width, height: head + 24 * HOUR, '--cp-hour': `${HOUR}px` } as CSSProperties}>
      <div className="cp-tg__head" style={{ width, height: head }} role="row">
        <div className="cp-tg__corner">{rows > 0 && <span className="cp-tg__alllabel" title="Круглосуточно: приходит по вебхуку и выходит сразу">24/7</span>}</div>
        {days.map(({ date, i }) => (
          <div key={date} className={`cp-tg__day${weekday(date) === SAT ? ' cp-tg__day--rest' : ''}`} role="columnheader" style={{ left: GUT + i * col, width: col }}>
            <div className="cp-tg__dayhead">
              <DayHead date={date} />
            </div>
            {rows > 0 && (
              <div className="cp-tg__allday" aria-label={`Круглосуточно, ${date}`}>
                {streams.get(date)!.map((u) => (
                  <UnitCard key={u.key} unit={u} variant="chip" />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="cp-tg__body" style={{ height: 24 * HOUR }}>
        <div className="cp-tg__hours" aria-hidden="true">
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} style={{ top: h * HOUR }}>{h ? `${String(h).padStart(2, '0')}:00` : ''}</span>
          ))}
        </div>
        {days.map(({ date, i }) => (
          <TimeColumn key={date} date={date} left={GUT + i * col} width={col} />
        ))}
      </div>
    </div>
  )
}

function TimeColumn({ date, left, width }: { date: ISODate; left: number; width: number }) {
  const { unitsOn, dropOn, openNew, openDay } = usePlan()
  const at = (clientY: number, el: HTMLElement, offset = 0) => {
    const y = clientY - el.getBoundingClientRect().top - offset
    return fromMin(Math.round((y / HOUR) * 4) * 15)
  }
  const drop = useDrop((d, e) => dropOn(date, d, at(e.clientY, e.currentTarget as HTMLElement, d.kind === 'item' ? grab.y : 0)))
  const placed = stackDay(unitsOn(date).filter((u) => !u.stream), Math.max(1, Math.floor((width - 10) / 140)))
  const now = date === today() ? new Date() : null
  return (
    <div
      className={`cp-tg__col${weekday(date) === SAT ? ' cp-tg__col--rest' : ''}${drop.over ? ' cp-tg__col--drop' : ''}`}
      role="gridcell"
      aria-label={date}
      data-date={date}
      style={{ left, width }}
      {...drop.props}
      onDoubleClick={(e) => {
        if (e.target !== e.currentTarget) return
        openNew({ date, time: at(e.clientY, e.currentTarget) })
      }}
    >
      {now && <span className="cp-tg__now" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR }} aria-hidden="true" />}
      {placed.map(({ u, start, lane, lanes, more }) => {
        const w = (width - 10) / lanes
        return (
          <UnitCard
            key={u.key}
            unit={u}
            variant="compact"
            narrow={w < 120}
            style={{ position: 'absolute', top: (start / 60) * HOUR + 1, left: 4 + lane * w, width: w - 2, height: (DUR / 60) * HOUR - 3 }}
          >
            {more.length > 0 && (
              <button
                type="button"
                className="cp-more"
                aria-label={`Ещё ${more.length} в это время: ${more.map((m) => shownTitle(m.head)).join(', ')}`}
                title={more.map((m) => `${m.time} ${shownTitle(m.head)}`).join('\n')}
                onClick={(e) => {
                  e.stopPropagation()
                  openDay(date)
                }}
              >
                +{more.length}
              </button>
            )}
          </UnitCard>
        )
      })}
    </div>
  )
}

// ── дорожками ────────────────────────────────────────────────────────────────

function LaneGrid({ days, count, col, gutter, mode, hidden, shown: [from, to] }: { days: { date: ISODate; i: number }[]; count: number; col: number; gutter: number; mode: Mode; hidden: string[]; shown: [ISODate, ISODate] }) {
  const { plan, filters, unitsOn, rules } = usePlan()
  const [closed, setClosed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('cp:week-closed') ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const toggle = (id: string) => {
    const next = closed.includes(id) ? closed.filter((x) => x !== id) : [...closed, id]
    setClosed(next)
    try {
      localStorage.setItem('cp:week-closed', JSON.stringify(next))
    } catch {
      /* до перезагрузки */
    }
  }
  const lanes: Lane[] =
    mode === 'channels'
      ? channelLanes(plan, hidden)
      : plan.platforms.filter((p) => !filters.hiddenPlatforms.includes(p)).map((p) => ({ id: p, label: p, match: (it) => it.platforms.includes(p) }))
  // по каналам карточка стоит в дорожке своего главного материала (FULL — в «FULL», тизер внутри неё);
  // по площадкам — строкой на каждой площадке, где она выходит, с тем, что там выходит
  const cells = lanes.map((lane) => ({
    lane,
    days: days.map(({ date }) => ({
      date,
      rows: unitsOn(date).flatMap((u) => {
        if (mode === 'channels') return lane.match(u.head) ? [{ u }] : []
        if (!u.items.some(lane.match)) return []
        const p = platformTypes(u, rules, plan.platforms).find((x) => x.platform === lane.id)
        return [{ u, kind: p?.parts.map((x) => x.type).join(', ') }]
      }),
    })),
  }))
  // дорожки и числа — по дням на экране: пустые дорожки не показываются
  const onScreen = (d: { date: ISODate }) => d.date >= from && d.date <= to
  const shown = cells.filter((c) => c.days.some((d) => onScreen(d) && d.rows.length))
  const first = days[0]?.i ?? 0
  const cols = `${gutter}px ${first * col}px repeat(${days.length}, ${col}px) ${Math.max(0, count - first - days.length) * col}px`
  return (
    <div className="cp-week" role="grid" aria-label={`Неделя по ${mode === 'channels' ? 'каналам' : 'площадкам'}`} style={{ gridTemplateColumns: cols }}>
      <div className="cp-week__corner" />
      <div aria-hidden="true" className="cp-week__pad" />
      {days.map(({ date }) => (
        <div key={date} className="cp-week__day" role="columnheader">
          <DayHead date={date} />
        </div>
      ))}
      <div aria-hidden="true" className="cp-week__pad" />
      {shown.map(({ lane, days: row }) => {
        const open = !closed.includes(lane.id)
        const n = row.reduce((k, d) => k + (onScreen(d) ? d.rows.length : 0), 0)
        return (
          <Fragment key={lane.id}>
            <div className="cp-lane" role="rowheader" style={{ '--cp-c': lane.color } as CSSProperties}>
              <button type="button" className="cp-lane__btn cp-fold" aria-expanded={open} aria-label={`${open ? 'Свернуть' : 'Развернуть'}: ${lane.label}`} onClick={() => toggle(lane.id)}>
                <Icon name="chev-right" size={14} />
                <span className="cp-lane__name">{lane.label}</span>
                <span className="cp-muted">{n}</span>
              </button>
            </div>
            <div aria-hidden="true" />
            {row.map(({ date, rows }) => (
              <LaneCell key={date} lane={lane} date={date} rows={rows} open={open} />
            ))}
            <div aria-hidden="true" />
          </Fragment>
        )
      })}
      {shown.length === 0 && <p className="cp-empty" style={{ gridColumn: '1 / -1' }}>На этой неделе ничего нет — или всё скрыто фильтрами.</p>}
    </div>
  )
}

function LaneCell({ lane, date, rows, open }: { lane: Lane; date: ISODate; rows: { u: Unit; kind?: string }[]; open: boolean }) {
  const { dropOn, openNew } = usePlan()
  const drop = useDrop((d) => dropOn(date, d))
  const cls = ['cp-cell', !open && 'cp-cell--closed', weekday(date) === SAT && 'cp-cell--rest', drop.over && 'cp-cell--drop'].filter(Boolean).join(' ')
  return (
    <div className={cls} role="gridcell" {...drop.props} data-date={date} data-lane={lane.id}>
      {open ? rows.map(({ u, kind }) => <UnitCard key={u.key} unit={u} variant="line" kind={kind} />) : rows.length > 0 && <span className="cp-cell__n">{rows.length}</span>}
      {open && lane.channelId && (
        <button
          type="button"
          className="nr-btn nr-btn--ghost nr-btn--sm nr-btn--icon cp-cell__add"
          aria-label={`Новый материал: ${lane.label}, ${date}`}
          title="Новый материал"
          onClick={() => openNew({ date, channelId: lane.channelId, sectionId: lane.sectionId })}
        >
          <Icon name="plus" size={16} />
        </button>
      )}
    </div>
  )
}
