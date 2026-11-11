import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../App'
import { memoryStorage, type PlanStorage } from '../model/storage'
import { DATAIST_EXAMPLE, emptyPlan, type Plan } from '../model/types'
import { loadDataist, smallPlan } from '../test/fixtures'

const dataist = loadDataist()

/** Хранилище, которое сохраняет правки (как IndexedDB браузера). */
const keeping = (): PlanStorage => ({ ...memoryStorage(), persistent: true })

/** Приложение с уже сохранённым планом (или без него); исходный план (seed.json) — календарь Датаиста. Сегодня — 4 ноября 2026. */
async function open(stored: Plan | null, seed: Plan = dataist, storage: PlanStorage = memoryStorage(), month = false) {
  localStorage.clear()
  localStorage.setItem('cp:section', JSON.stringify('calendar'))
  localStorage.setItem('cp:anchor', JSON.stringify('2026-10-26'))
  if (!month) {
    localStorage.setItem('cp:span-2', 'week')
    localStorage.setItem('cp:week-mode', 'time')
  }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(seed))))
  if (stored) await storage.save(stored)
  const view = render(<App storage={async () => storage} />)
  await screen.findByRole('grid', { name: month ? /^Месяц: / : 'Неделя по времени' })
  return { storage, view }
}
const profile = async (item: string) => {
  await userEvent.click(screen.getByRole('button', { name: 'Профиль' }))
  await userEvent.click(screen.getByRole('menuitem', { name: item }))
}

describe('T-CP-071 FR-CP-071 план Датаиста: календарь со страницы — в приложении', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-04T10:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ничего не сохранено — сразу план Датаиста, без кнопок: календарь — с первой полной недели плана (16–22 ноября)', async () => {
    await open(null)
    expect(await screen.findAllByRole('button', { name: /Knowledge Management · 100 продуктов · 1\/100/ })).not.toHaveLength(0)
    expect(screen.getAllByText(/16–22 ноя 2026/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Загружен план Датаиста/)).toBeNull()
  })

  it('календарь открывается месяцем: каждая публикация — своей карточкой целиком, как в календаре Датаиста', async () => {
    await open(null, dataist, memoryStorage(), true)
    const month = await screen.findByRole('grid', { name: 'Месяц: Ноябрь 2026' })
    const day8 = month.querySelector('[data-date="2026-11-16"]') as HTMLElement
    // все публикации 16 ноября — каждая своей карточкой: ничего не сходится в одну (короткое и пост лайфстайла — порознь)
    expect(day8.querySelectorAll('.cp-card')).toHaveLength(dataist.items.filter((it) => it.date === '2026-11-16').length)
    expect(day8.querySelectorAll('.cp-card')).toHaveLength(14)
    expect(within(day8).getAllByRole('button', { name: /: Я устал от хайпа вокруг ИИ, 2\d:00/ })).toHaveLength(2)
    // карточка — как в календаре: время и канал, рубрика (с отделом демо), название целиком, формат словами и площадки
    const demo = within(day8).getByRole('button', { name: /^Демо · Короткое демо: Knowledge Management/ }).closest('.cp-card') as HTMLElement
    expect(demo).toHaveClass('cp-card--post')
    expect(demo.querySelector('.cp-card__time')).toHaveTextContent('12:00')
    expect(demo.querySelector('.cp-card__ch')).toHaveTextContent('Нейроний')
    expect(demo.querySelector('.cp-card__cap')).toHaveTextContent('Демо · Короткое демо · Management')
    expect(demo.querySelector('.cp-card__title')).toHaveTextContent('Knowledge Management · 100 продуктов · 1/100')
    expect(demo.querySelector('.cp-card__kind')).toHaveTextContent('Короткое видео')
    expect([...demo.querySelectorAll('.cp-card__plats .cp-pi')].map((x) => x.getAttribute('title'))).toEqual(['YouTube', 'Instagram', 'TikTok'])
    // видео Академии — «Обучение 1», формат словами — только внизу; «видео» дважды нет ни на одной карточке
    const lesson = within(day8).getByRole('button', { name: /^Обучение 1: ИИ инженер/ }).closest('.cp-card') as HTMLElement
    expect([lesson.querySelector('.cp-card__cap')?.textContent, lesson.querySelector('.cp-card__kind')?.textContent]).toEqual(['Обучение 1', 'Короткое видео'])
    expect([...month.querySelectorAll('.cp-card__cap')].filter((c) => /видео/i.test(c.textContent ?? ''))).toHaveLength(0)
    const article = within(day8).getByRole('button', { name: /^Исследования · Статья: Нужна тема/ }).closest('.cp-card') as HTMLElement
    expect([article.querySelector('.cp-card__cap')?.textContent, article.querySelector('.cp-card__kind')?.textContent]).toEqual(['Исследования', 'Страница на сайте'])
  })

  it('«Очистить всё» — пусто и после перезагрузки; план Датаиста — снова из профиля, «К началу плана» — к первой неделе', async () => {
    const storage = keeping()
    const { view } = await open(null, dataist, storage)
    await profile('Очистить всё')
    await waitFor(async () => expect((await storage.load())?.example).toBe('cleared'))
    view.unmount()
    await open(null, dataist, storage)
    expect(screen.queryAllByRole('button', { name: /100 ИИ-сотрудников/ })).toHaveLength(0)
    expect(screen.queryByText(/Загружен план Датаиста/)).toBeNull()
    await profile('Загрузить план Датаиста')
    const note = await screen.findByText(/^Загружен план Датаиста — с 15 ноя/)
    await userEvent.click(within(note.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'К началу плана' }))
    expect(await screen.findAllByRole('button', { name: /Knowledge Management/ })).not.toHaveLength(0)
  })

  it('до плана Датаиста в браузере был свой план — открывается план Датаиста, прежний не стёрт: «Вернуть прежний» ставит его', async () => {
    const storage: PlanStorage = { ...keeping(), previous: async () => smallPlan() }
    await open(null, dataist, storage)
    const note = await screen.findByText(/^Открыт план Датаиста: 7 каналов, с 15 ноя — прежний план не стёрт$/)
    expect(await screen.findAllByRole('button', { name: /Note Taking/ })).not.toHaveLength(0)
    await waitFor(async () => expect((await storage.load())?.example).toBe(DATAIST_EXAMPLE))
    await userEvent.click(within(note.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Вернуть прежний' }))
    const side = screen.getByRole('complementary', { name: 'Фильтры' })
    await waitFor(() => expect(within(side).getAllByText('Andre AIT').length).toBeGreaterThan(0))
    expect(within(side).queryByText('Нейроний')).toBeNull()
  })

  it('сохранён пустой план (ещё до плана Датаиста) — встаёт план Датаиста; мои соцсети остаются', async () => {
    const blank: Plan = { ...emptyPlan('2026-11-03'), analytics: { competitors: [], accounts: [{ id: 'a1', name: 'Мой блог', platform: 'Telegram', handle: '@blog' }] } }
    const storage = keeping()
    await open(blank, dataist, storage)
    await screen.findByText(/^Загружен план Датаиста: 7 каналов, с 15 ноя$/)
    expect(await screen.findAllByRole('button', { name: /Note Taking/ })).not.toHaveLength(0)
    const kept = await storage.load()
    expect([kept?.example, kept?.analytics?.accounts?.map((a) => a.name)]).toEqual([DATAIST_EXAMPLE, ['Мой блог']])
  })
  it('сохранён старый пример — открывается план Датаиста; «К началу плана» — первая неделя, «Отменить» вернёт прежний', async () => {
    await open(smallPlan()) // старый пример: формат FULL Демо, метки плана Датаиста нет
    const note = await screen.findByText(/Загружен план Датаиста: 7 каналов, с 15 ноя.* — прежний пример заменён/)
    const bar = note.closest('[role="status"]') as HTMLElement
    await userEvent.click(within(bar).getByRole('button', { name: 'К началу плана' }))
    expect(await screen.findAllByRole('button', { name: /Knowledge Management · 100 продуктов · 1\/100/ })).not.toHaveLength(0)
    expect(screen.getAllByRole('button', { name: /^Обучение 1: ИИ инженер по автоматизации · Лекция 4 из 8/ }).length).toBeGreaterThan(0)
    // каналы плана — в фильтрах слева
    const side = screen.getByRole('complementary', { name: 'Фильтры' })
    for (const name of ['Датаист Live', 'Лаборатория Датаиста', 'Академия Датаиста', 'Нейроний', 'Ландао', 'Антрополис']) expect(within(side).getAllByText(name).length).toBeGreaterThan(0)
    // ⌘Z — прежний план
    await userEvent.keyboard('{Meta>}z{/Meta}')
    await waitFor(() => expect(screen.queryAllByRole('button', { name: /Knowledge Management/ })).toHaveLength(0))
    expect(within(side).queryByText('Нейроний')).toBeNull()
  })

  it('сохранён план Датаиста прежней версии (с 8 ноября) — его сменяет новый (с 15 ноября); «Отменить» вернёт прежний', async () => {
    const stale: Plan = { ...dataist, example: 'dataist-calendar', start: '2026-11-08', items: dataist.items.map((it) => ({ ...it, title: it.title.replace('100 продуктов', '100 ИИ-сотрудников за 100 дней') })) }
    const storage = keeping()
    await open(stale, dataist, storage)
    await screen.findByText(/^Обновлён план Датаиста: 7 каналов, с 15 ноя$/)
    expect(await screen.findAllByRole('button', { name: /Knowledge Management · 100 продуктов · 1\/100/ })).not.toHaveLength(0)
    expect((await storage.load())?.example).toBe(DATAIST_EXAMPLE)
    await userEvent.keyboard('{Meta>}z{/Meta}')
    expect(await screen.findAllByRole('button', { name: /Knowledge Management · 100 ИИ-сотрудников/ })).not.toHaveLength(0)
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
})
