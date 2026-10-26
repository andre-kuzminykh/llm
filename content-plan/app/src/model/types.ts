// Данные контент-плана. Тот же формат лежит в public/seed.json (его пишет ../build.py)
// и в выгрузке JSON — поэтому поля плоские и сериализуемые.
//
// Рубрика — о чём материал: Демо, Академия, Тезисы… Правило — как рубрика выходит:
// формат (FULL, тизер, анонс, урок, письмо), канал, площадки, дни недели и время.
// Название материала — только тема («Стратегия»): рубрика и формат стоят рядом метками.

export type ISODate = string // 'YYYY-MM-DD'

export interface Section {
  id: string
  name: string // как в Telegram: «Dataist Lab»
  web: string // как на сайте: «Лаборатория»
}

export interface Channel {
  id: string
  name: string
  color: string
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
  format: string
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

/** Тема-хэштег: «Демо» → «#демо». */
export const tagOf = (name: string) => `#${name.toLowerCase().replace(/\s+/g, '_')}`

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

const DEFAULT_TYPES: Record<string, string> = {
  Web: 'Статья', YouTube: 'Видео', Instagram: 'Reels', TikTok: 'Видео', Threads: 'Пост', X: 'Пост', Telegram: 'Пост', LinkedIn: 'Пост', Mail: 'Письмо',
}

/** Что выходит на площадке в этом формате: «FULL» на YouTube, «Reels» в Instagram. */
export function typeOf(rule: Rule | undefined, platform: string) {
  const own = rule?.types?.[platform]
  if (own) return own
  if (platform === 'YouTube' && rule?.full) return 'FULL'
  if (platform === 'YouTube' && rule?.format === 'Shorts') return 'Shorts'
  return DEFAULT_TYPES[platform] ?? platform
}

export const DEFAULT_TIME = '12:00'
/** Как подписан поток вместо времени: «24/7». */
export const STREAM_TIME = '24/7'
export const timeOf = (it: Pick<Item, 'time'>, rule: Rule | undefined) => it.time ?? rule?.time ?? DEFAULT_TIME
