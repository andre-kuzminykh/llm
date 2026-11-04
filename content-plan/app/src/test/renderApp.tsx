import { render } from '@testing-library/react'
import { App } from '../App'
import { memoryStorage } from '../model/storage'
import { smallPlan } from './fixtures'

/** Приложение на маленьком плане: хранилище в памяти, раздел «Календарь» на неделе 26 октября 2026 (по часам). prefs — свои настройки в localStorage. */
export function renderApp(plan = smallPlan(), prefs: Record<string, string> = {}) {
  localStorage.clear()
  localStorage.setItem('cp:anchor', JSON.stringify('2026-10-26'))
  // главная — первый экран; тесты календаря открывают календарь (свой раздел — через prefs)
  localStorage.setItem('cp:section', JSON.stringify('calendar'))
  // тесты недели: календарь сам открывается месяцем (FR-CP-072) — здесь неделя и шкала времени, если тест не сказал иначе
  localStorage.setItem('cp:span-2', 'week')
  localStorage.setItem('cp:week-mode', 'time')
  for (const [k, v] of Object.entries(prefs)) localStorage.setItem(k, v)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(plan))))
  const storage = memoryStorage()
  // хранилище пустое — программа открывает этот план как начальный (без него — чистый лист)
  return { storage, ...render(<App storage={async () => storage} initialPlan={plan} />) }
}
