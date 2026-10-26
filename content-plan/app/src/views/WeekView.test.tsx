import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'

// календарь неделей по времени, неделя на экран: колонка — (1200 − 56) / 7 px (в jsdom ширины нет — берётся 1200)
const COL = Math.floor((1200 - 56) / 7)
const HOUR = 64
const week = () => renderApp(undefined, { 'cp:week-mode': 'time' })
const sheet = () => document.querySelector('.cp-body') as HTMLElement
const column = (date: string) => document.querySelector(`.cp-tg__col[data-date="${date}"]`) as HTMLElement
const card = (id: string) => document.querySelector(`.cp-tg__col [data-unit="${id}"]`) as HTMLElement
/** Экранный x середины колонки дня: колонка стоит на left, лист прокручен на scrollLeft. */
const xOf = (date: string) => parseFloat(column(date).style.left) - sheet().scrollLeft + COL / 2

describe('T-CP-029 FR-CP-029 календарь по времени — жесты из nr_management', () => {
  it('карточку берут и ставят на другой день и час: едет по 15 минутам, время на ней — куда встанет', async () => {
    week()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    const from = { clientX: xOf('2026-10-26'), clientY: 300 }
    fireEvent.pointerDown(card('thesis'), from)
    fireEvent.pointerMove(sheet(), { clientX: xOf('2026-10-27'), clientY: 300 + 2 * HOUR + 5 })
    expect(card('thesis')).toHaveClass('cp-card--lifted')
    expect(within(card('thesis')).getByText('13:00')).toBeInTheDocument()
    fireEvent.pointerUp(sheet(), { clientX: xOf('2026-10-27'), clientY: 300 + 2 * HOUR + 5 })
    expect(within(column('2026-10-27')).getByRole('button', { name: /^Тезисы · Тезис дня: Я устал от хайпа вокруг ИИ, 13:00/ })).toBeInTheDocument()
    expect(within(column('2026-10-26')).queryByRole('button', { name: /Я устал от хайпа/ })).not.toBeInTheDocument()
    expect(document.querySelector('.cp-toast')).toHaveTextContent('Перенесено на 27 окт, 13:00')
  })

  it('щелчок без сдвига — не перенос: карточка открывается', async () => {
    week()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    const at = { clientX: xOf('2026-10-26'), clientY: 300 }
    fireEvent.pointerDown(card('thesis'), at)
    fireEvent.pointerMove(sheet(), { ...at, clientX: at.clientX + 2 })
    fireEvent.pointerUp(sheet(), at)
    expect(card('thesis')).not.toHaveClass('cp-card--lifted')
    await userEvent.click(within(card('thesis')).getByRole('button', { name: /^Тезисы · Тезис дня/ }))
    expect(await screen.findByRole('complementary', { name: 'Материал' })).toBeInTheDocument()
  })

  it('нижний край тянут — конец по 15 минутам, на карточке «12:00–14:30»; отмена возвращает', async () => {
    week()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    const grip = card('demo').querySelector('.cp-tg__grip') as HTMLElement
    fireEvent.pointerDown(grip, { clientX: xOf('2026-10-26'), clientY: 400 })
    fireEvent.pointerMove(sheet(), { clientX: xOf('2026-10-26'), clientY: 400 + 1.4 * HOUR }) // +84 минуты → 14:30
    expect(within(card('demo')).getByText('12:00–14:30')).toBeInTheDocument()
    fireEvent.pointerUp(sheet(), { clientX: xOf('2026-10-26'), clientY: 400 + 1.4 * HOUR })
    expect(within(card('demo')).getByText('12:00–14:30')).toBeInTheDocument()
    expect(parseFloat(card('demo').style.height)).toBeCloseTo(2.5 * HOUR - 2)
    // растянутая карточка едет с той же длительностью
    fireEvent.pointerDown(card('demo'), { clientX: xOf('2026-10-26'), clientY: 400 })
    fireEvent.pointerMove(sheet(), { clientX: xOf('2026-10-26'), clientY: 400 + HOUR })
    fireEvent.pointerUp(sheet(), { clientX: xOf('2026-10-26'), clientY: 400 + HOUR })
    expect(within(card('demo')).getByText('13:00–15:30')).toBeInTheDocument()
    await userEvent.keyboard('{Control>}z{/Control}{Control>}z{/Control}')
    expect(within(card('demo')).getByText('12:00')).toBeInTheDocument()
  })

  it('пустой лист тянут рукой: прокрутка идёт в обратную сторону, ничего не переносится', async () => {
    week()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    const el = sheet()
    const left = el.scrollLeft
    const top = el.scrollTop
    fireEvent.pointerDown(column('2026-10-28'), { clientX: 600, clientY: 300 })
    fireEvent.pointerMove(el, { clientX: 500, clientY: 260 })
    fireEvent.pointerUp(el, { clientX: 500, clientY: 260 })
    expect(el.scrollLeft).toBe(left + 100)
    expect(el.scrollTop).toBe(top + 40)
    expect(document.querySelector('.cp-toast')).not.toBeInTheDocument()
  })

  it('Esc, пока карточку ведут, — отмена: она на месте', async () => {
    week()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    fireEvent.pointerDown(card('thesis'), { clientX: xOf('2026-10-26'), clientY: 300 })
    fireEvent.pointerMove(sheet(), { clientX: xOf('2026-10-28'), clientY: 300 + HOUR })
    expect(card('thesis')).toHaveClass('cp-card--lifted')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(card('thesis')).not.toHaveClass('cp-card--lifted')
    fireEvent.pointerUp(sheet(), { clientX: xOf('2026-10-28'), clientY: 300 + HOUR })
    expect(within(column('2026-10-26')).getByRole('button', { name: /^Тезисы · Тезис дня: .*, 11:00/ })).toBeInTheDocument()
    expect(document.querySelector('.cp-toast')).not.toBeInTheDocument()
  })

  it('уход указателя с листа заканчивает перенос там, где карточка стоит (gestureEnd)', async () => {
    week()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    fireEvent.pointerDown(card('thesis'), { clientX: xOf('2026-10-26'), clientY: 300 })
    fireEvent.pointerMove(sheet(), { clientX: xOf('2026-10-26'), clientY: 300 - HOUR })
    fireEvent.pointerLeave(sheet(), { clientX: xOf('2026-10-26'), clientY: 300 - HOUR })
    expect(within(column('2026-10-26')).getByRole('button', { name: /^Тезисы · Тезис дня: .*, 10:00/ })).toBeInTheDocument()
  })

  it('неделя на экран; стрелки — на неделю', async () => {
    week()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    expect(within(screen.getByRole('banner')).getByRole('heading', { name: '26 окт – 1 ноя 2026' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Следующая неделя' }))
    expect(within(screen.getByRole('banner')).getByRole('heading', { name: '2–8 ноя 2026' })).toBeInTheDocument()
    await act(async () => {})
  })
})

const tip = () => document.querySelector('.cp-drag-hint') as HTMLElement | null
const open = (id: string) => within(card(id)).getAllByRole('button')[0]

describe('T-CP-033 FR-CP-033 подсказка при переносе — словами', () => {
  it('пока ведут: куда встанет и что отметит проверка; отпустили — подсказки нет', async () => {
    week()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    fireEvent.pointerDown(card('thesis'), { clientX: xOf('2026-10-26'), clientY: 300 })
    // в субботу тезисы по сетке не выходят
    fireEvent.pointerMove(sheet(), { clientX: xOf('2026-10-31'), clientY: 300 })
    expect(tip()).toHaveTextContent('Сб, 31 окт · 11:00')
    expect(tip()).toHaveTextContent('По сетке Тезисы · Тезис дня не выходит в Сб')
    // во вторник уже стоит тезис — сверх лимита
    fireEvent.pointerMove(sheet(), { clientX: xOf('2026-10-27'), clientY: 300 })
    expect(tip()).toHaveTextContent('Вт, 27 окт · 11:00')
    expect(tip()).toHaveTextContent('Сверх лимита в день: Тезисы · Тезис дня: 2 при лимите 1')
    // в среду — всё в порядке: только куда
    fireEvent.pointerMove(sheet(), { clientX: xOf('2026-10-28'), clientY: 300 + HOUR })
    expect(tip()!.textContent).toBe('Ср, 28 окт · 12:00')
    fireEvent.pointerUp(sheet(), { clientX: xOf('2026-10-28'), clientY: 300 + HOUR })
    expect(tip()).toBeNull()
  })
  it('FULL — что едет вместе с ним', async () => {
    week()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    fireEvent.pointerDown(card('demo'), { clientX: xOf('2026-10-26'), clientY: 400 })
    fireEvent.pointerMove(sheet(), { clientX: xOf('2026-10-26'), clientY: 400 + HOUR })
    expect(tip()).toHaveTextContent('Пн, 26 окт · 13:00')
    fireEvent.pointerMove(sheet(), { clientX: xOf('2026-10-28'), clientY: 400 })
    expect(tip()).toHaveTextContent('Вместе с группой: Анонс в Офисе, Тизер FULL, Анонс от Andre AIT')
    expect(tip()).toHaveTextContent('По сетке Демо · FULL не выходит в Ср')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(tip()).toBeNull()
  })
})

describe('T-CP-034 FR-CP-034 несколько карточек сразу', () => {
  it('Shift-щелчок выбирает, а не открывает; панель внизу: сколько выбрано; Esc снимает', async () => {
    week()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    fireEvent.click(open('thesis'), { shiftKey: true })
    fireEvent.click(open('demo'), { metaKey: true })
    expect(screen.queryByRole('complementary', { name: 'Материал' })).toBeNull()
    expect(card('thesis')).toHaveClass('cp-card--picked')
    expect(open('demo')).toHaveAttribute('aria-pressed', 'true')
    const bar = screen.getByRole('toolbar', { name: 'Выбранные карточки' })
    expect(bar).toHaveTextContent('Выбрано: 2')
    expect(screen.queryByRole('button', { name: 'Новый контент' })).toBeNull()
    fireEvent.click(open('demo'), { ctrlKey: true })
    expect(bar).toHaveTextContent('Выбрано: 1')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('toolbar', { name: 'Выбранные карточки' })).toBeNull()
    expect(card('thesis')).not.toHaveClass('cp-card--picked')
  })
  it('статус всем выбранным — одной кнопкой', async () => {
    week()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    fireEvent.click(open('thesis'), { shiftKey: true })
    fireEvent.click(open('demo'), { shiftKey: true })
    const bar = screen.getByRole('toolbar', { name: 'Выбранные карточки' })
    await userEvent.click(within(within(bar).getByRole('group', { name: 'Статус выбранных' })).getByRole('button', { name: 'Готово' }))
    expect(within(card('thesis')).getByRole('button', { name: 'Задача: Я устал от хайпа вокруг ИИ (готово)' })).toBeInTheDocument()
    expect(within(card('demo')).getByRole('button', { name: 'Задача: Стратегия (готово)' })).toBeInTheDocument()
    // тизер и анонсы FULL в той же карточке — тоже
    await userEvent.click(screen.getByRole('button', { name: 'Открыть день 2026-10-26' }))
    const panel = screen.getByRole('complementary', { name: /26 октября 2026/ })
    expect(within(panel).getAllByRole('button', { name: /^Задача: Стратегия \(готово\)/ }).length).toBeGreaterThan(0)
  })
  it('перенос выбранной везёт все выбранные — на тот же сдвиг; подсказка — сколько и куда; одна отмена', async () => {
    week()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    fireEvent.click(open('thesis'), { shiftKey: true })
    fireEvent.click(open('demo'), { shiftKey: true })
    fireEvent.pointerDown(card('thesis'), { clientX: xOf('2026-10-26'), clientY: 300 })
    fireEvent.pointerMove(sheet(), { clientX: xOf('2026-10-28'), clientY: 300 + HOUR })
    expect(tip()).toHaveTextContent('2 карточки · +2 дня · +1 ч')
    // вторая выбранная едет вместе с первой, на ней — её новое время
    expect(card('demo')).toHaveClass('cp-card--lifted')
    expect(within(card('demo')).getByText('13:00')).toBeInTheDocument()
    fireEvent.pointerUp(sheet(), { clientX: xOf('2026-10-28'), clientY: 300 + HOUR })
    expect(within(column('2026-10-28')).getByRole('button', { name: /^Тезисы · Тезис дня: Я устал от хайпа вокруг ИИ, 12:00/ })).toBeInTheDocument()
    expect(within(column('2026-10-28')).getByRole('button', { name: /^Демо · FULL: Стратегия, 13:00/ })).toBeInTheDocument()
    expect(within(column('2026-10-28')).getByRole('button', { name: /^Демо · Анонс от Andre AIT: Стратегия, 14:00/ })).toBeInTheDocument()
    expect(document.querySelector('.cp-toast')).toHaveTextContent('Перенесено: 2 карточки · +2 дня · +1 ч')
    // выбор остаётся — можно двигать дальше; отмена — одним шагом
    expect(screen.getByRole('toolbar', { name: 'Выбранные карточки' })).toHaveTextContent('Выбрано: 2')
    await userEvent.keyboard('{Control>}z{/Control}')
    expect(within(column('2026-10-26')).getByRole('button', { name: /^Тезисы · Тезис дня: Я устал от хайпа вокруг ИИ, 11:00/ })).toBeInTheDocument()
    expect(within(column('2026-10-26')).getByRole('button', { name: /^Демо · FULL: Стратегия, 12:00/ })).toBeInTheDocument()
  })
  it('«На дату…» переносит выбранные, сохраняя промежутки; удалить — с отменой', async () => {
    week()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    fireEvent.click(open('thesis'), { shiftKey: true })
    fireEvent.click(within(card('th-slot')).getAllByRole('button')[0], { shiftKey: true })
    const bar = screen.getByRole('toolbar', { name: 'Выбранные карточки' })
    fireEvent.change(within(bar).getByLabelText('Перенести выбранные на дату'), { target: { value: '2026-10-28' } })
    expect(within(column('2026-10-28')).getByRole('button', { name: /^Тезисы · Тезис дня: Я устал от хайпа/ })).toBeInTheDocument()
    expect(within(column('2026-10-29')).getByRole('button', { name: /^Тезисы · Тезис дня: Нужна тема/ })).toBeInTheDocument()
    await userEvent.click(within(bar).getByRole('button', { name: 'Удалить выбранные' }))
    expect(screen.queryByRole('toolbar', { name: 'Выбранные карточки' })).toBeNull()
    expect(within(column('2026-10-28')).queryByRole('button', { name: /Я устал от хайпа/ })).toBeNull()
    await userEvent.keyboard('{Control>}z{/Control}')
    expect(within(column('2026-10-28')).getByRole('button', { name: /^Тезисы · Тезис дня: Я устал от хайпа/ })).toBeInTheDocument()
  })
})
