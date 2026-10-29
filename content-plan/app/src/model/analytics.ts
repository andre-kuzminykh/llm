// Аналитика своих каналов — по карточкам плана: сколько вышло, что не вышло вовремя, что впереди, ритм по неделям,
// форматы, площадки и рубрики. Охваты и просмотры появятся, когда подключим площадки.
import { addDays, daysBetween, mondayOf } from './dates'
import { indexByDate } from './filters'
import { FORMAT_ICON, isHome, type ISODate, type Plan, type Rule } from './types'
import { unitsOf, type Unit } from './units'

export interface Week {
  from: ISODate // понедельник
  n: number // карточек канала
  published: number
  future: boolean // неделя после текущей
  current: boolean
}

export interface ChannelStats {
  channelId: string
  total: number // карточек за период (до сегодня включительно)
  published: number // из них «Вышло»
  late: number // дата прошла, а «Вышло» не отмечено
  ahead: number // карточек на 7 дней вперёд
  perWeek: number // в среднем за неделю периода (с начала плана, если он моложе периода)
  weeks: Week[] // ритм: 4 недели назад, текущая и 7 вперёд
  formats: [string, number][]
  platforms: [string, number][]
  rubrics: [string, number][] // id рубрики и число — три самые частые
}

const top = (m: Map<string, number>, n = Infinity) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n)
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)

/** Статистика каналов за days дней до today (включительно); weeks — с понедельника за 4 недели до текущей и 7 после. */
export function channelStats(plan: Plan, today: ISODate, days: number): ChannelStats[] {
  const rules = new Map<string, Rule>(plan.rules.map((r) => [r.id, r]))
  const byDate = indexByDate(plan)
  const order = plan.channels.map((c) => c.id)
  const cache = new Map<ISODate, Unit[]>()
  const unitsAt = (d: ISODate) => {
    let u = cache.get(d)
    if (!u) cache.set(d, (u = unitsOf(byDate.get(d) ?? [], rules, order)))
    return u
  }
  const from = addDays(today, -(days - 1))
  const firstWeek = addDays(mondayOf(today), -4 * 7)
  // план моложе периода — «в неделю» считаем по дням, где он уже есть
  const covered = Math.max(1, daysBetween(from > plan.start ? from : plan.start, today) + 1)
  return plan.channels.map((c) => {
    const s: ChannelStats = { channelId: c.id, total: 0, published: 0, late: 0, ahead: 0, perWeek: 0, weeks: [], formats: [], platforms: [], rubrics: [] }
    const formats = new Map<string, number>()
    const platforms = new Map<string, number>()
    const rubrics = new Map<string, number>()
    for (let d = from; d <= today; d = addDays(d, 1)) {
      for (const u of unitsAt(d)) {
        if (u.channelId !== c.id) continue
        s.total++
        if (u.head.status === 'published') s.published++
        else if (d < today) s.late++
        for (const f of new Set(u.items.map((it) => it.format))) if (FORMAT_ICON[f]) bump(formats, f)
        for (const p of new Set(u.items.flatMap((it) => it.platforms))) if (!isHome(p)) bump(platforms, p)
        if (u.head.rubricId) bump(rubrics, u.head.rubricId)
      }
    }
    for (let d = addDays(today, 1); d <= addDays(today, 7); d = addDays(d, 1)) s.ahead += unitsAt(d).filter((u) => u.channelId === c.id).length
    for (let w = 0; w < 12; w++) {
      const mon = addDays(firstWeek, w * 7)
      const week: Week = { from: mon, n: 0, published: 0, future: w > 4, current: w === 4 }
      for (let i = 0; i < 7; i++)
        for (const u of unitsAt(addDays(mon, i))) {
          if (u.channelId !== c.id) continue
          week.n++
          if (u.head.status === 'published') week.published++
        }
      s.weeks.push(week)
    }
    s.perWeek = Math.round((s.total / covered) * 7 * 10) / 10
    s.formats = top(formats)
    // площадки — в порядке плана, как везде
    s.platforms = plan.platforms.filter((p) => platforms.has(p)).map((p) => [p, platforms.get(p)!])
    s.rubrics = top(rubrics, 3)
    return s
  })
}
