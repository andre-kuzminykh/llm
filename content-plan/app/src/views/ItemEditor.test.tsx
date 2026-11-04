import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'

const day = (date: string) => document.querySelector(`[data-date="${date}"]`) as HTMLElement
// карточка FULL «Демо: Стратегия» в дне недели (рядом стоит анонс Andre AIT с той же темой)
const full = (date = '2026-10-26') => within(day(date)).getByRole('button', { name: /^Демо · FULL: Стратегия/ }).closest('.cp-card') as HTMLElement
/** Рубрика — с подсказками при вводе: набрать начало и выбрать подсказку. */
const pickTag = async (form: HTMLElement, tag: string) => {
  const input = within(form).getByRole('combobox', { name: 'Рубрика' })
  await userEvent.clear(input)
  await userEvent.type(input, tag.slice(0, 3))
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
    await pickTag(form, 'Тезисы')
    // формат — из четырёх: у Тезисы в Dataist это короткое вертикальное видео («Тезис дня»)
    expect(within(within(form).getByRole('radiogroup', { name: 'Формат' })).getByRole('radio', { checked: true })).toHaveAccessibleName('Короткое вертикальное видео')
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

  it('главное — название: без канала и без рубрики можно; без названия — не сохраняет и говорит почему', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    const form = screen.getByRole('complementary', { name: 'Новый контент' })
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Канал' }), 'Без канала')
    const rubric = within(form).getByRole('combobox', { name: 'Рубрика' })
    await userEvent.click(rubric)
    await userEvent.click(within(form).getByRole('option', { name: 'Без рубрики' }))
    expect(rubric).toHaveValue('')
    await userEvent.click(within(form).getByRole('button', { name: 'Создать' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Впишите название')
    await userEvent.type(within(form).getByRole('textbox', { name: 'Тема' }), 'Просто мысль')
    const date = within(form).getByLabelText('Дата')
    await userEvent.clear(date)
    await userEvent.type(date, '2026-10-29')
    await userEvent.click(within(form).getByRole('button', { name: 'Создать' }))
    expect(screen.queryByRole('complementary', { name: 'Новый контент' })).toBeNull()
    // на шкале — карточка без рубрики, просто тема
    expect(within(day('2026-10-29')).getByRole('button', { name: /^Просто мысль/ })).toBeInTheDocument()
    // в «Каналах» — своя дорожка «Без канала»
    await userEvent.click(screen.getByRole('radio', { name: 'Каналы' }))
    expect(await screen.findByText('Без канала')).toBeInTheDocument()
  })

  it('тема — вместо заголовка «Материал», вписывается там; рядом ▶ / ⏸ (сразу, всей карточке); внизу галочка «Готово»; «Отменить» возвращает', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: /^Демо · FULL: Стратегия/ }))
    const form = screen.getByRole('complementary', { name: 'Материал' })
    const head = form.querySelector('.cp-sheet__head') as HTMLElement
    expect(within(form).queryByRole('heading', { name: 'Материал' })).toBeNull()
    expect(within(head).getByRole('textbox', { name: 'Тема' })).toHaveValue('Стратегия')
    expect(within(form).queryByRole('group', { name: 'Статус' })).toBeNull() // ряда статусов нет
    await userEvent.click(within(head).getByRole('button', { name: 'Начать' }))
    expect(within(full()).getByRole('button', { name: 'Пауза: Стратегия (в работе)' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Задача' })).toBeNull() // форма остаётся
    await userEvent.click(within(head).getByRole('button', { name: 'Пауза' }))
    expect(within(full()).getByRole('button', { name: 'Продолжить: Стратегия (на паузе)' })).toBeInTheDocument()
    expect(within(head).getByRole('button', { name: 'Продолжить' })).toBeInTheDocument()
    const done = within(form).getByRole('checkbox', { name: 'Готово' })
    expect(done).not.toBeChecked()
    await userEvent.click(done)
    expect(done).toBeChecked()
    expect(within(day('2026-10-26')).getByRole('button', { name: /^Демо · FULL: Стратегия, 12:00 — готово/ })).toBeInTheDocument()
    expect(within(full()).getByRole('button', { name: 'Задача: Стратегия (готово)' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Отменить' }))
    expect(within(full()).getByRole('button', { name: 'Продолжить: Стратегия (на паузе)' })).toBeInTheDocument()
    // тему правят прямо в заголовке
    const topic = within(head).getByRole('textbox', { name: 'Тема' })
    await userEvent.clear(topic)
    await userEvent.type(topic, 'Агент продаж{Enter}')
    expect(topic).toHaveValue('Агент продаж') // Enter не переносит строку
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }))
    expect(within(day('2026-10-26')).getByRole('button', { name: /^Демо · FULL: Агент продаж/ })).toBeInTheDocument()
  })
  it('площадки — по формату, значками, как в фильтрах; сайта и письма среди них нет; новая для канала — появится у канала', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    // в фильтрах слева — площадки без сайта и письма: это форматы
    const all = [...screen.getByRole('complementary', { name: 'Фильтры' }).querySelector('.cp-pills')!.querySelectorAll('button')].map((b) => b.textContent)
    expect(all).toEqual(['YouTube', 'Instagram', 'Telegram', 'X', 'LinkedIn'])
    await userEvent.click(within(day('2026-10-26')).getByRole('button', { name: /^Демо · Анонс от Andre AIT: Стратегия/ }))
    const form = screen.getByRole('complementary', { name: 'Материал' })
    const plats = () => within(within(form).getByRole('group', { name: 'Площадки' })).getAllByRole('button')
    // пост — только там, где пост выходит: без YouTube; строка в письме стала своей частью карточки
    expect(plats().map((b) => b.textContent)).toEqual(['Instagram', 'Telegram', 'X', 'LinkedIn'])
    expect(plats().every((b) => b.querySelector('svg'))).toBe(true)
    expect(plats().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)).toEqual(['LinkedIn'])
    await userEvent.click(within(within(form).getByRole('group', { name: 'Площадки' })).getByRole('button', { name: 'Instagram' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }))
    await userEvent.click(within(day('2026-10-26')).getByRole('button', { name: /^Демо · Анонс от Andre AIT: Стратегия/ }))
    const again = screen.getByRole('complementary', { name: 'Материал' })
    expect(within(within(again).getByRole('group', { name: 'Площадки' })).getByRole('button', { name: 'Instagram' })).toHaveAttribute('aria-pressed', 'true')
    // новый контент: список — по формату
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    const fresh = screen.getByRole('complementary', { name: 'Новый контент' })
    const list = () => within(within(fresh).getByRole('group', { name: 'Площадки' })).getAllByRole('button').map((b) => b.textContent)
    const fmt = (name: string) => userEvent.click(within(within(fresh).getByRole('radiogroup', { name: 'Формат' })).getByRole('radio', { name }))
    await userEvent.selectOptions(within(fresh).getByRole('combobox', { name: 'Канал' }), 'Landao')
    expect(list()).toEqual(['Instagram', 'Telegram', 'X', 'LinkedIn'])
    await fmt('Короткое вертикальное видео')
    expect(list()).toEqual(['YouTube', 'Instagram', 'Telegram', 'X', 'LinkedIn'])
    await fmt('Полное горизонтальное видео')
    expect(list()).toEqual(['YouTube', 'Telegram', 'X', 'LinkedIn'])
    // сайт и письмо — форматы: выбирать площадки не нужно, списка нет
    await fmt('Страница на сайте')
    expect(within(fresh).queryByRole('group', { name: 'Площадки' })).toBeNull()
    await fmt('Рассылка')
    expect(within(fresh).queryByRole('group', { name: 'Площадки' })).toBeNull()
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
    expect(within(full()).getByRole('button', { name: 'Пауза: Стратегия (в работе)' })).toBeInTheDocument()
    // рядом с темой — ⏸
    expect(within(task.querySelector('.cp-sheet__head') as HTMLElement).getByRole('button', { name: 'Пауза' })).toBeInTheDocument()
    const play = within(within(task).getByRole('group', { name: 'Статус задачи' })).getByRole('button', { name: 'В работе' })
    expect(play).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(play)
    expect(play).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(within(task).getByRole('button', { name: 'Назад' }))
    expect(within(panel()).getAllByRole('button', { name: 'Начать: Стратегия' })).toHaveLength(2)
    expect(within(full()).getByRole('button', { name: 'Начать: Стратегия' })).toBeInTheDocument()
  })
  it('на карточке ▶ — в работу (задача), потом ⏸ — на паузу без перехода, снова ▶ — продолжить', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(within(full()).getByRole('button', { name: 'Начать: Стратегия' }))
    expect(screen.getByRole('complementary', { name: 'Задача' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    await userEvent.click(within(full()).getByRole('button', { name: 'Пауза: Стратегия (в работе)' }))
    expect(screen.queryByRole('complementary', { name: 'Задача' })).toBeNull()
    expect(screen.getByText('На паузе: Стратегия')).toBeInTheDocument()
    await userEvent.click(within(full()).getByRole('button', { name: 'Продолжить: Стратегия (на паузе)' }))
    expect(within(full()).getByRole('button', { name: 'Пауза: Стратегия (в работе)' })).toBeInTheDocument()
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
    await pickTag(form, 'Тезисы')
    await userEvent.type(within(form).getByRole('textbox', { name: 'Тема' }), 'Разовый тезис')
    const date = within(form).getByLabelText('Дата')
    await userEvent.clear(date)
    await userEvent.type(date, '2026-10-31') // суббота: тезисы по сетке не выходят
    expect(within(form).queryByRole('switch', { name: /Вне сетки/ })).toBeNull() // переключателя нет — разовый сам
    await userEvent.click(within(form).getByRole('button', { name: 'Создать' }))
    expect(within(day('2026-10-31')).queryByRole('img', { name: /Нарушений/ })).toBeNull()
  })
  it('формат — значками: горизонталь, вертикаль, пост, веб, рассылка, щёлкнуть один; общие форматы FULL достаются только рубрикам, у которых есть FULL', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    const form = screen.getByRole('complementary', { name: 'Новый контент' })
    const group = () => within(form).getByRole('radiogroup', { name: 'Формат' })
    const radios = within(group()).getAllByRole('radio')
    expect(radios.map((o) => [o.getAttribute('aria-label'), o.textContent, !!o.querySelector('svg')])).toEqual([
      ['Полное горизонтальное видео', 'Горизонталь', true],
      ['Короткое вертикальное видео', 'Вертикаль', true],
      ['Текст с картинкой', 'Пост', true],
      ['Страница на сайте', 'Веб', true],
      ['Рассылка', 'Рассылка', true],
    ])
    // у Демо короткое видео — тизер FULL: формат уже есть, новым не заводится
    await pickTag(form, 'Демо')
    await userEvent.click(within(group()).getByRole('radio', { name: 'Короткое вертикальное видео' }))
    expect(within(group()).getByRole('radio', { name: 'Короткое вертикальное видео' })).toHaveAttribute('aria-checked', 'true')
    expect(within(form).queryByText('· новый')).toBeNull()
    // у Тезисы FULL нет — страница на сайте для них новая, заведётся разовой
    await pickTag(form, 'Тезисы')
    await userEvent.click(within(group()).getByRole('radio', { name: 'Страница на сайте' }))
    expect(within(form).getByText('· новый')).toBeInTheDocument()
  })
})

describe('T-CP-027 FR-CP-027 «+»: форма — только нужное', () => {
  it('сверху тема и ▶, под ней дата и время; дальше канал, рубрика (без «#»), заметка, формат, площадки, внизу «Готово» — без «Подробнее»', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    const form = screen.getByRole('complementary', { name: 'Новый контент' })
    const order = [
      within(form).getByRole('textbox', { name: 'Тема' }),
      within(form).getByRole('button', { name: 'Начать' }),
      within(form).getByLabelText('Дата'),
      within(form).getByRole('combobox', { name: 'Канал' }),
      within(form).getByRole('combobox', { name: 'Рубрика' }),
      within(form).getByRole('textbox', { name: 'Заметка' }),
      within(form).getByRole('radiogroup', { name: 'Формат' }),
      within(form).getByRole('group', { name: 'Площадки' }),
      within(form).getByRole('checkbox', { name: 'Готово' }),
    ]
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    for (const gone of [/Подробнее/, /Кто делает/, /Подготовить к/, /Вне сетки/, /Копи/, /Пересоздать/, /Общая тема/, /Хэштег/, /исходной сетке/])
      expect(within(form).queryByText(gone)).toBeNull()
    expect(within(form).queryByRole('button', { name: 'Подробнее' })).toBeNull()
    expect(within(form).queryByLabelText('Копия на дату')).toBeNull()
    expect(within(form).queryByRole('group', { name: 'Статус' })).toBeNull()
    await userEvent.type(within(form).getByRole('combobox', { name: 'Рубрика' }), 'тез')
    expect(within(form).getByRole('option', { name: 'Тезисы' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/#[А-Яа-яЁё]/) // решёток нигде нет
  })
  it('у материала то же: тема вместо «Материал», всё сразу, без «Подробнее»', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: /^Демо · FULL: Стратегия/ }))
    const form = screen.getByRole('complementary', { name: 'Материал' })
    expect(within(form).getByRole('combobox', { name: 'Рубрика' })).toHaveValue('Демо')
    expect(within(form.querySelector('.cp-sheet__head') as HTMLElement).getByRole('textbox', { name: 'Тема' })).toHaveValue('Стратегия')
    expect(within(form).getByRole('button', { name: 'YouTube' })).toHaveAttribute('aria-pressed', 'true')
    // ни состава группы, ни «Переносить и удалять вместе с группой»: карточка и так одна
    expect(within(form).queryByText(/Группа|вместе с группой/)).toBeNull()
    expect(within(form).queryByRole('switch')).toBeNull()
    expect(within(form).queryByRole('button', { name: 'Подробнее' })).toBeNull()
  })
})

describe('T-CP-049 FR-CP-049 рубрика — поле со списком: рубрики канала первыми', () => {
  it('щелчок открывает все рубрики: канала — первыми, ниже «Другие»; сменили канал — порядок свой', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    const form = screen.getByRole('complementary', { name: 'Новый контент' })
    const input = within(form).getByRole('combobox', { name: 'Рубрика' })
    const options = () => within(within(form).getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)
    await userEvent.click(input)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    // первой строкой — «Без рубрики»: рубрику можно не ставить
    expect(options()).toEqual(['Без рубрики', 'Демо', 'Технологии', 'Тезисы', 'Обновления'])
    expect(within(form).getByRole('listbox').textContent).toMatch(/В этом канале.*Тезисы.*Другие.*Обновления/)
    await userEvent.click(within(form).getByRole('option', { name: 'Тезисы' }))
    expect(input).toHaveValue('Тезисы')
    expect(within(form).queryByRole('listbox')).toBeNull()
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Канал' }), 'Landao')
    // у Landao тезисов нет — рубрика канала, и его рубрики теперь первыми
    expect(input).toHaveValue('Обновления')
    await userEvent.click(input)
    expect(options()).toEqual(['Без рубрики', 'Обновления', 'Демо', 'Технологии', 'Тезисы'])
  })
})

describe('T-CP-050 FR-CP-050 канал помнит площадки формата', () => {
  it('выбрали площадки руками — в следующий раз у этого канала и формата они уже выбраны; у другого канала — свои', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    const open = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
      const form = screen.getByRole('complementary', { name: 'Новый контент' })
      await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Канал' }), 'Landao')
      return form
    }
    const pressed = (form: HTMLElement) =>
      within(within(form).getByRole('group', { name: 'Площадки' }))
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.textContent)
    let form = await open()
    expect(pressed(form)).toEqual(['Telegram']) // как у формата рубрики в канале
    await userEvent.click(within(within(form).getByRole('group', { name: 'Площадки' })).getByRole('button', { name: 'Instagram' }))
    await userEvent.click(within(within(form).getByRole('group', { name: 'Площадки' })).getByRole('button', { name: 'X' }))
    await userEvent.type(within(form).getByRole('textbox', { name: 'Тема' }), 'Запуск')
    await userEvent.click(within(form).getByRole('button', { name: 'Создать' }))
    form = await open()
    expect(pressed(form)).toEqual(['Instagram', 'Telegram', 'X'])
    // другой канал — свои площадки: пост Демо у Dataist (анонс в Офисе) — Telegram, память Landao сюда не переходит
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Канал' }), 'Dataist')
    expect(pressed(form)).toEqual(['Telegram'])
  })
})

describe('T-CP-051 FR-CP-051 «Готово» — карточка сразу бледнеет, «В работе» — подсвечена', () => {
  it('▶ рядом с темой — карточка «в работе»; галочка «Готово» — сразу бледная; снять — как была', async () => {
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: /^Демо · FULL: Стратегия/ }))
    const form = screen.getByRole('complementary', { name: 'Материал' })
    expect(full()).not.toHaveClass('cp-card--progress')
    await userEvent.click(within(form).getByRole('button', { name: 'Начать' }))
    expect(full()).toHaveClass('cp-card--progress')
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Готово' }))
    expect(full()).toHaveClass('cp-card--done')
    expect(full()).not.toHaveClass('cp-card--progress')
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Готово' }))
    expect(full()).not.toHaveClass('cp-card--done')
  })
})

describe('T-CP-054 FR-CP-054 языков в форме нет: контент всегда на двух языках, язык — у подключённой соцсети', () => {
  it('в форме нового и старого материала языков нет; в настройках у своей соцсети — язык RU или EN, у конкурента — нет', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    const form = screen.getByRole('complementary', { name: 'Новый контент' })
    expect(within(form).queryByText('Языки')).toBeNull()
    expect(within(form).queryByRole('button', { name: /^Языки/ })).toBeNull()
    expect(within(form).queryByRole('group', { name: 'Языки по каналам' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    await userEvent.click(within(day('2026-10-26')).getByRole('button', { name: /^Демо · FULL: Стратегия/ }))
    expect(within(screen.getByRole('complementary', { name: 'Материал' })).queryByText('Языки')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    // язык — свойство подключения: русская версия уходит в аккаунты RU, английская — в EN
    await userEvent.click(screen.getByRole('button', { name: 'Профиль' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Настройки: соцсети и конкуренты/ }))
    const settings = screen.getByRole('complementary', { name: 'Настройки' })
    expect(settings).toHaveTextContent('Контент всегда на двух языках')
    const add = within(settings).getByRole('form', { name: 'Подключить соцсеть' })
    const lang = within(add).getByRole('combobox', { name: 'Язык' })
    expect([...(lang as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['RU — Русский', 'EN — English'])
    expect(lang).toHaveDisplayValue('RU — Русский')
    await userEvent.selectOptions(lang, 'en')
    await userEvent.type(within(add).getByLabelText('Название'), 'Dataist EN')
    await userEvent.click(within(add).getByRole('button', { name: 'Подключить' }))
    const mine = within(settings).getByRole('list', { name: 'Мои соцсети' })
    expect(within(mine).getByRole('listitem')).toHaveTextContent('Dataist EN')
    expect(within(mine).getByRole('listitem')).toHaveTextContent('EN')
    expect(screen.getByText(/«Dataist EN» \(EN\) подключён/)).toBeInTheDocument()
    expect(within(within(settings).getByRole('form', { name: 'Следить за аккаунтом' })).queryByRole('combobox', { name: 'Язык' })).toBeNull()
  })
})

describe('T-CP-055 FR-CP-055 повтор рядом со временем', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T09:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  it('каждую неделю по ср и пт — до конца плана, одним шагом; «Отменить» убирает все', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    const form = screen.getByRole('complementary', { name: 'Новый контент' })
    expect(within(form).getByLabelText('Дата')).toHaveValue('2026-10-28')
    const sel = within(form).getByRole('combobox', { name: 'Повтор' })
    expect([...(sel as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['Не повторять', 'Каждый день', 'По будням', 'Каждую неделю', 'Через неделю', 'Раз в месяц', 'Другое…'])
    expect(within(form).queryByRole('group', { name: 'Дни недели' })).toBeNull()
    await userEvent.selectOptions(sel, 'Каждую неделю')
    const days = within(form).getByRole('group', { name: 'Дни недели' })
    expect(within(days).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)).toEqual(['Ср'])
    expect(within(form).getByText(/каждую неделю: ср — ещё 4 до конца плана, 30 ноя/)).toBeInTheDocument()
    await userEvent.click(within(days).getByRole('button', { name: 'Пт' }))
    expect(within(form).getByText(/каждую неделю: ср, пт — ещё 9 до конца плана, 30 ноя/)).toBeInTheDocument()
    await userEvent.type(within(form).getByRole('textbox', { name: 'Тема' }), 'Стрим с подписчиками')
    await userEvent.click(within(form).getByRole('button', { name: 'Создать' }))
    expect(screen.getByText(/Создано на .* и ещё 9 раз — каждую неделю: ср, пт/)).toBeInTheDocument()
    // FULL Демо — с анонсом Andre AIT, как у ближайшего материала рубрики: в каждом дне повтора — то же
    const has = (d: string) => within(day(d)).queryAllByText('Стрим с подписчиками').length
    expect([has('2026-10-28'), has('2026-10-30'), has('2026-10-29')]).toEqual([2, 2, 0])
    await userEvent.click(screen.getByRole('button', { name: 'Отменить' }))
    expect([has('2026-10-28'), has('2026-10-30')]).toEqual([0, 0])
  })
})

describe('T-CP-063 FR-CP-063 повтор «Другое…» как в Google Календаре; заметка с картинками', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T09:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  it('раз в 3 дня, после 3 раз — два повтора; «Изменить» открывает окно снова', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    const form = screen.getByRole('complementary', { name: 'Новый контент' })
    await userEvent.type(within(form).getByRole('textbox', { name: 'Тема' }), 'Разбор кейса')
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Повтор' }), 'Другое…')
    const dlg = screen.getByRole('dialog', { name: 'Повтор' })
    expect(within(dlg).getByRole('group', { name: 'Дни повторения' })).toBeInTheDocument()
    await userEvent.clear(within(dlg).getByRole('spinbutton', { name: 'Интервал' }))
    await userEvent.type(within(dlg).getByRole('spinbutton', { name: 'Интервал' }), '3')
    await userEvent.selectOptions(within(dlg).getByRole('combobox', { name: 'Единица' }), 'day')
    expect(within(dlg).queryByRole('group', { name: 'Дни повторения' })).toBeNull()
    await userEvent.click(within(dlg).getByRole('radio', { name: /После/ }))
    await userEvent.clear(within(dlg).getByRole('spinbutton', { name: 'Сколько раз' }))
    await userEvent.type(within(dlg).getByRole('spinbutton', { name: 'Сколько раз' }), '3')
    await userEvent.click(within(dlg).getByRole('button', { name: 'Готово' }))
    expect(screen.queryByRole('dialog', { name: 'Повтор' })).toBeNull()
    expect(within(form).getByRole('combobox', { name: 'Повтор' })).toHaveDisplayValue('раз в 3 дня, 3 раза')
    expect(within(form).getByText(/раз в 3 дня, 3 раза — ещё 2/)).toBeInTheDocument()
    await userEvent.click(within(form).getByRole('button', { name: 'Изменить' }))
    expect(within(screen.getByRole('dialog', { name: 'Повтор' })).getByRole('spinbutton', { name: 'Интервал' })).toHaveValue(3)
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Повтор' })).getByRole('button', { name: 'Отмена' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Создать' }))
    expect(screen.getByText(/Создано на .* и ещё 2 раза — раз в 3 дня, 3 раза/)).toBeInTheDocument()
    const has = (d: string) => within(day(d)).queryAllByText('Разбор кейса').length > 0
    expect([has('2026-10-28'), has('2026-10-31'), has('2026-11-03'), has('2026-11-06')]).toEqual([true, true, true, false])
  })

  it('заметка — длинный текст и до 5 файлов: картинки и тексты; файл можно убрать', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    const form = screen.getByRole('complementary', { name: 'Новый контент' })
    await userEvent.type(within(form).getByRole('textbox', { name: 'Тема' }), 'Пост с файлами')
    await userEvent.type(within(form).getByRole('textbox', { name: 'Заметка' }), 'Длинное описание. '.repeat(20))
    const png = (n: number) => new File([new Uint8Array([137, 80, 78, 71, n])], `p${n}.png`, { type: 'image/png' })
    const txt = new File(['Сценарий: хук, суть, финал'], 'сценарий.txt', { type: 'text/plain' })
    const list = () => within(within(form).getByRole('list', { name: 'Файлы' })).getAllByRole('listitem')
    await userEvent.upload(within(form).getByLabelText('Добавить файлы'), [png(1), txt, png(2)])
    await waitFor(() => expect(list()).toHaveLength(3))
    expect(within(form).getByRole('link', { name: /сценарий\.txt/ })).toHaveAttribute('download', 'сценарий.txt')
    await userEvent.click(within(form).getByRole('button', { name: 'Убрать: p2.png' }))
    expect(list()).toHaveLength(2)
    await userEvent.upload(within(form).getByLabelText('Добавить файлы'), [png(3), png(4), png(5), png(6)])
    await waitFor(() => expect(list()).toHaveLength(5))
    expect(within(form).getByRole('alert')).toHaveTextContent('Не больше 5 файлов')
    expect(within(form).getByRole('button', { name: /Файлы 5\/5/ })).toBeDisabled()
    await userEvent.click(within(form).getByRole('button', { name: 'Создать' }))
    await userEvent.click(within(day('2026-10-28')).getAllByRole('button', { name: /Пост с файлами, \d\d:\d\d/ })[0])
    const item = screen.getByRole('complementary', { name: 'Материал' })
    expect(within(within(item).getByRole('list', { name: 'Файлы' })).getAllByRole('listitem')).toHaveLength(5)
    expect(within(item).getByRole('textbox', { name: 'Заметка' })).toHaveValue('Длинное описание. '.repeat(20))
  })
})
