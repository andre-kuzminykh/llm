import { createContext, useContext } from 'react'
import type { Filters } from '../model/filters'
import type { Violation } from '../model/rules'
import type { Action } from '../model/store'
import type { Channel, ISODate, Item, Plan, Rubric, Rule, Status } from '../model/types'
import type { Unit } from '../model/units'

/** Что показывает календарь: неделю по часам или дорожками по каналам, площадкам, темам; на телефоне ещё — ленту по дням.
 *  Выбирается в левой панели, как фильтр. */
export type Mode = 'time' | 'channels' | 'platforms' | 'topics' | 'feed'

export type Drag = { kind: 'item' | 'bank'; id: string }

export interface ToastAction {
  label: string
  run: () => void
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
  /** Дашборд — панелью справа. */
  openDashboard: () => void
  /** Черновики (банк идей) — во вкладке «+». */
  openDrafts: () => void
  /** Планирование недели: уточнить темы пустых слотов. */
  openPlanning: () => void
  dropOn: (date: ISODate, drag: Drag, time?: string) => void
  /** Статус всей карточке; ▶ ещё и открывает задачу. */
  setStatus: (unit: Unit, status: Status) => void
  toast: (msg: string, opts?: boolean | ToastOpts) => void
  toggleSide: () => void
  sideOpen: boolean
  openHelp: () => void
  /** Что открыто справа: дашборд, черновики, планирование — чтобы кнопки знали, нажаты ли они. */
  panel: 'dashboard' | 'drafts' | 'planning' | null
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
