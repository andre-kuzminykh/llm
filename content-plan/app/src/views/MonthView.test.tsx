import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { smallPlan } from '../test/fixtures'
import { renderApp } from '../test/renderApp'

const day = (date: string) => document.querySelector(`[data-date="${date}"]`) as HTMLElement

describe('T-CP-001 FR-CP-001 месяц', () => {
  it('FULL дня, слоты без темы, суббота «отдых»', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'Октябрь 2026' })
    expect(within(day('2026-10-26')).getByRole('button', { name: /Демо \/ Стратегия/ })).toBeInTheDocument()
    expect(within(day('2026-10-31')).getByText('отдых')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }))
    expect(within(day('2026-11-02')).getByText('1 без темы')).toBeInTheDocument()
  })
  it('день открывает панель со всеми материалами по каналам', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Открыть день 2026-10-26' }))
    const panel = screen.getByRole('complementary', { name: /26 октября 2026/ })
    expect(within(panel).getByRole('region', { name: 'Andre AIT' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /Тизер: Демо \/ Стратегия/ })).toBeInTheDocument()
  })
  it('нарушение видно на дне и в рейле', async () => {
    const p = smallPlan()
    p.items.find((x) => x.id === 'thesis')!.date = '2026-10-31'
    renderApp(p)
    await screen.findByRole('heading', { name: 'Октябрь 2026' })
    expect(within(day('2026-10-31')).getByRole('img', { name: 'Нарушений: 1' })).toBeInTheDocument()
  })
})
