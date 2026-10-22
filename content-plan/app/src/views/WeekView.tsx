import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { addDays, fromMin, mondayOf, SAT, shortDate, toMin, today, WEEKDAYS, weekday } from '../model/dates'
import { visible } from '../model/filters'
import type { ISODate, Item, Plan } from '../model/types'
import type { Unit } from '../model/units'
import { ChannelDot, grab, IconButton, Seg, UnitCard, useDrop } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'
import { useInfinite } from '../ui/infinite'
import { DateJump, TopBar } from '../ui/TopBar'
import { SlotsTag } from './MonthView'

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

const HOUR = 64 // px на час
const DUR = 60 // сколько минут карточка занимает на шкале
const HEAD = 52 // высота шапки дней
const GUT = 56 // колонка часов

/** Неделя: дни листаются вбок без конца. «Время» — по часам, совпадающие стоят рядом, как в Google Календаре;
 *  «Каналы» и «Площадки» — дорожками, как в исходной таблице. */
export function WeekView() {
  const { plan, anchor, setAnchor, jump, jumpTo, filters, phone } = usePlan()
  const [mode, setModeState] = useState<Mode>(readMode)
  const setMode = (m: Mode) => {
    setModeState(m)
    try {
      localStorage.setItem('cp:week-mode', m)
    } catch {
      /* только на эту сессию */
    }
  }
  const gutter = mode === 'time' ? GUT : phone ? 96 : 150
  // неделя целиком по ширине экрана: колонка дня — седьмая часть (на телефоне — два дня)
  const [width, setWidth] = useState(1200)
  const perScreen = phone ? 2 : 7
  const col = Math.max(120, Math.floor((width - gutter) / perScreen))
  // неделя открывается с понедельника; «Сегодня» и стрелки — тоже к понедельнику
  const weekJump = useMemo(() => ({ date: mondayOf(jump.date), n: jump.n }), [jump])
  const inf = useInfinite({ axis: 'x', step: 1, size: col, start: plan.start, end: plan.end, anchor: mondayOf(anchor), jump: weekJump, onFocus: setAnchor, overscan: 4 })
  const shownDays = Math.max(1, Math.floor(((inf.view.len || width) - gutter) / col))
  const firstDay = inf.dateAt(Math.round(inf.view.pos / col))
  const lastDay = addDays(firstDay, shownDays - 1)
  const title = `${shortDate(firstDay)} – ${shortDate(lastDay)} ${lastDay.slice(0, 4)}`
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
  // шкала времени открывается на утре, дорожки — сверху
  useEffect(() => {
    if (inf.ref.current) inf.ref.current.scrollTop = mode === 'time' ? 7 * HOUR : 0
  }, [mode, inf.ref])

  return (
    <>
      <TopBar title={<DateJump label={title} value={anchor} onPick={jumpTo} />}>
        <nav className="cp-top__nav" aria-label="Недели">
          <IconButton icon="chev-left" label="Предыдущая неделя" onClick={() => jumpTo(addDays(firstDay, -7))} />
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => jumpTo(today())}>
            Сегодня
          </button>
          <IconButton icon="chev-right" label="Следующая неделя" onClick={() => jumpTo(addDays(firstDay, 7))} />
        </nav>
        <Seg
          value={mode}
          onChange={setMode}
          label="Вид недели"
          options={[
            { id: 'time', label: 'Время' },
            { id: 'channels', label: 'Каналы' },
            { id: 'platforms', label: 'Площадки' },
          ]}
        />
      </TopBar>
      <div className="cp-body nr-scroll" ref={inf.ref} onScroll={inf.onScroll}>
        {mode === 'time' ? (
          <TimeGrid days={days} count={inf.range.count} col={col} />
        ) : (
          <LaneGrid days={days} count={inf.range.count} col={col} gutter={gutter} mode={mode} hidden={filters.hiddenChannels} />
        )}
      </div>
    </>
  )
}

function DayHead({ date }: { date: ISODate }) {
  const { unitsOn, violByDate, openDay } = usePlan()
  const units = unitsOn(date)
  const viol = violByDate.get(date)?.length ?? 0
  return (
    <>
      <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm cp-week__daybtn" onClick={() => openDay(date)} aria-label={`Открыть день ${date}`}>
        <span className="nr-label">{WEEKDAYS[weekday(date)]}</span>
        <span className={`cp-week__date${date === today() ? ' cp-week__date--today' : ''}`}>{shortDate(date)}</span>
      </button>
      {weekday(date) === SAT && <span className="nr-tag nr-tag--rest">отдых</span>}
      <SlotsTag units={units} />
      {viol > 0 && <span className="cp-viol" title={`Нарушений: ${viol}`} />}
    </>
  )
}

// ── по времени ───────────────────────────────────────────────────────────────

/** Раскладка как в Google Календаре: пересекающиеся по времени карточки делят ширину поровну. */
export function layoutDay(units: Unit[]) {
  const items = units.map((u) => ({ u, start: toMin(u.time), end: toMin(u.time) + DUR, lane: 0, lanes: 1 }))
  let cluster: typeof items = []
  let clusterEnd = -1
  const flush = () => {
    const ends: number[] = []
    for (const it of cluster) {
      let lane = ends.findIndex((e) => e <= it.start)
      if (lane < 0) lane = ends.length
      ends[lane] = it.end
      it.lane = lane
    }
    for (const it of cluster) it.lanes = ends.length
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

function TimeGrid({ days, count, col }: { days: { date: ISODate; i: number }[]; count: number; col: number }) {
  const width = GUT + count * col
  return (
    <div className="cp-tg" role="grid" aria-label="Неделя по времени" style={{ width, height: HEAD + 24 * HOUR, '--cp-hour': `${HOUR}px` } as CSSProperties}>
      <div className="cp-tg__head" style={{ width }} role="row">
        <div className="cp-tg__corner" />
        {days.map(({ date, i }) => (
          <div key={date} className={`cp-tg__day${weekday(date) === SAT ? ' cp-tg__day--rest' : ''}`} role="columnheader" style={{ left: GUT + i * col, width: col }}>
            <DayHead date={date} />
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
  const { unitsOn, dropOn, openNew } = usePlan()
  const at = (clientY: number, el: HTMLElement, offset = 0) => {
    const y = clientY - el.getBoundingClientRect().top - offset
    return fromMin(Math.round((y / HOUR) * 4) * 15)
  }
  const drop = useDrop((d, e) => dropOn(date, d, at(e.clientY, e.currentTarget as HTMLElement, d.kind === 'item' ? grab.y : 0)))
  const placed = layoutDay(unitsOn(date))
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
      {placed.map(({ u, start, lane, lanes }) => {
        const w = (width - 10) / lanes
        return (
          <UnitCard
            key={u.key}
            unit={u}
            variant="compact"
            narrow={w < 120}
            style={{ position: 'absolute', top: (start / 60) * HOUR + 1, left: 4 + lane * w, width: w - 2, height: (DUR / 60) * HOUR - 3 }}
          />
        )
      })}
    </div>
  )
}

// ── дорожками ────────────────────────────────────────────────────────────────

function LaneGrid({ days, count, col, gutter, mode, hidden }: { days: { date: ISODate; i: number }[]; count: number; col: number; gutter: number; mode: Mode; hidden: string[] }) {
  const { plan, byDate, filters } = usePlan()
  const lanes: Lane[] =
    mode === 'channels'
      ? channelLanes(plan, hidden)
      : plan.platforms.filter((p) => !filters.hiddenPlatforms.includes(p)).map((p) => ({ id: p, label: p, match: (it) => it.platforms.includes(p) }))
  const dayItems = new Map(days.map(({ date }) => [date, (byDate.get(date) ?? []).filter((it) => visible(it, filters))]))
  const shown = lanes.filter((l) => mode === 'platforms' || l.sectionId === undefined || days.some(({ date }) => dayItems.get(date)!.some(l.match)))
  const first = days[0]?.i ?? 0
  const cols = `${gutter}px ${first * col}px repeat(${days.length}, ${col}px) ${Math.max(0, count - first - days.length) * col}px`
  return (
    <div className="cp-week" role="grid" aria-label={`Неделя по ${mode === 'channels' ? 'каналам' : 'площадкам'}`} style={{ gridTemplateColumns: cols }}>
      <div className="cp-week__corner nr-label">{mode === 'channels' ? 'Канал' : 'Площадка'}</div>
      <div aria-hidden="true" className="cp-week__pad" />
      {days.map(({ date }) => (
        <div key={date} className="cp-week__day" role="columnheader">
          <DayHead date={date} />
        </div>
      ))}
      <div aria-hidden="true" className="cp-week__pad" />
      {shown.map((lane) => (
        <LaneRow key={lane.id} lane={lane} days={days} dayItems={dayItems} byHead={mode === 'channels'} />
      ))}
      {shown.length === 0 && <p className="cp-empty" style={{ gridColumn: '1 / -1' }}>Все каналы скрыты фильтром.</p>}
    </div>
  )
}

function LaneRow({ lane, days, dayItems, byHead }: { lane: Lane; days: { date: ISODate }[]; dayItems: Map<ISODate, Item[]>; byHead: boolean }) {
  return (
    <>
      <div className="cp-lane" role="rowheader">
        {lane.color && <ChannelDot color={lane.color} />}
        {lane.label}
      </div>
      <div aria-hidden="true" />
      {days.map(({ date }) => (
        <LaneCell key={date} lane={lane} date={date} items={dayItems.get(date)!.filter(lane.match)} byHead={byHead} />
      ))}
      <div aria-hidden="true" />
    </>
  )
}

function LaneCell({ lane, date, items, byHead }: { lane: Lane; date: ISODate; items: Item[]; byHead: boolean }) {
  const { unitsOn, dropOn, openNew } = usePlan()
  const drop = useDrop((d) => dropOn(date, d))
  const ids = new Set(items.map((it) => it.id))
  // по каналам карточка стоит в дорожке своего главного материала (FULL — в «FULL», тизер внутри неё);
  // по площадкам — на каждой площадке, где она выходит
  const units = unitsOn(date).filter((u) => (byHead ? ids.has(u.head.id) : u.items.some((it) => ids.has(it.id))))
  const cls = ['cp-cell', weekday(date) === SAT && 'cp-cell--rest', drop.over && 'cp-cell--drop'].filter(Boolean).join(' ')
  return (
    <div className={cls} role="gridcell" {...drop.props} data-date={date} data-lane={lane.id}>
      {units.map((u) => (
        <UnitCard key={u.key} unit={u} variant="compact" />
      ))}
      {lane.channelId && (
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
