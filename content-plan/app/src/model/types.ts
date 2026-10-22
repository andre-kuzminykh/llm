// Данные контент-плана. Тот же формат лежит в public/seed.json (его пишет ../build.py)
// и в выгрузке JSON — поэтому поля плоские и сериализуемые.
//
// Рубрика — о чём материал: Демо, Академия, Тезисы… Правило — как рубрика выходит:
// формат (FULL, тизер, анонс, урок, письмо), канал, площадки и дни недели.

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
  pattern?: string // заголовок из темы: «Демо / {topic}»
}

export type Status = 'planned' | 'progress' | 'paused' | 'ready' | 'published'

export interface Item {
  id: string
  date: ISODate | null // null — тема в банке, ещё без даты
  channelId: string
  sectionId?: string
  ruleId: string
  rubricId: string | null
  title: string
  format: string
  platforms: string[]
  status: Status
  source: string
  rank: number
  group?: string
  derive?: string // шаблон заголовка от главного материала группы
  origDate?: ISODate
  note?: string
}

export interface Plan {
  version: 2
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
export const SPREAD = 'С каждым FULL'
export const isSlot = (it: Pick<Item, 'title'>) => it.title.includes(PLACEHOLDER)

/** Подпись материала: «Демо · FULL», «Демо · Тизер FULL»; формат, совпадающий с рубрикой, не повторяется. */
export function labelOf(rubric: Rubric | undefined, rule: Rule | undefined) {
  const r = rubric?.name
  const f = rule?.name
  if (!r) return f ?? ''
  if (!f || f === r) return r
  return `${r} · ${f}`
}
