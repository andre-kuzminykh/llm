import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'

describe('T-CP-056/057 FR-CP-056/057 СММ: календарь и аналитика по данным соцсетей; конкуренты и лента для вдохновения', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T15:20:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('слева, справа от отделов — «Календарь» и «Аналитика»; без данных соцсетей — пусто, без «карточек плана»', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    const smm = screen.getByRole('navigation', { name: 'SMM' })
    expect(within(smm).getAllByRole('button').map((b) => b.textContent)).toEqual(['Календарь', 'Аналитика'])
    expect(within(smm).getByRole('button', { name: 'Календарь контента' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(within(smm).getByRole('button', { name: /^Аналитика/ }))
    expect(screen.getByRole('heading', { name: 'Аналитика' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Фильтры' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Новый контент' })).toBeNull()
    expect(localStorage.getItem('cp:section')).toBe('"analytics"')
    // периоды — от суток (по часам) до 90 дней
    expect(within(screen.getByRole('radiogroup', { name: 'Период' })).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Сутки', '7 дней', '30 дней', '90 дней'])
    // по карточкам плана ничего не считаем: данные — из соцсетей, пока их нет
    expect(screen.queryByText(/Карточек в неделю|Не вышло вовремя|Впереди 7 дней/)).toBeNull()
    expect(screen.getByText('Данные придут из соцсетей')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Dataist' })).getByText(/Нет данных: YouTube, Instagram, Telegram, X — не подключены/)).toBeInTheDocument()
    // свои каналы — все, что есть в плане; снять — карточки канала нет; ⌘Z — вернулась
    const pick = screen.getByRole('group', { name: 'Каналы для анализа' })
    expect(within(pick).getAllByRole('button').map((b) => b.textContent)).toEqual(['Dataist', 'Andre AIT', 'Landao'])
    await userEvent.click(within(pick).getByRole('button', { name: 'Landao' }))
    expect(screen.queryByRole('article', { name: 'Landao' })).toBeNull()
    await userEvent.keyboard('{Control>}z{/Control}')
    expect(screen.getByRole('article', { name: 'Landao' })).toBeInTheDocument()
    await userEvent.click(within(smm).getByRole('button', { name: 'Календарь контента' }))
    expect(await screen.findByRole('grid', { name: 'Неделя по времени' })).toBeInTheDocument()
  })

  it('на примере: графики подписчиков, просмотров и вовлечённости, за сутки — по часам; конкурент — тоже; его посты — «Переиспользовать»', async () => {
    renderApp(undefined, { 'cp:section': '"analytics"' })
    await screen.findByRole('heading', { name: 'Аналитика' })
    // конкуренты: из маркетингового анализа — позже (пунктиром); пока заводят сами
    expect(screen.getByText('Из маркетингового анализа').closest('[aria-disabled="true"]')).toHaveTextContent('скоро')
    const form = screen.getByRole('form', { name: 'Новый конкурент' })
    await userEvent.click(within(form).getByRole('button', { name: 'Следить' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Как называется канал конкурента?')
    await userEvent.type(within(form).getByLabelText('Название'), 'AI Daily')
    await userEvent.selectOptions(within(form).getByLabelText('Площадка'), 'Telegram')
    await userEvent.type(within(form).getByLabelText('Ссылка или @аккаунт'), '@aidaily')
    await userEvent.click(within(form).getByRole('button', { name: 'Следить' }))
    const rival = within(screen.getByRole('list', { name: 'Конкуренты' })).getByRole('article', { name: 'AI Daily' })
    expect(rival).toHaveTextContent(/Telegram · @aidaily.*каждый час/)
    expect(screen.getByText(/посты и саммери появятся после первой проверки/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('switch', { name: 'Пример' }))
    expect(screen.getByRole('note')).toHaveTextContent('Это пример, не ваши данные')
    const dataist = screen.getByRole('article', { name: 'Dataist' })
    expect(within(dataist).getAllByRole('img').map((g) => g.getAttribute('aria-label')!.split(':')[0])).toEqual(['Dataist, подписчики', 'Dataist, просмотры', 'Dataist, вовлечённость'])
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Период' })).getByRole('radio', { name: 'Сутки' }))
    // сутки — 24 часа: «16:00 — …», …, «15:00 — …»
    const views = within(dataist).getByRole('img', { name: /просмотры/ }).getAttribute('aria-label')!
    expect(views.match(/\d\d:00 — /g)).toHaveLength(24)
    expect(views).toMatch(/просмотры: 16:00 — .*15:00 — /)
    // площадка — фильтром
    await userEvent.click(within(dataist).getByRole('radio', { name: 'YouTube' }))
    expect(within(dataist).getByRole('radio', { name: 'YouTube' })).toHaveAttribute('aria-checked', 'true')
    expect(within(rival).getAllByRole('img')).toHaveLength(3)

    // лента для вдохновения: посты конкурента с саммери, помечены как пример; «Переиспользовать» — новый контент с темой
    const feed = screen.getByRole('list', { name: 'Посты конкурентов' })
    const first = within(feed).getAllByRole('listitem')[0]
    expect(first).toHaveTextContent(/AI Daily.*пример/)
    const title = within(first).getByRole('heading').textContent!.replace(/^Пример: /, '')
    await userEvent.click(within(first).getByRole('button', { name: 'Переиспользовать' }))
    const draft = screen.getByRole('complementary', { name: 'Новый контент' })
    expect(within(draft).getByRole('textbox', { name: 'Тема' })).toHaveValue(title.charAt(0).toUpperCase() + title.slice(1))
    expect((within(draft).getByRole('textbox', { name: 'Заметка' }) as HTMLTextAreaElement).value).toMatch(/^По мотивам: AI Daily, Telegram\nСаммери: Пример саммери.*\nЧто поменять у нас: $/)

    await userEvent.click(within(screen.getByRole('list', { name: 'Конкуренты' })).getByRole('button', { name: 'Не следить: AI Daily' }))
    expect(screen.queryByRole('list', { name: 'Конкуренты' })).toBeNull()
  })
})
