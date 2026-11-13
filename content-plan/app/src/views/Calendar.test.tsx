import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { smallPlan } from '../test/fixtures'
import { renderApp } from '../test/renderApp'
import { Icon } from '../ui/Icon'

const day = (date: string) => document.querySelector(`[data-date="${date}"]`) as HTMLElement
const ready = () => screen.findByRole('grid', { name: 'Неделя по времени' })
const side = () => screen.getByRole('complementary', { name: 'Фильтры' })
/** Рисунок значка из src/ui/Icon.tsx (содержимое svg) — по нему видно, какой значок стоит на кнопке. */
const glyph = (name: string) => {
  const box = document.createElement('div') // вне страницы: страница не меняется
  box.innerHTML = renderToStaticMarkup(<Icon name={name} />)
  return box.querySelector('svg')!.innerHTML
}
/** Сколько на странице значков-человечков — как в кружке аккаунта. */
const people = () => [...document.querySelectorAll('svg')].filter((s) => s.innerHTML === glyph('user')).length

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
  it('отделы — новыми именами (04.11.2026: «да, переименуй, старые перенаправь»): Главное, Рынок, Система; «Разработка» и остальные — как были', async () => {
    renderApp()
    await ready()
    const nav = screen.getByRole('navigation', { name: 'Отделы' })
    const names = ['Главное — скоро', 'HR — скоро', 'Рынок — скоро', 'SMM — контент-план', 'Продажи — скоро', 'Поддержка — скоро', 'Аналитика — скоро', 'Дизайн — скоро', 'Разработка — скоро', 'Система — скоро', 'Профиль']
    expect(within(nav).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(names)
    // подписи при наведении — те же имена
    expect([...nav.querySelectorAll('.cp-rail-tip')].map((t) => t.textContent)).toEqual(names)
    // «Скоро: …» в меню профиля — новыми именами; старых имён нет нигде
    await userEvent.click(within(nav).getByRole('button', { name: 'Профиль' }))
    expect(within(screen.getByRole('menu', { name: 'Профиль' })).getByText('Скоро: Главное, HR, Рынок, Продажи, Поддержка, Аналитика, Дизайн, Разработка, Система')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Менеджмент|Маркетинг|Инжиниринг/)
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
    // в меню профиля («Настройки» в окне, FR-CP-070) нет строки «Скоро: …» с отделами — они у Neuronium
    await userEvent.click(within(smm).getByRole('button', { name: 'Настройки' }))
    const menu = screen.getByRole('menu', { name: 'Настройки' })
    expect(within(menu).queryByText(/^Скоро:/)).toBeNull()
    expect(menu.textContent).not.toMatch(/Главное|Рынок|Система|Менеджмент|Маркетинг|Инжиниринг/)
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
    expect(within(screen.getByRole('menu', { name: 'Профиль' })).getByText(/^Скоро: Главное, HR, Рынок/)).toBeInTheDocument()
  })
  it('телефон в окне Neuronium: отделов нет ни в шапке, ни внизу, ни в меню', async () => {
    inNeuronium()
    onPhone()
    renderApp()
    await ready()
    expect(screen.queryByRole('navigation', { name: 'Отделы' })).toBeNull()
    expect(screen.queryByText('Nr')).toBeNull()
    // в шапке — два раздела SMM и его меню (что за третьей кнопкой — FR-CP-070), значков отделов нет
    const tabs = screen.getByRole('navigation', { name: 'Разделы' })
    expect(within(tabs).getAllByRole('button')).toHaveLength(3)
    expect(within(tabs).queryAllByRole('button', { name: /— скоро$|— контент-план$/ })).toHaveLength(0)
    await userEvent.click(within(tabs).getAllByRole('button')[2])
    const menu = screen.getByRole('menu')
    expect(within(menu).queryByText(/^Скоро:/)).toBeNull()
    expect(menu.textContent).not.toMatch(/Главное|Рынок|Система|Менеджмент|Маркетинг|Инжиниринг/)
    expect(within(menu).getByRole('menuitem', { name: 'Настройки: соцсети и конкуренты' })).toBeInTheDocument()
  })
})

/** Меню профиля — одно и то же на своём адресе и в окне Neuronium. */
const MENU_ITEMS = [
  'Расписание: рубрики по каналам и времени',
  'Настройки: соцсети и конкуренты',
  'Как пользоваться',
  'Перенести период (отпуск)…',
  'Выгрузить JSON',
  'Календарь для таблицы (CSV)',
  'Загрузить JSON',
  'Загрузить план Датаиста',
  'Очистить всё',
]

describe('T-CP-070 FR-CP-070 NFR-CP-009 меню профиля в окне Neuronium — «Настройки» шестерёнкой: внизу колонки разделов, на телефоне — в шапке', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  it('«Настройки» — последними в колонке, серой шестерёнкой с подписью, человечка нет; меню то же: настройки, как пользоваться, отпуск, данные, тема', async () => {
    inNeuronium()
    renderApp()
    await ready()
    // на компьютере строки разделов в шапке нет: колонка слева, как была
    expect(document.querySelector('.cp-topnav')).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Разделы' })).toBeNull()
    const items = within(screen.getByRole('navigation', { name: 'SMM' })).getAllByRole('button')
    expect(items.map((b) => b.getAttribute('aria-label'))).toEqual(['Главная — аналитика и лента', 'Календарь контента', 'Настройки'])
    const settings = items[2]
    expect(settings).toHaveClass('cp-sub__item')
    expect(settings).toHaveTextContent('Настройки')
    expect(settings).toHaveAttribute('title', 'Настройки')
    // шестерёнка, а не человечек: кружок аккаунта рядом — у Neuronium, входа у SMM нет
    expect(settings.querySelector('svg')!.innerHTML).toBe(glyph('settings'))
    expect(settings.querySelector('.cp-avatar')).toBeNull()
    expect(people()).toBe(0)
    expect(screen.queryByRole('button', { name: 'Профиль' })).toBeNull()
    expect(settings).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(settings)
    expect(settings).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu', { name: 'Настройки' })
    // шапка меню — тоже «Настройки» шестерёнкой: человечка нет и в открытом меню
    const head = menu.querySelector('.cp-menu__head') as HTMLElement
    expect(within(head).getByText('Настройки')).toBeInTheDocument()
    expect(within(head).getByText('SMM · контент-план')).toBeInTheDocument()
    expect(head.querySelector('svg')!.innerHTML).toBe(glyph('settings'))
    expect(head.querySelector('.cp-avatar')).toBeNull()
    expect(people()).toBe(0)
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual(MENU_ITEMS)
    // тема — здесь же
    const theme = within(menu).getByRole('radiogroup', { name: 'Тема' })
    await userEvent.click(within(theme).getByRole('radio', { name: 'Тёмная' }))
    expect(document.documentElement).toHaveClass('dark')
    await userEvent.click(within(theme).getByRole('radio', { name: 'Авто' }))
    expect(document.documentElement).not.toHaveClass('dark')
    // Esc закрывает; «Настройки: соцсети и конкуренты» и «Как пользоваться» открываются панелью справа
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu', { name: 'Настройки' })).toBeNull()
    expect(settings).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(settings)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Настройки: соцсети и конкуренты' }))
    expect(screen.getByRole('complementary', { name: 'Настройки' })).toBeInTheDocument()
    expect(screen.queryByRole('menu', { name: 'Настройки' })).toBeNull()
    await userEvent.click(settings)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Как пользоваться' }))
    expect(screen.getByRole('complementary', { name: 'Как пользоваться' })).toBeInTheDocument()
  })
  it('телефон в окне Neuronium: внизу у SMM панели нет — она одна, у Neuronium; «Главная», «Календарь» и «Настройки» — вверху, в шапке', async () => {
    inNeuronium()
    onPhone()
    renderApp()
    await ready()
    // нижней панели у SMM нет: ни вкладок внизу, ни рейла
    expect(document.querySelector('.cp-tabs')).toBeNull()
    expect(document.querySelector('.nr-rail')).toBeNull()
    // раздел и меню — одной строкой над шапкой календаря: в окне она раньше всего остального, под ней — страница
    const app = document.querySelector('.nr-app') as HTMLElement
    const main = screen.getByRole('main')
    const nav = screen.getByRole('navigation', { name: 'Разделы' })
    expect(nav).toHaveClass('cp-topnav')
    expect(app.firstElementChild).toBe(nav)
    expect(nav.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // ниже страницы навигации нет — внизу окна ничего, панель у Neuronium
    const below = [...document.querySelectorAll('nav')].filter((n) => !main.contains(n) && main.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(below).toEqual([])
    expect(within(nav).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Главная', 'Календарь', 'Настройки'])
    expect(within(nav).queryByRole('button', { name: 'Профиль' })).toBeNull()
  })
  it('телефон в окне Neuronium: «Главная» и «Календарь» в шапке переключают разделы, выбранный отмечен', async () => {
    inNeuronium()
    onPhone()
    renderApp()
    await ready()
    const nav = screen.getByRole('navigation', { name: 'Разделы' })
    expect(within(nav).getByRole('button', { name: 'Календарь' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: 'Главная' })).not.toHaveAttribute('aria-current')
    await userEvent.click(within(nav).getByRole('button', { name: 'Главная' }))
    expect(await screen.findByRole('heading', { name: 'Главная' })).toBeInTheDocument()
    expect(screen.queryByRole('grid', { name: 'Неделя по времени' })).toBeNull()
    expect(within(nav).getByRole('button', { name: 'Главная' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: 'Календарь' })).not.toHaveAttribute('aria-current')
    expect(localStorage.getItem('cp:section')).toBe(JSON.stringify('home'))
    await userEvent.click(within(nav).getByRole('button', { name: 'Календарь' }))
    await ready()
    expect(within(nav).getByRole('button', { name: 'Календарь' })).toHaveAttribute('aria-current', 'page')
    expect(localStorage.getItem('cp:section')).toBe(JSON.stringify('calendar'))
    // фильтры и шапка страницы — на месте, под строкой разделов
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Фильтры' })).toBeInTheDocument()
  })
  it('телефон в окне Neuronium: «Настройки» — шестерёнкой в той же строке, без кружка-человечка; меню то же и раскрывается под ней', async () => {
    inNeuronium()
    onPhone()
    renderApp()
    await ready()
    const nav = screen.getByRole('navigation', { name: 'Разделы' })
    const settings = within(nav).getByRole('button', { name: 'Настройки' })
    expect(settings).toHaveClass('cp-topnav__gear')
    expect(settings).toHaveAttribute('title', 'Настройки')
    // шестерёнка, а не человечек: кружок аккаунта — у Neuronium, входа у SMM нет
    expect(settings.querySelector('svg')!.innerHTML).toBe(glyph('settings'))
    expect(settings.querySelector('.cp-avatar')).toBeNull()
    expect(people()).toBe(0)
    expect(settings).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(settings)
    expect(settings).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu', { name: 'Настройки' })
    expect(nav).toContainElement(menu) // раскрывается от строки разделов, под ней
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual(MENU_ITEMS)
    expect(within(menu).getByRole('radiogroup', { name: 'Тема' })).toBeInTheDocument()
    expect(within(menu).queryByText(/^Скоро:/)).toBeNull()
    expect(people()).toBe(0)
    // повторное нажатие закрывает, Esc — тоже
    await userEvent.click(settings)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(settings).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(settings)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu', { name: 'Настройки' })).toBeNull()
    // пункт меню открывает лист справа; строка разделов остаётся — раздел меняется и при открытом листе
    await userEvent.click(settings)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Как пользоваться' }))
    expect(screen.getByRole('complementary', { name: 'Как пользоваться' })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).toBeNull()
    await userEvent.click(within(nav).getByRole('button', { name: 'Главная' }))
    expect(screen.queryByRole('complementary', { name: 'Как пользоваться' })).toBeNull()
    expect(await screen.findByRole('heading', { name: 'Главная' })).toBeInTheDocument()
    // «Настройки: соцсети и конкуренты» — тот же лист, что на компьютере
    await userEvent.click(settings)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Настройки: соцсети и конкуренты' }))
    expect(screen.getByRole('complementary', { name: 'Настройки' })).toBeInTheDocument()
  })
  it('на своём адресе — «Профиль», как раньше: кружок-человечек внизу панели отделов и третьей вкладкой на телефоне, меню «Профиль»', async () => {
    renderApp()
    await ready()
    const profile = within(screen.getByRole('navigation', { name: 'Отделы' })).getByRole('button', { name: 'Профиль' })
    expect(profile).toHaveClass('nr-rail-item', 'cp-rail-account')
    expect(profile.querySelector('.cp-avatar svg')!.innerHTML).toBe(glyph('user'))
    expect(screen.queryByRole('button', { name: 'Настройки' })).toBeNull()
    await userEvent.click(profile)
    const menu = screen.getByRole('menu', { name: 'Профиль' })
    const head = menu.querySelector('.cp-menu__head') as HTMLElement
    expect(within(head).getByText('Профиль')).toBeInTheDocument()
    expect(head.querySelector('.cp-avatar svg')!.innerHTML).toBe(glyph('user'))
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual(MENU_ITEMS)
  })
  it('на своём адресе на телефоне — внизу «Главная, Календарь, Профиль» с кружком, как раньше', async () => {
    onPhone()
    renderApp()
    await ready()
    const tabs = screen.getByRole('navigation', { name: 'Разделы' })
    expect(within(tabs).getAllByRole('button').map((b) => b.textContent)).toEqual(['Главная', 'Календарь', 'Профиль'])
    // та же нижняя панель, что была: рейл-вкладки первым в оболочке (внизу её ставит CSS), строки в шапке нет
    expect(tabs).toHaveClass('nr-rail', 'cp-tabs')
    expect(tabs).not.toHaveClass('cp-topnav')
    expect(document.querySelector('.nr-app')!.firstElementChild).toBe(tabs)
    expect(document.querySelector('.nr-app')).not.toHaveClass('cp-framed')
    expect(document.querySelector('.cp-topnav')).toBeNull()
    const profile = within(tabs).getByRole('button', { name: 'Профиль' })
    expect(profile.querySelector('.cp-avatar.cp-avatar--sm svg')!.innerHTML).toBe(glyph('user'))
    expect(screen.queryByRole('button', { name: 'Настройки' })).toBeNull()
    await userEvent.click(profile)
    expect(within(screen.getByRole('menu', { name: 'Профиль' })).getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual(MENU_ITEMS)
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

describe('T-CP-070 FR-CP-070 подсказки называют меню так, как оно зовётся в этом окне: «Профиль» на своём адресе, «Настройки» в окне Neuronium', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  /** «Как пользоваться» — из меню профиля (на своём адресе — внизу панели отделов, в окне — «Настройки» в колонке разделов). */
  const openHelp = async (button: HTMLElement) => {
    await userEvent.click(button)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Как пользоваться' }))
    return screen.getByRole('complementary', { name: 'Как пользоваться' })
  }
  it('на своём адресе: справка и подсказка «Без сохранения» говорят «Профиль» — не «меню профиля»', async () => {
    renderApp()
    await ready()
    const help = await openHelp(within(screen.getByRole('navigation', { name: 'Отделы' })).getByRole('button', { name: 'Профиль' }))
    expect(help.textContent).toContain('меню «Профиль» → «Настройки: соцсети и конкуренты»')
    expect(help.textContent).toContain('«Перенести период (отпуск)» — в меню «Профиль»')
    expect(help.textContent).not.toMatch(/меню профиля|внизу слева/)
    expect(help.textContent).not.toContain('меню «Настройки»')
    // хранилище недоступно (память) — предупреждение в шапке и то же слово в подсказке к нему
    expect(screen.getByText('Без сохранения')).toHaveAttribute('title', 'Хранилище браузера недоступно: правки живут до перезагрузки — выгрузите JSON в меню «Профиль»')
  })
  it('в окне Neuronium: «Настройки» — и в справке, и в подсказке «Без сохранения»; слова «профиль» нет нигде', async () => {
    inNeuronium()
    renderApp()
    await ready()
    const help = await openHelp(within(screen.getByRole('navigation', { name: 'SMM' })).getByRole('button', { name: 'Настройки' }))
    expect(help.textContent).toContain('меню «Настройки» → «Настройки: соцсети и конкуренты»')
    expect(help.textContent).toContain('«Перенести период (отпуск)» — в меню «Настройки»')
    expect(help.textContent).not.toMatch(/[Пп]рофил|внизу слева/)
    expect(screen.getByText('Без сохранения')).toHaveAttribute('title', 'Хранилище браузера недоступно: правки живут до перезагрузки — выгрузите JSON в меню «Настройки»')
    expect(document.body.textContent).not.toMatch(/[Пп]рофил/)
  })
  it('телефон в окне Neuronium: то же слово — «Настройки», меню — в шапке', async () => {
    inNeuronium()
    onPhone()
    renderApp()
    await ready()
    const help = await openHelp(within(screen.getByRole('navigation', { name: 'Разделы' })).getByRole('button', { name: 'Настройки' }))
    expect(help.textContent).toContain('меню «Настройки» → «Настройки: соцсети и конкуренты»')
    expect(help.textContent).not.toMatch(/[Пп]рофил/)
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
