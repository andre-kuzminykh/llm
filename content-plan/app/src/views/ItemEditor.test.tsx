import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'

const day = (date: string) => document.querySelector(`[data-date="${date}"]`) as HTMLElement
// карточка FULL «Демо: Стратегия» в дне недели (рядом стоит анонс Andre AIT с той же темой)
const full = (date = '2026-10-26') => within(day(date)).getByRole('button', { name: /^Демо · FULL: Стратегия/ }).closest('.cp-card') as HTMLElement
/** Хэштег — с подсказками при вводе: набрать начало и выбрать подсказку. */
const pickTag = async (form: HTMLElement, tag: string) => {
  const input = within(form).getByRole('combobox', { name: 'Хэштег' })
  await userEvent.clear(input)
  await userEvent.type(input, tag.slice(1, 4))
  await userEvent.click(within(form).getByRole('option', { name: tag }))
}

describe('T-CP-005 FR-CP-005 форма материала', () => {
  it('правка заголовка FULL пересобирает тизер; отмена возвращает', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: /^Демо · FULL: Стратегия/ }))
    const form = screen.getByRole('complementary', { name: 'Материал' })
    const title = within(form).getByRole('textbox', { name: 'Тема' })
    await userEvent.clear(title)
    await userEvent.type(title, 'Агент продаж')
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }))

    await userEvent.click(screen.getByRole('button', { name: 'Открыть день 2026-10-26' }))
    const panel = screen.getByRole('complementary', { name: /26 октября 2026/ })
    expect(within(panel).getByRole('button', { name: /^Демо · Анонс от Andre AIT: Агент продаж/ })).toBeInTheDocument()

    await userEvent.keyboard('{Control>}z{/Control}')
    expect(within(panel).getByRole('button', { name: /^Демо · Анонс от Andre AIT: Стратегия/ })).toBeInTheDocument()
  })

  it('новый материал из шапки появляется на своей дате', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    const form = screen.getByRole('complementary', { name: 'Новый контент' })
    await pickTag(form, '#тезисы')
    expect(within(form).getByRole('combobox', { name: 'Формат' })).toHaveDisplayValue('Тезис дня')
    await userEvent.type(within(form).getByRole('textbox', { name: 'Тема' }), 'ИИ не заменит вас')
    const date = within(form).getByLabelText('Дата')
    await userEvent.clear(date)
    await userEvent.type(date, '2026-10-29')
    await userEvent.click(within(form).getByRole('button', { name: 'Создать' }))
    await userEvent.click(screen.getByRole('button', { name: 'Открыть день 2026-10-29' }))
    const panel = screen.getByRole('complementary', { name: /29 октября 2026/ })
    await waitFor(() => expect(within(panel).getByRole('button', { name: /^Тезисы · Тезис дня: ИИ не заменит вас, 11:00/ })).toBeInTheDocument())
    expect(within(day('2026-10-29')).getByRole('button', { name: /^Тезисы · Тезис дня: ИИ не заменит вас/ })).toBeInTheDocument()
  })

  it('без площадки не сохраняет и говорит почему', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: /^Демо · FULL: Стратегия/ }))
    const form = screen.getByRole('complementary', { name: 'Материал' })
    // площадки — в «Подробнее»
    expect(within(form).queryByRole('button', { name: 'YouTube' })).toBeNull()
    await userEvent.click(within(form).getByRole('button', { name: 'Подробнее' }))
    await userEvent.click(within(form).getByRole('button', { name: 'YouTube' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Выберите хотя бы одну площадку')
  })

  it('статус ставится значком в форме; без значка — в плане', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: /^Демо · FULL: Стратегия/ }))
    const form = screen.getByRole('complementary', { name: 'Материал' })
    expect(within(form).queryByRole('combobox', { name: /Статус/ })).toBeNull()
    await userEvent.click(within(form).getByRole('button', { name: 'Подробнее' }))
    await userEvent.click(within(within(form).getByRole('group', { name: 'Статус' })).getByRole('button', { name: 'Готово' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }))
    expect(within(day('2026-10-26')).getByRole('button', { name: /^Демо · FULL: Стратегия, 12:00 — готово/ })).toBeInTheDocument()
    expect(within(full()).getByRole('button', { name: 'Задача: Стратегия (готово)' })).toBeInTheDocument()
  })
})

describe('T-CP-016 FR-CP-016 статус значком в панели дня', () => {
  it('▶ в углу карточки — в работе и открылась задача; статус снимается в задаче', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Открыть день 2026-10-26' }))
    const panel = () => screen.getByRole('complementary', { name: /26 октября 2026/ })
    // у карточки один значок статуса, без ряда кнопок
    expect(within(panel()).queryByRole('group', { name: /^Статус/ })).toBeNull()
    // первая — FULL Dataist в 12:00, вторая — анонс Andre AIT
    await userEvent.click(within(panel()).getAllByRole('button', { name: 'Начать: Стратегия' })[0])
    // задача: тема — заголовком, что сделать на каждой площадке
    const task = screen.getByRole('complementary', { name: 'Задача' })
    expect(within(task).getByRole('textbox', { name: 'Тема' })).toHaveValue('Стратегия')
    expect(within(task).getByRole('checkbox', { name: /YouTube — FULL/ })).toBeInTheDocument()
    expect(within(task).getByRole('checkbox', { name: /Instagram — Тизер · Reels/ })).toBeInTheDocument()
    expect(within(task).getByRole('button', { name: 'Пн, 26 окт' })).toBeInTheDocument()
    expect(within(full()).getByRole('button', { name: 'Задача: Стратегия (в работе)' })).toBeInTheDocument()
    const play = within(within(task).getByRole('group', { name: 'Статус задачи' })).getByRole('button', { name: 'В работе' })
    expect(play).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(play)
    expect(play).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(within(task).getByRole('button', { name: 'Назад' }))
    expect(within(panel()).getAllByRole('button', { name: 'Начать: Стратегия' })).toHaveLength(2)
    expect(within(full()).getByRole('button', { name: 'Начать: Стратегия' })).toBeInTheDocument()
  })
  it('в задаче галочки по площадкам; когда всё сделано — «Готово» одной кнопкой', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(within(full()).getByRole('button', { name: 'Начать: Стратегия' }))
    const task = screen.getByRole('complementary', { name: 'Задача' })
    for (const box of within(task).getAllByRole('checkbox')) await userEvent.click(box)
    await userEvent.click(within(task).getByRole('button', { name: /Всё сделано/ }))
    expect(within(full()).getByRole('button', { name: 'Задача: Стратегия (готово)' })).toBeInTheDocument()
  })
})

describe('T-CP-019 FR-CP-019 разовый материал и форматы рубрики', () => {
  it('материал на «чужой» день сразу вне сетки — проверка его не трогает', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    const form = screen.getByRole('complementary', { name: 'Новый контент' })
    await pickTag(form, '#тезисы')
    await userEvent.type(within(form).getByRole('textbox', { name: 'Тема' }), 'Разовый тезис')
    const date = within(form).getByLabelText('Дата')
    await userEvent.clear(date)
    await userEvent.type(date, '2026-10-31') // суббота: тезисы по сетке не выходят
    expect(within(form).getByRole('switch', { name: /Вне сетки/ })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(within(form).getByRole('button', { name: 'Создать' }))
    expect(within(day('2026-10-31')).queryByRole('img', { name: /Нарушений/ })).toBeNull()
  })
  it('общие форматы FULL предлагаются только рубрикам, у которых есть FULL', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    const form = screen.getByRole('complementary', { name: 'Новый контент' })
    const formats = () => within(within(form).getByRole('combobox', { name: 'Формат' })).getAllByRole('option').map((o) => o.textContent)
    await pickTag(form, '#демо')
    expect(formats()).toContain('Тизер FULL (с FULL)')
    await pickTag(form, '#тезисы')
    expect(formats()).toEqual(['Тезис дня'])
  })
})

describe('T-CP-027 FR-CP-027 «+»: новый контент, копии и версии для площадок', () => {
  it('копия на другую дату и версия для Instagram — автоматически, когда оригинал выйдет', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    const form = screen.getByRole('complementary', { name: 'Новый контент' })
    // у нового контента все поля открыты сразу
    expect(within(form).getByRole('button', { name: 'Подробнее' })).toHaveAttribute('aria-expanded', 'true')
    await pickTag(form, '#тезисы')
    await userEvent.type(within(form).getByRole('textbox', { name: 'Тема' }), 'Агенты вместо отделов')
    const date = within(form).getByLabelText('Дата')
    await userEvent.clear(date)
    await userEvent.type(date, '2026-10-28')
    fireEvent.change(within(form).getByLabelText('Копия на дату'), { target: { value: '2026-11-04' } })
    expect(within(form).getByRole('button', { name: 'Убрать копию на 4 ноя' })).toBeInTheDocument()
    await userEvent.click(within(form).getByRole('button', { name: 'Версия для Instagram' }))
    await userEvent.click(within(form).getByRole('radio', { name: 'Автоматически после выхода' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Создать' }))
    expect(screen.getByText(/Создано на 28 окт · копий: 1, версий: 1, после выхода/)).toBeInTheDocument()
    expect(within(day('2026-11-04')).getByRole('button', { name: /^#?Тезисы · Тезис дня: Агенты вместо отделов/ })).toBeInTheDocument()
    const version = () => within(day('2026-10-29')).getByRole('button', { name: /Тезисы · Тезис дня: Агенты вместо отделов/ }).closest('.cp-card') as HTMLElement
    expect(version().querySelector('.cp-auto')).not.toBeNull()
    // оригинал вышел — версия стала задачей «в работе»
    await userEvent.click(within(day('2026-10-28')).getByRole('button', { name: 'Начать: Агенты вместо отделов' }))
    const task = screen.getByRole('complementary', { name: 'Задача' })
    await userEvent.click(within(within(task).getByRole('group', { name: 'Статус задачи' })).getByRole('button', { name: 'Вышло' }))
    expect(within(version()).getByRole('button', { name: 'Задача: Агенты вместо отделов (в работе)' })).toBeInTheDocument()
  })
})
