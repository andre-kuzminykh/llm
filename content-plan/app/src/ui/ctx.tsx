import { createContext, useContext } from 'react'
import type { Filters } from '../model/filters'
import type { HomeFilters } from '../model/overview'
import type { HintLine, Move } from '../model/hint'
import type { Violation } from '../model/rules'
import type { Source } from '../model/social'
import type { Action } from '../model/store'
import type { Channel, ISODate, Item, Plan, Rubric, Rule, Status } from '../model/types'
import type { Unit } from '../model/units'

/** Что показывает календарь: неделю по часам или дорожками по каналам, площадкам, темам; на телефоне ещё — ленту по дням.
 *  Выбирается в левой панели, как фильтр. */
export type Mode = 'time' | 'channels' | 'platforms' | 'topics' | 'feed'

/** Сколько видно: неделя (в одном из видов выше) или месяц — в дне все карточки. */
export type Span = 'week' | 'month'

export type Drag = { kind: 'item' | 'bank'; id: string }

export interface ToastAction {
  label: string
  run: () => void
}
export type Section = 'feed' | 'calendar' | 'analytics'

/** Главная: чья лента (моя или конкурентов — «Поиск»), период графиков и фильтры — общие для графиков, таблицы и ленты. */
export interface HomeState {
  tab: 'mine' | 'discover'
  days: number
  filters: HomeFilters
}

export interface ToastOpts {
  undo?: boolean
  actions?: ToastAction[]
}

export interface Ctx {
  plan: Plan
  dispatch: (a: Action) => void
  canUndo: boolean
  canRedo: boolean
  byDate: Map<ISODate, Item[]>
  /** Карточки дня с учётом фильтров. */
  unitsOn: (date: ISODate) => Unit[]
  /** Каждая публикация дня — своей карточкой (месяц, лента на телефоне). */
  cardsOn: (date: ISODate) => Unit[]
  violations: Violation[]
  violByDate: Map<ISODate, Violation[]>
  badIds: Set<string>
  channels: Map<string, Channel>
  rubrics: Map<string, Rubric>
  rules: Map<string, Rule>
  labelOf: (it: Pick<Item, 'rubricId' | 'ruleId'>) => string
  filters: Filters
  setFilters: (f: Filters) => void
  anchor: ISODate
  setAnchor: (d: ISODate) => void
  /** Переход к дате: вид прокручивает к ней. n растёт с каждым переходом. */
  jump: { date: ISODate; n: number }
  jumpTo: (d: ISODate) => void
  openItem: (id: string) => void
  openNew: (draft: Partial<Item>) => void
  openDay: (d: ISODate) => void
  openTask: (id: string) => void
  openDayId: ISODate | null
  /** Календарь, закрыв панели; с датой — к ней. */
  show: (date?: ISODate) => void
  mode: Mode
  setMode: (m: Mode) => void
  span: Span
  setSpan: (s: Span) => void
  /** Черновики (банк идей) — во вкладке «+». */
  openDrafts: () => void
  /** Пересоздать пост, видео или материал календаря — в той же форме, что и новый контент: источник — контекстом сверху. */
  openRecreate: (source: Source, preset?: { format: string; count: number }) => void
  /** Настройки справа: мои соцсети и конкуренты. */
  openSettings: () => void
  /** Расписание: рубрики по каналам и категориям — дни, недели цикла, время. */
  openSchedule: () => void
  home: HomeState
  setHome: (patch: Partial<HomeState>) => void
  /** Раздел СММ: главная (графики и лента), календарь. */
  section: Section
  setSection: (s: Section) => void
  /** Планирование недели: уточнить темы пустых слотов. */
  /** Наверстать просроченное, не двигая остальной план. */
  /** Перенести период (отпуск): на следующие слоты или в свободные места. */
  dropOn: (date: ISODate, drag: Drag, time?: string) => void
  /** Выбранные карточки (их главные материалы): Shift- или ⌘-щелчок, пальцем — подержать и отпустить. */
  selected: Set<string>
  toggleSelect: (id: string) => void
  clearSelection: () => void
  /** Перенести несколько карточек разом: на столько дней и минут — одним шагом истории. */
  moveMany: (ids: string[], dDays: number, dMin?: number) => void
  /** Подсказка при переносе словами: что едет вместе и что отметит проверка на новом месте. */
  hint: (moves: Move[]) => HintLine[]
  /** Статус всей карточке; ▶ ещё и открывает задачу. */
  setStatus: (unit: Unit, status: Status) => void
  toast: (msg: string, opts?: boolean | ToastOpts) => void
  toggleSide: () => void
  sideOpen: boolean
  openHelp: () => void
  saved: 'idle' | 'saving' | 'saved' | 'memory' | 'error'
  phone: boolean
  /** Узкий экран: левая панель — за кнопкой «Фильтры». */
  narrow: boolean
}

export const PlanCtx = createContext<Ctx | null>(null)

export function usePlan() {
  const c = useContext(PlanCtx)
  if (!c) throw new Error('usePlan вне PlanCtx')
  return c
}
