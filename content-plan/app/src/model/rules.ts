// Проверка плана по сетке правил и типовая неделя из неё.
import { WEEKDAYS, weekday } from './dates'
import { labelOf, type ISODate, type Item, type Plan, type Rule } from './types'

export type ViolationKind = 'full' | 'limit' | 'weekday' | 'start'

export interface Violation {
  date: ISODate
  kind: ViolationKind
  text: string
  itemIds: string[]
}

export const KIND_LABEL: Record<ViolationKind, string> = {
  full: 'Два FULL в день',
  limit: 'Сверх лимита',
  weekday: 'Не свой день недели',
  start: 'Канал ещё не запущен',
}

const unitKey = (it: Item) => it.group ?? it.id

export function checkDay(plan: Plan, date: ISODate, items: Item[]): Violation[] {
  const rules = new Map(plan.rules.map((r) => [r.id, r]))
  const rubrics = new Map(plan.rubrics.map((r) => [r.id, r]))
  const channels = new Map(plan.channels.map((c) => [c.id, c]))
  const label = (it: Item) => labelOf(rubrics.get(it.rubricId ?? ''), rules.get(it.ruleId))
  const wd = weekday(date)
  const out: Violation[] = []

  const fulls = items.filter((it) => rules.get(it.ruleId)?.full && !it.derive)
  if (fulls.length > 1) {
    out.push({ date, kind: 'full', text: fulls.map((it) => it.title).join(' · '), itemIds: fulls.map((it) => it.id) })
  }

  const byRule = new Map<string, Item[]>()
  for (const it of items) {
    const key = `${it.ruleId}|${it.channelId}`
    byRule.set(key, [...(byRule.get(key) ?? []), it])
  }
  for (const list of byRule.values()) {
    const r = rules.get(list[0].ruleId)
    const units = new Set(list.map(unitKey))
    if (r && units.size > r.limit) {
      out.push({ date, kind: 'limit', text: `${label(list[0])}: ${units.size} при лимите ${r.limit}`, itemIds: list.map((it) => it.id) })
    }
  }

  const offDay = new Map<string, Item[]>()
  for (const it of items) {
    const r = rules.get(it.ruleId)
    if (r && !r.days[wd]) offDay.set(unitKey(it), [...(offDay.get(unitKey(it)) ?? []), it])
  }
  for (const list of offDay.values()) {
    const names = [...new Set(list.map(label))]
    out.push({ date, kind: 'weekday', text: `${names.join(', ')} — не выходит в ${WEEKDAYS[wd]}`, itemIds: list.map((it) => it.id) })
  }

  const early = new Map<string, Item[]>()
  for (const it of items) {
    const c = channels.get(it.channelId)
    if (c && date < c.start) early.set(c.id, [...(early.get(c.id) ?? []), it])
  }
  for (const [cid, list] of early) {
    const c = channels.get(cid)!
    out.push({ date, kind: 'start', text: `${c.name} стартует ${c.start}`, itemIds: list.map((it) => it.id) })
  }
  return out
}

export function checkPlan(plan: Plan, byDate: Map<ISODate, Item[]>): Violation[] {
  const out: Violation[] = []
  for (const [date, items] of [...byDate].sort(([a], [b]) => (a < b ? -1 : 1))) out.push(...checkDay(plan, date, items))
  return out
}

// ── типовая неделя ───────────────────────────────────────────────────────────

export interface TemplateLine {
  header: string
  channelId: string
  rule: Rule
  label: string
  note: string
}

/** Заголовок материала на площадке: на сайте — раздел, в Telegram — канал раздела, иначе бренд. */
export function headerFor(plan: Plan, channelId: string, sectionId: string | undefined, platform: string) {
  const c = plan.channels.find((x) => x.id === channelId)
  if (!c) return channelId
  const s = c.sections.find((x) => x.id === sectionId)
  if (platform === 'Web' && s) return s.web
  if (platform === 'Telegram' && s) return s.name
  return c.name
}

export function weekTemplate(plan: Plan): Map<string, TemplateLine[]> {
  const out = new Map<string, TemplateLine[]>()
  const order = plan.channels.map((c) => c.id)
  const rubrics = new Map(plan.rubrics.map((r) => [r.id, r]))
  for (let wd = 0; wd < 7; wd++) {
    for (const p of plan.platforms) {
      const lines = plan.rules
        .filter((r) => r.days[wd] && r.platforms.includes(p) && r.freq !== 'разово')
        .map((r) => ({
          header: headerFor(plan, r.channelId, r.sectionId, p),
          channelId: r.channelId,
          rule: r,
          label: labelOf(rubrics.get(r.rubricId ?? ''), r),
          note: r.dayNotes[wd],
        }))
        .sort((a, b) => order.indexOf(a.channelId) - order.indexOf(b.channelId))
      out.set(`${wd}|${p}`, lines)
    }
  }
  return out
}
