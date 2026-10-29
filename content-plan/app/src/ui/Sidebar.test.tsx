import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { smallPlan } from '../test/fixtures'
import { renderApp } from '../test/renderApp'

const side = () => screen.getByRole('complementary', { name: 'Фильтры' })
const day = (date: string) => document.querySelector(`.cp-tg__col[data-date="${date}"]`) as HTMLElement
const card = (date: string, name: RegExp) => within(day(date)).getByRole('button', { name }).closest('.cp-card') as HTMLElement
const colorOf = (el: HTMLElement) => el.style.getPropertyValue('--cp-c').toLowerCase()

describe('T-CP-035 FR-CP-035 разделы Датаиста, цвета и иконки площадок', () => {
  it('раздел назван полностью и серый; цвет канала и раздела меняется в фильтрах, «Как у канала» — вернуть', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    expect(within(side()).getByRole('button', { name: 'Офис Датаиста' })).toBeInTheDocument()
    expect(colorOf(card('2026-10-26', /^Демо · FULL: Стратегия/))).toBe('#1a56b8')

    await userEvent.click(within(side()).getByRole('button', { name: 'Цвет: Dataist' }))
    await userEvent.click(within(within(side()).getByRole('group', { name: 'Цвет: Dataist' })).getByRole('button', { name: 'Серый' }))
    expect(within(side()).queryByRole('group', { name: 'Цвет: Dataist' })).toBeNull()
    expect(colorOf(card('2026-10-26', /^Демо · FULL: Стратегия/))).toBe('#8e8e93')

    await userEvent.click(within(side()).getByRole('button', { name: 'Цвет: Офис Датаиста' }))
    const pop = within(side()).getByRole('group', { name: 'Цвет: Офис Датаиста' })
    expect(within(pop).getByRole('button', { name: 'Серый' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(pop).getByRole('button', { name: 'Зелёный' }))
    await userEvent.click(within(side()).getByRole('button', { name: 'Цвет: Офис Датаиста' }))
    await userEvent.click(within(side()).getByRole('button', { name: 'Как у канала' }))
    await userEvent.click(within(side()).getByRole('button', { name: 'Цвет: Офис Датаиста' }))
    // своего цвета у раздела нет — он как у канала (серый, его только что выбрали)
    expect(within(within(side()).getByRole('group', { name: 'Цвет: Офис Датаиста' })).queryByRole('button', { name: 'Как у канала' })).toBeNull()
    await userEvent.keyboard('{Escape}')
    expect(within(side()).queryByRole('group', { name: 'Цвет: Офис Датаиста' })).toBeNull()
    expect(screen.getByRole('complementary', { name: 'Фильтры' })).toBeInTheDocument()
    // щелчок мимо закрывает палитру
    await userEvent.click(within(side()).getByRole('button', { name: 'Цвет: Dataist' }))
    await userEvent.click(within(side()).getByText('Каналы'))
    expect(within(side()).queryByRole('group', { name: 'Цвет: Dataist' })).toBeNull()
  })
  it('у площадок — иконки', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    const yt = within(side()).getByRole('button', { name: /YouTube/ })
    expect(yt.querySelector('svg')).not.toBeNull()
  })
})

describe('T-CP-036 FR-CP-036 форматы: видео и текст (сайт и письмо — тоже форматы)', () => {
  it('в фильтрах — «Видео» и «Текст»; скрыли формат — карточки пропали, метка снимает', async () => {
    renderApp(undefined, { 'cp:side': 'false' })
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Фильтры' }))
    const video = within(side()).getByRole('group', { name: 'Видео' })
    expect(within(video).getAllByRole('button').map((b) => b.textContent)).toEqual(['Полное горизонтальное видео', 'Короткое вертикальное видео'])
    const text = within(side()).getByRole('group', { name: 'Текст' })
    // сайт и письмо — форматы; сайт — последним
    expect(within(text).getAllByRole('button').map((b) => b.textContent)).toEqual(['Текст с картинкой', 'Письмо', 'Страница на сайте'])
    expect(within(day('2026-10-26')).getByRole('button', { name: /Тезисы · Тезис дня: Я устал/ })).toBeInTheDocument()
    await userEvent.click(within(video).getByRole('button', { name: 'Короткое вертикальное видео' }))
    expect(within(day('2026-10-26')).queryByRole('button', { name: /Тезисы · Тезис дня: Я устал/ })).toBeNull()
    await userEvent.click(within(side()).getByRole('button', { name: 'Свернуть фильтры' }))
    await userEvent.click(screen.getByRole('button', { name: 'Снять фильтр: Скрыт формат: короткое вертикальное видео' }))
    expect(within(day('2026-10-26')).getByRole('button', { name: /Тезисы · Тезис дня: Я устал/ })).toBeInTheDocument()
  })
})

describe('T-CP-040 FR-CP-040 канал: «⋯» — переименовать или удалить', () => {
  it('«⋯» у канала — меню из двух: переименовать (в строке, Enter) и удалить (с подтверждением, ⌘Z возвращает)', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(within(side()).getByRole('button', { name: 'Ещё: Landao' }))
    const menu = within(side()).getByRole('menu', { name: 'Канал «Landao»' })
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Переименовать', 'Выше', 'Ниже', 'Удалить'])
    await userEvent.keyboard('{Escape}')
    expect(within(side()).queryByRole('menu')).toBeNull()

    await userEvent.click(within(side()).getByRole('button', { name: 'Ещё: Landao' }))
    await userEvent.click(within(side()).getByRole('menuitem', { name: 'Переименовать' }))
    const input = within(side()).getByRole('textbox', { name: 'Новое название канала «Landao»' })
    await userEvent.clear(input)
    await userEvent.type(input, 'Dataist{Enter}')
    expect(screen.getByText('Канал «Dataist» уже есть')).toBeInTheDocument()
    await userEvent.clear(input)
    await userEvent.type(input, 'Landao Studio{Enter}')
    expect(within(side()).getByRole('button', { name: 'Landao Studio' })).toBeInTheDocument() // без «с 02.11»

    await userEvent.click(within(side()).getByRole('button', { name: 'Ещё: Andre AIT' }))
    await userEvent.click(within(side()).getByRole('menuitem', { name: 'Удалить' }))
    const confirm = within(side()).getByRole('group', { name: 'Удалить канал «Andre AIT»?' })
    expect(confirm).toHaveTextContent('Уйдут 2 материала и форматы канала') // анонс в LinkedIn и строка в письме — письмо теперь формат
    await userEvent.click(within(confirm).getByRole('button', { name: 'Удалить' }))
    expect(within(side()).queryByRole('button', { name: 'Andre AIT' })).toBeNull()
    expect(within(day('2026-10-26')).queryByRole('button', { name: /Анонс от Andre AIT/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Отменить' }))
    expect(within(side()).getByRole('button', { name: 'Andre AIT' })).toBeInTheDocument()
    expect(within(day('2026-10-26')).getByRole('button', { name: /Анонс от Andre AIT/ })).toBeInTheDocument()
  })
  it('последний канал не удалить', async () => {
    const p = smallPlan()
    p.channels = [p.channels[0]]
    renderApp(p)
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(within(side()).getByRole('button', { name: 'Ещё: Dataist' }))
    expect(within(side()).getByRole('menuitem', { name: 'Удалить' })).toBeDisabled()
  })
  it('порядок каналов: «Выше / Ниже» в «⋯» и перетаскивание мышью; ⌘Z возвращает', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    const order = () => within(side()).getAllByRole('button', { name: /^Ещё: / }).map((b) => b.getAttribute('aria-label')!.slice(5))
    expect(order()).toEqual(['Dataist', 'Andre AIT', 'Landao'])
    await userEvent.click(within(side()).getByRole('button', { name: 'Ещё: Landao' }))
    expect(within(side()).getByRole('menuitem', { name: 'Ниже' })).toBeDisabled()
    await userEvent.click(within(side()).getByRole('menuitem', { name: 'Выше' }))
    expect(order()).toEqual(['Dataist', 'Landao', 'Andre AIT'])
    // мышью: взять Dataist и потянуть вниз за всех
    const row = within(side()).getByRole('button', { name: 'Dataist' })
    fireEvent.pointerDown(row, { button: 0, pointerType: 'mouse', clientY: 10 })
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientY: 80 })
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientY: 80 })
    expect(order()).toEqual(['Landao', 'Andre AIT', 'Dataist'])
    await userEvent.keyboard('{Control>}z{/Control}')
    expect(order()).toEqual(['Dataist', 'Landao', 'Andre AIT'])
  })
})

describe('T-CP-044 FR-CP-044 рубрики в фильтре — выделить', () => {
  it('ничего не выделено — видны все; щелчок выделяет — видны только выделенные; «Выделить все» и «Снять выделение»', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    const tags = () => within(side()).getByRole('group', { name: 'Рубрики' })
    const pill = (name: string) => within(tags()).getByRole('button', { name })
    const thesis = () => within(day('2026-10-26')).queryByRole('button', { name: /^Тезисы · Тезис дня/ })
    const demo = () => within(day('2026-10-26')).queryByRole('button', { name: /^Демо · FULL/ })
    expect(within(tags()).getAllByRole('button').every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(thesis()).not.toBeNull()
    expect(demo()).not.toBeNull()

    await userEvent.click(pill('Тезисы'))
    expect(pill('Тезисы')).toHaveAttribute('aria-pressed', 'true')
    expect(thesis()).not.toBeNull()
    expect(demo()).toBeNull()
    expect(within(side()).getByRole('button', { name: 'Сбросить' })).toBeInTheDocument() // фильтр включён

    await userEvent.click(pill('Демо'))
    expect(demo()).not.toBeNull()

    await userEvent.click(within(side()).getByRole('button', { name: 'Выделить все' }))
    expect(within(tags()).getAllByRole('button').every((b) => b.getAttribute('aria-pressed') === 'true')).toBe(true)
    expect(within(side()).getByRole('button', { name: 'Выделить все' })).toBeDisabled()
    expect(within(side()).queryByRole('button', { name: 'Сбросить' })).toBeNull() // все выделены — фильтра нет

    await userEvent.click(within(side()).getByRole('button', { name: 'Снять выделение' }))
    expect(within(tags()).getAllByRole('button').every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(thesis()).not.toBeNull()
    expect(demo()).not.toBeNull()
  })
})
