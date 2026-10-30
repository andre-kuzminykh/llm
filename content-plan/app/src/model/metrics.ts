// Данные соцсетей для аналитики: подписчики, просмотры, вовлечённость — по часам, у своих каналов и у конкурентов, и посты
// конкурентов с саммери для ленты вдохновения. Придут с сервера, когда подключим площадки (нужны доступы к аккаунтам);
// пока источника нет — пусто, а посмотреть, как это выглядит, можно на явно помеченном примере (sampleFeed).
import { FULL_VIDEO, SHORT_VIDEO, TEXT_IMAGE } from './types'

export type Metric = 'followers' | 'views' | 'er'

export const METRICS: { id: Metric; label: string; kind: 'line' | 'columns'; unit?: '%'; note: string }[] = [
  { id: 'followers', label: 'Подписчики', kind: 'line', note: 'на конец периода' },
  { id: 'views', label: 'Просмотры', kind: 'columns', note: 'за период' },
  { id: 'er', label: 'Вовлечённость', kind: 'line', unit: '%', note: 'в среднем' },
]

export interface Point {
  t: number // начало часа, мс
  v: number // подписчики — на конец часа; просмотры — за час; вовлечённость — % за час
}

export interface Series {
  owner: string // id своего канала или конкурента
  platform: string
  metric: Metric
  points: Point[] // по возрастанию t
}

/** Пост конкурента: тема, короткое саммери и цифры — его можно переиспользовать, видоизменив. */
export interface Post {
  id: string
  owner: string // id конкурента
  platform: string
  at: number // когда вышел, мс
  title: string
  summary: string
  url?: string
  views: number
  likes: number
  format: string // как наш формат: вертикаль, горизонталь, пост
  sample?: boolean // из примера, не настоящий
}

export interface Feed {
  series: Series[]
  posts: Post[]
}

export const EMPTY_FEED: Feed = { series: [], posts: [] }

export const PERIODS: { days: number; label: string }[] = [
  { days: 1, label: 'Сутки' },
  { days: 7, label: '7 дней' },
  { days: 30, label: '30 дней' },
  { days: 90, label: '90 дней' },
]

const HOUR = 3600_000
const DAY = 24 * HOUR
export const hourOf = (ms: number) => Math.floor(ms / HOUR) * HOUR

export interface Bucket {
  from: number
  to: number // не включая
  label: string // «14:00», «28 окт», «с 21 окт»
}

const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const dayLabel = (ms: number) => {
  const d = new Date(ms)
  return `${d.getDate()} ${MON[d.getMonth()]}`
}
const startOfDay = (ms: number) => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Корзины периода до now: сутки — 24 часа, 7 и 30 дней — по дням, 90 — по неделям (последняя — текущая). */
export function bucketsOf(now: number, days: number): Bucket[] {
  if (days <= 1) {
    const end = hourOf(now) + HOUR
    return Array.from({ length: 24 }, (_, i) => {
      const from = end - (24 - i) * HOUR
      return { from, to: from + HOUR, label: `${String(new Date(from).getHours()).padStart(2, '0')}:00` }
    })
  }
  const end = startOfDay(now) + DAY
  if (days <= 30)
    return Array.from({ length: days }, (_, i) => {
      const from = end - (days - i) * DAY
      return { from, to: from + DAY, label: dayLabel(from) }
    })
  const weeks = Math.ceil(days / 7)
  return Array.from({ length: weeks }, (_, i) => {
    const from = end - (weeks - i) * 7 * DAY
    return { from, to: from + 7 * DAY, label: `с ${dayLabel(from)}` }
  })
}

/** Значения метрики по корзинам для owner на выбранных площадках (null — все): подписчики — последнее значение в корзине,
 *  сложенное по площадкам; просмотры — сумма; вовлечённость — среднее. Нет точек — null. */
export function valuesOf(feed: Feed, owner: string, metric: Metric, platforms: string[] | null, buckets: Bucket[]): (number | null)[] {
  const series = feed.series.filter((s) => s.owner === owner && s.metric === metric && (!platforms || platforms.includes(s.platform)))
  return buckets.map((b) => {
    const per = series
      .map((s) => s.points.filter((p) => p.t >= b.from && p.t < b.to))
      .filter((pts) => pts.length)
    if (!per.length) return null
    if (metric === 'followers') return per.reduce((sum, pts) => sum + pts[pts.length - 1].v, 0)
    if (metric === 'views') return per.reduce((sum, pts) => sum + pts.reduce((x, p) => x + p.v, 0), 0)
    const all = per.flat()
    return Math.round((all.reduce((x, p) => x + p.v, 0) / all.length) * 100) / 100
  })
}

/** Есть ли у owner хоть какие-то данные. */
export const hasData = (feed: Feed, owner: string) => feed.series.some((s) => s.owner === owner && s.points.length)

// ── пример: только чтобы посмотреть, как будут выглядеть графики и лента; помечен везде как пример ──────────────

/** Повторяемые «случайные» числа от строки — пример одинаковый при каждом открытии. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
  let a = (h << 13) | (h >>> 19)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SAMPLE_TOPICS: [string, string, string][] = [
  ['Пример: 5 ИИ-агентов, которые экономят день', 'Пример саммери: короткий обзор пяти агентов с ценами и сценариями — в конце сравнение по времени.', SHORT_VIDEO],
  ['Пример: как мы автоматизировали отдел продаж', 'Пример саммери: кейс с цифрами до и после, три шага внедрения и ошибки, которых стоит избежать.', FULL_VIDEO],
  ['Пример: новая модель — что изменилось', 'Пример саммери: что умеет новая версия, где она лучше прошлой и кому стоит переходить.', TEXT_IMAGE],
  ['Пример: промпт, который пишет план недели', 'Пример саммери: готовый промпт и разбор, почему он работает; в комментариях — варианты.', SHORT_VIDEO],
  ['Пример: тренды недели в ИИ', 'Пример саммери: пять новостей недели одной каруселью, по слайду на новость.', TEXT_IMAGE],
  ['Пример: ошибки при внедрении ИИ в компании', 'Пример саммери: список типичных ошибок и чек-лист, как их обойти.', FULL_VIDEO],
]

/** Пример данных за 90 дней по часам для своих каналов и конкурентов; у конкурентов — ещё и посты за две недели. */
export function sampleFeed(now: number, owners: { id: string; platforms: string[]; rival?: boolean }[]): Feed {
  const end = hourOf(now)
  const start = end - 90 * DAY
  const series: Series[] = []
  const posts: Post[] = []
  for (const o of owners) {
    for (const platform of o.platforms) {
      const r = rng(`${o.id}|${platform}`)
      let followers = Math.round(2000 + r() * 40000)
      const growth = 0.3 + r() * 2.5 // подписчиков в час в среднем
      const viewsBase = 40 + r() * 600
      const erBase = 1.5 + r() * 4
      const f: Point[] = []
      const v: Point[] = []
      const e: Point[] = []
      for (let t = start; t <= end; t += HOUR) {
        const h = new Date(t).getHours()
        const day = new Date(t).getDay()
        // вечером и в будни смотрят больше, ночью — почти никто
        const curve = Math.max(0.05, Math.sin(((h - 6) / 24) * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.6) * (day === 0 || day === 6 ? 0.8 : 1)
        followers += Math.round(growth * curve * (0.5 + r()) - (r() < 0.02 ? r() * 20 : 0))
        f.push({ t, v: followers })
        v.push({ t, v: Math.round(viewsBase * curve * (0.6 + r() * 0.8)) })
        e.push({ t, v: Math.round(erBase * (0.7 + r() * 0.6) * 100) / 100 })
      }
      series.push({ owner: o.id, platform, metric: 'followers', points: f }, { owner: o.id, platform, metric: 'views', points: v }, { owner: o.id, platform, metric: 'er', points: e })
      if (!o.rival) continue
      for (let d = 0; d < 14; d++) {
        if (r() < 0.35) continue
        const [title, summary, format] = SAMPLE_TOPICS[Math.floor(r() * SAMPLE_TOPICS.length)]
        const at = end - d * DAY - Math.floor(r() * 12) * HOUR
        posts.push({ id: `${o.id}|${platform}|${d}`, owner: o.id, platform, at, title, summary, views: Math.round(viewsBase * (8 + r() * 40)), likes: Math.round(viewsBase * (0.2 + r() * 2)), format, sample: true })
      }
    }
  }
  posts.sort((a, b) => b.at - a.at)
  return { series, posts }
}
