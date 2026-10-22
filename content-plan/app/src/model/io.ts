// Выгрузка и загрузка: JSON целиком и CSV-календарь в формате out/4_calendar.csv.
import { addDays, WEEKDAYS, weekday } from './dates'
import type { ISODate, Item, Plan } from './types'

export const exportJSON = (plan: Plan) => JSON.stringify(plan)

export function parsePlan(text: string): Plan {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Это не JSON')
  }
  const p = data as Partial<Plan>
  const ok =
    p &&
    p.version === 1 &&
    typeof p.start === 'string' &&
    typeof p.end === 'string' &&
    Array.isArray(p.platforms) &&
    Array.isArray(p.channels) &&
    Array.isArray(p.rubrics) &&
    Array.isArray(p.items) &&
    p.items.every((it: Partial<Item>) => typeof it.id === 'string' && typeof it.rubricId === 'string' && typeof it.title === 'string')
  if (!ok) throw new Error('Файл не похож на выгрузку контент-плана (нужен version 1, каналы, рубрики и материалы)')
  return p as Plan
}

/** Порядок заголовков в ячейке: канал, его разделы в Telegram, его разделы на сайте. */
export function headerOrder(plan: Plan) {
  return plan.channels.flatMap((c) => [c.name, ...c.sections.map((s) => s.name), ...c.sections.map((s) => s.web)])
}

export function headerOf(plan: Plan, it: Item, platform: string) {
  const c = plan.channels.find((x) => x.id === it.channelId)
  const s = c?.sections.find((x) => x.id === it.sectionId)
  if (platform === 'Web' && s) return s.web
  if (platform === 'Telegram' && s) return s.name
  return c?.name ?? it.channelId
}

/** Строки ячейки календаря: заголовок канала, под ним материалы, между каналами пустая строка. */
export function cellLines(plan: Plan, items: Item[], platform: string, order = headerOrder(plan)) {
  const groups = new Map<string, Item[]>()
  for (const it of items) {
    if (!it.platforms.includes(platform)) continue
    const h = headerOf(plan, it, platform)
    groups.set(h, [...(groups.get(h) ?? []), it])
  }
  const lines: { text: string; head?: boolean; item?: Item }[] = []
  for (const h of [...groups.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
    if (lines.length) lines.push({ text: '' })
    lines.push({ text: h, head: true })
    for (const it of [...groups.get(h)!].sort((a, b) => a.rank - b.rank)) {
      lines.push({ text: it.format === 'FULL' ? `• FULL: ${it.title}` : `• ${it.title}`, item: it })
    }
  }
  return lines
}

const csvField = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

export function calendarCSV(plan: Plan): string {
  const byDate = new Map<ISODate, Item[]>()
  for (const it of plan.items) if (it.date) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it])
  const order = headerOrder(plan)
  const rows = [['#', 'День', 'Дата', ...plan.platforms]]
  let n = 1
  for (let d = plan.start; d <= plan.end; d = addDays(d, 1), n++) {
    const items = byDate.get(d) ?? []
    rows.push([String(n), WEEKDAYS[weekday(d)], d, ...plan.platforms.map((p) => cellLines(plan, items, p, order).map((l) => l.text).join('\n'))])
  }
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n'
}

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
