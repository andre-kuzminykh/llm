import { useState } from 'react'
import { addDays, clampDate, mondayOf, SAT, shortDate, today, WEEKDAYS, weekDays, weekday } from '../model/dates'
import { visible } from '../model/filters'
import { isSlot, type ISODate, type Item, type Plan } from '../model/types'
import { ChannelDot, IconButton, ItemCard, Seg, useDrop } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'
import { TopBar } from '../ui/TopBar'

type Mode = 'channels' | 'platforms'

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
    return localStorage.getItem('cp:week-mode') === 'platforms' ? 'platforms' : 'channels'
  } catch {
    return 'channels'
  }
}

export function WeekView() {
  const { plan, anchor, setAnchor, byDate, filters, violByDate, openDay } = usePlan()
  const [mode, setModeState] = useState<Mode>(readMode)
  const setMode = (m: Mode) => {
    setModeState(m)
    try {
      localStorage.setItem('cp:week-mode', m)
    } catch {
      /* только на эту сессию */
    }
  }
  const days = weekDays(anchor)
  const lanes: Lane[] =
    mode === 'channels'
      ? channelLanes(plan, filters.hiddenChannels)
      : plan.platforms.filter((p) => !filters.hiddenPlatforms.includes(p)).map((p) => ({ id: p, label: p, match: (it) => it.platforms.includes(p) }))
  const dayItems = new Map(days.map((d) => [d, (byDate.get(d) ?? []).filter((it) => visible(it, filters))]))
  const shown = lanes.filter((l) => mode === 'platforms' || l.sectionId === undefined || days.some((d) => dayItems.get(d)!.some(l.match)))
  const m = mondayOf(anchor)
  const title = `${shortDate(days[0])} – ${shortDate(days[6])} ${days[6].slice(0, 4)}`
  return (
    <>
      <TopBar title={title}>
        <nav className="cp-top__nav" aria-label="Недели">
          <IconButton icon="chev-left" label="Предыдущая неделя" onClick={() => setAnchor(addDays(m, -7))} disabled={addDays(m, -1) < plan.start} />
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => setAnchor(clampDate(today(), plan.start, plan.end))}>
            Сегодня
          </button>
          <IconButton icon="chev-right" label="Следующая неделя" onClick={() => setAnchor(addDays(m, 7))} disabled={addDays(m, 7) > plan.end} />
        </nav>
        <Seg value={mode} onChange={setMode} label="Дорожки" options={[{ id: 'channels', label: 'Каналы' }, { id: 'platforms', label: 'Площадки' }]} />
      </TopBar>
      <div className="cp-body nr-scroll">
        <div className="cp-week" role="grid" aria-label={`Неделя ${title}`}>
          <div className="cp-week__corner nr-label">{mode === 'channels' ? 'Канал' : 'Площадка'}</div>
          {days.map((d) => {
            const items = dayItems.get(d)!
            const slots = items.filter((it) => isSlot(it) && !it.derive).length
            const viol = violByDate.get(d)?.length ?? 0
            return (
              <div key={d} className="cp-week__day" role="columnheader">
                <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => openDay(d)} aria-label={`Открыть день ${d}`}>
                  <span className="nr-label">{WEEKDAYS[weekday(d)]}</span>
                  <span className="cp-week__date">{shortDate(d)}</span>
                </button>
                {weekday(d) === SAT && <span className="nr-tag nr-tag--rest">отдых</span>}
                {slots > 0 && <span className="nr-tag nr-tag--warn">{slots} без темы</span>}
                {viol > 0 && <span className="cp-viol" title={`Нарушений: ${viol}`} />}
              </div>
            )
          })}
          {shown.map((lane) => (
            <LaneRow key={lane.id} lane={lane} days={days} dayItems={dayItems} />
          ))}
        </div>
        {shown.length === 0 && <p className="cp-empty">Все каналы скрыты фильтром.</p>}
      </div>
    </>
  )
}

function LaneRow({ lane, days, dayItems }: { lane: Lane; days: ISODate[]; dayItems: Map<ISODate, Item[]> }) {
  return (
    <>
      <div className="cp-lane" role="rowheader">
        {lane.color && <ChannelDot color={lane.color} />}
        {lane.label}
      </div>
      {days.map((d) => (
        <LaneCell key={d} lane={lane} date={d} items={dayItems.get(d)!.filter(lane.match)} />
      ))}
    </>
  )
}

function LaneCell({ lane, date, items }: { lane: Lane; date: ISODate; items: Item[] }) {
  const { plan, dropOn, openNew } = usePlan()
  const drop = useDrop((d) => dropOn(date, d))
  const inPlan = date >= plan.start && date <= plan.end
  const cls = ['cp-cell', weekday(date) === SAT && 'cp-cell--rest', drop.over && 'cp-cell--drop'].filter(Boolean).join(' ')
  return (
    <div className={cls} role="gridcell" {...drop.props} data-date={date} data-lane={lane.id}>
      {items.map((it) => (
        <ItemCard key={it.id} item={it} />
      ))}
      {inPlan && lane.channelId && (
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
