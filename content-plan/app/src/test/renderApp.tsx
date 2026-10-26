import { render } from '@testing-library/react'
import { App } from '../App'
import { memoryStorage } from '../model/storage'
import { smallPlan } from './fixtures'

/** Приложение на маленьком плане: хранилище в памяти, вид «Календарь», октябрь 2026. prefs — свои настройки в localStorage. */
export function renderApp(plan = smallPlan(), prefs: Record<string, string> = {}) {
  localStorage.clear()
  localStorage.setItem('cp:anchor', JSON.stringify('2026-10-26'))
  localStorage.setItem('cp:view', JSON.stringify('month'))
  for (const [k, v] of Object.entries(prefs)) localStorage.setItem(k, v)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(plan))))
  const storage = memoryStorage()
  return { storage, ...render(<App storage={async () => storage} />) }
}
