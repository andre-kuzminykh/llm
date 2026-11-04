// Главная лента: мои соцсети и конкуренты, «кто впереди» по просмотрам, лайкам и комментариям, и «Пересоздать» —
// из чужого или своего поста, видео или статьи сделать новый контент в той же форме: пост, короткие видео (нарезать на N),
// длинное видео или статью, с озвучкой (голос или аватар). Пересозданное ложится в календарь: в черновики или на даты.
import { addDays, weekday } from './dates'
import type { Post, PostKind } from './metrics'
import { newId, type Action } from './store'
import { FULL_VIDEO, isSlot, SHORT_VIDEO, TEXT_IMAGE, WEB_PAGE, type Account, type Competitor, type ISODate, type Item, type Plan, type Rule } from './types'

/** Демо: свои аккаунты и конкуренты, если человек ещё никого не подключил, — чтобы прототип было что листать. */
export const DEMO_ACCOUNTS: Account[] = [
  { id: 'demo-me-yt', name: 'Мой канал', platform: 'YouTube', handle: '@my_channel', lang: 'ru' },
  { id: 'demo-me-yt-en', name: 'My channel', platform: 'YouTube', handle: '@my_channel_en', lang: 'en' },
  { id: 'demo-me-tg', name: 'Мой канал', platform: 'Telegram', handle: '@my_channel', lang: 'ru' },
  { id: 'demo-me-ig', name: 'Мой канал', platform: 'Instagram', handle: '@my_channel', lang: 'ru' },
]
export const DEMO_RIVALS: Competitor[] = [
  { id: 'demo-rv-1', name: 'AI Daily', platform: 'YouTube', handle: '@aidaily', added: '2026-10-01' },
  { id: 'demo-rv-2', name: 'Нейросети без воды', platform: 'Telegram', handle: '@neuro_nowater', added: '2026-10-01' },
  { id: 'demo-rv-3', name: 'Tech Shorts', platform: 'TikTok', handle: '@techshorts', added: '2026-10-01' },
  { id: 'demo-rv-4', name: 'Growth Lab', platform: 'Instagram', handle: '@growthlab', added: '2026-10-01' },
]

export type Sort = 'new' | 'views' | 'likes' | 'comments' | 'shares'
export const SORTS: { id: Sort; label: string }[] = [
  { id: 'new', label: 'Свежие' },
  { id: 'views', label: 'Просмотры' },
  { id: 'likes', label: 'Лайки' },
  { id: 'comments', label: 'Комменты' },
  { id: 'shares', label: 'Репосты' },
]
export const sortPosts = (posts: Post[], by: Sort) => [...posts].sort((a, b) => (by === 'new' ? b.at - a.at : b[by] - a[by]))

export interface Leader {
  owner: string
  posts: number
  views: number // в среднем на пост
  likes: number
  comments: number
  shares: number
}

/** Кто впереди: средние просмотры, лайки и комментарии на пост у каждого аккаунта — по убыванию выбранного. */
export function leaders(posts: Post[], by: Sort): Leader[] {
  const m = new Map<string, Leader>()
  for (const p of posts) {
    const l = m.get(p.owner) ?? { owner: p.owner, posts: 0, views: 0, likes: 0, comments: 0, shares: 0 }
    l.posts++
    l.views += p.views
    l.likes += p.likes
    l.comments += p.comments
    l.shares += p.shares
    m.set(p.owner, l)
  }
  const key = by === 'new' ? 'views' : by
  return [...m.values()]
    .map((l) => ({ ...l, views: Math.round(l.views / l.posts), likes: Math.round(l.likes / l.posts), comments: Math.round(l.comments / l.posts), shares: Math.round(l.shares / l.posts) }))
    .sort((a, b) => b[key] - a[key])
}

// ── пересоздать ──────────────────────────────────────────────────────────────────────────────────────
// «Пересоздать» открывает ту же форму, что и новый контент: пост или видео — контекстом сверху, формат выбирает человек.
// Длинное видео можно нарезать на N коротких: в один день (несколько рилсов в день — дальше распихать руками),
// ежедневно по одному или по расписанию — друг за другом в ближайшие дни, когда формат рубрики в канале выходит по сетке.

export type Voice = 'tts' | 'avatar' | 'self'
export const VOICES: { id: Voice; label: string; note: string }[] = [
  { id: 'tts', label: 'Голосом', note: 'по тексту' },
  { id: 'avatar', label: 'Аватар', note: 'лицо читает' },
  { id: 'self', label: 'Сам', note: 'запишу сам' },
]

/** Из чего пересоздаём: пост или видео из ленты, или материал календаря. */
export interface Source {
  title: string
  summary: string
  kind: PostKind
  platform?: string
  owner?: string // имя аккаунта
  url?: string
  itemId?: string // материал календаря
  rubricId?: string | null
}

/** Контекст для пересоздания — текстом в заметку: откуда, ссылка, о чём. Дальше человек дописывает своё. */
export const contextOf = (s: Source) =>
  [`По мотивам: «${s.title}»${s.owner || s.platform ? ` — ${[s.owner, s.platform].filter(Boolean).join(', ')}` : ''}`, s.url, s.summary && s.summary !== s.title ? s.summary : '']
    .filter(Boolean)
    .join('\n')

/** С чего начать форму: длинное видео — нарезать на 3 коротких, короткое — пост, текст — короткое видео. */
export const presetOfSource = (s: Source): { format: string; count: number } =>
  s.kind === 'video' ? { format: SHORT_VIDEO, count: 3 } : s.kind === 'short' ? { format: TEXT_IMAGE, count: 1 } : { format: SHORT_VIDEO, count: 1 }

/** Как поставить части: в черновики, все в один день, по одному в день, по расписанию. */
export type Place = 'drafts' | 'sameDay' | 'daily' | 'schedule'

/** Формат рубрики в канале с расписанием (есть дни по сетке) — для «по расписанию». */
export const scheduleRule = (plan: Plan, channelId: string, rubricId: string | null, format: string) =>
  plan.rules.find((r) => r.channelId === channelId && r.rubricId === rubricId && r.format === format && r.days.some(Boolean) && r.freq !== 'разово')

/** Ближайшие n мест по расписанию с from: дни сетки, где формата ещё нет или стоит пустой слот (его и займём). */
export function scheduleDates(plan: Plan, rule: Rule, from: ISODate, n: number): { date: ISODate; slot?: Item }[] {
  const out: { date: ISODate; slot?: Item }[] = []
  for (let d = from; out.length < n && d <= addDays(from, 3 * 365); d = addDays(d, 1)) {
    if (!rule.days[weekday(d)]) continue
    const here = plan.items.filter((x) => x.ruleId === rule.id && x.date === d && !x.derive)
    const slot = here.find(isSlot)
    if (slot) out.push({ date: d, slot })
    else if (here.length < Math.max(1, rule.limit)) out.push({ date: d })
  }
  return out
}

/** Части нарезки: «Тема — часть 2 из 5». По расписанию пустые слоты рубрики занимаются (тема и заметка — в них),
 *  остальное встаёт на свободные дни сетки; в один день и ежедневно — разово, вне сетки. Одним шагом истории. */
export function partsActions(plan: Plan, base: Item, n: number, place: Place, sched?: Rule): { actions: Action[]; dates: (ISODate | null)[] } {
  const actions: Action[] = []
  const dates: (ISODate | null)[] = []
  const from = base.date
  const places = sched && from ? scheduleDates(plan, sched, from, n) : []
  const dateOf = (i: number): ISODate | null =>
    !from || place === 'drafts'
      ? null
      : place === 'sameDay'
        ? from
        : place === 'daily'
          ? addDays(from, i)
          : places[i]?.date ?? addDays(places[places.length - 1]?.date ?? from, 1 + i - places.length)
  for (let i = 0; i < n; i++) {
    const date = dateOf(i)
    dates.push(date)
    const title = n > 1 ? `${base.title} — часть ${i + 1} из ${n}` : base.title
    const slot = place === 'schedule' ? places[i]?.slot : undefined
    if (slot) {
      actions.push({ type: 'update', id: slot.id, patch: { title, ...(base.note ? { note: base.note } : {}), ...(base.ref ? { ref: base.ref } : {}), ...(base.voice ? { voice: base.voice } : {}) } })
      continue
    }
    const it: Item = { ...base, id: newId(), date, title, source: date ? base.source : 'черновик' }
    if (place === 'schedule' && sched) {
      it.ruleId = sched.id
      delete it.offGrid
    } else if (date) it.offGrid = true
    actions.push({ type: 'create', item: it, withFamily: false })
  }
  return { actions, dates }
}

/** Источник из материала календаря: длинное видео — нарезать, статья или пост — в видео. */
export function sourceOfItem(it: Item, owner?: string): Source {
  const kind: PostKind = it.format === FULL_VIDEO ? 'video' : it.format === SHORT_VIDEO ? 'short' : it.format === WEB_PAGE ? 'article' : 'post'
  return { title: it.title, summary: it.note?.split('\n')[0] || it.title, kind, owner, itemId: it.id, rubricId: it.rubricId }
}
