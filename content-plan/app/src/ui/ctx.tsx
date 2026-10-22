import { createContext, useContext } from 'react'
import type { Filters } from '../model/filters'
import type { Violation } from '../model/rules'
import type { Action } from '../model/store'
import type { Channel, ISODate, Item, Plan, Rubric, Rule } from '../model/types'

export type View = 'month' | 'week' | 'plan' | 'bank' | 'rules' | 'checks'

export type Drag = { kind: 'item' | 'bank'; id: string }

export interface Ctx {
  plan: Plan
  dispatch: (a: Action) => void
  canUndo: boolean
  canRedo: boolean
  byDate: Map<ISODate, Item[]>
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
  openItem: (id: string) => void
  openNew: (draft: Partial<Item>) => void
  openDay: (d: ISODate) => void
  openDayId: ISODate | null
  goto: (view: View, date?: ISODate) => void
  dropOn: (date: ISODate, drag: Drag) => void
  toast: (msg: string, undo?: boolean) => void
  toggleSide: () => void
  saved: 'idle' | 'saving' | 'saved' | 'memory' | 'error'
}

export const PlanCtx = createContext<Ctx | null>(null)

export function usePlan() {
  const c = useContext(PlanCtx)
  if (!c) throw new Error('usePlan вне PlanCtx')
  return c
}
