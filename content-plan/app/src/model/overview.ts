// Аналитика на главной — как отчёт «Эффективность» в Google Search Console: плитки метрик за период (щелчок — линия на
// графике), график по часам или дням и таблица по разрезам — посты, топики, аккаунты, площадки, форматы. Щелчок по строке
// таблицы «проваливается»: фильтр по ней ставится на всю главную — графики, таблицу и ленту.
// Считается по постам (их просмотры, лайки, комментарии набираются со временем — shareIn) и рядам подписчиков.
import { shareIn, tagsOf, type Bucket, type Post, type Series } from './metrics'

export type Kpi = 'views' | 'likes' | 'comments' | 'shares' | 'followers'
export const KPIS: { id: Kpi; label: string; unit?: '%'; hint: string }[] = [
  { id: 'views', label: 'Просмотры', hint: 'за период' },
  { id: 'likes', label: 'Лайки', hint: 'за период' },
  { id: 'comments', label: 'Комментарии', hint: 'за период' },
  { id: 'shares', label: 'Репосты', hint: 'сколько раз переслали или поделились — за период' },
  { id: 'followers', label: 'Подписчики', hint: 'на конец периода' },
]

/** Фильтры главной — общие для графиков, таблицы и ленты; панель слева и щелчки по таблице ставят их же. */
export interface HomeFilters {
  hiddenOwners: string[] // аккаунты, которые скрыты
  hiddenPlatforms: string[]
  hiddenFormats: string[]
  pickedTopics: string[] // выделенные топики — только они; пусто — все
  post?: string // провалились в один пост
}
export const NO_HOME_FILTERS: HomeFilters = { hiddenOwners: [], hiddenPlatforms: [], hiddenFormats: [], pickedTopics: [] }

/** Топик — тег из текста без решётки: «кейсы_клиентов» → «кейсы клиентов». */
export const topicLabel = (t: string) => t.replace(/_/g, ' ')

export function postVisible(p: Post, f: HomeFilters) {
  if (f.post && p.id !== f.post) return false
  if (f.hiddenOwners.includes(p.owner) || f.hiddenPlatforms.includes(p.platform) || f.hiddenFormats.includes(p.format)) return false
  if (f.pickedTopics.length && !tagsOf(p.text).some((t) => f.pickedTopics.includes(t))) return false
  return true
}
/** Подписчики — у аккаунта на площадке, не у поста: по топику, формату или посту их не посчитать. */
export const followersApply = (f: HomeFilters) => !f.post && !f.pickedTopics.length && !f.hiddenFormats.length

interface Sums {
  views: number
  likes: number
  comments: number
  shares: number
}
function sumIn(posts: Post[], from: number, to: number, now: number): Sums {
  const s = { views: 0, likes: 0, comments: 0, shares: 0 }
  for (const p of posts) {
    const k = shareIn(p.at, from, to, now)
    if (!k) continue
    s.views += p.views * k
    s.likes += p.likes * k
    s.comments += p.comments * k
    s.shares += p.shares * k
  }
  return s
}
/** Подписчики на момент t: последнее значение каждого ряда не позже t, сложенное; рядов нет — null. */
function followersAt(series: Series[], t: number): number | null {
  let sum: number | null = null
  for (const s of series) {
    if (s.metric !== 'followers') continue
    let v: number | null = null
    for (const p of s.points) {
      if (p.t >= t) break
      v = p.v
    }
    if (v !== null) sum = (sum ?? 0) + v
  }
  return sum
}

/** Значения метрик по корзинам графика. */
export function kpiValues(posts: Post[], series: Series[], buckets: Bucket[], now: number): Record<Kpi, (number | null)[]> {
  const sums = buckets.map((b) => sumIn(posts, b.from, Math.min(b.to, now + 1), now))
  return {
    views: sums.map((s) => Math.round(s.views)),
    likes: sums.map((s) => Math.round(s.likes)),
    comments: sums.map((s) => Math.round(s.comments)),
    shares: sums.map((s) => Math.round(s.shares)),
    followers: buckets.map((b) => followersAt(series, Math.min(b.to, now + 1))),
  }
}

export interface Totals {
  views: number
  likes: number
  comments: number
  shares: number
  followers: number | null
  posts: number // сколько вышло за период
  prev: { views: number; likes: number; comments: number; shares: number; followers: number | null } // прошлый такой же период
}

/** Итоги за [from, now] и за такой же период до него — для плиток и «+12 %». */
export function totals(posts: Post[], series: Series[], from: number, now: number): Totals {
  const span = now - from
  const cur = sumIn(posts, from, now + 1, now)
  const prev = sumIn(posts, from - span, from, now)
  return {
    views: Math.round(cur.views),
    likes: Math.round(cur.likes),
    comments: Math.round(cur.comments),
    shares: Math.round(cur.shares),
    followers: followersAt(series, now + 1),
    posts: posts.filter((p) => p.at >= from && p.at <= now).length,
    prev: { views: Math.round(prev.views), likes: Math.round(prev.likes), comments: Math.round(prev.comments), shares: Math.round(prev.shares), followers: followersAt(series, from) },
  }
}

export type Dim = 'posts' | 'topics' | 'accounts' | 'platforms' | 'formats'
export const DIMS: { id: Dim; label: string; head: string }[] = [
  { id: 'posts', label: 'Посты', head: 'Пост' },
  { id: 'topics', label: 'Топики', head: 'Топик' },
  { id: 'accounts', label: 'Аккаунты', head: 'Аккаунт' },
  { id: 'platforms', label: 'Площадки', head: 'Площадка' },
  { id: 'formats', label: 'Форматы', head: 'Формат' },
]

export interface Row {
  key: string
  views: number
  likes: number
  comments: number
  shares: number
  posts: number // постов за период
}
export type Col = 'views' | 'likes' | 'comments' | 'shares' | 'posts'

const keysOf = (dim: Dim, p: Post): string[] =>
  dim === 'posts' ? [p.id] : dim === 'topics' ? tagsOf(p.text) : dim === 'accounts' ? [p.owner] : dim === 'platforms' ? [p.platform] : [p.format]

/** Строки таблицы по разрезу: цифры за период, по убыванию выбранного столбца. */
export function rowsBy(dim: Dim, posts: Post[], from: number, now: number, sort: Col = 'views'): Row[] {
  const m = new Map<string, Sums & { posts: number }>()
  for (const p of posts) {
    const k = shareIn(p.at, from, now + 1, now)
    if (!k) continue
    for (const key of keysOf(dim, p)) {
      const r = m.get(key) ?? { views: 0, likes: 0, comments: 0, shares: 0, posts: 0 }
      r.views += p.views * k
      r.likes += p.likes * k
      r.comments += p.comments * k
      r.shares += p.shares * k
      if (p.at >= from) r.posts++
      m.set(key, r)
    }
  }
  return [...m.entries()]
    .map(([key, s]) => ({ key, views: Math.round(s.views), likes: Math.round(s.likes), comments: Math.round(s.comments), shares: Math.round(s.shares), posts: s.posts }))
    .filter((r) => r.views > 0)
    .sort((a, b) => b[sort] - a[sort] || b.views - a.views)
}

/** Изменение к прошлому периоду, %: null — сравнивать не с чем. */
export const deltaPct = (cur: number | null, prev: number | null) => (cur === null || prev === null || !prev ? null : Math.round(((cur - prev) / prev) * 100))
