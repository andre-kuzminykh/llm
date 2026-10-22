import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'

describe('T-CP-020 FR-CP-020 «Сейчас»', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T09:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('сверху просроченное (FULL готовят за 3 дня), дальше — по дням выхода; ▶ открывает задачу', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Сейчас' }))
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
    await userEvent.click(await screen.findByRole('button', { name: 'Сейчас' }))
    const top = screen.getByRole('banner')
    await userEvent.click(within(top).getByRole('radio', { name: 'В работе' }))
    expect(screen.getByText('Всё готово')).toBeInTheDocument()
    // включённый фильтр виден меткой и снимается одним нажатием
    await userEvent.click(within(top).getByRole('button', { name: 'Снять фильтр: Только «В работе»' }))
    expect(within(top).getByRole('radio', { name: 'Все' })).toHaveAttribute('aria-checked', 'true')
  })
})
