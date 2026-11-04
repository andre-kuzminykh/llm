import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../App'
import { memoryStorage } from '../model/storage'
import type { Plan } from '../model/types'
import { loadDataist, smallPlan } from '../test/fixtures'

const dataist = loadDataist()

/** Приложение с уже сохранённым планом; исходный план (seed.json) — календарь Датаиста. */
async function open(stored: Plan | null, seed: Plan = dataist) {
  localStorage.clear()
  localStorage.setItem('cp:section', JSON.stringify('calendar'))
  localStorage.setItem('cp:anchor', JSON.stringify('2026-10-26'))
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(seed))))
  const storage = memoryStorage()
  if (stored) await storage.save(stored)
  render(<App storage={async () => storage} />)
  await screen.findByRole('grid', { name: 'Неделя по времени' })
  return { storage }
}

describe('T-CP-071 FR-CP-071 план Датаиста: календарь со страницы — в приложении', () => {
  it('сохранён старый пример — открывается план Датаиста; «К началу плана» — 8 ноября, «Отменить» вернёт прежний', async () => {
    await open(smallPlan()) // старый пример: формат FULL Демо, метки плана Датаиста нет
    const note = await screen.findByText(/Загружен план Датаиста: 7 каналов, с 8 ноя.* — прежний пример заменён/)
    const bar = note.closest('[role="status"]') as HTMLElement
    await userEvent.click(within(bar).getByRole('button', { name: 'К началу плана' }))
    expect(await screen.findAllByRole('button', { name: /Knowledge Management · 100 ИИ-сотрудников за 100 дней · 1\/100/ })).not.toHaveLength(0)
    expect(screen.getAllByRole('button', { name: /^Обучение · Видео 1: ИИ инженер по автоматизации · Лекция 4 из 8/ }).length).toBeGreaterThan(0)
    // каналы плана — в фильтрах слева
    const side = screen.getByRole('complementary', { name: 'Фильтры' })
    for (const name of ['Датаист Live', 'Лаборатория Датаиста', 'Академия Датаиста', 'Нейроний', 'Ландао', 'Антрополис']) expect(within(side).getAllByText(name).length).toBeGreaterThan(0)
    // ⌘Z — прежний план
    await userEvent.keyboard('{Meta>}z{/Meta}')
    await waitFor(() => expect(screen.queryAllByRole('button', { name: /Knowledge Management/ })).toHaveLength(0))
    expect(within(side).queryByText('Нейроний')).toBeNull()
  })

  it('свой план не трогаем: ни замены, ни тоста', async () => {
    const own = { ...smallPlan(), rules: smallPlan().rules.filter((r) => r.id !== 'f_demo'), items: smallPlan().items.filter((it) => it.ruleId !== 'f_demo') }
    const { storage } = await open(own)
    expect(screen.getAllByRole('button', { name: /Тезисы · Тезис дня/ }).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Загружен план Датаиста/)).toBeNull()
    expect((await storage.load())?.example).toBeUndefined()
  })

  it('исходный план — без метки плана Датаиста (старый seed): сохранённый пример остаётся как был', async () => {
    const { storage } = await open(smallPlan(), smallPlan())
    expect(screen.queryByText(/Загружен план Датаиста/)).toBeNull()
    expect((await storage.load())?.rules.some((r) => r.id === 'f_demo')).toBe(true)
  })

  it('с чистого листа — пусто; «Загрузить план Датаиста» в профиле ставит календарь, «К началу плана» — к 8 ноября', async () => {
    await open(null)
    expect(screen.queryAllByRole('button', { name: /Knowledge Management/ })).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Профиль' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Загрузить план Датаиста' }))
    const note = await screen.findByText(/^Загружен план Датаиста — с 8 ноя/)
    await userEvent.click(within(note.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'К началу плана' }))
    expect(await screen.findAllByRole('button', { name: /Knowledge Management/ })).not.toHaveLength(0)
  })
})
