import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'

// календарь неделей по времени, неделя на экран: колонка — (1200 − 56) / 7 px (в jsdom ширины нет — берётся 1200)
const COL = Math.floor((1200 - 56) / 7)
const HOUR = 64
const week = (span = 'week') => renderApp(undefined, { 'cp:view': JSON.stringify('week'), 'cp:week-mode': 'time', 'cp:span': span })
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

  it('день, три дня или неделя на экран; стрелки — на ширину окна; лента дней с окном посередине', async () => {
    week('3day')
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    const spans = screen.getByRole('radiogroup', { name: 'Сколько дней на экране' })
    expect(within(spans).getByRole('radio', { name: '3 дня' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Следующие 3 дня' })).toBeInTheDocument()
    const strip = screen.getByRole('group', { name: 'Лента дней' })
    expect(within(strip).getAllByRole('button')).toHaveLength(50)
    expect(within(strip).getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'true').length).toBeGreaterThan(0)
    await userEvent.click(within(spans).getByRole('radio', { name: 'День' }))
    expect(screen.getByRole('button', { name: 'Следующий день' })).toBeInTheDocument()
    expect(localStorage.getItem('cp:span')).toBe('day')
    await userEvent.click(within(spans).getByRole('radio', { name: 'Неделя' }))
    expect(screen.getByRole('button', { name: 'Следующая неделя' })).toBeInTheDocument()
    await act(async () => {})
  })
})
