// Расписание — план повествования: по каналам (разделы — как отдельные каналы), внутри — хэштеги,
// по каждому — что и когда выходит, по порядку. Не шкала времени: время — подписью у строки.
// Потоки 24/7 сюда не идут; одно и то же, что выходит много раз («Исследование дня»), — одной строкой с днями.
import { shortDate, WEEKDAYS, weekday } from './dates'
import { plural } from './hint'
import { colorOf, isSlot, shownTitle, tagOf, type Channel, type ISODate, type Rubric, type Rule, type Status } from './types'
import type { Unit } from './units'

export interface SchedRow {
  key: string
  id: string // что открыть по щелчку: материал (у слитой строки — ближайший)
  date: ISODate
  time: string
  title: string
  slot: boolean
  status: Status
  format: string
  days: ISODate[] // в какие дни выходит; больше одного — строка слита из повторов
}

export interface SchedTag {
  id: string
  tag: string // «#тезисы»; без хэштега — название формата
  rows: SchedRow[]
}

export interface SchedGroup {
  id: string
  name: string
  color?: string
  tags: SchedTag[]
}

/** Карточки за период (в порядке дат) → каналы и разделы → хэштеги → строки. */
export function scheduleOf(channels: Channel[], units: Unit[], rules: Map<string, Rule>, rubrics: Map<string, Rubric>): SchedGroup[] {
  const groups = new Map<string, SchedGroup>()
  // порядок групп — как каналы в плане: сначала сам канал, потом его разделы
  for (const c of channels) {
    groups.set(c.id, { id: c.id, name: c.name, color: c.color, tags: [] })
    for (const s of c.sections) groups.set(`${c.id}:${s.id}`, { id: `${c.id}:${s.id}`, name: s.web, color: colorOf(c, s.id), tags: [] })
  }
  const sorted = units.filter((u) => !u.stream && u.date).sort((a, b) => a.date!.localeCompare(b.date!) || a.time.localeCompare(b.time))
  for (const u of sorted) {
    const it = u.head
    const g = groups.get(it.sectionId && groups.has(`${u.channelId}:${it.sectionId}`) ? `${u.channelId}:${it.sectionId}` : u.channelId)
    if (!g) continue
    const rule = rules.get(it.ruleId)
    const rubric = rubrics.get(it.rubricId ?? '')
    const tagId = it.rubricId ?? `rule:${it.ruleId}`
    let tag = g.tags.find((t) => t.id === tagId)
    if (!tag) {
      tag = { id: tagId, tag: rubric ? tagOf(rubric.name) : rule?.name ?? it.format, rows: [] }
      g.tags.push(tag)
    }
    const slot = isSlot(it)
    const title = shownTitle(it)
    // повтор той же темы в то же время — к уже стоящей строке; пустые слоты не сливаются: каждый надо заполнить
    const same = !slot && tag.rows.find((r) => !r.slot && r.title === title && r.time === u.time && r.format === it.format)
    if (same) {
      same.days.push(u.date!)
      continue
    }
    tag.rows.push({ key: u.key, id: it.id, date: u.date!, time: u.time, title, slot, status: it.status, format: it.format, days: [u.date!] })
  }
  return [...groups.values()].filter((g) => g.tags.length)
}

/** Когда выходит слитая строка: «каждый день», «Пн, Ср, Пт» или «2 ноя – 29 ноя» (сколько раз — timesText). */
export function daysText(days: ISODate[], span: number): string {
  if (days.length === span) return 'каждый день'
  if (span <= 7) return days.map((d) => WEEKDAYS[weekday(d)]).join(', ')
  return `${shortDate(days[0])} – ${shortDate(days[days.length - 1])}`
}

/** «12 раз» — у слитой строки за долгий период, где дни не перечислить. */
export const timesText = (days: ISODate[], span: number) =>
  span > 7 && days.length > 1 && days.length < span ? `${days.length} ${plural(days.length, 'раз', 'раза', 'раз')}` : ''
