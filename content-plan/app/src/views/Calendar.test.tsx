import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { smallPlan } from '../test/fixtures'
import { renderApp } from '../test/renderApp'

const day = (date: string) => document.querySelector(`[data-date="${date}"]`) as HTMLElement
const ready = () => screen.findByRole('grid', { name: 'Неделя по времени' })
const side = () => screen.getByRole('complementary', { name: 'Фильтры' })

describe('T-CP-001 FR-CP-001 календарь — неделя', () => {
  it('в дне — все единицы контента; фильтры слева убирают лишнее', async () => {
    renderApp()
    await ready()
    // все карточки дня: тезис, FULL с тизером и анонсом (одна карточка), анонс Andre AIT; рубрика — хэштегом
    const cards = [...day('2026-10-26').querySelectorAll('.cp-card__open')].map((b) => b.getAttribute('aria-label'))
    expect(cards).toEqual(['Тезисы · Тезис дня: Я устал от хайпа вокруг ИИ, 11:00', 'Демо · FULL: Стратегия, 12:00', 'Демо · Анонс от Andre AIT: Стратегия, 13:00'])
    const card = within(day('2026-10-26')).getByRole('button', { name: /^Демо · FULL: Стратегия/ })
    expect(within(card).getByLabelText('Хэштег: #демо')).toBeInTheDocument()
    expect(card.closest('.cp-card')).toHaveClass('cp-card--main')
    // слот без темы — пунктиром «Нужна тема»
    expect(within(day('2026-10-27')).getByRole('button', { name: /^Тезисы · Тезис дня: Нужна тема/ }).closest('.cp-card')).toHaveClass('cp-card--slot')
    // фильтр по каналу — в панели слева, она всегда открыта
    await userEvent.click(within(side()).getByRole('button', { name: 'Andre AIT' }))
    expect(within(day('2026-10-26')).queryByRole('button', { name: /Andre AIT/ })).toBeNull()
    expect(day('2026-10-26').querySelectorAll('.cp-card')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Следующая неделя' }))
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
    expect(within(full).getByText('Анонс · Офис')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /^Демо · Анонс от Andre AIT: Стратегия, 13:00/ })).toBeInTheDocument()
  })
  it('нарушение видно на дне', async () => {
    const p = smallPlan()
    p.items.find((x) => x.id === 'thesis')!.date = '2026-10-31'
    renderApp(p)
    await ready()
    expect(screen.getByRole('img', { name: 'Нарушений: 1' })).toBeInTheDocument()
  })
})

describe('T-CP-028 FR-CP-028 оболочка: отделы, панель слева, дашборд справа вверху', () => {
  it('слева — отделы и фильтры; вид календаря с иконками — справа от поиска; «Месяца», окон дней и «Отменить» в шапке нет', async () => {
    renderApp()
    await ready()
    const nav = screen.getByRole('navigation', { name: 'Отделы' })
    expect(within(nav).getByRole('button', { name: 'SMM — контент-план' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getAllByRole('button', { name: /— скоро$/ })).toHaveLength(9)
    expect(within(nav).getByRole('button', { name: 'Профиль' })).toBeInTheDocument()
    const top = screen.getByRole('banner')
    const views = within(top).getByRole('radiogroup', { name: 'Вид календаря' })
    expect(within(views).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(['Время', 'Каналы', 'Площадки', 'Темы'])
    expect(within(views).getByRole('radio', { name: 'Время' }).querySelector('svg')).not.toBeNull()
    // справа от поиска, а значок дашборда — в самом углу
    const order = [...top.querySelectorAll('[role="search"], [aria-label="Вид календаря"], [aria-label="Дашборд"]')].map((el) => (el.getAttribute('role') === 'search' ? 'search' : el.getAttribute('aria-label')))
    expect(order).toEqual(['search', 'Вид календаря', 'Дашборд'])
    await userEvent.click(within(views).getByRole('radio', { name: 'Темы' }))
    expect(await screen.findByRole('grid', { name: 'Неделя по темам' })).toBeInTheDocument()
    await userEvent.click(within(views).getByRole('radio', { name: 'Время' }))
    await ready()
    expect(within(side()).queryByRole('radiogroup', { name: /Вид|Показать/ })).toBeNull()
    expect(within(top).queryByRole('radio', { name: 'Месяц' })).toBeNull()
    expect(within(top).queryByRole('button', { name: /Отменить/ })).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: /Сколько дней/ })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Лента дней' })).toBeNull()
    // в фильтрах — без банка идей
    expect(within(side()).queryByText('Банк идей')).toBeNull()
    // дашборд — значок справа вверху, открывается панелью справа, календарь остаётся
    await userEvent.click(within(top).getByRole('button', { name: 'Дашборд' }))
    expect(screen.getByRole('complementary', { name: 'Дашборд' })).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: 'Неделя по времени' })).toBeInTheDocument()
    await userEvent.click(within(top).getByRole('button', { name: 'Дашборд' }))
    expect(screen.queryByRole('complementary', { name: 'Дашборд' })).toBeNull()
  })
  it('фильтры сворачиваются и разворачиваются; свёрнутые — метками в шапке и числом на кнопке; помнится', async () => {
    renderApp()
    await ready()
    const top = screen.getByRole('banner')
    const button = within(top).getByRole('button', { name: 'Фильтры' })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(within(side()).getByRole('button', { name: 'Andre AIT' }))
    expect(within(top).queryByRole('button', { name: 'Снять фильтр: Без Andre AIT' })).toBeNull()
    await userEvent.click(within(side()).getByRole('button', { name: 'Свернуть фильтры' }))
    expect(screen.queryByRole('complementary', { name: 'Фильтры' })).toBeNull()
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button.querySelector('.cp-top__badge')).toHaveTextContent('1')
    expect(within(top).getByRole('button', { name: 'Снять фильтр: Без Andre AIT' })).toBeInTheDocument()
    expect(localStorage.getItem('cp:side')).toBe('false')
    await userEvent.click(button)
    expect(side()).toBeInTheDocument()
    expect(within(side()).getByRole('button', { name: 'Andre AIT' })).toHaveAttribute('aria-pressed', 'false')
    expect(localStorage.getItem('cp:side')).toBe('true')
  })
  it('каналы, площадки и хэштеги добавляются в панели слева и сразу фильтруются', async () => {
    renderApp()
    await ready()
    await userEvent.click(within(side()).getByRole('button', { name: 'Добавить площадку' }))
    await userEvent.type(within(side()).getByRole('textbox', { name: 'Новая площадка' }), 'VK{Enter}')
    expect(within(side()).getByRole('button', { name: 'VK' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(side()).getByRole('button', { name: 'Добавить канал' }))
    await userEvent.type(within(side()).getByRole('textbox', { name: 'Новый канал' }), 'Антрополис{Enter}')
    await userEvent.click(within(side()).getByRole('button', { name: /^Антрополис/ }))
    expect(within(side()).getByRole('button', { name: /^Антрополис/ })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(within(side()).getByRole('button', { name: 'Добавить хэштег' }))
    await userEvent.type(within(side()).getByRole('textbox', { name: 'Новый хэштег' }), '#исследования{Enter}')
    expect(within(side()).getByRole('button', { name: '#исследования' })).toBeInTheDocument()
  })
})

describe('T-CP-030 FR-CP-030 поиск вверху', () => {
  it('поиск в шапке: найденное под полем, нажать — календарь на дате и материал открыт', async () => {
    renderApp()
    await ready()
    await userEvent.type(within(screen.getByRole('banner')).getByRole('searchbox', { name: 'Поиск по плану' }), 'хайп')
    const found = screen.getByRole('region', { name: 'Найдено' })
    expect(within(found).getByText('Найдено: 1')).toBeInTheDocument()
    await userEvent.click(within(found).getByRole('button', { name: /26 окт, 11:00 · #тезисы: Я устал от хайпа вокруг ИИ/ }))
    expect(screen.getByRole('complementary', { name: 'Материал' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Найдено' })).toBeNull()
  })
})
