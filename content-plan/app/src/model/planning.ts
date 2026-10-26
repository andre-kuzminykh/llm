// Планирование недели: хэштег с периодичностью ставит в расписание слоты без темы, а за неделю до выхода
// календарь просит уточнить темы — всё, что пусто с сегодняшнего дня до конца следующей недели.
import { addDays, mondayOf } from './dates'
import { AUTO_RULES } from './filters'
import { isSlot, timeOf, type ISODate, type Item, type Plan } from './types'

/** До какого дня планируем: воскресенье следующей недели. */
export const planningEnd = (today: ISODate) => addDays(mondayOf(today), 13)

/** Пустые слоты (главные материалы без темы) с сегодняшнего дня до конца следующей недели — по дате и времени.
 *  Ежедневные авто-публикации тем не ждут — их здесь нет. */
export function planningSlots(plan: Plan, today: ISODate): Item[] {
  const end = planningEnd(today)
  const rules = new Map(plan.rules.map((r) => [r.id, r]))
  const at = (x: Item) => `${x.date} ${timeOf(x, rules.get(x.ruleId))}`
  return plan.items
    .filter((x) => x.date && x.date >= today && x.date <= end && !x.derive && isSlot(x) && x.status === 'planned' && !AUTO_RULES.has(x.ruleId) && !rules.get(x.ruleId)?.stream)
    .sort((a, b) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : a.rank - b.rank))
}
