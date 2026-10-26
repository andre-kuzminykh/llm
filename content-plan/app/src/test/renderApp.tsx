import { render } from '@testing-library/react'
import { App } from '../App'
import { memoryStorage } from '../model/storage'
import { smallPlan } from './fixtures'

/** Приложение на маленьком плане: хранилище в памяти, календарь на неделе 26 октября 2026 (по часам). prefs — свои настройки в localStorage. */
export function renderApp(plan = smallPlan(), prefs: Record<string, string> = {}) {
  localStorage.clear()
  localStorage.setItem('cp:anchor', JSON.stringify('2026-10-26'))
  for (const [k, v] of Object.entries(prefs)) localStorage.setItem(k, v)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(plan))))
  const storage = memoryStorage()
  return { storage, ...render(<App storage={async () => storage} />) }
}
