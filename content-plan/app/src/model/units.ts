// Карточка в календаре — это материал целиком, а не каждая публикация отдельно: FULL вместе
// с тизером, анонсом в Офисе и в X — одна карточка Офиса Датаиста; анонс от Andre AIT и кросс-посты
// других каналов — свои карточки. Так же в одну карточку сходятся пост и шортс исследования дня.
import { addDays, daysBetween } from './dates'
import { AUTO_RULES } from './filters'
import { ALL_DAY, FORMAT_ICON, STREAM_TIME, timeOf, typeOf, type ISODate, type Item, type Rule, type Status } from './types'

/** Один материал в разных форматах — одна карточка: тот же день, час, канал, рубрика и тема (короткое видео, статья
 *  и пост исследования в 09:00 — одна карточка, «Нужна тема» — тоже). У материалов группы (FULL с тизером и анонсами)
 *  и черновиков без даты — свой порядок: ключа нет. */
export const mateKey = (it: Item, rule: Rule | undefined): string | null =>
  !it.date || it.group || it.derive ? null : `${it.date}|${it.allDay ? ALL_DAY : timeOf(it, rule)}|${it.channelId}|${it.rubricId ?? ''}|${it.title.trim()}`

/** Порядок форматов в карточке — как плитки формы: горизонталь, вертикаль, пост, веб, рассылка; главный — первым. */
const FORMAT_ORDER = Object.keys(FORMAT_ICON)
const formatRank = (f: string) => {
  const i = FORMAT_ORDER.indexOf(f)
  return i < 0 ? 99 : i
}
// тизер и анонсы группы — за главным, по рангу, как были
const byFormat = (a: Item, b: Item) => Number(!!a.derive) - Number(!!b.derive) || (a.derive ? 0 : formatRank(a.format) - formatRank(b.format)) || a.rank - b.rank

export interface Unit {
  key: string
  head: Item
  items: Item[] // главный — первым
  channelId: string
  date: ISODate | null
  time: string
  end?: string // конец на шкале времени, если карточку растянули; без него — час
  stream: boolean // поток 24/7 по вебхуку: в дне — первым, на шкале времени — над часами
  allDay?: boolean // ситуативно: без часа — сверху дня, следом за потоком, на шкале времени — строкой над часами
}

/** Время карточки для подписи: «12:00» или «24/7» у потока. */
export const timeText = (u: Pick<Unit, 'time' | 'stream' | 'allDay'>) => (u.stream ? STREAM_TIME : u.allDay ? ALL_DAY : u.time)
/** Сверху дня, над часами: поток 24/7 и ситуативное. */
export const onTop = (u: Pick<Unit, 'stream' | 'allDay'>) => u.stream || !!u.allDay

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
    } else if (!it.group) {
      key = mateKey(it, rules.get(it.ruleId)) ?? `${it.id}|${it.channelId}`
    } else {
      key = `${it.id}|${it.channelId}`
    }
    const list = byKey.get(key)
    if (list) list.push(it)
    else byKey.set(key, [it])
  }
  const out: Unit[] = []
  for (const [key, list] of byKey) {
    const sorted = [...list].sort(byFormat)
    const head = sorted[0]
    const rule = rules.get(head.ruleId)
    out.push({ key, head, items: sorted, channelId: head.channelId, date: head.date, time: timeOf(head, rule), end: head.end, stream: !!rule?.stream, allDay: !!head.allDay && !rule?.stream })
  }
  return out.sort(byTime(channelOrder))
}

/** Порядок карточек дня: поток — как событие на весь день, первым; дальше по времени, каналу и рангу. */
const byTime = (channelOrder: string[]) => {
  const order = (cid: string) => {
    const i = channelOrder.indexOf(cid)
    return i < 0 ? 99 : i
  }
  return (a: Unit, b: Unit) => Number(b.stream) - Number(a.stream) || Number(!!b.allDay) - Number(!!a.allDay) || (a.time < b.time ? -1 : a.time > b.time ? 1 : 0) || order(a.channelId) - order(b.channelId) || a.head.rank - b.head.rank
}

/** Месяц и лента — как в календаре Датаиста: каждый материал своей карточкой целиком, ничего не прячется за «+N»;
 *  один материал в разных форматах (тот же час, канал, рубрика и тема) — одной карточкой: внизу все форматы и площадки. */
export function cardsOf(items: Item[], rules: Map<string, Rule>, channelOrder: string[] = []): Unit[] {
  const byKey = new Map<string, Item[]>()
  for (const it of items) {
    const key = mateKey(it, rules.get(it.ruleId)) ?? `i|${it.id}`
    const list = byKey.get(key)
    if (list) list.push(it)
    else byKey.set(key, [it])
  }
  return [...byKey.values()]
    .map((list): Unit => {
      const sorted = list.length > 1 ? [...list].sort(byFormat) : list
      const head = sorted[0]
      const rule = rules.get(head.ruleId)
      return { key: head.id, head, items: sorted, channelId: head.channelId, date: head.date, time: timeOf(head, rule), end: head.end, stream: !!rule?.stream, allDay: !!head.allDay && !rule?.stream }
    })
    .sort(byTime(channelOrder))
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
