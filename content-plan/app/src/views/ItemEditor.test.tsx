import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'

const day = (date: string) => document.querySelector(`[data-date="${date}"]`) as HTMLElement

describe('T-CP-005 FR-CP-005 форма материала', () => {
  it('правка заголовка FULL пересобирает тизер; отмена возвращает', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: /Демо · FULL: Демо \/ Стратегия/ }))
    const form = screen.getByRole('complementary', { name: 'Материал' })
    const title = within(form).getByRole('textbox', { name: 'Заголовок' })
    await userEvent.clear(title)
    await userEvent.type(title, 'Демо / Агент продаж')
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }))

    await userEvent.click(screen.getByRole('button', { name: 'Открыть день 2026-10-26' }))
    const panel = screen.getByRole('complementary', { name: /26 октября 2026/ })
    expect(within(panel).getByRole('button', { name: /Тизер: Демо \/ Агент продаж/ })).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: 'Отменить (⌘Z)' })[0])
    expect(within(panel).getByRole('button', { name: /Тизер: Демо \/ Стратегия/ })).toBeInTheDocument()
  })

  it('новый материал из шапки появляется на своей дате', async () => {
    renderApp()
    await screen.findByRole('heading', { name: 'Октябрь 2026' })
    await userEvent.click(screen.getByRole('button', { name: 'Материал' }))
    const form = screen.getByRole('complementary', { name: 'Новый материал' })
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Рубрика' }), 'Тезисы')
    expect(within(form).getByRole('combobox', { name: 'Формат' })).toHaveDisplayValue('Тезис дня')
    await userEvent.type(within(form).getByRole('textbox', { name: 'Заголовок' }), 'ИИ не заменит вас')
    const date = within(form).getByLabelText('Дата')
    await userEvent.clear(date)
    await userEvent.type(date, '2026-10-29')
    await userEvent.click(within(form).getByRole('button', { name: 'Создать' }))
    await userEvent.click(screen.getByRole('button', { name: 'Открыть день 2026-10-29' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Тезисы · Тезис дня: ИИ не заменит вас/ })).toBeInTheDocument())
    expect(day('2026-10-29')).toBeInTheDocument()
  })

  it('без площадки не сохраняет и говорит почему', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: /Демо · FULL: Демо \/ Стратегия/ }))
    const form = screen.getByRole('complementary', { name: 'Материал' })
    await userEvent.click(within(form).getByRole('button', { name: 'YouTube' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Выберите хотя бы одну площадку')
  })

  it('статус ставится значком в форме; без значка — в плане', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: /Демо · FULL: Демо \/ Стратегия/ }))
    const form = screen.getByRole('complementary', { name: 'Материал' })
    expect(within(form).queryByRole('combobox', { name: /Статус/ })).toBeNull()
    await userEvent.click(within(within(form).getByRole('group', { name: 'Статус' })).getByRole('button', { name: 'Готово' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }))
    const card = screen.getByRole('button', { name: /Демо \/ Стратегия — готово/ })
    expect(within(card).getByRole('img', { name: 'Готово' })).toBeInTheDocument()
  })
})

describe('T-CP-016 FR-CP-016 статус значком в панели дня', () => {
  it('нажали ▶ — в работе, нажали ещё раз — снова в плане', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Открыть день 2026-10-26' }))
    const panel = screen.getByRole('complementary', { name: /26 октября 2026/ })
    const picker = within(panel).getByRole('group', { name: 'Статус: Демо · FULL: Демо / Стратегия' })
    const play = within(picker).getByRole('button', { name: 'В работе' })
    await userEvent.click(play)
    expect(play).toHaveAttribute('aria-pressed', 'true')
    expect(within(day('2026-10-26')).getByRole('img', { name: 'В работе' })).toBeInTheDocument()
    await userEvent.click(play)
    expect(play).toHaveAttribute('aria-pressed', 'false')
    expect(within(day('2026-10-26')).queryByRole('img', { name: 'В работе' })).toBeNull()
  })
})
