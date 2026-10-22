import { createContext, useContext } from 'react'
import type { Filters } from '../model/filters'
import type { Violation } from '../model/rules'
import type { Action } from '../model/store'
import type { Channel, ISODate, Item, Plan, Rubric, Rule, Status } from '../model/types'
import type { Unit } from '../model/units'

export type View = 'now' | 'month' | 'week' | 'plan' | 'bank' | 'rules' | 'checks'

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
  goto: (view: View, date?: ISODate) => void
  dropOn: (date: ISODate, drag: Drag, time?: string) => void
  /** Статус всей карточке; ▶ ещё и открывает задачу. */
  setStatus: (unit: Unit, status: Status) => void
  toast: (msg: string, opts?: boolean | ToastOpts) => void
  toggleSide: () => void
  sideOpen: boolean
  openHelp: () => void
  saved: 'idle' | 'saving' | 'saved' | 'memory' | 'error'
  phone: boolean
}

export const PlanCtx = createContext<Ctx | null>(null)

export function usePlan() {
  const c = useContext(PlanCtx)
  if (!c) throw new Error('usePlan вне PlanCtx')
  return c
}
