import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../App'
import { memoryStorage } from '../model/storage'
import type { Plan } from '../model/types'
import { loadDataist } from '../test/fixtures'

const dataist = loadDataist()
/** План Датаиста; в карточке исследования 16 ноября (короткое, пост, статья) вписана тема и заметка. */
const withTopic = (): Plan => ({
  ...dataist,
  items: dataist.items.map((it) =>
    it.date === '2026-11-16' && it.channelId === 'lab' && it.rubricId === 'research' ? { ...it, title: 'ИИ-агенты в бухгалтерии', note: 'Кейс: закрытие месяца за день' } : it,
  ),
})

async function open(stored: Plan | null, opts: { demo?: boolean; side?: 'mine' | 'theirs' } = {}) {
  localStorage.clear()
  localStorage.setItem('cp:section', JSON.stringify('feed'))
  localStorage.setItem('cp:demo', String(!!opts.demo))
  if (opts.side) localStorage.setItem('cp:reel-side', opts.side)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(dataist))))
  const storage = memoryStorage()
  if (stored) await storage.save(stored)
  render(<App storage={async () => storage} />)
  await screen.findByRole('heading', { name: 'Лента' })
}

describe('T-CP-078 FR-CP-078 лента как в TikTok: я выпускаю и смотрю других — по одному материалу, саммери и «Пересоздать» в одном окне', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-14T10:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('«Лента» — третьим разделом; пусто — подсказка: своё — тема в календаре, чужое — подписка по ссылке', async () => {
    await open(null)
    expect(within(screen.getByRole('navigation', { name: 'SMM' })).getByRole('button', { name: 'Лента — что выпускаю и что смотрю' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Здесь — то, что вы выпускаете' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'В календарь' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Смотрю других' }))
    expect(screen.getByRole('heading', { name: 'Здесь — то, что выпускают другие' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Подписаться по ссылке' }))
    expect(screen.getByRole('region', { name: 'Подписки: ссылки на соцсети' })).toBeInTheDocument()
  })

  it('я выпускаю: карточка календаря с темой — по виду на формат (вертикаль, пост, статья); саммери — одно окно: «Открыть карточку», «Пересоздать»', async () => {
    await open(withTopic())
    const feed = await screen.findByRole('feed', { name: 'Лента: я выпускаю' })
    const reel = within(feed).getByRole('article', { name: 'ИИ-агенты в бухгалтерии' })
    const faces = within(reel).getByRole('radiogroup', { name: 'Формат карточки' })
    expect(within(faces).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Вертикаль', 'Пост', 'Веб'])
    expect(within(reel).getByText('Выйдет · Пн, 16 ноября, 09:00')).toBeInTheDocument()
    expect(within(reel).getByRole('img', { name: 'Короткое видео: ИИ-агенты в бухгалтерии' })).toBeInTheDocument()
    await userEvent.click(within(faces).getByRole('radio', { name: 'Пост' }))
    expect(within(reel).getByRole('img', { name: 'Пост: ИИ-агенты в бухгалтерии' })).toBeInTheDocument()
    await userEvent.click(within(faces).getByRole('radio', { name: 'Веб' }))
    expect(within(reel).getByRole('img', { name: 'Обложка статьи: ИИ-агенты в бухгалтерии' })).toBeInTheDocument()
    expect(within(reel).getByText('Кейс: закрытие месяца за день', { selector: '.cp-reel__lead' })).toBeInTheDocument()
    // саммери — окно с кнопками
    await userEvent.click(within(reel).getByRole('button', { name: 'Саммери' }))
    const sheet = within(reel).getByRole('dialog', { name: 'Саммери: ИИ-агенты в бухгалтерии' })
    expect(sheet).toHaveTextContent('Кейс: закрытие месяца за день')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Открыть карточку' }))
    expect(screen.getByRole('complementary', { name: 'Материал' })).toBeInTheDocument()
  })

  it('смотрю других (демо): подписки строкой; саммери → «Пересоздать у себя» — форма нового контента с темой и откуда', async () => {
    await open(null, { demo: true, side: 'theirs' })
    const subs = screen.getByRole('group', { name: 'Подписки' })
    expect(within(subs).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Все', 'AI Daily, YouTube', 'Нейросети без воды, Telegram', 'Tech Shorts, TikTok', 'Growth Lab, Instagram', 'Подписаться'])
    const feed = screen.getByRole('feed', { name: 'Лента: смотрю других' })
    const first = within(feed).getAllByRole('article')[0]
    const title = first.getAttribute('aria-label')!
    await userEvent.click(within(first).getByRole('button', { name: 'Саммери' }))
    const sheet = within(first).getByRole('dialog', { name: `Саммери: ${title}` })
    expect(within(sheet).getByLabelText('Топики')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Пересоздать у себя' }))
    const form = screen.getByRole('complementary', { name: 'Новый контент' })
    expect((within(form).getByRole('textbox', { name: 'Заметка' }) as HTMLTextAreaElement).value).toContain(`По мотивам: «${title}»`)
  })

  it('аккаунт в строке подписок — только его посты; пост с несколькими мыслями — карусель: стрелкой к следующему слайду', async () => {
    await open(null, { demo: true, side: 'theirs' })
    await userEvent.click(screen.getByRole('button', { name: 'Нейросети без воды, Telegram' }))
    const feed = screen.getByRole('feed', { name: 'Лента: смотрю других' })
    await waitFor(() => expect(within(feed).getAllByRole('button', { name: /^Только / }).every((b) => b.getAttribute('aria-label') === 'Только Нейросети без воды')).toBe(true))
    const car = within(feed).getAllByRole('group', { name: /^Карусель: \d+ слайдов$/ })[0]
    const n = Number(car.getAttribute('aria-label')!.match(/\d+/)![0])
    expect(car).toHaveTextContent(`1 / ${n}`)
    await userEvent.click(within(car).getByRole('button', { name: 'Следующий слайд' }))
    expect(car).toHaveTextContent(`2 / ${n}`)
    expect(within(car).getByRole('button', { name: 'Предыдущий слайд' })).toBeInTheDocument()
  })

  it('подписаться ссылкой: площадка и @аккаунт — из ссылки; первая подписка заменяет пример; «Отписаться» — открепиться', async () => {
    await open(null, { demo: true, side: 'theirs' })
    await userEvent.click(screen.getByRole('button', { name: 'Подписаться' }))
    const panel = screen.getByRole('region', { name: 'Подписки: ссылки на соцсети' })
    expect(panel).toHaveTextContent('Сейчас в ленте — пример')
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Ссылка или @аккаунт' }), 't.me/neuro_digest')
    expect(panel).toHaveTextContent('Telegram · @neuro_digest')
    await userEvent.click(within(panel).getByRole('button', { name: 'Следить' }))
    expect(screen.getByText(/^Следите: neuro_digest · Telegram/)).toBeInTheDocument()
    const subs = screen.getByRole('group', { name: 'Подписки' })
    expect(within(subs).getByRole('button', { name: 'neuro_digest, Telegram' })).toBeInTheDocument()
    expect(within(subs).queryByRole('button', { name: 'AI Daily, YouTube' })).toBeNull()
    // повтор — не дублирует
    await userEvent.type(within(panel).getByRole('textbox', { name: 'Ссылка или @аккаунт' }), 'https://t.me/Neuro_Digest')
    await userEvent.click(within(panel).getByRole('button', { name: 'Следить' }))
    expect(within(panel).getByRole('alert')).toHaveTextContent('Вы уже следите за @Neuro_Digest в Telegram')
    await userEvent.click(within(panel).getByRole('button', { name: 'Отписаться: neuro_digest' }))
    expect(screen.getByText('Отписались: neuro_digest · Telegram')).toBeInTheDocument()
    expect(within(subs).queryByRole('button', { name: 'neuro_digest, Telegram' })).toBeNull()
  })
})
