import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../App'
import { memoryStorage } from '../model/storage'
import { renderApp } from '../test/renderApp'

describe('T-CP-060 FR-CP-060 с чистого листа: контента нет, первый канал — из формы', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-03T10:00:00'))
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('открывается главная, пусто; в календаре «+» сначала просит канал; созданное — в «Ожидается» на главной', async () => {
    render(<App storage={async () => memoryStorage()} />)
    const smm = await screen.findByRole('navigation', { name: 'SMM' })
    expect(within(smm).getAllByRole('button').map((b) => b.textContent)).toEqual(['Главная', 'Календарь', 'Аналитика'])
    expect(within(smm).getByRole('button', { name: /^Главная/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText(/Пока пусто. Подключите свои соцсети/)).toBeInTheDocument()

    await userEvent.click(within(smm).getByRole('button', { name: 'Календарь контента' }))
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    expect(document.querySelectorAll('.cp-tg__col .cp-card')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Новый контент' }))
    const first = screen.getByRole('complementary', { name: 'Новый контент' })
    expect(within(first).getByRole('heading', { name: 'Сначала — канал' })).toBeInTheDocument()
    await userEvent.type(within(first).getByLabelText('Название канала'), 'Мой блог')
    await userEvent.click(within(first).getByRole('button', { name: 'Создать канал' }))

    const form = screen.getByRole('complementary', { name: 'Новый контент' })
    expect(within(form).getByRole('combobox', { name: 'Канал' })).toHaveDisplayValue('Мой блог')
    await userEvent.type(within(form).getByRole('textbox', { name: 'Тема' }), 'Первый разбор')
    // без рубрики не создаётся: рубрик ещё нет — вписать новую
    await userEvent.click(within(form).getByRole('button', { name: 'Создать' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Выберите рубрику (тег) или впишите новую')
    await userEvent.type(within(form).getByRole('combobox', { name: 'Рубрика' }), 'Обзоры')
    await userEvent.click(within(form).getByRole('option', { name: 'Новая рубрика «Обзоры»' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Создать' }))

    await userEvent.click(within(smm).getByRole('button', { name: /^Главная/ }))
    const soon = screen.getByRole('region', { name: 'Ожидается' })
    expect(within(soon).getByRole('article', { name: 'Первый разбор' })).toHaveTextContent(/Мой блог.*Ожидается.*из календаря/)
    expect(within(screen.getByRole('list', { name: 'Топики' })).getByRole('button', { name: /#обзоры/ })).toBeInTheDocument()
  })
})

describe('T-CP-061 FR-CP-061 главная: моя лента и поиск по конкурентам', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T15:20:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('демо: мои посты и материалы календаря, топики из тегов; поиск — конкуренты, кто впереди, сортировка, + следить', async () => {
    renderApp(undefined, { 'cp:section': '"home"' })
    await screen.findByRole('heading', { name: 'Главная' })
    // материалы календаря — настоящие, без демо: тезис 28 окт ещё не вышел — «Ожидается»
    expect(within(screen.getByRole('region', { name: 'Ожидается' })).getAllByRole('article').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('switch', { name: 'Демо' }))
    expect(screen.getByRole('note')).toHaveTextContent('Демо: посты и цифры выдуманы')
    const out = screen.getByRole('region', { name: 'Вышло' })
    const post = within(out).getAllByRole('article')[0]
    // саммери — подсвеченным окошком, без подписи «Саммери»
    expect(post).toHaveTextContent(/Мой канал.*демо/)
    expect(post.querySelector('.cp-post__sum')!.textContent).not.toMatch(/Саммери/)
    // топик из тегов: щелчок — только посты с ним
    const topics = screen.getByRole('list', { name: 'Топики' })
    await userEvent.click(within(topics).getByRole('button', { name: /^#ии/ }))
    expect(document.querySelector('.cp-home__filter')).toHaveTextContent('Топик #ии')
    for (const a of within(screen.getByRole('region', { name: 'Вышло' })).getAllByRole('article')) expect(a).toHaveTextContent('#ии')
    // взять тег в рубрики календаря
    await userEvent.click(within(topics).getByRole('button', { name: 'В рубрики: агенты' }))
    expect(within(topics).queryByRole('button', { name: 'В рубрики: агенты' })).toBeNull()

    await userEvent.click(screen.getByRole('radio', { name: /Поиск/ }))
    const board = screen.getByRole('table', { name: 'Кто впереди' })
    expect(within(board).getAllByRole('row')).toHaveLength(5) // заголовок и четыре демо-конкурента
    await userEvent.click(screen.getByRole('radio', { name: 'Комменты' }))
    const posts = within(screen.getByRole('list', { name: 'Посты конкурентов' })).getAllByRole('article')
    const comments = posts.map((a) => Number((a.querySelector('[title="Комментарии"]')!.textContent ?? '').replace(/\D/g, '')))
    expect(comments).toEqual([...comments].sort((a, b) => b - a))
    // поиск по аккаунту
    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск по конкурентам' }), 'Tech Shorts')
    for (const a of within(screen.getByRole('list', { name: 'Посты конкурентов' })).getAllByRole('article')) expect(a).toHaveTextContent('Tech Shorts')
    // + следить: свой конкурент вместо демо
    const follow = screen.getByRole('form', { name: 'Следить за аккаунтом' })
    await userEvent.selectOptions(within(follow).getByLabelText('Площадка'), 'Telegram')
    await userEvent.type(within(follow).getByLabelText('Название'), 'Мой конкурент')
    await userEvent.type(within(follow).getByLabelText('@аккаунт или ссылка'), '@rival')
    await userEvent.click(within(follow).getByRole('button', { name: '+ Следить' }))
    expect(within(screen.getByRole('list', { name: 'Слежу' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Мой конкурент@rivalУбрать: Мой конкурент'.replace('Убрать: Мой конкурент', '')])
  })
})

describe('T-CP-062 FR-CP-062 «Пересоздать»: пост, короткие ×N, длинное видео; в один день, ежедневно, по расписанию', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-26T09:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('из видео конкурента — 3 коротких в один день; по расписанию — в ближайшие места рубрики, пустой слот занимается', async () => {
    renderApp(undefined, { 'cp:section': '"home"', 'cp:demo': 'true' })
    await screen.findByRole('heading', { name: 'Главная' })
    await userEvent.click(screen.getByRole('radio', { name: /Поиск/ }))
    const video = within(screen.getByRole('list', { name: 'Посты конкурентов' }))
      .getAllByRole('article')
      .find((a) => a.querySelector('.cp-post__media--video'))!
    await userEvent.click(within(video).getByRole('button', { name: 'Пересоздать' }))
    const sheet = screen.getByRole('complementary', { name: 'Пересоздать' })
    // из длинного видео — сразу «нарезать на 3», в один день
    expect(within(sheet).getByRole('radio', { name: 'Короткие видео' })).toHaveAttribute('aria-checked', 'true')
    expect(within(sheet).getByRole('group', { name: 'Сколько коротких' })).toHaveTextContent('3')
    expect(within(sheet).getByRole('radio', { name: 'В один день' })).toHaveAttribute('aria-checked', 'true')
    expect((within(sheet).getByRole('textbox', { name: 'Сценарий' }) as HTMLTextAreaElement).value).toMatch(/^Часть 1 из 3\.[\s\S]*Озвучка: голосом/)
    await userEvent.click(within(sheet).getByRole('radio', { name: /^Аватар/ }))
    expect((within(sheet).getByRole('textbox', { name: 'Сценарий' }) as HTMLTextAreaElement).value).toMatch(/аватар \(лицо\)/)
    await userEvent.type(within(sheet).getByRole('combobox', { name: 'Рубрика' }), 'Тез')
    await userEvent.click(within(sheet).getByRole('option', { name: 'Тезисы' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Создать' }))
    expect(screen.getByText(/Создано: 3 коротких видео — все на 26 окт/)).toBeInTheDocument()
    // в календаре — три части в один день
    await userEvent.click(within(screen.getByRole('navigation', { name: 'SMM' })).getByRole('button', { name: 'Календарь контента' }))
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    const day = document.querySelector('.cp-tg__col[data-date="2026-10-26"]') as HTMLElement
    for (const i of [1, 2, 3]) expect(within(day).getByRole('button', { name: new RegExp(`^Тезисы.*часть ${i} из 3`) })).toBeInTheDocument()

    // по расписанию: у Тезисов в Dataist короткие выходят по будням — первым занимается пустой слот 27 окт
    await userEvent.click(within(screen.getByRole('navigation', { name: 'SMM' })).getByRole('button', { name: /^Главная/ }))
    await userEvent.click(screen.getByRole('radio', { name: /Поиск/ }))
    const again = within(screen.getByRole('list', { name: 'Посты конкурентов' }))
      .getAllByRole('article')
      .find((a) => a.querySelector('.cp-post__media--video'))!
    await userEvent.click(within(again).getByRole('button', { name: 'Пересоздать' }))
    const s2 = screen.getByRole('complementary', { name: 'Пересоздать' })
    await userEvent.click(within(s2).getByRole('button', { name: 'Меньше' }))
    await userEvent.type(within(s2).getByRole('combobox', { name: 'Рубрика' }), 'Тез')
    await userEvent.click(within(s2).getByRole('option', { name: 'Тезисы' }))
    await userEvent.click(within(s2).getByRole('radio', { name: 'По расписанию' }))
    expect(within(s2).getByText(/Друг за другом в ближайшие дни расписания: 27 окт \(пустое место\), 28 окт/)).toBeInTheDocument()
    await userEvent.click(within(s2).getByRole('button', { name: 'Создать' }))
    await userEvent.click(within(screen.getByRole('navigation', { name: 'SMM' })).getByRole('button', { name: 'Календарь контента' }))
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    const tue = document.querySelector('.cp-tg__col[data-date="2026-10-27"]') as HTMLElement
    expect(within(tue).getByRole('button', { name: /^Тезисы.*часть 1 из 2/ })).toBeInTheDocument()
    expect(within(tue).queryByRole('button', { name: /^Тезисы.*Нужна тема/ })).toBeNull()
  })

  it('из календаря: длинное видео — «Нарезать на короткие…», статья — «Сделать видео…»', async () => {
    renderApp()
    await screen.findByRole('grid', { name: 'Неделя по времени' })
    await userEvent.click(screen.getByRole('button', { name: /^Демо · FULL: Стратегия/ }))
    await userEvent.click(within(screen.getByRole('complementary', { name: 'Материал' })).getByRole('button', { name: 'Нарезать на короткие…' }))
    const sheet = screen.getByRole('complementary', { name: 'Пересоздать' })
    expect(within(sheet).getByLabelText('Из чего')).toHaveTextContent('Стратегия')
    expect(within(sheet).getByRole('group', { name: 'Сколько коротких' })).toHaveTextContent('3')
    // рубрика — как у источника; день — как у видео
    expect(within(sheet).getByRole('combobox', { name: 'Рубрика' })).toHaveValue('Демо')
    expect(within(sheet).getByText(/Все 3 — на 26 окт/)).toBeInTheDocument()
  })
})
