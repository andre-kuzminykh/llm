// Лента на главной: чья (я выпускаю / смотрю других) и фильтры — у каждой свои. Одно на ленту и панель фильтров слева;
// помнится в этом браузере. Без хранилища — живёт до перезагрузки.
import { useSyncExternalStore } from 'react'
import { NO_REEL_FILTERS, type ReelFilters, type Side } from '../model/reel'

export interface ReelState {
  side: Side
  filters: Record<Side, ReelFilters>
}
const SIDE = 'cp:reel-side'
const FILTERS = 'cp:reel-filters'
const subs = new Set<() => void>()
let state: ReelState | null = null
let key: string | null = null // что лежало в хранилище, когда читали: поменялось (другая вкладка, тест) — читаем заново

const raw = () => {
  try {
    return `${localStorage.getItem(SIDE) ?? ''}\n${localStorage.getItem(FILTERS) ?? ''}`
  } catch {
    return null
  }
}
const parse = (s: string): ReelState => {
  const [side, json] = s.split('\n')
  let filters: Record<Side, ReelFilters> = { mine: NO_REEL_FILTERS, theirs: NO_REEL_FILTERS }
  try {
    const f = json ? JSON.parse(json) : null
    if (f) filters = { mine: { ...NO_REEL_FILTERS, ...f.mine }, theirs: { ...NO_REEL_FILTERS, ...f.theirs } }
  } catch {
    /* испорченное — с чистого листа */
  }
  return { side: side === 'theirs' ? 'theirs' : 'mine', filters }
}
const read = (): ReelState => {
  const r = raw()
  if (r === null) return (state ??= parse(''))
  if (state && key === r) return state
  key = r
  state = parse(r)
  return state
}

export function setReelState(patch: Partial<ReelState>) {
  state = { ...read(), ...patch }
  try {
    localStorage.setItem(SIDE, state.side)
    localStorage.setItem(FILTERS, JSON.stringify(state.filters))
    key = raw()
  } catch {
    /* до перезагрузки */
  }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => subs.delete(f)
}
export const useReelState = () => useSyncExternalStore(subscribe, read, read)
