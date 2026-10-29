import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'

describe('T-CP-057 FR-CP-057 СММ: календарь контента и аналитика; свои каналы и конкуренты', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T09:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('слева, справа от отделов — «Календарь» и «Аналитика»; в аналитике — свои каналы по выбору, конкуренты, их контент', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    const smm = screen.getByRole('navigation', { name: 'SMM' })
    expect(within(smm).getAllByRole('button').map((b) => b.textContent)).toEqual(['Календарь', 'Аналитика'])
    expect(within(smm).getByRole('button', { name: 'Календарь контента' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(within(smm).getByRole('button', { name: /^Аналитика/ }))
    expect(within(smm).getByRole('button', { name: /^Аналитика/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Аналитика' })).toBeInTheDocument()
    // фильтры календаря и «+» здесь не нужны
    expect(screen.queryByRole('complementary', { name: 'Фильтры' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Новый контент' })).toBeNull()
    expect(localStorage.getItem('cp:section')).toBe('"analytics"')

    // свои каналы — все, что есть в плане; снять — карточки канала нет; ⌘Z — вернулась
    const pick = screen.getByRole('group', { name: 'Каналы для анализа' })
    expect(within(pick).getAllByRole('button').map((b) => b.textContent)).toEqual(['Dataist', 'Andre AIT', 'Landao'])
    const dataist = screen.getByRole('article', { name: 'Dataist' })
    expect(within(dataist).getByText('Карточек').nextElementSibling?.textContent).toMatch(/^3/)
    expect(within(dataist).getByRole('img', { name: /Dataist, карточек в неделю: .*26 окт — 3/ })).toBeInTheDocument()
    await userEvent.click(within(pick).getByRole('button', { name: 'Landao' }))
    expect(screen.queryByRole('article', { name: 'Landao' })).toBeNull()
    await userEvent.keyboard('{Control>}z{/Control}')
    expect(screen.getByRole('article', { name: 'Landao' })).toBeInTheDocument()

    // конкуренты: из маркетингового анализа — позже (пунктиром); пока заводят сами
    expect(screen.getByText('Из маркетингового анализа').closest('[aria-disabled="true"]')).toHaveTextContent('скоро')
    const form = screen.getByRole('form', { name: 'Новый конкурент' })
    await userEvent.click(within(form).getByRole('button', { name: 'Следить' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Как называется канал конкурента?')
    await userEvent.type(within(form).getByLabelText('Название'), 'AI Daily')
    await userEvent.selectOptions(within(form).getByLabelText('Площадка'), 'Telegram')
    await userEvent.type(within(form).getByLabelText('Ссылка или @аккаунт'), '@aidaily')
    await userEvent.click(within(form).getByRole('button', { name: 'Следить' }))
    const list = screen.getByRole('list', { name: 'Конкуренты' })
    expect(within(list).getByText('AI Daily').closest('li')).toHaveTextContent(/Telegram · @aidaily.*каждый час/)
    expect(screen.getByText(/посты и саммери появятся после первой проверки/)).toBeInTheDocument()
    await userEvent.click(within(list).getByRole('button', { name: 'Не следить: AI Daily' }))
    expect(screen.queryByRole('list', { name: 'Конкуренты' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Отменить' }))
    expect(within(screen.getByRole('list', { name: 'Конкуренты' })).getByText('AI Daily')).toBeInTheDocument()

    // обратно в календарь
    await userEvent.click(within(smm).getByRole('button', { name: 'Календарь контента' }))
    expect(await screen.findByRole('grid', { name: 'Неделя по времени' })).toBeInTheDocument()
  })
})
