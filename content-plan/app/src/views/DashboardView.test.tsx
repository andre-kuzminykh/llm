import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { item, smallPlan } from '../test/fixtures'
import { renderApp } from '../test/renderApp'

const day = (date: string) => document.querySelector(`[data-date="${date}"]`) as HTMLElement
const openDash = async () => {
  await screen.findByRole('grid', { name: 'Неделя по времени' })
  await userEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Дашборд' }))
  return screen.getByRole('complementary', { name: 'Дашборд' })
}

describe('T-CP-020 FR-CP-020 дашборд — панелью справа: что делать, темы', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T09:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('сверху просроченное (FULL готовят за 3 дня), дальше — по дням выхода; ▶ открывает задачу, «Назад» — к дашборду', async () => {
    renderApp()
    const dash = await openDash()
    const late = within(dash).getByRole('region', { name: 'Просрочено' })
    expect(within(late).getByRole('button', { name: 'Стратегия' })).toBeInTheDocument()
    const monday = within(dash).getByRole('region', { name: 'Пн, 26 октября' })
    expect(within(monday).getByRole('button', { name: 'Я устал от хайпа вокруг ИИ' })).toBeInTheDocument()
    expect(within(monday).getAllByText('к 25 окт').length).toBeGreaterThan(0)
    expect(within(within(dash).getByRole('region', { name: 'Пн, 2 ноября' })).getAllByRole('button', { name: 'Нужна тема' }).length).toBeGreaterThan(0)
    expect(within(late).queryByText('Dataist')).toBeNull()
    await userEvent.click(within(late).getByRole('button', { name: 'Начать: Стратегия' }))
    const task = screen.getByRole('complementary', { name: 'Задача' })
    await userEvent.click(within(task).getByRole('button', { name: 'Назад' }))
    const again = screen.getByRole('complementary', { name: 'Дашборд' })
    expect(within(within(again).getByRole('region', { name: 'Просрочено' })).getByRole('button', { name: 'Задача: Стратегия' })).toBeInTheDocument()
  })
  it('фильтр статуса словами — тот же, что в панели слева', async () => {
    renderApp()
    const dash = await openDash()
    await userEvent.click(within(within(dash).getByRole('region', { name: 'Что делать' })).getByRole('radio', { name: 'В работе' }))
    expect(within(dash).getByText(/ничего не ждёт работы/)).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('complementary', { name: 'Фильтры' })).getByRole('button', { name: 'Сбросить' }))
    expect(within(within(dash).getByRole('region', { name: 'Что делать' })).getByRole('radio', { name: 'Все' })).toHaveAttribute('aria-checked', 'true')
  })
  it('рубрика в «Темах» показывает календарь только по этой теме', async () => {
    renderApp()
    const dash = await openDash()
    const dataist = within(within(dash).getByRole('region', { name: 'Темы' })).getByRole('group', { name: 'Темы: Dataist' })
    expect(within(dataist).getByRole('button', { name: /^#демо/ })).toBeInTheDocument()
    await userEvent.click(within(dataist).getByRole('button', { name: /^#тезисы/ }))
    expect(screen.queryByRole('complementary', { name: 'Дашборд' })).toBeNull()
    const side = screen.getByRole('complementary', { name: 'Фильтры' })
    expect(within(side).getByRole('button', { name: '#тезисы' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(side).getByRole('button', { name: '#демо' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(day('2026-10-26')).queryByRole('button', { name: /^Демо/ })).toBeNull()
  })
})

describe('T-CP-031 FR-CP-031 периодичность рубрики и планирование недели', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T09:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('дни недели у рубрики ставят слоты без темы в расписание; снятый день убирает пустые', async () => {
    renderApp()
    const dash = await openDash()
    const topics = within(dash).getByRole('region', { name: 'Темы' })
    await userEvent.click(within(topics).getByRole('button', { name: 'Править' }))
    const period = within(topics).getByRole('group', { name: 'Периодичность: #тезисы · Тезис дня' })
    expect(within(period).getByRole('button', { name: 'Сб' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(within(period).getByRole('button', { name: 'Сб' }))
    expect(within(period).getByRole('button', { name: 'Сб' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('.cp-toast')).toHaveTextContent(/#тезисы · Тезис дня: ежедневно 11:00 · слотов без темы \+\d+/)
    await userEvent.click(within(dash).getByRole('button', { name: 'Закрыть' }))
    expect(within(day('2026-10-31')).getByRole('button', { name: /^Тезисы · Тезис дня: Нужна тема, 11:00/ })).toBeInTheDocument()
    // снять субботу — пустой слот уходит
    await userEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Дашборд' }))
    const again = within(screen.getByRole('complementary', { name: 'Дашборд' })).getByRole('region', { name: 'Темы' })
    await userEvent.click(within(again).getByRole('button', { name: 'Править' }))
    await userEvent.click(within(within(again).getByRole('group', { name: 'Периодичность: #тезисы · Тезис дня' })).getByRole('button', { name: 'Сб' }))
    expect(within(day('2026-10-31')).queryByRole('button', { name: /Нужна тема/ })).toBeNull()
  })

  it('новая рубрика в канал — с подсказками; периодичность у него задаётся днями', async () => {
    renderApp()
    const dash = await openDash()
    const topics = within(dash).getByRole('region', { name: 'Темы' })
    await userEvent.click(within(topics).getByRole('button', { name: 'Править' }))
    const add = within(topics).getByRole('combobox', { name: 'Добавить рубрику: Andre AIT' })
    await userEvent.type(add, 'тез')
    expect(within(topics).getByRole('option', { name: '#тезисы' })).toBeInTheDocument()
    await userEvent.clear(add)
    await userEvent.type(add, 'агенты')
    await userEvent.click(within(topics).getByRole('option', { name: 'Новая рубрика #агенты' }))
    const andre = within(topics).getByRole('group', { name: 'Темы: Andre AIT' })
    expect(within(andre).getByRole('group', { name: 'Периодичность: #агенты · Текст с картинкой' })).toBeInTheDocument()
  })

  it('за неделю дашборд просит уточнить темы: вписать или взять ближайший черновик той же рубрики', async () => {
    const p = smallPlan()
    // черновик тезиса и ещё один пустой слот тезиса на следующей неделе
    p.items.push({ ...p.items.find((x) => x.id === 'th-slot')!, id: 'draft1', date: null, title: 'Агенты вместо отделов', source: 'черновик' })
    p.items.push({ ...p.items.find((x) => x.id === 'th-slot')!, id: 'th-slot2', date: '2026-10-29' })
    renderApp(p)
    const dash = await openDash()
    const ask = within(dash).getByRole('region', { name: 'Планирование недели' })
    expect(within(ask).getByText('Неделя 26 окт – 1 ноя: уточните темы')).toBeInTheDocument()
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Дашборд' }).querySelector('.cp-top__dot')).not.toBeNull()
    await userEvent.click(within(ask).getByRole('button', { name: 'Уточнить' }))
    const plan = screen.getByRole('complementary', { name: 'Планирование недели' })
    // ближайший черновик — первому слоту по дате
    await userEvent.click(within(plan).getByRole('button', { name: 'Из черновиков: Агенты вместо отделов' }))
    await userEvent.type(within(plan).getByRole('textbox', { name: 'Тема: 29 окт, 11:00, #тезисы' }), 'Сколько стоит ИИ-сотрудник{Enter}')
    expect(within(plan).getAllByRole('img', { name: 'Тема есть' })).toHaveLength(2)
    expect(within(plan).getByText(/Все темы уточнены/)).toBeInTheDocument()
    await userEvent.click(within(plan).getByRole('button', { name: 'Назад' }))
    expect(within(screen.getByRole('complementary', { name: 'Дашборд' })).queryByRole('region', { name: 'Планирование недели' })).toBeNull()
    expect(within(day('2026-10-27')).getByRole('button', { name: /^Тезисы · Тезис дня: Агенты вместо отделов/ })).toBeInTheDocument()
    expect(within(day('2026-10-29')).getByRole('button', { name: /^Тезисы · Тезис дня: Сколько стоит ИИ-сотрудник/ })).toBeInTheDocument()
  })
})

describe('T-CP-022 FR-CP-022 черновики — банк идей во вкладке «+»', () => {
  // слоты раскладываются с сегодняшнего дня: «сегодня» — до слота тезисов 27 окт
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T09:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  it('«В черновики» из формы, вкладка «Черновики»: добавить списком, разложить по слотам', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    const form = screen.getByRole('complementary', { name: 'Новый контент' })
    await userEvent.type(within(form).getByRole('combobox', { name: 'Рубрика' }), 'тез')
    await userEvent.click(within(form).getByRole('option', { name: '#тезисы' }))
    await userEvent.type(within(form).getByRole('textbox', { name: 'Тема' }), 'ИИ-бухгалтер')
    await userEvent.click(within(form).getByRole('button', { name: 'В черновики' }))
    expect(document.querySelector('.cp-toast')).toHaveTextContent('Сохранено в черновики')
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    await userEvent.click(screen.getByRole('tab', { name: /^Черновики/ }))
    const drafts = screen.getByRole('complementary', { name: 'Черновики' })
    await userEvent.click(within(within(drafts).getByRole('group', { name: 'Рубрики черновиков' })).getByRole('button', { name: /^#тезисы/ }))
    const col = within(drafts).getByRole('region', { name: 'Черновики: #тезисы · Тезис дня' })
    expect(within(col).getByRole('button', { name: 'ИИ-бухгалтер' })).toBeInTheDocument()
    await userEvent.type(within(col).getByLabelText('Новые черновики: #тезисы · Тезис дня'), 'Агенты вместо отделов')
    await userEvent.click(within(col).getByRole('button', { name: 'Добавить' }))
    expect(within(col).getByRole('button', { name: 'Агенты вместо отделов' })).toBeInTheDocument()
    await userEvent.click(within(col).getByRole('button', { name: 'Разложить по слотам' }))
    expect(within(col).getByRole('button', { name: 'Вернуть в черновики: ИИ-бухгалтер' })).toBeInTheDocument()
    await userEvent.click(within(drafts).getByRole('tab', { name: 'Новый контент' }))
    expect(screen.getByRole('complementary', { name: 'Новый контент' })).toBeInTheDocument()
  })
})

describe('T-CP-037 FR-CP-037 программа в дашборде', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T09:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('«Программа» переворачивает дашборд: каналы → рубрики → тема, справа время, дата и площадки; неделя или месяц; щелчок открывает материал', async () => {
    renderApp()
    const dash = await openDash()
    await userEvent.click(within(dash).getByRole('radio', { name: 'Программа' }))
    expect(within(dash).queryByRole('heading', { name: 'Что делать' })).toBeNull()
    expect(within(dash).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Сводка', 'Программа', 'Неделя', 'Месяц', 'Все'])
    const dataist = within(dash).getByRole('region', { name: 'Программа: Dataist' })
    const demo = within(dataist).getByRole('group', { name: 'Dataist: #демо' })
    // по умолчанию — неделя: 2 ноября не попадает
    expect(within(demo).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['26 окт 12:00: Стратегия'])
    const row = within(demo).getByRole('button', { name: '26 окт 12:00: Стратегия' })
    // тема — первой, справа время и дата, рядом площадки всей карточки значками
    expect([...row.children].map((x) => x.className.split(' ')[0])).toEqual(['cp-sched__main', 'cp-sched__when', 'cp-sched__plats'])
    expect(row.querySelector('.cp-sched__when')).toHaveTextContent('26 окт 12:00')
    expect(within(row).getByLabelText('Площадки: Web, YouTube, Instagram, Telegram').querySelectorAll('svg')).toHaveLength(4)
    expect(within(dash).getByRole('region', { name: 'Программа: Andre AIT' })).toBeInTheDocument()
    await userEvent.click(within(dash).getByRole('radio', { name: 'Месяц' }))
    expect(within(within(dash).getByRole('group', { name: 'Dataist: #демо' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      '26 окт 12:00: Стратегия',
      '2 ноя 12:00: Нужна тема',
      '9 ноя 12:00: Нужна тема',
    ])
    await userEvent.click(within(dash).getByRole('button', { name: '26 окт 12:00: Стратегия' }))
    const sheet = screen.getByRole('complementary', { name: 'Материал' })
    expect(within(sheet).getByRole('textbox', { name: 'Тема' })).toHaveValue('Стратегия')
    // «Назад» — к расписанию, а не к сводке
    await userEvent.click(within(sheet).getByRole('button', { name: 'Назад' }))
    expect(within(screen.getByRole('complementary', { name: 'Дашборд' })).getByRole('radio', { name: 'Программа' })).toHaveAttribute('aria-checked', 'true')
  })
})

describe('T-CP-039 FR-CP-039 программа без общей темы: рубрика и есть тема', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T09:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('строк не отмечают и общей темы не ставят: в программе только рубрики и их материалы', async () => {
    renderApp()
    const dash = await openDash()
    await userEvent.click(within(dash).getByRole('radio', { name: 'Программа' }))
    expect(within(dash).getByRole('group', { name: 'Dataist: #тезисы' })).toBeInTheDocument()
    expect(within(dash).queryByRole('checkbox')).toBeNull()
    expect(within(dash).queryByText(/Общая тема|Поставить тему/)).toBeNull()
  })
  it('«Все» — до конца плана: у рубрики сначала 10 строк, дальше «Показать ещё»', async () => {
    const p = smallPlan()
    for (let i = 0; i < 14; i++) p.items.push(item({ id: `t${i}`, date: `2026-11-${String(i + 10).padStart(2, '0')}`, ruleId: 'sh_thesis', rubricId: 'thesis', title: `Тезис ${i + 1}`, format: 'Короткое вертикальное видео', platforms: ['YouTube'], rank: 20 }))
    renderApp(p)
    const dash = await openDash()
    await userEvent.click(within(dash).getByRole('radio', { name: 'Программа' }))
    await userEvent.click(within(dash).getByRole('radio', { name: 'Все' }))
    const tag = () => within(dash).getByRole('group', { name: 'Dataist: #тезисы' })
    const rows = () => within(tag()).getAllByRole('button', { name: /\d\d:\d\d: / })
    expect(rows()).toHaveLength(10)
    await userEvent.click(within(tag()).getByRole('button', { name: 'Показать ещё 6' }))
    expect(rows()).toHaveLength(16)
  })
})

describe('T-CP-041/042 FR-CP-041/042 наверстать и перенести период', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T09:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('«Не вышло вовремя» → «Наверстать» одной кнопкой: просроченное — на ближайшие дни, остальное по очереди; «Отменить» возвращает', async () => {
    renderApp()
    const dash = await openDash()
    const ask = within(dash).getByRole('region', { name: 'Не вышло вовремя' })
    expect(ask).toHaveTextContent('Не вышло вовремя: 2')
    await userEvent.click(within(ask).getByRole('button', { name: 'Наверстать' }))
    expect(screen.queryByRole('complementary', { name: 'Наверстать' })).toBeNull() // листа нет — сразу
    expect(screen.getByText('Наверстали: 2 карточки с 28 окт, занято пустых слотов: 1')).toBeInTheDocument()
    expect(within(screen.getByRole('complementary', { name: 'Дашборд' })).queryByRole('region', { name: 'Не вышло вовремя' })).toBeNull()
    expect(within(day('2026-10-28')).getByRole('button', { name: /^Тезисы · Тезис дня: Я устал от хайпа вокруг ИИ/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Отменить' }))
    expect(within(screen.getByRole('complementary', { name: 'Дашборд' })).getByRole('region', { name: 'Не вышло вовремя' })).toHaveTextContent('Не вышло вовремя: 2')
  })
  it('«Перенести период»: даты и каналы, «на следующие слоты» или «в свободные места», предпросмотр, перенос', async () => {
    const p = smallPlan()
    for (const [id, date] of [['A', '2026-10-29'], ['B', '2026-10-30'], ['C', '2026-11-01'], ['D', '2026-11-02']])
      p.items.push(item({ id, date, ruleId: 'sh_thesis', rubricId: 'thesis', title: `Тезис ${id}`, format: 'Короткое вертикальное видео', platforms: ['YouTube'], rank: 20 }))
    renderApp(p)
    const dash = await openDash()
    await userEvent.click(within(dash).getByRole('button', { name: 'Перенести период (отпуск)…' }))
    const sheet = screen.getByRole('complementary', { name: 'Перенести период' })
    const set = async (label: string, v: string) => fireEvent.change(within(sheet).getByLabelText(label), { target: { value: v } })
    await set('С', '2026-10-29')
    await set('По', '2026-10-30')
    expect(within(sheet).getByRole('radio', { name: 'На следующие слоты' })).toHaveAttribute('aria-checked', 'true')
    expect(within(sheet).getByRole('status')).toHaveTextContent('Из периода — 2 карточки с темой')
    const rows = within(sheet).getAllByRole('listitem').map((li) => li.textContent)
    expect(rows[0]).toContain('Тезис A')
    expect(rows[0]).toContain('29 окт → 1 ноя 11:00 · следующий слот')
    await userEvent.click(within(sheet).getByRole('radio', { name: 'В свободные места' }))
    expect(within(sheet).getAllByRole('listitem')[0]).toHaveTextContent('29 окт → 3 ноя 11:00 · свободный день')
    await userEvent.click(within(sheet).getByRole('radio', { name: 'На следующие слоты' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Перенести' }))
    expect(screen.getByText('Период 29 окт – 30 окт свободен: перенесено 2 карточки')).toBeInTheDocument()
  })
})
