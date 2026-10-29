import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { item, smallPlan } from '../test/fixtures'
import { renderApp } from '../test/renderApp'

const day = (date: string) => document.querySelector(`[data-date="${date}"]`) as HTMLElement
const bar = () => screen.queryByRole('region', { name: 'Не вышло вовремя' })

describe('T-CP-020 FR-CP-020 дашборда нет', () => {
  it('ни значка в шапке, ни вкладки, ни панели «Дашборд»', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    expect(screen.queryByRole('button', { name: /Дашборд/ })).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Дашборд' })).toBeNull()
    expect(screen.queryByText(/Программа|Что делать|Сводка/)).toBeNull()
  })
})

describe('T-CP-022 FR-CP-022 черновики — банк идей во вкладке «+»', () => {
  // слоты раскладываются с сегодняшнего дня: «сегодня» — до слота тезисов 27 окт
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T09:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  it('«В черновики» из формы, вкладка «Черновики»: добавить списком, разложить по слотам', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    const form = screen.getByRole('complementary', { name: 'Новый контент' })
    await userEvent.type(within(form).getByRole('combobox', { name: 'Рубрика' }), 'тез')
    await userEvent.click(within(form).getByRole('option', { name: 'Тезисы' }))
    await userEvent.type(within(form).getByRole('textbox', { name: 'Тема' }), 'ИИ-бухгалтер')
    await userEvent.click(within(form).getByRole('button', { name: 'В черновики' }))
    expect(document.querySelector('.cp-toast')).toHaveTextContent('Сохранено в черновики')
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    await userEvent.click(screen.getByRole('tab', { name: /^Черновики/ }))
    const drafts = screen.getByRole('complementary', { name: 'Черновики' })
    await userEvent.click(within(within(drafts).getByRole('group', { name: 'Рубрики черновиков' })).getByRole('button', { name: /^Тезисы/ }))
    const col = within(drafts).getByRole('region', { name: 'Черновики: Тезисы · Тезис дня' })
    expect(within(col).getByRole('button', { name: 'ИИ-бухгалтер' })).toBeInTheDocument()
    await userEvent.type(within(col).getByLabelText('Новые черновики: Тезисы · Тезис дня'), 'Агенты вместо отделов')
    await userEvent.click(within(col).getByRole('button', { name: 'Добавить' }))
    expect(within(col).getByRole('button', { name: 'Агенты вместо отделов' })).toBeInTheDocument()
    await userEvent.click(within(col).getByRole('button', { name: 'Разложить по слотам' }))
    expect(within(col).getByRole('button', { name: 'Вернуть в черновики: ИИ-бухгалтер' })).toBeInTheDocument()
    await userEvent.click(within(drafts).getByRole('tab', { name: 'Новый контент' }))
    expect(screen.getByRole('complementary', { name: 'Новый контент' })).toBeInTheDocument()
  })
})

describe('T-CP-041/042 FR-CP-041/042 наверстать — плашкой под шапкой, перенести период — в профиле', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T09:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
    sessionStorage.clear() // «Скрыть» помнится до конца сеанса
  })

  it('плашка «Не вышло вовремя: N» под шапкой → «Наверстать» одной кнопкой; «Отменить» возвращает; ✕ прячет', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    expect(bar()).toHaveTextContent('Не вышло вовремя: 2')
    // под шапкой календаря
    expect(screen.getByRole('banner').nextElementSibling).toBe(bar())
    await userEvent.click(within(bar()!).getByRole('button', { name: 'Наверстать' }))
    expect(screen.queryByRole('complementary', { name: 'Наверстать' })).toBeNull() // листа нет — сразу
    expect(screen.getByText('Наверстали: 2 карточки с 28 окт, занято пустых слотов: 1')).toBeInTheDocument()
    expect(bar()).toBeNull()
    expect(within(day('2026-10-28')).getByRole('button', { name: /^Тезисы · Тезис дня: Я устал от хайпа вокруг ИИ/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Отменить' }))
    expect(bar()).toHaveTextContent('Не вышло вовремя: 2')
    await userEvent.click(within(bar()!).getByRole('button', { name: 'Скрыть' }))
    expect(bar()).toBeNull()
  })
  it('просроченного нет — плашки нет', async () => {
    vi.setSystemTime(new Date('2026-10-20T09:00:00'))
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    expect(bar()).toBeNull()
  })
  it('«Перенести период» — в меню профиля: даты и каналы, «на следующие слоты» или «в свободные места», предпросмотр, перенос', async () => {
    const p = smallPlan()
    for (const [id, date] of [['A', '2026-10-29'], ['B', '2026-10-30'], ['C', '2026-11-01'], ['D', '2026-11-02']])
      p.items.push(item({ id, date, ruleId: 'sh_thesis', rubricId: 'thesis', title: `Тезис ${id}`, format: 'Короткое вертикальное видео', platforms: ['YouTube'], rank: 20 }))
    renderApp(p)
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(screen.getByRole('button', { name: 'Профиль' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Перенести период (отпуск)…' }))
    const sheet = screen.getByRole('complementary', { name: 'Перенести период' })
    const set = async (label: string, v: string) => fireEvent.change(within(sheet).getByLabelText(label), { target: { value: v } })
    await set('С', '2026-10-29')
    await set('По', '2026-10-30')
    expect(within(sheet).getByRole('radio', { name: 'На следующие слоты' })).toHaveAttribute('aria-checked', 'true')
    expect(within(sheet).getByRole('status')).toHaveTextContent('Из периода — 2 карточки с темой')
    const rows = within(sheet).getAllByRole('listitem').map((li) => li.textContent)
    expect(rows[0]).toContain('Тезис A')
    expect(rows[0]).toContain('29 окт → 1 ноя 11:00 · следующий слот')
    await userEvent.click(within(sheet).getByRole('radio', { name: 'В свободные места' }))
    expect(within(sheet).getAllByRole('listitem')[0]).toHaveTextContent('29 окт → 3 ноя 11:00 · свободный день')
    await userEvent.click(within(sheet).getByRole('radio', { name: 'На следующие слоты' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Перенести' }))
    expect(screen.getByText('Период 29 окт – 30 окт свободен: перенесено 2 карточки')).toBeInTheDocument()
  })
})
