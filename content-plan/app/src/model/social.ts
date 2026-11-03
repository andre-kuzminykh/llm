// Главная лента: мои соцсети и конкуренты, «кто впереди» по просмотрам, лайкам и комментариям, и «Пересоздать» —
// из чужого или своего поста, видео или статьи сделать пост, короткие видео (нарезать на N), длинное видео или статью
// со сценарием и озвучкой (голос или аватар). Пересозданное ложится в календарь: в черновики или на даты.
import { addDays, weekday } from './dates'
import type { Post, PostKind } from './metrics'
import { newId, type Action } from './store'
import { FORMAT_SHORT, FULL_VIDEO, isSlot, presetPlatforms, SHORT_VIDEO, TEXT_IMAGE, WEB_PAGE, type Account, type Competitor, type ISODate, type Item, type Plan, type Rule } from './types'

/** Демо: свои аккаунты и конкуренты, если человек ещё никого не подключил, — чтобы прототип было что листать. */
export const DEMO_ACCOUNTS: Account[] = [
  { id: 'demo-me-yt', name: 'Мой канал', platform: 'YouTube', handle: '@my_channel' },
  { id: 'demo-me-tg', name: 'Мой канал', platform: 'Telegram', handle: '@my_channel' },
  { id: 'demo-me-ig', name: 'Мой канал', platform: 'Instagram', handle: '@my_channel' },
]
export const DEMO_RIVALS: Competitor[] = [
  { id: 'demo-rv-1', name: 'AI Daily', platform: 'YouTube', handle: '@aidaily', added: '2026-10-01' },
  { id: 'demo-rv-2', name: 'Нейросети без воды', platform: 'Telegram', handle: '@neuro_nowater', added: '2026-10-01' },
  { id: 'demo-rv-3', name: 'Tech Shorts', platform: 'TikTok', handle: '@techshorts', added: '2026-10-01' },
  { id: 'demo-rv-4', name: 'Growth Lab', platform: 'Instagram', handle: '@growthlab', added: '2026-10-01' },
]

export type Sort = 'new' | 'views' | 'likes' | 'comments'
export const SORTS: { id: Sort; label: string }[] = [
  { id: 'new', label: 'Свежие' },
  { id: 'views', label: 'Просмотры' },
  { id: 'likes', label: 'Лайки' },
  { id: 'comments', label: 'Комменты' },
]
export const sortPosts = (posts: Post[], by: Sort) => [...posts].sort((a, b) => (by === 'new' ? b.at - a.at : b[by] - a[by]))

export interface Leader {
  owner: string
  posts: number
  views: number // в среднем на пост
  likes: number
  comments: number
}

/** Кто впереди: средние просмотры, лайки и комментарии на пост у каждого аккаунта — по убыванию выбранного. */
export function leaders(posts: Post[], by: Sort): Leader[] {
  const m = new Map<string, Leader>()
  for (const p of posts) {
    const l = m.get(p.owner) ?? { owner: p.owner, posts: 0, views: 0, likes: 0, comments: 0 }
    l.posts++
    l.views += p.views
    l.likes += p.likes
    l.comments += p.comments
    m.set(p.owner, l)
  }
  const key = by === 'new' ? 'views' : by
  return [...m.values()]
    .map((l) => ({ ...l, views: Math.round(l.views / l.posts), likes: Math.round(l.likes / l.posts), comments: Math.round(l.comments / l.posts) }))
    .sort((a, b) => b[key] - a[key])
}

// ── пересоздать ──────────────────────────────────────────────────────────────────────────────────────

export type Output = 'post' | 'shorts' | 'long' | 'article'
export const OUTPUTS: { id: Output; label: string; format: string; icon: string }[] = [
  { id: 'post', label: 'Пост', format: TEXT_IMAGE, icon: 'f-post' },
  { id: 'shorts', label: 'Короткие видео', format: SHORT_VIDEO, icon: 'f-vertical' },
  { id: 'long', label: 'Длинное видео', format: FULL_VIDEO, icon: 'f-horizontal' },
  { id: 'article', label: 'Статья', format: WEB_PAGE, icon: 'f-web' },
]
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

/** Что предложить сразу: длинное видео — нарезать на короткие (3), короткое — пост, текст — короткое видео. */
export const defaultOutput = (s: Source): { output: Output; count: number } =>
  s.kind === 'video' ? { output: 'shorts', count: 3 } : s.kind === 'short' ? { output: 'post', count: 1 } : { output: 'shorts', count: 1 }

const VOICE_LINE: Record<Voice, string> = {
  tts: 'Озвучка: голосом по этому тексту.',
  avatar: 'Озвучка: аватар (лицо) читает этот текст.',
  self: 'Озвучка: запишу сам по этому тексту.',
}

/** Черновик сценария — заготовка по теме и саммери источника; в продукте его напишет ИИ, здесь — правят руками. */
export function scriptOf(s: Source, output: Output, voice: Voice, part = 1, parts = 1): string {
  const from = `Источник: ${[s.owner, s.platform].filter(Boolean).join(', ') || 'материал календаря'} — «${s.title}»${s.url ? ` (${s.url})` : ''}`
  const voiceLine = output === 'shorts' || output === 'long' ? `\n${VOICE_LINE[voice]}` : ''
  const body: Record<Output, string> = {
    shorts: `Часть ${part} из ${parts}.\nХук (0–3 с): почему это важно — одной фразой.\nСуть (3–40 с): ${s.summary}\nФинал (5 с): ${part < parts ? `продолжение — в части ${part + 1}.` : 'подписывайтесь, разберём ещё.'}`,
    long: `Вступление: о чём ролик и что зритель получит.\nКонтекст: ${s.summary}\nГлавное: три мысли из источника — своими словами, со своими примерами.\nПрактика: как применить у себя.\nВывод и призыв: что сделать после просмотра.`,
    post: `Заголовок: ${s.title}\nТекст: ${s.summary} Добавить свой опыт и вывод.\nВопрос к подписчикам: а как у вас?`,
    article: `Заголовок: ${s.title}\nЛид: ${s.summary}\nРазделы: контекст, разбор, примеры, вывод.`,
  }
  return `${body[output]}${voiceLine}\n\n${from}`
}

/** Куда поставить: в черновики; все в один день (несколько рилсов в день — дальше распихать руками); по одному в день;
 *  по расписанию — друг за другом в ближайшие дни, когда формат рубрики в канале выходит по сетке (пустые места — заполнить). */
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

export interface Recreate {
  source: Source
  output: Output
  count: number // коротких видео — на сколько нарезать
  voice: Voice
  channelId: string
  rubricId: string | null // рубрика (тег) из плана
  newRubric?: string // или новая — заведётся
  place: Place
  date: ISODate // с какого дня ставить (для черновиков не нужен)
  title: string
  script: string // сценарий; у коротких — свой номер части в начале
}

/** Действия, которые создают пересозданное: рубрику и формат, если их нет, и сами материалы — одним шагом истории.
 *  По расписанию пустые слоты рубрики занимаются (тема и сценарий — в них), остальное встаёт на свободные дни сетки. */
export function recreateActions(plan: Plan, r: Recreate): { actions: Action[]; dates: (ISODate | null)[] } {
  const actions: Action[] = []
  const format = OUTPUTS.find((o) => o.id === r.output)!.format
  let rubricId = r.rubricId
  if (!rubricId && r.newRubric?.trim()) {
    rubricId = newId('k')
    actions.push({ type: 'addRubric', name: r.newRubric.trim(), id: rubricId })
  }
  const channel = plan.channels.find((c) => c.id === r.channelId)
  const sched = r.place === 'schedule' ? scheduleRule(plan, r.channelId, rubricId, format) : undefined
  let rule: Rule | undefined = sched ?? plan.rules.find((x) => x.channelId === r.channelId && x.rubricId === rubricId && x.format === format)
  let ruleId = rule?.id
  if (!ruleId) {
    // такого формата у рубрики в канале нет — заведётся разовым, без дней по сетке
    ruleId = newId('r')
    actions.push({ type: 'addRule', rubricId, channelId: r.channelId, name: FORMAT_SHORT[format] ?? format, id: ruleId, days: [false, false, false, false, false, false, false], format })
    rule = undefined
  }
  const platforms = presetPlatforms(plan, channel, format, rule)
  const n = r.output === 'shorts' ? Math.max(1, Math.min(20, r.count)) : 1
  const places = sched ? scheduleDates(plan, sched, r.date, n) : []
  const dateOf = (i: number): ISODate | null =>
    r.place === 'drafts' ? null : r.place === 'sameDay' ? r.date : r.place === 'daily' ? addDays(r.date, i) : places[i]?.date ?? addDays(places[places.length - 1]?.date ?? r.date, 1 + i - places.length)
  const titleOf = (i: number) => (n > 1 ? `${r.title} — часть ${i + 1} из ${n}` : r.title)
  const noteOf = (i: number) => (n > 1 ? r.script.replace(/^Часть \d+ из \d+\./, `Часть ${i + 1} из ${n}.`) : r.script)
  const dates: (ISODate | null)[] = []
  const items: Item[] = []
  for (let i = 0; i < n; i++) {
    const date = dateOf(i)
    dates.push(date)
    // по расписанию: пустой слот рубрики — занимаем его, а не ставим рядом второй материал
    const slot = sched ? places[i]?.slot : undefined
    if (slot) {
      actions.push({ type: 'update', id: slot.id, patch: { title: titleOf(i), note: noteOf(i), ...(r.output === 'shorts' || r.output === 'long' ? { voice: r.voice } : {}) } })
      continue
    }
    const it: Item = {
      id: newId(),
      date,
      channelId: r.channelId,
      ruleId: ruleId!,
      rubricId,
      title: titleOf(i),
      format,
      platforms,
      status: 'planned',
      source: date ? 'пересоздано' : 'черновик',
      rank: 50,
      note: noteOf(i),
    }
    // в один день или ежедневно — разово, вне сетки (несколько рилсов в день сетка не считает лишними); по расписанию — по сетке
    if (date && !sched) it.offGrid = true
    if (r.output === 'shorts' || r.output === 'long') it.voice = r.voice
    items.push(it)
  }
  for (const item of items) actions.push({ type: 'create', item, withFamily: false })
  return { actions, dates }
}

/** Источник из материала календаря: длинное видео — нарезать, статья или пост — в видео. */
export function sourceOfItem(it: Item, owner?: string): Source {
  const kind: PostKind = it.format === FULL_VIDEO ? 'video' : it.format === SHORT_VIDEO ? 'short' : it.format === WEB_PAGE ? 'article' : 'post'
  return { title: it.title, summary: it.note?.split('\n')[0] || it.title, kind, owner, itemId: it.id, rubricId: it.rubricId }
}
