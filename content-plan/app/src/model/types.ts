// Данные контент-плана. Тот же формат лежит в public/seed.json (его пишет ../build.py)
// и в выгрузке JSON — поэтому поля плоские и сериализуемые.

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
  channelId: string
  sectionId?: string
  channel: string // подпись «канал / раздел» из правил
  name: string
  what: string
  format: string
  platforms: string[]
  days: boolean[] // Пн..Вс
  dayNotes: string[] // уточнение к дню: «через нед.», «2-й чт»
  freq: string
  source: string
  full: boolean
  limit: number // сколько материалов рубрики в день на канал (группа — один)
  pattern?: string // заголовок из темы: «Демо / {topic}»
}

export type Status = 'planned' | 'progress' | 'ready' | 'published'

export interface Item {
  id: string
  date: ISODate | null // null — тема в банке, ещё без даты
  channelId: string
  sectionId?: string
  rubricId: string
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
  version: 1
  start: ISODate
  end: ISODate
  platforms: string[]
  channels: Channel[]
  rubrics: Rubric[]
  items: Item[]
}

export const STATUSES: { id: Status; label: string }[] = [
  { id: 'planned', label: 'План' },
  { id: 'progress', label: 'В работе' },
  { id: 'ready', label: 'Готово' },
  { id: 'published', label: 'Вышло' },
]

export const PLACEHOLDER = '…'
export const isSlot = (it: Pick<Item, 'title'>) => it.title.includes(PLACEHOLDER)
