import { smallPlan } from '../test/fixtures'
import { channelStats } from './analytics'
import { webAndMail } from './io'

describe('T-CP-057 FR-CP-057 аналитика своих каналов — по карточкам плана', () => {
  it('за период: карточки, вышло, не вышло вовремя, впереди, ритм по неделям, форматы, площадки, рубрики', () => {
    const p = webAndMail(smallPlan())
    p.items = p.items.map((it) => (it.id === 'thesis' ? { ...it, status: 'published' } : it))
    const [dataist, andre, landao] = channelStats(p, '2026-10-28', 7)
    // 26 окт: FULL Демо (с тизером и анонсом) и тезис; 27 окт: слот тезиса
    expect([dataist.total, dataist.published, dataist.late]).toEqual([3, 1, 2])
    expect(dataist.ahead).toBe(1) // слот Демо 2 ноя
    expect(dataist.weeks).toHaveLength(12)
    expect(dataist.weeks[4]).toMatchObject({ from: '2026-10-26', n: 3, published: 1, current: true, future: false })
    expect(dataist.weeks[5]).toMatchObject({ from: '2026-11-02', n: 1, future: true })
    expect(Object.fromEntries(dataist.formats)).toEqual({ 'Полное горизонтальное видео': 1, 'Короткое вертикальное видео': 3, 'Текст с картинкой': 1, 'Страница на сайте': 1 })
    expect(dataist.platforms.map(([x]) => x)).toEqual(['YouTube', 'Instagram', 'Telegram']) // сайт — формат, не площадка
    expect(dataist.rubrics[0]).toEqual(['thesis', 2])
    expect([andre.total, andre.platforms.map(([x]) => x)]).toEqual([1, ['LinkedIn']])
    expect(landao.total).toBe(0)
    // план начался 25 окт — неделя считается по 4 дням: 3 карточки за 4 дня — 5,3 в неделю
    expect(dataist.perWeek).toBe(5.3)
  })
})
