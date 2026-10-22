import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { smallPlan } from '../test/fixtures'
import { renderApp } from '../test/renderApp'

const day = (date: string) => document.querySelector(`[data-date="${date}"]`) as HTMLElement

describe('T-CP-001 FR-CP-001 месяц', () => {
  it('FULL дня, «ещё N» и слоты без темы', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'Октябрь 2026' })
    // рубрика — словом, название — только тема, значков площадок в месяце нет
    const card = within(day('2026-10-26')).getByRole('button', { name: /^Демо: Стратегия/ })
    expect(within(card).getByLabelText('Рубрика: Демо')).toBeInTheDocument()
    expect(day('2026-10-26').querySelector('.cp-pi')).toBeNull()
    // остальное в дне — одним числом: тезис и анонс Andre AIT
    expect(within(day('2026-10-26')).getByText('ещё 2')).toBeInTheDocument()
    expect(within(day('2026-10-27')).getByText('1 без темы')).toHaveAttribute('title', 'Нужна тема: Тезисы')
    await userEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }))
    await screen.findByRole('heading', { name: 'Ноябрь 2026' })
    // пустой FULL — пунктирной карточкой «Нужна тема»
    expect(within(day('2026-11-02')).getByRole('button', { name: /^Демо: Нужна тема/ }).closest('.cp-card')).toHaveClass('cp-card--slot')
  })
  it('день открывает панель со всеми материалами по каналам', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Открыть день 2026-10-26' }))
    const panel = screen.getByRole('complementary', { name: /26 октября 2026/ })
    expect(within(panel).getByRole('region', { name: 'Andre AIT' })).toBeInTheDocument()
    // FULL с тизером и анонсом — одна карточка Dataist; под каждой площадкой — что на ней выходит
    const full = within(panel).getByRole('button', { name: /^Демо · FULL: Стратегия, 12:00/ })
    expect(within(full).getByLabelText(/YouTube — FULL, Тизер · Shorts · Instagram — Тизер · Reels/)).toBeInTheDocument()
    expect(within(full).getByText('Тизер · Shorts')).toBeInTheDocument()
    expect(within(full).getByText('Анонс · Кабинет')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /^Демо · Анонс от Andre AIT: Стратегия, 13:00/ })).toBeInTheDocument()
  })
  it('нарушение видно на дне и в рейле', async () => {
    const p = smallPlan()
    p.items.find((x) => x.id === 'thesis')!.date = '2026-10-31'
    renderApp(p)
    await screen.findByRole('heading', { name: 'Октябрь 2026' })
    expect(within(day('2026-10-31')).getByRole('img', { name: 'Нарушений: 1' })).toBeInTheDocument()
  })
})
