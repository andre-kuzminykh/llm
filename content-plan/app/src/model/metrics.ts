// Данные соцсетей для аналитики: подписчики, просмотры, вовлечённость — по часам, у своих каналов и у конкурентов, и посты
// конкурентов с саммери для ленты вдохновения. Придут с сервера, когда подключим площадки (нужны доступы к аккаунтам);
// пока источника нет — пусто, а посмотреть, как это выглядит, можно на явно помеченном примере (sampleFeed).
import { FULL_VIDEO, SHORT_VIDEO, TEXT_IMAGE, WEB_PAGE } from './types'

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

/** Пост из соцсети — мой или конкурента: тема, текст с тегами, короткое саммери и цифры; его можно пересоздать. */
export type PostKind = 'video' | 'short' | 'post' | 'article'
export interface Post {
  id: string
  owner: string // id моего аккаунта или конкурента
  platform: string
  at: number // когда вышел, мс
  title: string
  text: string // текст поста или описание видео — из него берутся теги (#ии, #кейсы)
  summary: string
  url?: string
  views: number
  likes: number
  comments: number
  kind: PostKind
  duration?: number // видео, секунд
  format: string // как наш формат: вертикаль, горизонталь, пост
  mine?: boolean // мой пост, а не конкурента
  sample?: boolean // из примера, не настоящий
}

/** Теги из текста: «#ИИ #кейсы_клиентов» → «ии», «кейсы_клиентов» — по ним собираются топики ленты. */
export const tagsOf = (text: string) => [...new Set([...text.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1].toLowerCase()))]

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

// темы примера: тема, саммери, вид поста, теги в тексте
const SAMPLE_TOPICS: [string, string, PostKind, string][] = [
  ['5 ИИ-агентов, которые экономят день', 'Короткий обзор пяти агентов с ценами и сценариями — в конце сравнение по сэкономленному времени.', 'short', '#ии #агенты #продуктивность'],
  ['Как мы автоматизировали отдел продаж', 'Кейс с цифрами до и после, три шага внедрения и ошибки, которых стоит избежать.', 'video', '#кейсы #продажи #автоматизация'],
  ['Новая модель — что изменилось', 'Что умеет новая версия, где она лучше прошлой и кому стоит переходить.', 'post', '#ии #новости'],
  ['Промпт, который пишет план недели', 'Готовый промпт и разбор, почему он работает; в комментариях — варианты под разные задачи.', 'short', '#промпты #продуктивность'],
  ['Тренды недели в ИИ', 'Пять новостей недели одной каруселью, по слайду на новость.', 'post', '#ии #тренды #новости'],
  ['Ошибки при внедрении ИИ в компании', 'Список типичных ошибок и чек-лист, как их обойти: от пилота до масштаба.', 'video', '#кейсы #внедрение'],
  ['Как выбрать нейросеть для текстов', 'Сравнение четырёх моделей на одних и тех же задачах: скорость, качество, цена.', 'article', '#ии #сравнение #тексты'],
  ['Один день из жизни ИИ-продюсера', 'Влог: как устроен день, какие инструменты в работе, где ИИ помогает, а где мешает.', 'video', '#влог #продуктивность'],
]
const KIND_FORMAT: Record<PostKind, string> = { video: FULL_VIDEO, short: SHORT_VIDEO, post: TEXT_IMAGE, article: WEB_PAGE }

/** Пост набирает просмотры быстрее всего в первые сутки-двое: к моменту t — доля 1 − e^(−(t − выход)/TAU). */
export const TAU = 36 * HOUR
const gained = (at: number, t: number) => (t <= at ? 0 : 1 - Math.exp(-(t - at) / TAU))
/** Какая доля цифр поста (на now) набрана за [from, to) — для графиков по часам и дням. */
export function shareIn(at: number, from: number, to: number, now: number): number {
  const total = gained(at, now)
  if (!total) return 0
  const a = Math.max(from, at)
  const b = Math.min(to, now)
  return b > a ? (gained(at, b) - gained(at, a)) / total : 0
}

/** Пример данных за 90 дней по часам для своих каналов и конкурентов; посты — тоже за 90 дней (мои — с mine). */
export function sampleFeed(now: number, owners: { id: string; platforms: string[]; rival?: boolean; posts?: boolean }[]): Feed {
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
      if (o.posts === false) continue
      for (let d = 0; d < 90; d++) {
        if (r() < 0.35) continue
        const [title, summary, kind0, tags] = SAMPLE_TOPICS[Math.floor(r() * SAMPLE_TOPICS.length)]
        // у видеоплощадок — видео, у текстовых — посты
        const kind: PostKind = platform === 'YouTube' ? (kind0 === 'short' ? 'short' : 'video') : platform === 'TikTok' || platform === 'Instagram' ? 'short' : kind0 === 'article' ? 'article' : 'post'
        const at = end - d * DAY - Math.floor(r() * 12) * HOUR
        // свежий пост ещё набирает: цифры — сколько набрал к этому часу
        const views = Math.round(viewsBase * (8 + r() * 40) * gained(at, now + HOUR))
        posts.push({
          id: `${o.id}|${platform}|${d}`,
          owner: o.id,
          platform,
          at,
          title,
          text: `${summary} ${tags}`,
          summary,
          views,
          likes: Math.round(views * (0.02 + r() * 0.08)),
          comments: Math.round(views * (0.002 + r() * 0.01)),
          kind,
          duration: kind === 'video' ? Math.round(420 + r() * 1400) : kind === 'short' ? Math.round(20 + r() * 40) : undefined,
          format: KIND_FORMAT[kind],
          mine: !o.rival,
          sample: true,
        })
      }
    }
  }
  posts.sort((a, b) => b.at - a.at)
  return { series, posts }
}
