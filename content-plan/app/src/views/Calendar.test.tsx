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
    expect(within(card).getByLabelText('Рубрика: Демо')).toBeInTheDocument()
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

describe('T-CP-028 FR-CP-028 оболочка: отделы, панель слева, без дашборда', () => {
  it('слева — отделы и фильтры; справа от поиска — вид недели, в углу «Неделя / Месяц»; дашборда, окон дней и «Отменить» в шапке нет', async () => {
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
    // справа от поиска — вид недели, в самом углу — «Неделя / Месяц»; дашборда нет
    const order = [...top.querySelectorAll('[role="search"], [aria-label="Неделя или месяц"], [aria-label="Вид календаря"], [aria-label="Дашборд"]')].map((el) => (el.getAttribute('role') === 'search' ? 'search' : el.getAttribute('aria-label')))
    expect(order).toEqual(['search', 'Вид календаря', 'Неделя или месяц'])
    await userEvent.click(within(views).getByRole('radio', { name: 'Темы' }))
    expect(await screen.findByRole('grid', { name: 'Неделя по темам' })).toBeInTheDocument()
    await userEvent.click(within(views).getByRole('radio', { name: 'Время' }))
    await ready()
    expect(within(side()).queryByRole('radiogroup', { name: /Вид|Показать/ })).toBeNull()
    // месяц — не вид недели, а свой переключатель «Неделя / Месяц» значками
    expect(within(within(top).getByRole('radiogroup', { name: 'Неделя или месяц' })).getAllByRole('radio').map((r) => [r.getAttribute('aria-label'), !!r.querySelector('svg')])).toEqual([
      ['Неделя', true],
      ['Месяц', true],
    ])
    expect(within(top).queryByRole('button', { name: /Отменить/ })).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: /Сколько дней/ })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Лента дней' })).toBeNull()
    // в фильтрах — без банка идей
    expect(within(side()).queryByText('Банк идей')).toBeNull()
    // дашборда нет; «Перенести период (отпуск)» — в меню профиля
    expect(within(top).queryByRole('button', { name: 'Дашборд' })).toBeNull()
    await userEvent.click(within(nav).getByRole('button', { name: 'Профиль' }))
    expect(screen.getByRole('menuitem', { name: 'Перенести период (отпуск)…' })).toBeInTheDocument()
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
  it('каналы, площадки и рубрики добавляются в панели слева и сразу фильтруются', async () => {
    renderApp()
    await ready()
    await userEvent.click(within(side()).getByRole('button', { name: 'Добавить площадку' }))
    await userEvent.type(within(side()).getByRole('textbox', { name: 'Новая площадка' }), 'VK{Enter}')
    expect(within(side()).getByRole('button', { name: 'VK' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(side()).getByRole('button', { name: 'Добавить канал' }))
    await userEvent.type(within(side()).getByRole('textbox', { name: 'Новый канал' }), 'Антрополис{Enter}')
    await userEvent.click(within(side()).getByRole('button', { name: /^Антрополис/ }))
    expect(within(side()).getByRole('button', { name: /^Антрополис/ })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(within(side()).getByRole('button', { name: 'Добавить рубрику' }))
    await userEvent.type(within(side()).getByRole('textbox', { name: 'Новая рубрика' }), 'Исследования{Enter}')
    expect(within(side()).getByRole('button', { name: 'Исследования' })).toBeInTheDocument()
  })
})

/** SMM в окне Neuronium (nr-launch/1): у страницы свой top — window.top !== window.self. */
const inNeuronium = () => vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window)
/** Телефон, 390 px: совпадают (max-width: 600px) и (max-width: 900px). */
const onPhone = () =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: /max-width: (600|900)px/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {} }))

describe('T-CP-069 FR-CP-069 NFR-CP-008 одно меню отделов внутри Neuronium', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  it('в окне Neuronium своей панели отделов нет: ни Nr, ни отделов, ни «— скоро»; разделы и фильтры на месте', async () => {
    inNeuronium()
    renderApp()
    await ready()
    expect(screen.queryByRole('navigation', { name: 'Отделы' })).toBeNull()
    expect(screen.queryByText('Nr')).toBeNull()
    expect(screen.queryByRole('button', { name: 'SMM — контент-план' })).toBeNull()
    expect(screen.queryAllByRole('button', { name: /— скоро$/ })).toHaveLength(0)
    // разделы, шапка и фильтры — как на своём адресе
    const smm = screen.getByRole('navigation', { name: 'SMM' })
    expect(within(smm).getByRole('button', { name: 'Главная — аналитика и лента' })).toBeInTheDocument()
    expect(within(smm).getByRole('button', { name: 'Календарь контента' })).toHaveAttribute('aria-current', 'page')
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Фильтры' })).toHaveAttribute('aria-expanded', 'true')
    expect(within(side()).getByRole('button', { name: 'Andre AIT' })).toBeInTheDocument()
    // в меню профиля нет строки «Скоро: …» с отделами — они у Neuronium
    await userEvent.click(within(smm).getByRole('button', { name: 'Профиль' }))
    const menu = screen.getByRole('menu', { name: 'Профиль' })
    expect(within(menu).queryByText(/^Скоро:/)).toBeNull()
    expect(menu.textContent).not.toMatch(/Менеджмент|Инжиниринг/)
  })
  it('на своём адресе — как раньше: Nr, десять отделов, профиль внизу панели, «Скоро» в меню', async () => {
    renderApp()
    await ready()
    const nav = screen.getByRole('navigation', { name: 'Отделы' })
    expect(within(nav).getByText('Nr')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'SMM — контент-план' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getAllByRole('button', { name: /— скоро$/ })).toHaveLength(9)
    // в колонке разделов — только «Главная» и «Календарь»: профиль — внизу панели отделов
    expect(within(screen.getByRole('navigation', { name: 'SMM' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Главная', 'Календарь'])
    await userEvent.click(within(nav).getByRole('button', { name: 'Профиль' }))
    expect(within(screen.getByRole('menu', { name: 'Профиль' })).getByText(/^Скоро: Менеджмент, HR, Маркетинг/)).toBeInTheDocument()
  })
  it('телефон в окне Neuronium: внизу «Главная, Календарь, Профиль», отделов нет ни внизу, ни в меню профиля', async () => {
    inNeuronium()
    onPhone()
    renderApp()
    await ready()
    expect(screen.queryByRole('navigation', { name: 'Отделы' })).toBeNull()
    expect(screen.queryByText('Nr')).toBeNull()
    const tabs = screen.getByRole('navigation', { name: 'Разделы' })
    expect(within(tabs).getAllByRole('button').map((b) => b.textContent)).toEqual(['Главная', 'Календарь', 'Профиль'])
    await userEvent.click(within(tabs).getByRole('button', { name: 'Профиль' }))
    const menu = screen.getByRole('menu', { name: 'Профиль' })
    expect(within(menu).queryByText(/^Скоро:/)).toBeNull()
    expect(within(menu).getByRole('menuitem', { name: 'Настройки: соцсети и конкуренты' })).toBeInTheDocument()
  })
})

describe('T-CP-070 FR-CP-070 профиль в окне Neuronium — внизу колонки разделов', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  it('«Профиль» — последним в колонке, серым значком с подписью; меню то же: настройки, как пользоваться, отпуск, данные, тема', async () => {
    inNeuronium()
    renderApp()
    await ready()
    const items = within(screen.getByRole('navigation', { name: 'SMM' })).getAllByRole('button')
    expect(items.map((b) => b.getAttribute('aria-label'))).toEqual(['Главная — аналитика и лента', 'Календарь контента', 'Профиль'])
    const profile = items[2]
    expect(profile).toHaveClass('cp-sub__item')
    expect(profile).toHaveTextContent('Профиль')
    expect(profile.querySelector('.cp-avatar')).toBeNull() // кружок аккаунта рядом — у Neuronium
    expect(profile).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(profile)
    expect(profile).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu', { name: 'Профиль' })
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual([
      'Настройки: соцсети и конкуренты',
      'Как пользоваться',
      'Перенести период (отпуск)…',
      'Выгрузить JSON',
      'Календарь для таблицы (CSV)',
      'Загрузить JSON',
      'Загрузить план Датаиста (пример)',
      'Очистить всё',
    ])
    // тема — здесь же
    const theme = within(menu).getByRole('radiogroup', { name: 'Тема' })
    await userEvent.click(within(theme).getByRole('radio', { name: 'Тёмная' }))
    expect(document.documentElement).toHaveClass('dark')
    await userEvent.click(within(theme).getByRole('radio', { name: 'Авто' }))
    expect(document.documentElement).not.toHaveClass('dark')
    // Esc закрывает; «Настройки» и «Как пользоваться» открываются панелью справа
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu', { name: 'Профиль' })).toBeNull()
    expect(profile).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(profile)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Настройки: соцсети и конкуренты' }))
    expect(screen.getByRole('complementary', { name: 'Настройки' })).toBeInTheDocument()
    expect(screen.queryByRole('menu', { name: 'Профиль' })).toBeNull()
    await userEvent.click(profile)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Как пользоваться' }))
    expect(screen.getByRole('complementary', { name: 'Как пользоваться' })).toBeInTheDocument()
  })
  it('«Подключить соцсети — в настройках» на главной открывает настройки и в окне Neuronium', async () => {
    inNeuronium()
    renderApp(smallPlan(), { 'cp:section': JSON.stringify('home') })
    await screen.findByRole('heading', { name: 'Главная' })
    expect(screen.getByText(/— в настройках/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Подключить соцсети' }))
    expect(screen.getByRole('complementary', { name: 'Настройки' })).toBeInTheDocument()
  })
})

describe('T-CP-030 FR-CP-030 поиск вверху', () => {
  it('поиск в шапке: найденное под полем, нажать — календарь на дате и материал открыт', async () => {
    renderApp()
    await ready()
    await userEvent.type(within(screen.getByRole('banner')).getByRole('searchbox', { name: 'Поиск по плану' }), 'хайп')
    const found = screen.getByRole('region', { name: 'Найдено' })
    expect(within(found).getByText('Найдено: 1')).toBeInTheDocument()
    await userEvent.click(within(found).getByRole('button', { name: /26 окт, 11:00 · Тезисы: Я устал от хайпа вокруг ИИ/ }))
    expect(screen.getByRole('complementary', { name: 'Материал' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Найдено' })).toBeNull()
  })
})
