import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import {
  applyPan, blockGeometry, gestureEnd, layoutBlocks, minutesFromMidnight, minutesToClock, nowLine, resizeEnd, shiftAnchor, snapMin, type Geometry,
} from '../model/calendar'
import { addDays, daysBetween, mondayOf, SAT, shortDate, toMin, today, WEEKDAYS, weekday } from '../model/dates'
import { whereText } from '../model/hint'
import { FORMAT_SHORT, FULL_VIDEO, SHORT_VIDEO, shownTitle, tagOf, type ISODate, type Item, type Plan } from '../model/types'
import { platformTypes, type Unit } from '../model/units'
import { IconButton, UnitCard, useDrop } from '../ui/bits'
import { usePlan, type Mode } from '../ui/ctx'
import { autoScroll, hintBox, HOLD_MS, SLOP, swallowClick } from '../ui/drag'
import { Icon } from '../ui/Icon'
import { useInfinite } from '../ui/infinite'
import { DateJump, TopBar } from '../ui/TopBar'

interface Lane {
  id: string
  label: string
  color?: string
  channelId?: string
  sectionId?: string
  match: (it: Item) => boolean
}

/** Дорожки по каналам; у канала с разделами — по разделам и форматам, чтобы не было одной огромной строки. */
export function channelLanes(plan: Plan, hidden: string[]): Lane[] {
  const out: Lane[] = []
  for (const c of plan.channels) {
    if (hidden.includes(c.id)) continue
    if (!c.sections.length) {
      out.push({ id: c.id, label: c.name, color: c.color, channelId: c.id, match: (it) => it.channelId === c.id })
      continue
    }
    const inSection = (it: Item) => !!it.sectionId && c.sections.some((s) => s.id === it.sectionId)
    const video = (it: Item) => it.format === FULL_VIDEO || it.format === SHORT_VIDEO
    out.push({ id: `${c.id}:full`, label: `${c.name} · ${FORMAT_SHORT[FULL_VIDEO].toLowerCase()}`, color: c.color, channelId: c.id, match: (it) => it.channelId === c.id && it.format === FULL_VIDEO })
    out.push({ id: `${c.id}:shorts`, label: `${c.name} · ${FORMAT_SHORT[SHORT_VIDEO].toLowerCase()}`, color: c.color, channelId: c.id, match: (it) => it.channelId === c.id && it.format === SHORT_VIDEO })
    // раздел назван полностью («Лаборатория Датаиста») — канал в подписи не повторяется
    for (const s of c.sections) {
      out.push({ id: `${c.id}:${s.id}`, label: s.web, color: s.color ?? c.color, channelId: c.id, sectionId: s.id, match: (it) => it.channelId === c.id && it.sectionId === s.id })
    }
    out.push({
      id: `${c.id}:text`,
      label: `${c.name} · тексты и письма`,
      color: c.color,
      channelId: c.id,
      match: (it) => it.channelId === c.id && !video(it) && !inSection(it),
    })
  }
  return out
}

const HOUR = 64 // px на час
const PPM = HOUR / 60 // px на минуту
const HEAD = 52 // высота шапки дней
const GUT = 56 // колонка часов
/** Карточку взяли на шкале времени: переносят (move) или тянут за нижний край (resize). */
interface Gesture {
  unit: Unit
  date: ISODate // откуда
  mode: 'move' | 'resize'
  topMin: number
  heightMin: number
  id: number // pointerId
  touch: boolean
  x0: number
  y0: number
  top0: number // прокрутка по вертикали при нажатии
  x: number
  y: number
  hold: number // пальцем — таймер удержания
  live: boolean // жест начался: мышь сдвинулась, палец удержан
  ids: string[] // что едет: карточка или все выбранные, если взяли выбранную
  cancelled?: boolean // Esc: карточка вернулась, отпущенная кнопка — не щелчок
}

/** Что видно, пока карточку ведут: куда она встанет — день и начало (или конец, если тянут край), по 15 минут. */
export interface TimeDrag {
  key: string
  date: ISODate
  mode: 'move' | 'resize'
  to: ISODate
  min: number
  ids: string[] // выбранные едут вместе: на столько же дней и минут
  dDays: number
  dMin: number
}

/** Календарь SMM — неделя: дни листаются вбок без конца. «Время» — шкала часов, как календарь в nr_management:
 *  карточку берут и ставят на другой день и час, тянут за нижний край, пустой лист тянут рукой.
 *  «Каналы», «Площадки», «Темы» — дорожками, как в исходной таблице. Вид выбирается в панели слева. */
export function WeekView() {
  const { plan, anchor, setAnchor, jump, jumpTo, filters, phone, unitsOn, dropOn, dispatch, toast, mode: m, selected, toggleSelect, moveMany, hint } = usePlan()
  const mode = m as Exclude<Mode, 'feed'>
  const gutter = mode === 'time' ? GUT : phone ? 96 : 132
  // неделя целиком по ширине экрана: колонка дня — седьмая часть (на телефоне — два дня)
  const [width, setWidth] = useState(1200)
  const col = Math.max(120, Math.floor((width - gutter) / (phone ? 2 : 7)))
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

  // ── жесты шкалы времени (как в nr_management): взять карточку, растянуть, тянуть лист ──
  const gesture = useRef<Gesture | null>(null)
  const pan = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null)
  const [drag, setDrag] = useState<TimeDrag | null>(null)
  const aimed = useRef<TimeDrag | null>(null) // то же, что drag, но без ожидания отрисовки
  const raf = useRef(0)
  const tip = useRef<ReturnType<typeof hintBox> | null>(null) // подсказка словами у указателя
  const dateOf = (id: string) => plan.items.find((x) => x.id === id)?.date

  /** Куда встанет карточка: день — колонка под курсором, время — сдвиг по вертикали с привязкой к 15 минутам. */
  const aim = () => {
    const g = gesture.current
    const el = inf.ref.current
    if (!g?.live || g.cancelled || !el) return
    const dy = g.y - g.y0 + (el.scrollTop - g.top0)
    let next: TimeDrag
    if (g.mode === 'resize') {
      const min = minutesFromMidnight(resizeEnd(g.unit.time, g.topMin + g.heightMin + dy / PPM))
      next = { key: g.unit.key, date: g.date, mode: 'resize', to: g.date, min, ids: g.ids, dDays: 0, dMin: 0 }
    } else {
      const cx = g.x - el.getBoundingClientRect().left + el.scrollLeft - GUT
      const to = inf.dateAt(Math.floor(cx / col))
      const min = snapMin(g.topMin + dy / PPM)
      next = { key: g.unit.key, date: g.date, mode: 'move', to, min, ids: g.ids, dDays: daysBetween(g.date, to), dMin: min - g.topMin }
    }
    const d = aimed.current
    if (d && d.key === next.key && d.to === next.to && d.min === next.min && d.mode === next.mode) return
    aimed.current = next
    setDrag(next)
    // подсказка словами: куда, что едет вместе, что отметит проверка
    if (next.mode === 'resize') tip.current?.show([{ text: `${g.unit.time}–${minutesToClock(next.min)}` }])
    else {
      const many = next.ids.length > 1
      const moves = many ? next.ids.map((id) => ({ id, date: addDays(dateOf(id) ?? next.to, next.dDays) })) : [{ id: g.unit.head.id, date: next.to }]
      tip.current?.show([{ text: whereText(next.to, many ? undefined : minutesToClock(next.min), next.ids.length, next.dDays, next.dMin) }, ...hint(moves)])
    }
    tip.current?.place(g.x, g.y)
  }
  const goLive = () => {
    const g = gesture.current
    if (!g || g.live) return
    g.live = true
    if (g.touch) navigator.vibrate?.(8)
    document.body.classList.add('cp-grabbing')
    tip.current = hintBox()
    aim()
    const loop = () => {
      const el = inf.ref.current
      const cur = gesture.current
      if (el && cur?.live && autoScroll(el, cur.x, cur.y)) aim()
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
  }
  /** Взять карточку (move) или её нижний край (resize). */
  const grab = (e: ReactPointerEvent<HTMLElement>, unit: Unit, date: ISODate, kind: 'move' | 'resize', g: Geometry) => {
    if (e.button !== 0 || e.isPrimary === false || gesture.current) return
    if ((e.target as HTMLElement).closest('.cp-task-btn')) return // у ▶ — своя работа
    e.stopPropagation() // и лист не тянется, и край не берёт карточку целиком (текст не выделяется — user-select в CSS)
    const touch = e.pointerType === 'touch'
    const el = inf.ref.current
    gesture.current = {
      unit, date, mode: kind, ...g, id: e.pointerId, touch,
      x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, top0: el?.scrollTop ?? 0,
      hold: touch ? window.setTimeout(goLive, HOLD_MS) : 0,
      live: false,
      // взяли выбранную — едут все выбранные
      ids: kind === 'move' && selected.has(unit.head.id) && selected.size > 1 ? [...selected] : [unit.head.id],
    }
    if (kind === 'resize' && !touch) goLive() // мышью край берут нарочно — сразу; пальцем — тоже удержанием
  }
  /** Пустой лист берут рукой и тянут в обе стороны; мышью — в любом виде, пальцем — на шкале времени. */
  const beginPan = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || gesture.current) return
    if (e.pointerType !== 'mouse' && mode !== 'time') return // дорожки на телефоне листаются сами
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [data-unit]')) return
    pan.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (g && e.pointerId === g.id) {
      if (g.cancelled) return
      g.x = e.clientX
      g.y = e.clientY
      if (g.live) {
        tip.current?.place(g.x, g.y)
        return aim()
      }
      if (Math.hypot(g.x - g.x0, g.y - g.y0) <= SLOP * (g.touch ? 2 : 1)) return
      if (!g.touch) return goLive()
      // палец поехал раньше, чем взял карточку, — это лист
      clearTimeout(g.hold)
      gesture.current = null
      pan.current = { x: g.x0, y: g.y0, id: g.id, moved: false }
    }
    const p = pan.current
    const el = inf.ref.current
    if (!p || !el || e.pointerId !== p.id) return
    if (!p.moved) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) <= SLOP) return
      p.moved = true
      document.body.classList.add('cp-grabbing')
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* синтетические события */
      }
    }
    const next = applyPan({ left: el.scrollLeft, top: el.scrollTop }, e.clientX - p.x, e.clientY - p.y)
    el.scrollLeft = next.left
    el.scrollTop = next.top
    p.x = e.clientX
    p.y = e.clientY
  }
  /** Конец жеста — палец подняли или он ушёл с листа: правило gestureEnd решает, что записать. */
  const endGesture = (e: ReactPointerEvent<HTMLDivElement>, keep = true) => {
    const g = gesture.current
    if (g && e.pointerId !== g.id) return
    const decision = gestureEnd({ dragging: !!g?.live, panning: !!pan.current })
    if (decision === 'none' && !g) return
    if (g) clearTimeout(g.hold)
    cancelAnimationFrame(raf.current)
    document.body.classList.remove('cp-grabbing')
    gesture.current = null
    const panned = pan.current?.moved
    pan.current = null
    const d = aimed.current
    aimed.current = null
    setDrag(null)
    tip.current?.remove()
    tip.current = null
    if (panned || g?.cancelled) swallowClick() // лист тянули или перенос отменили — отпущенная кнопка мыши не щелчок
    if (decision !== 'commit-drag' || !g || !d) return
    swallowClick()
    // пальцем подержали и отпустили на месте — это выбор карточки, а не перенос
    if (g.touch && g.mode === 'move' && Math.hypot(g.x - g.x0, g.y - g.y0) <= SLOP * 2) return toggleSelect(g.unit.head.id)
    if (keep) commit(g, d)
  }
  const commit = (g: Gesture, d: TimeDrag) => {
    const { head } = g.unit
    if (d.mode === 'resize') {
      const end = minutesToClock(d.min)
      if (end === minutesToClock(g.topMin + g.heightMin)) return
      dispatch({ type: 'update', id: head.id, patch: { end } })
      toast(`${shownTitle(head)}: ${g.unit.time}–${end}`, true)
      return
    }
    if (d.to === g.date && d.min === g.topMin) return
    if (d.ids.length > 1) return moveMany(d.ids, d.dDays, d.dMin)
    dropOn(d.to, { kind: 'item', id: head.id }, minutesToClock(d.min))
  }
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current)
      tip.current?.remove()
    },
    [],
  )
  // Esc, пока карточку ведут, — отмена: она возвращается на место
  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    const onKey = (e: KeyboardEvent) => {
      const g = gesture.current
      if (e.key !== 'Escape' || !g) return
      e.stopPropagation()
      g.cancelled = true
      aimed.current = null
      setDrag(null)
      tip.current?.remove()
      tip.current = null
      cancelAnimationFrame(raf.current)
      document.body.classList.remove('cp-grabbing')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [dragging])
  const timeMode = mode === 'time'

  return (
    <>
      <TopBar title={<DateJump label={title} value={anchor} onPick={jumpTo} />}>
        <nav className="cp-top__nav" aria-label="Недели">
          <IconButton icon="chev-left" label="Предыдущая неделя" onClick={() => jumpTo(shiftAnchor(firstDay, 'week', -1))} />
          {!phone && (
            <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => jumpTo(today())}>
              Сегодня
            </button>
          )}
          <IconButton icon="chev-right" label="Следующая неделя" onClick={() => jumpTo(shiftAnchor(firstDay, 'week', 1))} />
        </nav>
      </TopBar>
      <div
        className={`cp-body nr-scroll cp-sheet-grab${timeMode ? ' cp-sheet-grab--time' : ''}`}
        ref={inf.ref}
        onScroll={() => {
          inf.onScroll()
          if (gesture.current?.live) aim()
        }}
        onPointerDown={beginPan}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerLeave={endGesture}
        onPointerCancel={(e) => endGesture(e, false)}
      >
        {timeMode ? (
          <TimeGrid days={days} count={inf.range.count} col={col} drag={drag} grab={grab} />
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
      {viol > 0 && <span className="cp-viol" title={`Нарушений: ${viol}`} aria-label={`Нарушений: ${viol}`} role="img" />}
    </>
  )
}

// ── по времени ───────────────────────────────────────────────────────────────

const STREAM_ROW = 26 // строка потока над шкалой

type Grab = (e: ReactPointerEvent<HTMLElement>, unit: Unit, date: ISODate, mode: 'move' | 'resize', g: Geometry) => void

function TimeGrid({ days, count, col, drag, grab }: { days: { date: ISODate; i: number }[]; count: number; col: number; drag: TimeDrag | null; grab: Grab }) {
  const { unitsOn } = usePlan()
  // линия «сейчас» сдвигается раз в минуту
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  const clock = { date: today(), minutes: now.getHours() * 60 + now.getMinutes() }
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
          <div key={date} className={`cp-tg__day${weekday(date) === SAT ? ' cp-tg__day--rest' : ''}`} role="columnheader" style={{ left: GUT + i * col, width: col }} data-drop={date}>
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
          <TimeColumn key={date} date={date} left={GUT + i * col} width={col} now={nowLine(date, clock)} drag={drag} grab={grab} />
        ))}
      </div>
    </div>
  )
}

function TimeColumn({ date, left, width, now, drag, grab }: { date: ISODate; left: number; width: number; now: { show: boolean; topMin: number }; drag: TimeDrag | null; grab: Grab }) {
  const { unitsOn, dropOn, openNew } = usePlan()
  const at = (clientY: number, el: HTMLElement) => minutesToClock(snapMin(((clientY - el.getBoundingClientRect().top) / HOUR) * 60))
  // тему из банка тянут на час
  const drop = useDrop((d, e) => dropOn(date, d, at(e.clientY, e.currentTarget as HTMLElement)))
  // пересекающиеся по времени — рядом, по колонкам; все видны
  const placed = layoutBlocks(
    unitsOn(date).filter((u) => !u.stream),
    (u) => blockGeometry(u.time, u.end),
  )
  const inner = width - 8
  return (
    <div
      className={`cp-tg__col${weekday(date) === SAT ? ' cp-tg__col--rest' : ''}${drop.over ? ' cp-tg__col--drop' : ''}`}
      role="gridcell"
      aria-label={date}
      data-date={date}
      data-drop={date}
      data-hour={HOUR}
      style={{ left, width }}
      {...drop.props}
      onDoubleClick={(e) => {
        if (e.target !== e.currentTarget) return
        openNew({ date, time: at(e.clientY, e.currentTarget) })
      }}
    >
      {now.show && <span className="cp-tg__now" style={{ top: now.topMin * PPM }} aria-hidden="true" />}
      {placed.map(({ item: u, topMin, heightMin, col, cols }) => {
        const w = inner / cols
        const g = { topMin, heightMin }
        // ведут эту карточку — или другую выбранную, а эта едет вместе с ней
        const lifted = drag && ((drag.key === u.key && drag.date === date) || (drag.mode === 'move' && drag.ids.length > 1 && drag.ids.includes(u.head.id))) ? drag : null
        const end = lifted?.mode === 'resize' ? lifted.min : topMin + heightMin
        const moving = lifted?.mode === 'move' ? lifted : null
        const box = { top: topMin * PPM + 1, left: 4 + col * w, width: w - 2, height: Math.max(18, heightMin * PPM - 2) }
        // карточку ведут — она стоит там, куда встанет (колонка и 15 минут), а на старом месте — пунктир
        const ghost: CSSProperties = moving ? { transform: `translate(${moving.dDays * width}px, ${moving.dMin * PPM}px)` } : {}
        return (
          <Fragment key={u.key}>
            {moving && <span className="cp-tg__origin" style={box} aria-hidden="true" />}
            <UnitCard
              unit={u}
              variant="compact"
              narrow={w < 110}
              className={lifted ? 'cp-card--lifted' : undefined}
              when={lifted ? (moving ? minutesToClock(Math.max(0, Math.min(topMin + moving.dMin, 1425))) : `${u.time}–${minutesToClock(end)}`) : undefined}
              style={{ position: 'absolute', ...box, height: Math.max(18, (end - topMin) * PPM - 2), ...ghost }}
              onGrab={(e) => grab(e, u, date, 'move', g)}
            >
              <span className="cp-tg__grip" aria-hidden="true" title="Потянуть — изменить длительность" onPointerDown={(e) => grab(e, u, date, 'resize', g)} />
            </UnitCard>
          </Fragment>
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
      : mode === 'topics'
        ? plan.rubrics.filter((r) => !filters.hiddenRubrics.includes(r.id)).map((r) => ({ id: r.id, label: tagOf(r.name), match: (it: Item) => it.rubricId === r.id }))
        : plan.platforms.filter((p) => !filters.hiddenPlatforms.includes(p)).map((p) => ({ id: p, label: p, match: (it: Item) => it.platforms.includes(p) }))
  // по каналам карточка стоит в дорожке своего главного материала (FULL — в «FULL», тизер внутри неё);
  // по площадкам — строкой на каждой площадке, где она выходит, с тем, что там выходит
  const cells = lanes.map((lane) => ({
    lane,
    days: days.map(({ date }) => ({
      date,
      rows: unitsOn(date).flatMap((u) => {
        if (mode !== 'platforms') return lane.match(u.head) ? [{ u }] : []
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
    <div className="cp-week" role="grid" aria-label={`Неделя по ${mode === 'channels' ? 'каналам' : mode === 'topics' ? 'темам' : 'площадкам'}`} style={{ gridTemplateColumns: cols }}>
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
    <div className={cls} role="gridcell" {...drop.props} data-date={date} data-drop={date} data-lane={lane.id}>
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
