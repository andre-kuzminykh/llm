import { loadDataist } from '../test/fixtures'
import { followed, kindOf, parseFollow, reelOfCard, reelOfPost, slidesOf } from './reel'
import { FULL_VIDEO, MAIL, SHORT_VIDEO, TEXT_IMAGE, WEB_PAGE } from './types'

describe('T-CP-078 FR-CP-078 лента как в TikTok: вид по формату, подписки по ссылке', () => {
  it('вид по формату: вертикаль — короткое видео, горизонталь — длинное, веб и письмо — статья, пост — карточка, с фото — карусель', () => {
    expect([kindOf(SHORT_VIDEO), kindOf(FULL_VIDEO), kindOf(WEB_PAGE), kindOf(MAIL), kindOf(TEXT_IMAGE), kindOf(TEXT_IMAGE, 1), kindOf(TEXT_IMAGE, 3)]).toEqual(['short', 'video', 'article', 'article', 'post', 'post', 'carousel'])
  })

  it('карусель: заголовок, дальше — по мысли из саммери; пост с «каруселью» в саммери — карусель', () => {
    expect(slidesOf('Тренды недели', 'Пять новостей недели. Вторая мысль — и третья; четвёртая.')).toEqual(['Тренды недели', 'Пять новостей недели', 'Вторая мысль', 'и третья', 'четвёртая'])
    const post = { id: 'p1', owner: 'r1', platform: 'Telegram', at: 0, title: 'Тренды недели в ИИ', text: 'Пять новостей недели одной каруселью, по слайду на новость. #ии #тренды', summary: 'Пять новостей недели одной каруселью, по слайду на новость.', views: 10, likes: 1, comments: 0, shares: 0, kind: 'post' as const, format: TEXT_IMAGE }
    const r = reelOfPost(post, { name: 'AI Daily', handle: '@aidaily' })
    expect([r.side, r.faces[0].kind, r.handle, r.tags.join(','), r.source.title]).toEqual(['theirs', 'carousel', '@aidaily', 'ии,тренды', 'Тренды недели в ИИ'])
  })

  it('карточка календаря с темой — вид на каждый формат (вертикаль, пост, веб), фото из заметки, когда выйдет', () => {
    const seed = loadDataist()
    const items = seed.items
      .filter((it) => it.date === '2026-11-16' && it.channelId === 'lab' && it.rubricId === 'research')
      .map((it) => ({ ...it, title: 'ИИ-агенты в бухгалтерии', note: 'Кейс: закрытие месяца за день', files: [{ name: 'a.png', type: 'image/png', size: 1, url: 'data:image/png;base64,AA' }] }))
    const r = reelOfCard(items, { channelName: 'Лаборатория Датаиста', rubric: 'Исследование', time: '09:00', at: 0 })
    expect(r.faces.map((f) => `${f.label}:${f.kind}`)).toEqual(['Вертикаль:short', 'Пост:post', 'Веб:article'])
    expect([r.side, r.title, r.summary, r.images.length, r.planned?.time, r.caption]).toEqual(['mine', 'ИИ-агенты в бухгалтерии', 'Кейс: закрытие месяца за день', 1, '09:00', 'Кейс: закрытие месяца за день #исследование'])
  })

  it('видео из заметки карточки — играет в ленте: у карточки есть источник с типом файла', () => {
    const seed = loadDataist()
    const items = seed.items
      .filter((it) => it.date === '2026-11-16' && it.channelId === 'lab' && it.rubricId === 'research')
      .map((it) => ({ ...it, title: 'Тема', files: [{ name: 'ролик.mp4', type: 'video/mp4', size: 10, url: 'data:video/mp4;base64,AA' }, { name: 'a.png', type: 'image/png', size: 1, url: 'data:image/png;base64,AA' }] }))
    const r = reelOfCard(items, { channelName: 'Лаборатория Датаиста', time: '09:00', at: 0 })
    expect([r.videos, r.images.length]).toEqual([[{ src: 'data:video/mp4;base64,AA', type: 'video/mp4' }], 1])
  })

  it('подписка ссылкой: площадка и @аккаунт из ссылки; @аккаунт — на выбранной площадке; сайт — Web; повтор узнаётся', () => {
    const cases = ['https://www.youtube.com/@aidaily', 't.me/neuro_digest', 'https://www.tiktok.com/@techshorts/video/1', 'instagram.com/growthlab/', 'https://x.com/sama', 'https://www.linkedin.com/company/anthropic', '@my_rival', 'blog.example.com/ai']
    expect(cases.map((c) => parseFollow(c, 'Telegram')).map((f) => `${f?.platform} ${f?.handle}`)).toEqual([
      'YouTube @aidaily',
      'Telegram @neuro_digest',
      'TikTok @techshorts',
      'Instagram @growthlab',
      'X @sama',
      'LinkedIn @anthropic',
      'Telegram @my_rival',
      'Web blog.example.com/ai',
    ])
    expect(parseFollow('   ')).toBeNull()
    expect(parseFollow('не ссылка')).toBeNull()
    expect(followed([{ id: 'c', name: 'n', platform: 'Telegram', handle: '@Neuro_Digest', added: '2026-11-01' }], parseFollow('t.me/neuro_digest')!)).toBe(true)
  })
})
