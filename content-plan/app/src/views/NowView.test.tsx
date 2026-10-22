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

  it('по сроку подготовки: FULL — за 3 дня, поэтому уже просрочен; ▶ открывает задачу', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Сейчас' }))
    const late = screen.getByRole('region', { name: 'Просрочено' })
    expect(within(late).getByRole('button', { name: 'Стратегия' })).toBeInTheDocument()
    const tomorrow = screen.getByRole('region', { name: 'Завтра' })
    expect(within(tomorrow).getByRole('button', { name: 'Я устал от хайпа вокруг ИИ' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'На неделе' })).getAllByRole('button', { name: 'Нужна тема' }).length).toBeGreaterThan(0)
    await userEvent.click(within(late).getByRole('button', { name: 'Начать: Стратегия' }))
    expect(screen.getByRole('complementary', { name: 'Задача' })).toBeInTheDocument()
    expect(within(late).getByRole('button', { name: 'Задача: Стратегия' })).toBeInTheDocument()
  })
  it('фильтр статусов значками', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Сейчас' }))
    const top = screen.getByRole('banner')
    await userEvent.click(within(top).getByRole('button', { name: 'Только «В работе»' }))
    expect(screen.getByText('Всё готово')).toBeInTheDocument()
  })
})
