// Карточка в календаре — это материал целиком, а не каждая публикация отдельно: FULL вместе
// с тизером, анонсом в Кабинете и в X — одна карточка Dataist; анонс от Andre AIT и кросс-посты
// других каналов — свои карточки. Так же в одну карточку сходятся пост и шортс исследования дня.
import { addDays, daysBetween } from './dates'
import { AUTO_RULES } from './filters'
import { isSlot, timeOf, typeOf, type ISODate, type Item, type Rule, type Status } from './types'

export interface Unit {
  key: string
  head: Item
  items: Item[] // главный — первым
  channelId: string
  date: ISODate | null
  time: string
}

/** Карточки одного дня. Порядок: по времени, затем по каналам и рангу. */
export function unitsOf(items: Item[], rules: Map<string, Rule>, channelOrder: string[] = []): Unit[] {
  const heads = new Map<string, Item>() // группа и дата → главный материал
  for (const it of items) {
    if (!it.group || it.derive) continue
    const k = `${it.group}|${it.date}`
    const h = heads.get(k)
    if (!h || (rules.get(it.ruleId)?.full && !rules.get(h.ruleId)?.full)) heads.set(k, it)
  }
  const byKey = new Map<string, Item[]>()
  for (const it of items) {
    let key: string
    if (it.derive && it.group) {
      const h = heads.get(`${it.group}|${it.date}`)
      key = h ? `${h.id}|${it.channelId}` : `${it.id}|${it.channelId}`
    } else if (!it.group && !isSlot(it)) {
      key = `t|${it.channelId}|${it.rubricId}|${it.title}`
    } else {
      key = `${it.id}|${it.channelId}`
    }
    const list = byKey.get(key)
    if (list) list.push(it)
    else byKey.set(key, [it])
  }
  const order = (cid: string) => {
    const i = channelOrder.indexOf(cid)
    return i < 0 ? 99 : i
  }
  const out: Unit[] = []
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) => Number(!!a.derive) - Number(!!b.derive) || a.rank - b.rank)
    const head = sorted[0]
    out.push({ key, head, items: sorted, channelId: head.channelId, date: head.date, time: timeOf(head, rules.get(head.ruleId)) })
  }
  return out.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0) || order(a.channelId) - order(b.channelId) || a.head.rank - b.head.rank)
}

/** Площадки карточки в порядке плана и что на каждой выходит: YouTube → FULL, Тизер · Shorts. */
export function platformTypes(unit: Unit, rules: Map<string, Rule>, platforms: string[]) {
  const map = new Map<string, { type: string; item: Item }[]>()
  for (const it of unit.items) {
    for (const p of it.platforms) {
      const type = typeOf(rules.get(it.ruleId), p)
      const list = map.get(p) ?? []
      if (!list.some((x) => x.type === type)) list.push({ type, item: it })
      map.set(p, list)
    }
  }
  return platforms.filter((p) => map.has(p)).map((p) => ({ platform: p, parts: map.get(p)! }))
}

/** Статус карточки — у главного материала; кнопка ставит его всем материалам карточки. */
export const unitStatus = (u: Unit): Status => u.head.status

/** За сколько дней до выхода подготовить: FULL снимают заранее, авто-рубрики выходят сами. */
export const leadOf = (rule: Rule | undefined) => (rule?.full ? 3 : rule && AUTO_RULES.has(rule.id) ? 0 : 1)

export const dueOf = (it: Item, rule: Rule | undefined): ISODate | null =>
  it.due ?? (it.date ? addDays(it.date, -leadOf(rule)) : null)

/** Части задачи: каждая площадка каждого материала карточки, с тем, что на ней выходит. */
export function taskParts(unit: Unit, rules: Map<string, Rule>, platforms: string[]) {
  return platformTypes(unit, rules, platforms).flatMap(({ platform, parts }) =>
    parts.map(({ type, item }) => ({ key: `${item.id}|${platform}`, platform, type, item })),
  )
}

/** Сколько дней до срока подготовки: < 0 — просрочено. */
export const daysLeft = (due: ISODate, today: ISODate) => daysBetween(today, due)
