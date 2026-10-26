import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { smallPlan } from '../test/fixtures'
import { renderApp } from '../test/renderApp'

const day = (date: string) => document.querySelector(`[data-date="${date}"]`) as HTMLElement

describe('T-CP-001 FR-CP-001 календарь месяцем', () => {
  it('в дне — все единицы контента строками; фильтры убирают лишнее', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'Октябрь 2026' })
    // все карточки дня: тезис, FULL с тизером и анонсом (одна карточка), анонс Andre AIT; рубрика — словом, значков площадок нет
    const cards = [...day('2026-10-26').querySelectorAll('.cp-card__open')].map((b) => b.getAttribute('aria-label'))
    expect(cards).toEqual(['Тезисы · Тезис дня: Я устал от хайпа вокруг ИИ, 11:00', 'Демо · FULL: Стратегия, 12:00', 'Демо · Анонс от Andre AIT: Стратегия, 13:00'])
    const card = within(day('2026-10-26')).getByRole('button', { name: /^Демо · FULL: Стратегия/ })
    expect(within(card).getByLabelText('Хэштег: #демо')).toBeInTheDocument()
    expect(card.closest('.cp-card')).toHaveClass('cp-card--main')
    expect(day('2026-10-26').querySelector('.cp-pi')).toBeNull()
    expect(within(day('2026-10-26')).queryByText(/^ещё/)).toBeNull()
    // слот без темы — пунктирной строкой «Нужна тема»
    expect(within(day('2026-10-27')).getByRole('button', { name: /^Тезисы · Тезис дня: Нужна тема/ }).closest('.cp-card')).toHaveClass('cp-card--slot')
    // фильтр по каналу убирает анонс Andre AIT
    await userEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    await userEvent.click(within(screen.getByRole('complementary', { name: 'Фильтры и банк тем' })).getByRole('button', { name: 'Andre AIT' }))
    expect(within(day('2026-10-26')).queryByRole('button', { name: /Andre AIT/ })).toBeNull()
    expect(day('2026-10-26').querySelectorAll('.cp-card')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }))
    await screen.findByRole('heading', { name: 'Ноябрь 2026' })
    expect(within(day('2026-11-02')).getByRole('button', { name: /^Демо · FULL: Нужна тема/ }).closest('.cp-card')).toHaveClass('cp-card--slot')
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
  it('слева — отделы Neuronium, SMM открыт; в календаре неделя и месяц — виды, «Дашборд» — справа вверху', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'Октябрь 2026' })
    const nav = screen.getByRole('navigation', { name: 'Отделы' })
    expect(within(nav).getByRole('button', { name: 'SMM — контент-план' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: 'Маркетинг — скоро' })).toHaveAttribute('aria-disabled', 'true')
    expect(within(nav).getAllByRole('button', { name: /— скоро$/ })).toHaveLength(9)
    expect(within(nav).getByRole('button', { name: 'Профиль' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Время' }))
    expect(await screen.findByRole('grid', { name: 'Неделя по времени' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Темы' }))
    expect(await screen.findByRole('grid', { name: 'Неделя по темам' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Месяц' }))
    expect(await screen.findByRole('heading', { name: 'Октябрь 2026' })).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Дашборд' }))
    expect(await screen.findByRole('heading', { name: 'Дашборд' })).toBeInTheDocument()
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Календарь' })).toBeInTheDocument()
  })
})
