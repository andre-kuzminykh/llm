import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../App'
import { memoryStorage } from '../model/storage'
import { emptyPlan } from '../model/types'
import { renderApp } from '../test/renderApp'

const smm = () => screen.getByRole('navigation', { name: 'SMM' })

describe('T-CP-060 FR-CP-060 с чистого листа: главная просит подключить соцсети, контент — без канала и рубрики', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-03T10:00:00'))
    localStorage.clear()
    localStorage.setItem('cp:span-2', 'week') // календарь открывается месяцем (FR-CP-072) — тут проверяем неделю
    localStorage.setItem('cp:week-mode', 'time')
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('три пункта меню, главная — лента; в «Аналитике» «Подключите соцсети» ведёт в настройки; в календаре «+» сразу форма — новый канал прямо в ней', async () => {
    // чистый лист — как после «Очистить всё» (без сохранённого плана программа открывает план Датаиста, FR-CP-071)
    render(<App storage={async () => memoryStorage()} initialPlan={emptyPlan('2026-11-03')} />)
    await screen.findByRole('navigation', { name: 'SMM' })
    expect(within(smm()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Главная', 'Календарь', 'Аналитика'])
    expect(within(smm()).getByRole('button', { name: /^Главная/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Здесь — то, что вы выпускаете' })).toBeInTheDocument()
    await userEvent.click(within(smm()).getByRole('button', { name: 'Аналитика — графики и посты' }))
    // без соцсетей и демо — графиков нет, уведомление «подключите»
    expect(screen.queryByRole('region', { name: 'Аналитика' })).toBeNull()
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('Подключите соцсети, чтобы видеть ленту и графики')
    await userEvent.click(within(note).getByRole('button', { name: 'Подключить' }))
    const settings = screen.getByRole('complementary', { name: 'Настройки' })
    const add = within(settings).getByRole('form', { name: 'Подключить соцсеть' })
    await userEvent.selectOptions(within(add).getByLabelText('Площадка'), 'Telegram')
    await userEvent.type(within(add).getByLabelText('Название'), 'Мой блог')
    await userEvent.type(within(add).getByLabelText('@аккаунт или ссылка'), '@myblog')
    await userEvent.click(within(add).getByRole('button', { name: 'Подключить' }))
    expect(within(within(settings).getByRole('list', { name: 'Мои соцсети' })).getAllByRole('listitem')).toHaveLength(1)
    await userEvent.click(within(settings).getByRole('button', { name: 'Закрыть' }))
    expect(screen.getByRole('note')).toHaveTextContent('Подключено соцсетей: 1')
    // аккаунт — в фильтрах слева
    expect(within(screen.getByRole('complementary', { name: 'Фильтры' })).getByRole('button', { name: 'Мой блог' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(within(smm()).getByRole('button', { name: 'Календарь контента' }))
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    expect(document.querySelectorAll('.cp-tg__col .cp-card')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    const form = screen.getByRole('complementary', { name: 'Новый контент' })
    expect(within(form).getByRole('combobox', { name: 'Канал' })).toHaveDisplayValue('Без канала')
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Канал' }), 'Новый канал…')
    await userEvent.type(within(form).getByRole('textbox', { name: 'Название канала' }), 'Мой блог')
    await userEvent.type(within(form).getByRole('textbox', { name: 'Тема' }), 'Первый разбор')
    await userEvent.type(within(form).getByRole('combobox', { name: 'Рубрика' }), 'Обзоры')
    await userEvent.click(within(form).getByRole('option', { name: 'Новая рубрика «Обзоры»' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Создать' }))

    // на главной — в ленте, как выйдет
    await userEvent.click(within(smm()).getByRole('button', { name: /^Главная/ }))
    expect(within(screen.getByRole('feed', { name: 'Лента: я выпускаю' })).getByRole('article', { name: 'Первый разбор' })).toBeInTheDocument()
    await userEvent.click(within(smm()).getByRole('button', { name: /^Аналитика/ }))
    const soon = screen.getByRole('region', { name: 'Ожидается' })
    expect(within(soon).getByRole('article', { name: 'Первый разбор' })).toHaveTextContent(/Мой блог.*Ожидается.*из календаря/)
    // рубрика — без решётки
    expect(within(soon).getByRole('article', { name: 'Первый разбор' })).toHaveTextContent('обзоры')
    expect(within(soon).getByRole('article', { name: 'Первый разбор' }).textContent).not.toMatch(/#/)
  })
})

describe('T-CP-061 FR-CP-061 главная: аналитика как в Search Console, лента идей, фильтры слева', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T15:20:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('демо: плитки метрик, график, разрезы; щелчок по строке — провалиться (фильтр на графики и ленту); топики без «#»', async () => {
    renderApp(undefined, { 'cp:section': '"analytics"' })
    await screen.findByRole('heading', { name: 'Аналитика' })
    // впереди у плана — только пустые слоты «Нужна тема» (2 и 9 ноября): это не материалы, в ленте их нет (FR-CP-075)
    expect(screen.queryByRole('region', { name: 'Ожидается' })).toBeNull()
    await userEvent.click(screen.getByRole('switch', { name: 'Демо' }))
    expect(screen.getByRole('note')).toHaveTextContent('Демо: посты, графики и цифры выдуманы')
    const ov = screen.getByRole('region', { name: 'Аналитика' })
    const kpis = within(ov).getByRole('group', { name: 'Метрики' })
    expect(within(kpis).getAllByRole('button').map((b) => b.querySelector('.cp-kpi__label')!.textContent)).toEqual(['Просмотры', 'Лайки', 'Комментарии', 'Репосты', 'Подписчики'])
    const pressed = () => within(kpis).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.querySelector('.cp-kpi__label')!.textContent)
    expect(pressed()).toEqual(['Просмотры', 'Лайки'])
    // сверху минимально: период и метрики строкой; графика и таблицы нет, пока не раскрыли
    expect(within(ov).queryByRole('img', { name: /^График/ })).toBeNull()
    expect(within(ov).queryByRole('table')).toBeNull()
    expect(within(ov).getByRole('button', { name: /Подробнее/ })).toHaveAttribute('aria-expanded', 'false')
    // щелчок по метрике — раскрывает график с ней
    await userEvent.click(within(kpis).getByRole('button', { name: /Комментарии/ }))
    expect(within(ov).getByRole('button', { name: /Свернуть/ })).toHaveAttribute('aria-expanded', 'true')
    expect(within(ov).getByRole('img', { name: /^График: просмотры, лайки, комментарии/ })).toBeInTheDocument()
    // за сутки — по часам
    await userEvent.click(within(ov).getByRole('radio', { name: 'Сутки' }))
    expect(within(ov).getByRole('img', { name: /^График: .*, \d\d:00 — \d\d:00$/ })).toBeInTheDocument()
    await userEvent.click(within(ov).getByRole('radio', { name: '7 дней' }))
    // таблица: сортировка по столбцу
    await userEvent.click(within(ov).getByRole('tab', { name: 'Топики' }))
    const table = () => within(ov).getByRole('table', { name: 'Разрез: Топики' })
    expect(within(table()).getAllByRole('columnheader').map((h) => h.textContent?.replace('↓ ', ''))).toEqual(['Топик', 'Просмотры', 'Лайки', 'Комменты', 'Репосты', 'Постов'])
    await userEvent.click(within(table()).getByRole('button', { name: 'Лайки' }))
    const likes = within(table()).getAllByRole('row').slice(1).map((r) => r.querySelectorAll('td')[1].textContent!)
    expect(likes.length).toBeGreaterThan(1)
    // провалиться: топик «ии» — метка над графиками, лента только с ним, подписчиков по топику не посчитать
    const first = within(table()).getAllByRole('row')[1]
    const topic = first.querySelector('.cp-ov__cell')!.textContent!
    expect(topic).not.toMatch(/#/)
    await userEvent.click(within(first).getByRole('button'))
    expect(screen.getByRole('button', { name: `Снять фильтр: Топик: ${topic}` })).toBeInTheDocument()
    expect(within(kpis).getByRole('button', { name: /Подписчики/ })).toBeDisabled()
    for (const a of within(screen.getByRole('region', { name: 'Вышло' })).getAllByRole('article').filter((x) => x.querySelector('.cp-post__tags')))
      expect(within(a.querySelector('.cp-post__tags') as HTMLElement).getAllByRole('button').map((b) => b.textContent)).toContain(topic)
    // в панели слева тот же топик выделен — те же фильтры
    const side = screen.getByRole('complementary', { name: 'Фильтры' })
    expect(within(within(side).getByRole('group', { name: 'Топики' })).getByRole('button', { name: new RegExp(`^${topic}`) })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: `Снять фильтр: Топик: ${topic}` }))
    // площадка: только YouTube
    await userEvent.click(within(ov).getByRole('tab', { name: 'Площадки' }))
    const yt = within(within(ov).getByRole('table', { name: 'Разрез: Площадки' })).getByRole('button', { name: /YouTube/ })
    await userEvent.click(yt)
    expect(screen.getByRole('button', { name: 'Снять фильтр: Площадка: YouTube' })).toBeInTheDocument()
    expect(within(ov).getAllByRole('table')[0].querySelectorAll('tbody tr')).toHaveLength(1)
    for (const a of within(screen.getByRole('region', { name: 'Вышло' })).getAllByRole('article').filter((x) => x.querySelector('.cp-an__badge')?.textContent === 'демо'))
      expect(a.querySelector('.cp-post__ava .cp-pi')).toHaveAttribute('title', 'YouTube')
    // длинное видео — на всю ширину карточки (без своей ширины), саммери — окошком без подписи
    const video = document.querySelector('.cp-post__media--video') as HTMLElement
    expect(video.style.width).toBe('')
    expect(document.querySelector('.cp-post__sum')!.textContent).not.toMatch(/Саммери/)

    // листаешь — графики сворачиваются в строку, справа внизу «Вернуться»
    const body = document.querySelector('.cp-home__wrap .cp-body') as HTMLElement
    body.scrollTop = 1500
    fireEvent.scroll(body)
    expect(screen.getByRole('button', { name: 'Графики свёрнуты — развернуть' })).toHaveTextContent(/Просмотры/)
    await userEvent.click(screen.getByRole('button', { name: 'Вернуться к графикам' }))
  })

  it('поиск: лента конкурентов, кто впереди — разрез «Аккаунты», сортировка, поиск; конкуренты — в настройках', async () => {
    renderApp(undefined, { 'cp:section': '"analytics"', 'cp:demo': 'true' })
    await screen.findByRole('heading', { name: 'Аналитика' })
    await userEvent.click(screen.getByRole('radio', { name: /Конкуренты/ }))
    const ov = screen.getByRole('region', { name: 'Аналитика' })
    await userEvent.click(within(ov).getByRole('button', { name: /Подробнее/ }))
    // кто впереди: разрез по аккаунтам — четыре демо-конкурента
    expect(within(within(ov).getByRole('table', { name: 'Разрез: Аккаунты' })).getAllByRole('row')).toHaveLength(5)
    await userEvent.click(screen.getByRole('radio', { name: 'Комменты' }))
    const posts = within(screen.getByRole('list', { name: 'Посты конкурентов' })).getAllByRole('article')
    const comments = posts.map((a) => {
      const t = a.querySelector('[title="Комментарии"]')!.textContent ?? ''
      return Number(t.replace(/[^\d,]/g, '').replace(',', '.')) * (/тыс/.test(t) ? 1000 : 1)
    })
    expect(comments).toEqual([...comments].sort((a, b) => b - a))
    // репосты — у каждого поста и в сортировке
    await userEvent.click(screen.getByRole('radio', { name: 'Репосты' }))
    const shares = within(screen.getByRole('list', { name: 'Посты конкурентов' }))
      .getAllByRole('article')
      .map((a) => {
        const t = a.querySelector('[title="Репосты"]')!.textContent ?? ''
        return Number(t.replace(/[^\d,]/g, '').replace(',', '.')) * (/тыс/.test(t) ? 1000 : 1)
      })
    expect(shares).toEqual([...shares].sort((a, b) => b - a))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск по конкурентам' }), 'Tech Shorts')
    for (const a of within(screen.getByRole('list', { name: 'Посты конкурентов' })).getAllByRole('article')) expect(a).toHaveTextContent('Tech Shorts')
    // + следить — в настройках (из панели слева «+»)
    await userEvent.click(within(screen.getByRole('complementary', { name: 'Фильтры' })).getByRole('button', { name: 'Следить за аккаунтом' }))
    const settings = screen.getByRole('complementary', { name: 'Настройки' })
    const follow = within(settings).getByRole('form', { name: 'Следить за аккаунтом' })
    await userEvent.selectOptions(within(follow).getByLabelText('Площадка'), 'Telegram')
    await userEvent.type(within(follow).getByLabelText('Название'), 'Мой конкурент')
    await userEvent.type(within(follow).getByLabelText('@аккаунт или ссылка'), '@rival')
    await userEvent.click(within(follow).getByRole('button', { name: '+ Следить' }))
    expect(within(within(settings).getByRole('list', { name: 'Конкуренты' })).getAllByRole('listitem')[0]).toHaveTextContent('Мой конкурент@rival')
  })
})

describe('T-CP-062 FR-CP-062 «Пересоздать» — та же форма создания контента: пост или видео — контекстом', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-26T09:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('из видео конкурента — 3 коротких в один день; по расписанию — в ближайшие места рубрики, пустой слот занимается', async () => {
    renderApp(undefined, { 'cp:section': '"analytics"', 'cp:demo': 'true' })
    await screen.findByRole('heading', { name: 'Аналитика' })
    await userEvent.click(screen.getByRole('radio', { name: /Конкуренты/ }))
    const video = within(screen.getByRole('list', { name: 'Посты конкурентов' }))
      .getAllByRole('article')
      .find((a) => a.querySelector('.cp-post__media--video'))!
    const title = video.querySelector('.cp-post__title')!.textContent!
    await userEvent.click(within(video).getByRole('button', { name: 'Пересоздать' }))
    const sheet = screen.getByRole('complementary', { name: 'Новый контент' })
    expect(within(sheet).getByRole('heading', { name: 'Пересоздать' })).toBeInTheDocument()
    // весь контекст — в заметке (откуда и о чём); тема — его; формат выбирают как обычно — из длинного видео сразу «вертикаль ×3»
    expect(within(sheet).queryByLabelText('Из чего')).toBeNull()
    expect((within(sheet).getByRole('textbox', { name: 'Заметка' }) as HTMLTextAreaElement).value).toMatch(new RegExp(`^По мотивам: «${title}» — `))
    expect(within(sheet).getByRole('textbox', { name: 'Тема' })).toHaveValue(title)
    expect(within(within(sheet).getByRole('radiogroup', { name: 'Формат' })).getByRole('radio', { checked: true })).toHaveAccessibleName('Короткое вертикальное видео')
    expect(within(sheet).getByRole('group', { name: 'Сколько коротких' })).toHaveTextContent(/^−3\+$/)
    expect(within(sheet).getByRole('radio', { name: 'В один день' })).toHaveAttribute('aria-checked', 'true')
    expect(within(sheet).queryByText(/части 1 из/)).toBeNull()
    await userEvent.click(within(sheet).getByRole('radio', { name: /^Аватар/ }))
    await userEvent.selectOptions(within(sheet).getByRole('combobox', { name: 'Канал' }), 'Dataist')
    await userEvent.clear(within(sheet).getByRole('combobox', { name: 'Рубрика' }))
    await userEvent.type(within(sheet).getByRole('combobox', { name: 'Рубрика' }), 'Тез')
    await userEvent.click(within(sheet).getByRole('option', { name: 'Тезисы' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Создать' }))
    expect(screen.getByText(/Создано: 3 коротких — все на 26 окт/)).toBeInTheDocument()
    await userEvent.click(within(smm()).getByRole('button', { name: 'Календарь контента' }))
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    const day = document.querySelector('.cp-tg__col[data-date="2026-10-26"]') as HTMLElement
    for (const i of [1, 2, 3]) expect(within(day).getByRole('button', { name: new RegExp(`^Тезисы.*часть ${i} из 3`) })).toBeInTheDocument()

    // по расписанию: у Тезисов в Dataist короткие выходят по будням — первым занимается пустой слот 27 окт
    await userEvent.click(within(smm()).getByRole('button', { name: /^Аналитика/ }))
    await userEvent.click(screen.getByRole('radio', { name: /Конкуренты/ }))
    const again = within(screen.getByRole('list', { name: 'Посты конкурентов' }))
      .getAllByRole('article')
      .find((a) => a.querySelector('.cp-post__media--video'))!
    await userEvent.click(within(again).getByRole('button', { name: 'Пересоздать' }))
    const s2 = screen.getByRole('complementary', { name: 'Новый контент' })
    await userEvent.click(within(s2).getByRole('button', { name: 'Меньше' }))
    await userEvent.selectOptions(within(s2).getByRole('combobox', { name: 'Канал' }), 'Dataist')
    await userEvent.clear(within(s2).getByRole('combobox', { name: 'Рубрика' }))
    await userEvent.type(within(s2).getByRole('combobox', { name: 'Рубрика' }), 'Тез')
    await userEvent.click(within(s2).getByRole('option', { name: 'Тезисы' }))
    await userEvent.click(within(s2).getByRole('radio', { name: 'По расписанию' }))
    expect(within(s2).getByText(/Друг за другом в ближайшие дни расписания: 27 окт \(пустое место\), 28 окт/)).toBeInTheDocument()
    await userEvent.click(within(s2).getByRole('button', { name: 'Создать' }))
    await userEvent.click(within(smm()).getByRole('button', { name: 'Календарь контента' }))
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    const tue = document.querySelector('.cp-tg__col[data-date="2026-10-27"]') as HTMLElement
    expect(within(tue).getByRole('button', { name: /^Тезисы.*часть 1 из 2/ })).toBeInTheDocument()
    expect(within(tue).queryByRole('button', { name: /^Тезисы.*Нужна тема/ })).toBeNull()
  })

  it('из календаря: «Пересоздать» — кнопкой внизу формы; длинное видео — нарезать на 3, канал, рубрика и день — как у видео', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(screen.getByRole('button', { name: /^Демо · FULL: Стратегия/ }))
    const item = screen.getByRole('complementary', { name: 'Материал' })
    const foot = item.querySelector('.cp-sheet__foot') as HTMLElement
    expect(within(foot).getByRole('button', { name: 'Пересоздать' })).toBeInTheDocument()
    expect(within(item).queryByText('Нарезать на короткие…')).toBeNull()
    await userEvent.click(within(foot).getByRole('button', { name: 'Пересоздать' }))
    const sheet = screen.getByRole('complementary', { name: 'Новый контент' })
    expect(within(sheet).getByRole('textbox', { name: 'Заметка' })).toHaveValue('По мотивам: «Стратегия» — Dataist')
    expect(within(sheet).getByRole('group', { name: 'Сколько коротких' })).toHaveTextContent('3')
    expect(within(sheet).getByRole('combobox', { name: 'Канал' })).toHaveDisplayValue('Dataist')
    expect(within(sheet).getByRole('combobox', { name: 'Рубрика' })).toHaveValue('Демо')
    expect(within(sheet).getByText(/Все 3 — на 26 окт/)).toBeInTheDocument()
  })
})
