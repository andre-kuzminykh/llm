// Данные контент-плана. Тот же формат лежит в public/seed.json (его пишет ../build.py)
// и в выгрузке JSON — поэтому поля плоские и сериализуемые.
//
// Рубрика — о чём материал: Демо, Академия, Тезисы… Правило — как рубрика выходит:
// формат (FULL, тизер, анонс, урок, письмо), канал, площадки, дни недели и время.
// Название материала — только тема («Стратегия»): рубрика и формат стоят рядом метками.

export type ISODate = string // 'YYYY-MM-DD'

export interface Section {
  id: string
  name: string // как в Telegram
  web: string // как на сайте и в плане: «Лаборатория Датаиста»
  color?: string // свой цвет раздела; без него — цвет канала
}

export interface Channel {
  id: string
  name: string
  color: string // цвет карточек; меняется в фильтрах
  start: ISODate
  platforms: string[]
  sections: Section[]
}

export interface Rubric {
  id: string
  name: string
  what: string
}

export interface Rule {
  id: string
  rubricId: string | null // null — общий формат: выходит с FULL любой рубрики (тизер, анонсы)
  name: string // формат: «FULL», «Урок дня», «Тизер FULL»
  channelId: string
  sectionId?: string
  channel: string // где выходит: «YouTube Dataist», «Dataist Lab»
  what: string
  format: string // один из FORMATS: «Полное горизонтальное видео», «Текст с картинкой»…
  platforms: string[]
  days: boolean[] // Пн..Вс
  dayNotes: string[] // уточнение к дню: «через нед.», «2-й чт»
  freq: string
  source: string
  full: boolean
  limit: number // сколько материалов правила в день на канал (группа — один)
  time: string // во сколько выходит, если у материала не задано своё: «12:00»
  types: Record<string, string> // что выходит на площадке: YouTube → «FULL», Instagram → «Reels»
  bank?: boolean // темы к формату копятся в банке
  stream?: boolean // поток: выходит по вебхуку круглосуточно, как только пришло (лента Neuronium); своего времени нет
}

export type Status = 'planned' | 'progress' | 'paused' | 'ready' | 'published'

export interface Item {
  id: string
  date: ISODate | null // null — тема в банке, ещё без даты
  channelId: string
  sectionId?: string
  ruleId: string
  rubricId: string | null
  title: string // тема: «Стратегия»; «…» — слот, тема ещё не задана
  format: string
  platforms: string[]
  status: Status
  source: string
  rank: number
  group?: string
  derive?: string // шаблон заголовка от главного материала группы: «{title}»
  origDate?: ISODate
  note?: string
  time?: string // своё время публикации; без него — время формата
  end?: string // до скольки занимает шкалу времени (растянули нижний край); без него — час
  offGrid?: boolean // разовый, вне сетки: проверка его не трогает
  owner?: string // кто делает
  due?: ISODate // подготовить к; без него — за несколько дней до выхода (leadOf)
  done?: string[] // готовые части задачи: «id материала|площадка»
  trigger?: string // версия для другой площадки: создаётся автоматически, когда выйдет оригинал (его id)
}

export interface Plan {
  version: 3
  start: ISODate
  end: ISODate
  platforms: string[]
  channels: Channel[]
  rubrics: Rubric[]
  rules: Rule[]
  items: Item[]
}

/** Статус показывается значком; «в плане» — без значка. Подпись — для подсказки и экранного диктора. */
export const STATUSES: { id: Status; label: string; icon?: string }[] = [
  { id: 'planned', label: 'В плане' },
  { id: 'progress', label: 'В работе', icon: 'play' },
  { id: 'paused', label: 'На паузе', icon: 'pause' },
  { id: 'ready', label: 'Готово', icon: 'check' },
  { id: 'published', label: 'Вышло', icon: 'published' },
]
export const statusOf = (id: Status) => STATUSES.find((s) => s.id === id) ?? STATUSES[0]

export const PLACEHOLDER = '…'
export const SLOT_TEXT = 'Нужна тема'
export const SPREAD = 'С каждым FULL'
export const isSlot = (it: Pick<Item, 'title'>) => it.title.trim() === PLACEHOLDER
export const shownTitle = (it: Pick<Item, 'title'>) => (isSlot(it) ? SLOT_TEXT : it.title)

/** Рубрика — просто название, без решётки: «#кейсы_клиентов» → «Кейсы клиентов»; первая буква — заглавная. */
export const rubricName = (s: string) => {
  const n = s.trim().replace(/^#+/, '').replace(/[_\s]+/g, ' ').trim()
  return n && n[0].toUpperCase() + n.slice(1)
}
/** Для сравнения рубрик: регистр, пробелы и решётка не важны. */
export const rubricKey = (s: string) => rubricName(s).toLowerCase()

/** Подпись материала: «Демо · FULL», «Демо · Тизер FULL»; формат, совпадающий с рубрикой, не повторяется. */
export function labelOf(rubric: Rubric | undefined, rule: Rule | undefined) {
  const r = rubric?.name
  const f = rule?.name
  if (!r) return f ?? ''
  if (!f || f === r) return r
  return `${r} · ${f}`
}

/** Тема — это и есть название формата («Все новости», «Лайфхак дня»): повторять её не нужно. */
export const titleIsFormat = (title: string, rule: Rule | undefined) => !!rule && (title === rule.name || rule.name.startsWith(`${title} `))

/** Строка CSV-календаря: «Демо · FULL: Стратегия»; для авто-рубрик — только подпись. */
export function lineOf(rubric: Rubric | undefined, rule: Rule | undefined, title: string) {
  const label = labelOf(rubric, rule)
  return titleIsFormat(title, rule) ? label : `${label}: ${title}`
}

/** Форматы — какой это материал по виду. Что именно выходит на площадке (Reels, строка письма) — в типах правила. */
export const FULL_VIDEO = 'Полное горизонтальное видео'
export const SHORT_VIDEO = 'Короткое вертикальное видео'
export const WEB_PAGE = 'Страница на сайте'
export const TEXT_IMAGE = 'Текст с картинкой'
export const FORMATS: { group: string; items: string[] }[] = [
  { group: 'Видео', items: [FULL_VIDEO, SHORT_VIDEO] },
  { group: 'Текст', items: [WEB_PAGE, TEXT_IMAGE] },
]
/** Коротко — в подписях дорожек и расписания и как название нового формата рубрики: «#кейсы · Текст с картинкой». */
export const FORMAT_SHORT: Record<string, string> = { [FULL_VIDEO]: 'Полное видео', [SHORT_VIDEO]: 'Короткое видео', [WEB_PAGE]: 'Страница на сайте', [TEXT_IMAGE]: 'Текст с картинкой' }
/** Значок и короткая подпись формата: горизонталь, вертикаль, веб, пост — в форме формат выбирают ими. */
export const FORMAT_ICON: Record<string, { icon: string; label: string }> = {
  [FULL_VIDEO]: { icon: 'f-horizontal', label: 'Горизонталь' },
  [SHORT_VIDEO]: { icon: 'f-vertical', label: 'Вертикаль' },
  [WEB_PAGE]: { icon: 'f-web', label: 'Веб' },
  [TEXT_IMAGE]: { icon: 'f-post', label: 'Пост' },
}
/** Где такой формат выходит, если канал там есть: полное видео — YouTube, страница — сайт… */
export const FORMAT_PLATFORMS: Record<string, string[]> = {
  [FULL_VIDEO]: ['YouTube'],
  [SHORT_VIDEO]: ['YouTube', 'Instagram', 'TikTok'],
  [WEB_PAGE]: ['Web'],
  [TEXT_IMAGE]: ['Telegram'],
}
const FORMAT_NAMES = FORMATS.flatMap((g) => g.items)
export const isFormat = (f: string) => FORMAT_NAMES.includes(f)
/** Группа формата: «Видео» или «Текст». */
export const formatGroup = (f: string) => FORMATS.find((g) => g.items.includes(f)) ?? FORMATS[1]

/** Старый формат (FULL, Shorts, Пост, Урок, письмо…) → один из FORMATS; с сайтом — страница на сайте. */
export function formatOf(old: string, platforms: string[]): string {
  if (isFormat(old)) return old
  if (old === 'FULL' || old === 'Видео') return FULL_VIDEO
  if (/shorts|reels/i.test(old)) return SHORT_VIDEO
  return platforms.includes('Web') ? WEB_PAGE : TEXT_IMAGE
}

/** Серый — цвет разделов по умолчанию; его же можно выбрать любому каналу. */
export const GRAY = '#8e8e93'

/** Цвет материала: свой цвет раздела, иначе цвет канала. */
export function colorOf(channel: Channel | undefined, sectionId?: string) {
  return channel?.sections.find((s) => s.id === sectionId)?.color ?? channel?.color
}

const DEFAULT_TYPES: Record<string, string> = {
  Web: 'Статья', YouTube: 'Видео', Instagram: 'Reels', TikTok: 'Видео', Threads: 'Пост', X: 'Пост', Telegram: 'Пост', LinkedIn: 'Пост', Mail: 'Письмо',
}

/** Что выходит на площадке в этом формате: «FULL» на YouTube, «Reels» в Instagram. */
export function typeOf(rule: Rule | undefined, platform: string) {
  const own = rule?.types?.[platform]
  if (own) return own
  if (platform === 'YouTube' && rule?.full) return 'FULL'
  if (platform === 'YouTube' && rule?.format === SHORT_VIDEO) return 'Shorts'
  return DEFAULT_TYPES[platform] ?? platform
}

export const DEFAULT_TIME = '12:00'
/** Как подписан поток вместо времени: «24/7». */
export const STREAM_TIME = '24/7'
export const timeOf = (it: Pick<Item, 'time'>, rule: Rule | undefined) => it.time ?? rule?.time ?? DEFAULT_TIME
