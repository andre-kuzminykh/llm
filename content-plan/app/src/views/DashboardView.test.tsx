import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'

describe('T-CP-020 FR-CP-020 дашборд: что делать, банк идей, темы', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T09:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('сверху просроченное (FULL готовят за 3 дня), дальше — по дням выхода; ▶ открывает задачу', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Дашборд' }))
    const late = screen.getByRole('region', { name: 'Просрочено' })
    expect(within(late).getByRole('button', { name: 'Стратегия' })).toBeInTheDocument()
    const monday = screen.getByRole('region', { name: 'Пн, 26 октября' })
    expect(within(monday).getByRole('button', { name: 'Я устал от хайпа вокруг ИИ' })).toBeInTheDocument()
    expect(within(monday).getAllByText('к 25 окт').length).toBeGreaterThan(0)
    expect(within(screen.getByRole('region', { name: 'Пн, 2 ноября' })).getAllByRole('button', { name: 'Нужна тема' }).length).toBeGreaterThan(0)
    // канал Dataist не повторяется, Andre AIT — подписан
    expect(within(late).queryByText('Dataist')).toBeNull()
    await userEvent.click(within(late).getByRole('button', { name: 'Начать: Стратегия' }))
    expect(screen.getByRole('complementary', { name: 'Задача' })).toBeInTheDocument()
    expect(within(late).getByRole('button', { name: 'Задача: Стратегия' })).toBeInTheDocument()
  })
  it('фильтр статуса словами', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Дашборд' }))
    const top = screen.getByRole('banner')
    await userEvent.click(within(screen.getByRole('region', { name: 'Что делать' })).getByRole('radio', { name: 'В работе' }))
    expect(screen.getByText(/ничего не ждёт работы/)).toBeInTheDocument()
    // включённый фильтр виден меткой и снимается одним нажатием
    await userEvent.click(within(top).getByRole('button', { name: 'Снять фильтр: Только «В работе»' }))
    expect(within(screen.getByRole('region', { name: 'Что делать' })).getByRole('radio', { name: 'Все' })).toHaveAttribute('aria-checked', 'true')
  })
  it('банк идей и темы — на дашборде; хэштег открывает календарь только по этой теме', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Дашборд' }))
    const bank = screen.getByRole('region', { name: 'Банк идей' })
    await userEvent.click(within(within(bank).getByRole('group', { name: 'Хэштеги банка' })).getByRole('button', { name: /^#тезисы/ }))
    await userEvent.type(within(bank).getByLabelText('Новые темы: #тезисы · Тезис дня'), 'Агенты вместо отделов')
    await userEvent.click(within(bank).getByRole('button', { name: 'Добавить' }))
    expect(within(bank).getByRole('button', { name: 'Агенты вместо отделов' })).toBeInTheDocument()
    const topics = screen.getByRole('region', { name: 'Темы' })
    const dataist = within(topics).getByRole('group', { name: 'Темы: Dataist' })
    expect(within(dataist).getByRole('button', { name: /^#демо/ })).toBeInTheDocument()
    await userEvent.click(within(dataist).getByRole('button', { name: /^#тезисы/ }))
    expect(await screen.findByRole('grid', { name: 'Неделя по времени' })).toBeInTheDocument()
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Снять фильтр: Только #тезисы' })).toBeInTheDocument()
  })
})
