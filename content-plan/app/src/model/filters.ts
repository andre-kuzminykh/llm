// Что показывать и в каком порядке.
import { isSlot, type ISODate, type Item, type Plan, type Status } from './types'

export interface Filters {
  hiddenChannels: string[]
  hiddenRubrics: string[]
  hiddenPlatforms: string[]
  onlySlots: boolean
  hideAuto: boolean // ежедневные авто-рубрики в неделе и в дне
  statuses: Status[] // показывать только эти статусы; пусто — все
}

export const NO_FILTERS: Filters = { hiddenChannels: [], hiddenRubrics: [], hiddenPlatforms: [], onlySlots: false, hideAuto: false, statuses: [] }

/** Ежедневные форматы, которые выходят сами и почти не требуют внимания. */
export const AUTO_RULES = new Set(['neu_all', 'neu_top', 'lab_day', 'lab_day_v', 'aca_lesson', 'sh_edu', 'tx_hack', 'ml_news'])

export function visible(it: Item, f: Filters) {
  if (f.hiddenChannels.includes(it.channelId)) return false
  if (it.rubricId && f.hiddenRubrics?.includes(it.rubricId)) return false
  if (f.hiddenPlatforms.length && !it.platforms.some((p) => !f.hiddenPlatforms.includes(p))) return false
  if (f.onlySlots && !isSlot(it)) return false
  if (f.hideAuto && AUTO_RULES.has(it.ruleId)) return false
  if (f.statuses?.length && !f.statuses.includes(it.status)) return false
  return true
}

/** Материалы по датам, в порядке каналов и рангов. Темы банка (без даты) сюда не попадают. */
export function indexByDate(plan: Plan): Map<ISODate, Item[]> {
  const order = new Map(plan.channels.map((c, i) => [c.id, i]))
  const map = new Map<ISODate, Item[]>()
  for (const it of plan.items) {
    if (!it.date) continue
    const list = map.get(it.date)
    if (list) list.push(it)
    else map.set(it.date, [it])
  }
  for (const list of map.values()) {
    list.sort((a, b) => (order.get(a.channelId) ?? 99) - (order.get(b.channelId) ?? 99) || a.rank - b.rank)
  }
  return map
}
