// Расписание — программа: что выпускаем. По хэштегам: каналы (разделы — как отдельные каналы), в них хэштеги,
// по каждому — что и когда выходит. По темам: общая тема над несколькими материалами разных форматов и каналов —
// что и когда по ней выходит. Не шкала времени: время — подписью у строки.
// Потоки 24/7 сюда не идут; одно и то же, что выходит много раз («Исследование дня»), — одной строкой с днями.
import { shortDate, WEEKDAYS, weekday } from './dates'
import { plural } from './hint'
import { colorOf, isSlot, shownTitle, tagOf, type Channel, type ISODate, type Rubric, type Rule, type Status } from './types'
import type { Unit } from './units'

export interface SchedRow {
  key: string
  id: string // что открыть по щелчку: материал (у слитой строки — ближайший)
  ids: string[] // все материалы строки — с тизерами и анонсами карточки и со всеми повторами: им ставится тема
  date: ISODate
  time: string
  title: string
  slot: boolean
  status: Status
  format: string
  group: string // канал или раздел: id группы и название
  channel: string
  color?: string
  tag: string
  theme?: string // общая тема над несколькими материалами
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

export interface ThemeGroup {
  theme: string
  rows: SchedRow[]
}

/** Карточки за период → строки по порядку: потоки 24/7 не идут. */
function rowsOf(channels: Channel[], units: Unit[], rules: Map<string, Rule>, rubrics: Map<string, Rubric>): SchedRow[] {
  const byId = new Map(channels.map((c) => [c.id, c]))
  return units
    .filter((u) => !u.stream && u.date)
    .sort((a, b) => a.date!.localeCompare(b.date!) || a.time.localeCompare(b.time))
    .flatMap((u) => {
      const it = u.head
      const c = byId.get(u.channelId)
      if (!c) return []
      const sec = c.sections.find((s) => s.id === it.sectionId)
      const rule = rules.get(it.ruleId)
      const rubric = rubrics.get(it.rubricId ?? '')
      const row: SchedRow = {
        key: u.key,
        id: it.id,
        ids: u.items.map((x) => x.id),
        date: u.date!,
        time: u.time,
        title: shownTitle(it),
        slot: isSlot(it),
        status: it.status,
        format: it.format,
        group: sec ? `${c.id}:${sec.id}` : c.id,
        channel: sec?.web ?? c.name,
        color: colorOf(c, sec?.id),
        tag: rubric ? tagOf(rubric.name) : rule?.name ?? it.format,
        theme: it.theme ?? u.items.find((x) => x.theme)?.theme,
        days: [u.date!],
      }
      return [row]
    })
}

/** Строка — к списку: повтор того же (канал, хэштег, тема, время, формат) сливается; пустые слоты — нет, каждый надо заполнить. */
function push(list: SchedRow[], r: SchedRow) {
  const same =
    !r.slot && list.find((x) => !x.slot && x.group === r.group && x.tag === r.tag && x.title === r.title && x.time === r.time && x.format === r.format)
  if (!same) return list.push({ ...r, ids: [...r.ids] })
  same.days.push(r.date)
  same.ids.push(...r.ids)
}

/** По хэштегам: каналы и разделы (в порядке плана) → хэштеги (по первому выходу) → строки. */
export function scheduleOf(channels: Channel[], units: Unit[], rules: Map<string, Rule>, rubrics: Map<string, Rubric>): SchedGroup[] {
  const groups = new Map<string, SchedGroup>()
  for (const c of channels) {
    groups.set(c.id, { id: c.id, name: c.name, color: c.color, tags: [] })
    for (const s of c.sections) groups.set(`${c.id}:${s.id}`, { id: `${c.id}:${s.id}`, name: s.web, color: colorOf(c, s.id), tags: [] })
  }
  for (const r of rowsOf(channels, units, rules, rubrics)) {
    const g = groups.get(r.group)!
    let tag = g.tags.find((t) => t.tag === r.tag)
    if (!tag) {
      tag = { id: r.tag, tag: r.tag, rows: [] }
      g.tags.push(tag)
    }
    push(tag.rows, r)
  }
  return [...groups.values()].filter((g) => g.tags.length)
}

/** По темам: общие темы (по первому выходу) → всё, что по теме выходит, в любом канале и формате; без темы — отдельно. */
export function themesOf(channels: Channel[], units: Unit[], rules: Map<string, Rule>, rubrics: Map<string, Rubric>): { themes: ThemeGroup[]; none: SchedRow[] } {
  const themes = new Map<string, ThemeGroup>()
  const none: SchedRow[] = []
  for (const r of rowsOf(channels, units, rules, rubrics)) {
    if (!r.theme) {
      push(none, r)
      continue
    }
    if (!themes.has(r.theme)) themes.set(r.theme, { theme: r.theme, rows: [] })
    push(themes.get(r.theme)!.rows, r)
  }
  return { themes: [...themes.values()], none }
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
