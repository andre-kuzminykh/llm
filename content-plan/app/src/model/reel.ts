// Лента как в TikTok: по одному материалу на экран — свой (что выпускаю: карточки календаря с темой и мои посты) или чужой
// (что смотрю: посты подписок). Как выглядит — по формату: короткое видео — кадр 9:16 с надписью, длинное — кадр 16:9
// в вертикальной рамке, пост — карточка или карусель с подписью, статья — обложка с подписью. Справа — цифры и «Саммери»:
// одно окно с саммери, топиками и кнопкой «Пересоздать».
import { tagsOf, type Post } from './metrics'
import type { Source } from './social'
import { filesOf, FORMAT_ICON, FULL_VIDEO, isImage, MAIL, SHORT_VIDEO, shownTitle, WEB_PAGE, type Competitor, type ISODate, type Item, type Status } from './types'

export type ReelKind = 'short' | 'video' | 'post' | 'carousel' | 'article'
export type Side = 'mine' | 'theirs'

/** Вид материала в ленте: у карточки календаря из нескольких форматов — по виду на формат (переключаются сверху). */
export interface Face {
  format: string
  kind: ReelKind
  label: string // «Вертикаль», «Пост», «Веб»
  platforms: string[]
  itemId?: string
}

export interface Reel {
  id: string
  side: Side
  title: string
  summary: string
  caption: string // подпись под материалом: текст с топиками
  tags: string[]
  owner: string // id аккаунта или канала
  ownerName: string
  handle?: string
  platform: string // откуда (у чужих) или главная площадка (у своих)
  at: number // когда вышел или выйдет, мс
  planned?: { date: ISODate; time: string; status: Status } // карточка календаря: ещё не вышла
  faces: Face[]
  slides: string[] // карусель и пост: текст слайдов
  images: string[] // фото из заметки карточки
  videos: { src: string; type: string }[] // видео из заметки карточки — играет в ленте
  duration?: number
  stats?: { views: number; likes: number; comments: number; shares: number }
  url?: string
  sample?: boolean
  itemId?: string
  hue: number // цвет кадра, если картинок нет: один и тот же у материала
  source: Source // для «Пересоздать»
}

/** Повторяемый оттенок от строки: кадр одного материала всегда одного цвета. */
export const hueOf = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % 360
}

/** Вид по формату: вертикаль — короткое видео, горизонталь — длинное, веб и письмо — статья, пост — карточка или карусель. */
export const kindOf = (format: string, images = 0): ReelKind =>
  format === SHORT_VIDEO ? 'short' : format === FULL_VIDEO ? 'video' : format === WEB_PAGE || format === MAIL ? 'article' : images > 1 ? 'carousel' : 'post'

/** Слайды карусели: заголовок, дальше — по мысли из саммери (предложения и части через тире). */
export function slidesOf(title: string, summary: string, max = 6): string[] {
  const parts = summary
    .split(/(?<=[.!?])\s+|\s+—\s+|;\s+/)
    .map((x) => x.trim().replace(/[.;]$/, ''))
    .filter((x) => x.length > 6)
  return [title, ...parts].slice(0, max)
}

const KIND_LABEL: Record<string, string> = { short: 'Вертикаль', video: 'Горизонталь', post: 'Пост', carousel: 'Карусель', article: 'Статья' }

/** Пост соцсети — в ленту: короткое и длинное видео как есть, текстовый — карусель, если в нём несколько мыслей. */
export function reelOfPost(p: Post, who?: { name: string; handle?: string }): Reel {
  const slides = slidesOf(p.title, p.summary)
  const kind: ReelKind = p.kind === 'post' ? (/карусел/i.test(p.summary) || (slides.length > 2 && hueOf(p.id) % 2 === 0) ? 'carousel' : 'post') : p.kind
  const tags = tagsOf(p.text)
  return {
    id: p.id,
    side: p.mine ? 'mine' : 'theirs',
    title: p.title,
    summary: p.summary,
    caption: p.text,
    tags,
    owner: p.owner,
    ownerName: who?.name ?? p.owner,
    handle: who?.handle,
    platform: p.platform,
    at: p.at,
    faces: [{ format: p.format, kind, label: KIND_LABEL[kind], platforms: [p.platform] }],
    slides,
    images: [],
    videos: [],
    duration: p.duration,
    stats: { views: p.views, likes: p.likes, comments: p.comments, shares: p.shares },
    url: p.url,
    sample: p.sample,
    hue: hueOf(p.id),
    source: { title: p.title, summary: p.summary, kind: p.kind, platform: p.platform, owner: who?.name, url: p.url },
  }
}

/** Карточка календаря с темой — в ленту «Я выпускаю»: вид на каждый формат карточки, фото — из заметки. */
export function reelOfCard(
  items: Item[],
  c: { channelName: string; color?: string; rubric?: string; time: string; at: number },
): Reel {
  const head = items[0]
  const images = filesOf(head).filter(isImage).map((f) => f.url)
  const videos = filesOf(head).filter((f) => f.type.startsWith('video/')).map((f) => ({ src: f.url, type: f.type }))
  const order = Object.keys(FORMAT_ICON)
  const sorted = [...items].sort((a, b) => order.indexOf(a.format) - order.indexOf(b.format))
  const faces: Face[] = sorted.map((it) => {
    const kind = kindOf(it.format, images.length)
    return { format: it.format, kind, label: FORMAT_ICON[it.format]?.label ?? KIND_LABEL[kind], platforms: it.platforms, itemId: it.id }
  })
  const note = (head.note ?? '').trim()
  const summary = note.split('\n').find((l) => l.trim())?.trim() || head.draft?.text.split('\n').find((l) => l.startsWith('Тема:'))?.slice(6) || shownTitle(head)
  const rubricTag = c.rubric ? `#${c.rubric.toLowerCase().replace(/\s+/g, '_')}` : ''
  return {
    id: `card|${head.id}`,
    side: 'mine',
    title: shownTitle(head),
    summary,
    caption: [note.split('\n').slice(0, 3).join(' '), rubricTag].filter(Boolean).join(' '),
    tags: rubricTag ? [rubricTag.slice(1)] : [],
    owner: head.channelId,
    ownerName: c.channelName,
    platform: faces.flatMap((f) => f.platforms)[0] ?? 'Web',
    at: c.at,
    planned: head.status === 'published' ? undefined : { date: head.date!, time: c.time, status: head.status },
    faces,
    slides: slidesOf(shownTitle(head), note),
    images,
    videos,
    itemId: head.id,
    hue: hueOf(head.id),
    source: { title: shownTitle(head), summary, kind: faces[0].kind === 'video' ? 'video' : faces[0].kind === 'short' ? 'short' : faces[0].kind === 'article' ? 'article' : 'post', owner: c.channelName, itemId: head.id, rubricId: head.rubricId },
  }
}

// ── подписки: ссылка на соцсеть → за кем следить ────────────────────────────────────────────────────────

const HOSTS: [RegExp, string][] = [
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)(t\.me|telegram\.me)$/, 'Telegram'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)(x\.com|twitter\.com)$/, 'X'],
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
]

/** Ссылка или @аккаунт → площадка, @аккаунт и имя. Ссылка на сайт — площадка Web; @аккаунт без ссылки — площадка, что выбрана. */
export function parseFollow(input: string, fallback = 'YouTube'): { platform: string; handle: string; name: string } | null {
  const raw = input.trim()
  if (!raw) return null
  if (/^@?[\p{L}\p{N}_.]{2,}$/u.test(raw) && !raw.includes('.')) {
    const h = raw.replace(/^@/, '')
    return { platform: fallback, handle: `@${h}`, name: h }
  }
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\.|^m\./, '').toLowerCase()
  if (!host.includes('.')) return null
  const platform = HOSTS.find(([re]) => re.test(host))?.[1] ?? 'Web'
  const seg = url.pathname.split('/').filter(Boolean)
  const pick = platform === 'LinkedIn' ? seg[1] ?? seg[0] : seg[0] === 'c' || seg[0] === 'channel' || seg[0] === 's' ? seg[1] ?? seg[0] : seg[0]
  if (platform === 'Web' || !pick) return { platform, handle: platform === 'Web' ? `${host}${url.pathname.replace(/\/$/, '')}` : host, name: host }
  const h = decodeURIComponent(pick).replace(/^@/, '')
  return { platform, handle: `@${h}`, name: h }
}

/** Уже следим за этим аккаунтом на этой площадке? */
export const followed = (list: Competitor[], f: { platform: string; handle: string }) =>
  list.some((c) => c.platform === f.platform && c.handle.toLowerCase() === f.handle.toLowerCase())
