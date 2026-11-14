import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../App'
import { memoryStorage, type PlanStorage } from '../model/storage'
import { DATAIST_EXAMPLE, emptyPlan, type Plan } from '../model/types'
import { loadDataist, smallPlan } from '../test/fixtures'

const dataist = loadDataist()

/** Хранилище, которое сохраняет правки (как IndexedDB браузера). */
const keeping = (): PlanStorage => ({ ...memoryStorage(), persistent: true })

/** Приложение с уже сохранённым планом (или без него); исходный план (seed.json) — расписание Датаиста. Сегодня — 4 ноября 2026. */
async function open(stored: Plan | null, seed: Plan = dataist, storage: PlanStorage = memoryStorage(), month = false) {
  localStorage.clear()
  localStorage.setItem('cp:section', JSON.stringify('calendar'))
  localStorage.setItem('cp:anchor', JSON.stringify('2026-10-26'))
  if (!month) {
    localStorage.setItem('cp:span-2', 'week')
    localStorage.setItem('cp:week-mode', 'time')
  }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(seed))))
  if (stored) await storage.save(stored)
  const view = render(<App storage={async () => storage} />)
  await screen.findByRole('grid', { name: month ? /^Месяц: / : 'Неделя по времени' })
  return { storage, view }
}
const profile = async (item: string | RegExp) => {
  await userEvent.click(screen.getByRole('button', { name: 'Профиль' }))
  await userEvent.click(screen.getByRole('menuitem', { name: item }))
}
// карточка расписания в неделе: короткое видео, пост и статья исследования в 09:00 — одна карточка «Нужна тема»
const research = /^Исследование · Короткое видео, Текст с картинкой, Страница на сайте: Нужна тема, 09:00/
const lesson = /^Микроурок · Короткое видео: Нужна тема, 17:00/
const cardsIn = (el: HTMLElement) => [...el.querySelectorAll('.cp-card')] as HTMLElement[]

describe('T-CP-075 FR-CP-075 план Датаиста — расписание из таблицы: каналы × категории × рубрики × время, контента нет', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-04T10:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ничего не сохранено — сразу расписание: неделя 16–22 ноября в слотах «Нужна тема»; каналы — как в таблице', async () => {
    await open(null)
    expect((await screen.findAllByRole('button', { name: research })).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/16–22 ноя 2026/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Загружен план Датаиста/)).toBeNull()
    const side = screen.getByRole('complementary', { name: 'Фильтры' })
    for (const name of ['Лаборатория Датаиста', 'Академия Датаиста', 'Офис Датаиста', 'Датаист Live', 'Нейроний', 'Ландао', 'Антрополис']) expect(within(side).getAllByText(name).length).toBeGreaterThan(0)
  })

  it('месяц: в понедельник 16 ноября — 29 слотов в 15 карточках: форматы одной рубрики в один час и в одном канале — одной карточкой', async () => {
    await open(null, dataist, memoryStorage(), true)
    const month = await screen.findByRole('grid', { name: 'Месяц: Ноябрь 2026' })
    const day = (d: string) => month.querySelector(`[data-date="${d}"]`) as HTMLElement
    expect(cardsIn(day('2026-11-16'))).toHaveLength(15)
    const caps = (d: string) => cardsIn(day(d)).map((c) => `${c.querySelector('.cp-card__time')?.textContent} ${c.querySelector('.cp-card__ch')?.textContent} · ${c.querySelector('.cp-card__cap')?.textContent} · ${c.querySelector('.cp-card__kind')?.textContent}`)
    const c16 = caps('2026-11-16')
    // исследование Лаборатории — короткое, пост и статья: одна карточка; внизу — все форматы
    expect(c16).toContain('09:00 Лаборатория Датаиста · Исследование · Вертикаль · Пост · Веб')
    expect(c16).toContain('10:00 Лаборатория Датаиста · Обзор · Горизонталь · Вертикаль')
    expect(caps('2026-11-23').filter((c) => c.includes('Обзор'))).toHaveLength(0)
    expect(caps('2026-11-30')).toContain('10:00 Лаборатория Датаиста · Разработка · Горизонталь · Вертикаль')
    // микроуроки — в разное время: каждый своей карточкой
    expect(c16.filter((c) => c.includes('Микроурок'))).toEqual(['17:00', '17:15', '17:30', '17:45'].map((t) => `${t} Академия Датаиста · Микроурок · Короткое видео`))
    // у карточки исследования — площадки всех её форматов
    const lab = cardsIn(day('2026-11-16')).find((c) => c.querySelector('.cp-card__cap')?.textContent === 'Исследование')!
    expect([...lab.querySelectorAll('.cp-card__plats [aria-label], .cp-card__plats [title]')].length).toBeGreaterThanOrEqual(6)
    // «видео» на карточке — один раз: в подписи только рубрика
    expect([...month.querySelectorAll('.cp-card__cap')].filter((c) => /видео/i.test(c.textContent ?? ''))).toHaveLength(0)
  })

  it('карточка из нескольких форматов: тема, заметка и черновик — один раз на всю карточку; площадки у формата свои; формат убрать и добавить', async () => {
    vi.setSystemTime(new Date('2026-11-16T08:00:00'))
    await open(null)
    await userEvent.click((await screen.findAllByRole('button', { name: research }))[0])
    const form = screen.getByRole('complementary', { name: 'Материал' })
    const fmts = within(form).getByRole('group', { name: 'Форматы карточки' })
    const rows = () => within(fmts).getAllByRole('group').map((g) => g.getAttribute('aria-label'))
    expect(rows()).toEqual(['Короткое видео', 'Текст с картинкой', 'Страница на сайте'])
    const pressed = (name: string) => within(within(fmts).getByRole('group', { name })).queryAllByRole('button', { pressed: true }).map((b) => b.getAttribute('aria-label'))
    expect(pressed('Короткое видео')).toEqual(['Короткое видео: YouTube', 'Короткое видео: Instagram', 'Короткое видео: TikTok'])
    expect(pressed('Текст с картинкой')).toEqual(['Текст с картинкой: X', 'Текст с картинкой: Telegram', 'Текст с картинкой: LinkedIn'])
    expect(within(fmts).getByRole('group', { name: 'Страница на сайте' })).toHaveTextContent('На сайте')
    // одиночного выбора формата и площадок у карточки нет — они у каждого формата
    expect(within(form).queryByRole('radiogroup', { name: 'Формат' })).toBeNull()
    await userEvent.type(within(form).getByRole('textbox', { name: 'Тема' }), 'ИИ-агенты в бухгалтерии')
    await userEvent.type(within(form).getByRole('textbox', { name: 'Заметка' }), 'Кейс: закрытие месяца за день')
    // пост — без X; статью убрать; добавить длинное видео
    await userEvent.click(within(fmts).getByRole('button', { name: 'Текст с картинкой: X' }))
    await userEvent.click(within(fmts).getByRole('button', { name: 'Убрать из карточки: Страница на сайте' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Добавить формат: Полное видео' }))
    expect(rows()).toEqual(['Короткое видео', 'Текст с картинкой', 'Полное видео — новый'])
    // черновик — на всю карточку: каркас каждого формата
    await userEvent.click(within(form).getByRole('button', { name: 'Создать черновик' }))
    const draft = within(form).getByRole('region', { name: 'Черновик' })
    expect(draft).toHaveTextContent('Черновик карточки · Исследование: сценарий длинного видео, сценарий короткого видео, пост')
    expect(draft).toHaveTextContent('Тема: ИИ-агенты в бухгалтерии')
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }))
    expect(screen.getByText('Сохранено: карточка — 3 формата')).toBeInTheDocument()
    // в календаре — одна карточка с темой
    const card = /^Исследование · Полное видео, Короткое видео, Текст с картинкой: ИИ-агенты в бухгалтерии, 09:00/
    expect(screen.getAllByRole('button', { name: card })).toHaveLength(1)
    // открыли снова — три формата, у поста — без X, заметка и черновик — на месте
    await userEvent.click(screen.getByRole('button', { name: card }))
    const again = screen.getByRole('complementary', { name: 'Материал' })
    const fmts2 = within(again).getByRole('group', { name: 'Форматы карточки' })
    expect(within(fmts2).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Полное видео', 'Короткое видео', 'Текст с картинкой'])
    expect(within(within(fmts2).getByRole('group', { name: 'Текст с картинкой' })).queryAllByRole('button', { pressed: true }).map((b) => b.getAttribute('aria-label'))).toEqual(['Текст с картинкой: Telegram', 'Текст с картинкой: LinkedIn'])
    expect(within(again).getByRole('textbox', { name: 'Заметка' })).toHaveValue('Кейс: закрытие месяца за день')
    expect(within(again).getByRole('region', { name: 'Черновик' })).toHaveTextContent('Версия 1 · заглушка')
    // удалить — вся карточка
    await userEvent.click(within(again).getByRole('button', { name: 'Удалить' }))
    expect(screen.getByText('Удалено: карточка целиком (3)')).toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: card })).toHaveLength(0)
  })

  it('«Расписание» в шапке: канал → категория → «время · рубрика · когда»; поправили время — слоты в календаре сдвинулись', async () => {
    vi.setSystemTime(new Date('2026-11-16T08:00:00'))
    await open(null)
    await userEvent.click(screen.getByRole('button', { name: 'Расписание' }))
    const sheet = screen.getByRole('complementary', { name: 'Расписание' })
    expect(sheet).toHaveTextContent('Сейчас — неделя I цикла')
    const lab = within(sheet).getByRole('region', { name: 'Лаборатория Датаиста' })
    const longs = within(lab).getByRole('group', { name: 'Лаборатория Датаиста: Длинное видео' })
    expect(within(longs).getAllByRole('button', { name: /поправить$/ }).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Обзор, Пн · I неделя, 10:00 — поправить',
      'Разработка, Пн · III неделя, 10:00 — поправить',
    ])
    // Исследование в коротком видео — с 09:00 на 09:30
    const shorts = within(lab).getByRole('group', { name: 'Лаборатория Датаиста: Короткое видео' })
    await userEvent.click(within(shorts).getByRole('button', { name: 'Исследование, каждый день, 09:00 — поправить' }))
    const ed = within(shorts).getByRole('group', { name: 'Строка расписания: Исследование' })
    fireEvent.change(within(ed).getByLabelText('Время'), { target: { value: '09:30' } })
    await userEvent.click(within(ed).getByRole('button', { name: 'Сохранить' }))
    expect(screen.getByText(/^Расписание: Исследование — каждый день, 09:30/)).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Закрыть' }))
    expect((await screen.findAllByRole('button', { name: /^Исследование · Короткое видео: Нужна тема, 09:30/ })).length).toBeGreaterThan(0)
  })

  it('добавить рубрику в расписание: новая «Подкаст» — Нейроний, длинное видео, Сб 19:00 — слоты по субботам; убрать — слоты сняты', async () => {
    vi.setSystemTime(new Date('2026-11-16T08:00:00'))
    await open(null)
    await userEvent.click(screen.getByRole('button', { name: 'Расписание' }))
    const sheet = screen.getByRole('complementary', { name: 'Расписание' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Добавить рубрику: Нейроний, Длинное видео' }))
    const ed = within(sheet).getByRole('group', { name: 'Новая строка расписания' })
    await userEvent.type(within(ed).getByRole('combobox', { name: 'Рубрика' }), 'Подкаст')
    await userEvent.click(within(ed).getByRole('option', { name: 'Новая рубрика «Подкаст»' }))
    const days = within(ed).getByRole('group', { name: 'Дни недели' })
    for (const d of ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']) await userEvent.click(within(days).getByRole('button', { name: d }))
    fireEvent.change(within(ed).getByLabelText('Время'), { target: { value: '19:00' } })
    await userEvent.click(within(ed).getByRole('button', { name: 'Добавить' }))
    expect(screen.getByText(/^Расписание: Подкаст — Сб, 19:00/)).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Закрыть' }))
    const podcast = /^Подкаст · Полное видео: Нужна тема, 19:00/
    expect(await screen.findAllByRole('button', { name: podcast })).toHaveLength(1) // суббота 21-го в этой неделе
    // убрать из расписания — слоты сняты
    await userEvent.click(screen.getByRole('button', { name: 'Расписание' }))
    const sheet2 = screen.getByRole('complementary', { name: 'Расписание' })
    await userEvent.click(within(sheet2).getByRole('button', { name: 'Подкаст, Сб, 19:00 — поправить' }))
    await userEvent.click(within(sheet2).getByRole('button', { name: 'Убрать из расписания' }))
    expect(screen.getByText(/«Подкаст» 19:00 убрана из расписания/)).toBeInTheDocument()
    await userEvent.click(within(sheet2).getByRole('button', { name: 'Закрыть' }))
    await waitFor(() => expect(screen.queryAllByRole('button', { name: podcast })).toHaveLength(0))
  })

  it('одиночный слот → тема, заметка → «Создать черновик» (заглушка) → «Перегенерировать» — версия 2; черновик сохраняется с материалом', async () => {
    vi.setSystemTime(new Date('2026-11-16T08:00:00'))
    await open(null)
    await userEvent.click((await screen.findAllByRole('button', { name: lesson }))[0])
    let form = screen.getByRole('complementary', { name: 'Материал' })
    await userEvent.click(within(form).getByRole('button', { name: 'Создать черновик' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Сначала впишите тему')
    await userEvent.type(within(form).getByRole('textbox', { name: 'Тема' }), 'ИИ-агенты в бухгалтерии')
    await userEvent.type(within(form).getByRole('textbox', { name: 'Заметка' }), 'Кейс: закрытие месяца за день')
    await userEvent.click(within(form).getByRole('button', { name: 'Создать черновик' }))
    const draft = within(form).getByRole('region', { name: 'Черновик' })
    expect(draft).toHaveTextContent('Сценарий короткого видео · Микроурок')
    expect(draft).toHaveTextContent('Тема: ИИ-агенты в бухгалтерии')
    expect(draft).toHaveTextContent('Опора из заметки: Кейс: закрытие месяца за день')
    expect(draft).toHaveTextContent('Версия 1 · заглушка')
    await userEvent.click(within(draft).getByRole('button', { name: 'Перегенерировать' }))
    expect(within(form).getByRole('region', { name: 'Черновик' })).toHaveTextContent('Версия 2 · заглушка')
    await userEvent.click(within(form).getByRole('button', { name: 'Сохранить' }))
    await userEvent.click(screen.getAllByRole('button', { name: /^Микроурок · Короткое видео: ИИ-агенты в бухгалтерии/ })[0])
    form = screen.getByRole('complementary', { name: 'Материал' })
    expect(within(form).getByRole('region', { name: 'Черновик' })).toHaveTextContent('Версия 2 · заглушка')
  })

  it('«Очистить всё» — пусто и после перезагрузки; план Датаиста — снова из профиля, «К началу плана» — к первой неделе', async () => {
    const storage = keeping()
    const { view } = await open(null, dataist, storage)
    await profile('Очистить всё')
    await waitFor(async () => expect((await storage.load())?.example).toBe('cleared'))
    view.unmount()
    await open(null, dataist, storage)
    expect(screen.queryAllByRole('button', { name: research })).toHaveLength(0)
    await profile('Загрузить план Датаиста')
    const note = await screen.findByText(/^Загружен план Датаиста — с 15 ноя/)
    await userEvent.click(within(note.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'К началу плана' }))
    expect((await screen.findAllByRole('button', { name: research })).length).toBeGreaterThan(0)
  })

  it('до плана Датаиста в браузере был свой план — открывается расписание, прежний не стёрт: «Вернуть прежний» ставит его', async () => {
    const storage: PlanStorage = { ...keeping(), previous: async () => smallPlan() }
    await open(null, dataist, storage)
    const note = await screen.findByText(/^Открыт план Датаиста: 7 каналов, с 15 ноя — прежний план не стёрт$/)
    expect((await screen.findAllByRole('button', { name: research })).length).toBeGreaterThan(0)
    await waitFor(async () => expect((await storage.load())?.example).toBe(DATAIST_EXAMPLE))
    await userEvent.click(within(note.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Вернуть прежний' }))
    const side = screen.getByRole('complementary', { name: 'Фильтры' })
    await waitFor(() => expect(within(side).getAllByText('Andre AIT').length).toBeGreaterThan(0))
  })

  it('сохранён пустой план — встаёт расписание; мои соцсети остаются', async () => {
    const blank: Plan = { ...emptyPlan('2026-11-03'), analytics: { competitors: [], accounts: [{ id: 'a1', name: 'Мой блог', platform: 'Telegram', handle: '@blog' }] } }
    const storage = keeping()
    await open(blank, dataist, storage)
    await screen.findByText(/^Загружен план Датаиста: 7 каналов, с 15 ноя$/)
    const kept = await storage.load()
    expect([kept?.example, kept?.analytics?.accounts?.map((a) => a.name)]).toEqual([DATAIST_EXAMPLE, ['Мой блог']])
  })

  it('сохранён старый пример — открывается расписание; «Отменить» вернёт прежний', async () => {
    await open(smallPlan())
    await screen.findByText(/Загружен план Датаиста: 7 каналов, с 15 ноя.* — прежний пример заменён/)
    await userEvent.keyboard('{Meta>}z{/Meta}')
    const side = screen.getByRole('complementary', { name: 'Фильтры' })
    await waitFor(() => expect(within(side).queryByText('Нейроний')).toBeNull())
  })

  it('сохранён план Датаиста прежней версии (календарь со страницы) — его сменяет расписание; «Отменить» вернёт прежний', async () => {
    const stale: Plan = { ...smallPlan(), example: 'dataist-calendar-2' }
    const storage = keeping()
    await open(stale, dataist, storage)
    await screen.findByText(/^Обновлён план Датаиста: 7 каналов, с 15 ноя$/)
    expect((await storage.load())?.example).toBe(DATAIST_EXAMPLE)
    await userEvent.keyboard('{Meta>}z{/Meta}')
    const side = screen.getByRole('complementary', { name: 'Фильтры' })
    await waitFor(() => expect(within(side).getAllByText('Andre AIT').length).toBeGreaterThan(0))
  })

  it('свой план не трогаем: ни замены, ни тоста', async () => {
    const own = { ...smallPlan(), rules: smallPlan().rules.filter((r) => r.id !== 'f_demo'), items: smallPlan().items.filter((it) => it.ruleId !== 'f_demo') }
    const { storage } = await open(own)
    expect(screen.queryByText(/план Датаиста/)).toBeNull()
    expect((await storage.load())?.example).toBeUndefined()
  })
})
