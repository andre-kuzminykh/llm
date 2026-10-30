import { bucketsOf, EMPTY_FEED, hasData, sampleFeed, valuesOf, type Feed } from './metrics'

const at = (s: string) => new Date(s).getTime()

describe('T-CP-057 FR-CP-057 данные соцсетей: корзины и значения', () => {
  const now = at('2026-10-30T15:20:00')
  it('сутки — 24 часа до текущего; 7 и 30 дней — по дням; 90 — по неделям', () => {
    const day = bucketsOf(now, 1)
    expect(day).toHaveLength(24)
    expect([day[0].label, day[23].label]).toEqual(['16:00', '15:00'])
    expect(day[23].from).toBe(at('2026-10-30T15:00:00'))
    const week = bucketsOf(now, 7)
    expect(week.map((b) => b.label)).toEqual(['24 окт', '25 окт', '26 окт', '27 окт', '28 окт', '29 окт', '30 окт'])
    expect(bucketsOf(now, 30)).toHaveLength(30)
    const q = bucketsOf(now, 90)
    expect(q).toHaveLength(13)
    expect(q[12].label).toBe('с 24 окт') // последние 7 дней: 24–30 окт
  })
  it('подписчики — последнее значение, сложенное по площадкам; просмотры — сумма; вовлечённость — среднее; нет данных — пусто', () => {
    const h = (s: string) => at(`2026-10-30T${s}:00`)
    const feed: Feed = {
      posts: [],
      series: [
        { owner: 'a', platform: 'YouTube', metric: 'followers', points: [{ t: h('13:00'), v: 100 }, { t: h('14:00'), v: 110 }] },
        { owner: 'a', platform: 'Telegram', metric: 'followers', points: [{ t: h('14:00'), v: 50 }] },
        { owner: 'a', platform: 'YouTube', metric: 'views', points: [{ t: h('13:00'), v: 7 }, { t: h('14:00'), v: 3 }] },
        { owner: 'a', platform: 'YouTube', metric: 'er', points: [{ t: h('13:00'), v: 2 }, { t: h('14:00'), v: 4 }] },
      ],
    }
    const b = [{ from: h('13:00'), to: h('15:00'), label: '' }, { from: h('15:00'), to: h('16:00'), label: '' }]
    expect(valuesOf(feed, 'a', 'followers', null, b)).toEqual([160, null])
    expect(valuesOf(feed, 'a', 'followers', ['YouTube'], b)).toEqual([110, null])
    expect(valuesOf(feed, 'a', 'views', null, b)).toEqual([10, null])
    expect(valuesOf(feed, 'a', 'er', null, b)).toEqual([3, null])
    expect(hasData(feed, 'a')).toBe(true)
    expect(hasData(EMPTY_FEED, 'a')).toBe(false)
  })
  it('пример — одинаковый при каждом открытии, по часам за 90 дней; посты — только у конкурентов и помечены', () => {
    const owners = [{ id: 'me', platforms: ['YouTube'] }, { id: 'rival', platforms: ['Telegram'], rival: true }]
    const a = sampleFeed(now, owners)
    const b = sampleFeed(now, owners)
    expect(a.series.map((s) => s.points.length)).toEqual(b.series.map((s) => s.points.length))
    expect(a.series[0].points.slice(0, 5)).toEqual(b.series[0].points.slice(0, 5))
    expect(a.series.find((s) => s.metric === 'followers')!.points).toHaveLength(90 * 24 + 1)
    expect(a.posts.length).toBeGreaterThan(0)
    expect(a.posts.every((p) => p.owner === 'rival' && p.sample && p.title.startsWith('Пример'))).toBe(true)
    expect(a.posts.map((p) => p.at)).toEqual([...a.posts.map((p) => p.at)].sort((x, y) => y - x))
  })
})
