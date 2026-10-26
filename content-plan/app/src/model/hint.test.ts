// T-CP-033 FR-CP-033 — подсказка при переносе словами: куда, что едет вместе, что отметит проверка.
import { byId, smallPlan } from '../test/fixtures'
import { indexByDate } from './filters'
import { moveHint, whereText } from './hint'

const hint = (moves: { id: string; date: string }[], plan = smallPlan(), today = '2026-10-24') => moveHint(plan, indexByDate(plan), moves, today)

describe('T-CP-033 подсказка при переносе', () => {
  it('куда — словами; несколько карточек — числом и сдвигом', () => {
    expect(whereText('2026-11-11', '13:00', 1)).toBe('Ср, 11 ноя · 13:00')
    expect(whereText('2026-11-11', undefined, 1)).toBe('Ср, 11 ноя')
    expect(whereText('2026-11-11', undefined, 3, 2)).toBe('3 карточки · +2 дня')
    expect(whereText('2026-11-11', undefined, 5, -1, 90)).toBe('5 карточек · −1 день · +1 ч 30 мин')
    expect(whereText('2026-11-11', undefined, 2, 0, -15)).toBe('2 карточки · тот же день · −15 мин')
  })
  it('FULL с группой: что едет вместе; на день с другим FULL — «можно поменять местами»', () => {
    const p = smallPlan()
    p.items.push({ ...byId(p, 'demo'), id: 'tech', ruleId: 'f_tech', rubricId: 'tech', title: 'ИИ-агенты', group: undefined, date: '2026-10-27' })
    const lines = hint([{ id: 'demo', date: '2026-10-27' }], p)
    expect(lines[0]).toEqual({ text: 'Вместе с группой: Анонс в Кабинете, Тизер FULL, Анонс от Andre AIT' })
    expect(lines.some((l) => l.warn && l.text === 'Здесь уже FULL: Технологии · FULL «ИИ-агенты» — после переноса можно поменять местами')).toBe(true)
    // два FULL — одно событие: про «не тот день» у этой же группы отдельно не пишем
    expect(lines.some((l) => l.text.startsWith('По сетке'))).toBe(false)
    // FULL демо выходит по понедельникам — в среду проверка это отметит
    expect(hint([{ id: 'demo', date: '2026-10-28' }]).map((l) => l.text)).toContain('По сетке Демо · FULL не выходит в Ср')
  })
  it('сверх лимита, не тот день недели, канал не запущен, дата в прошлом', () => {
    // второй тезис в день, где тезис уже есть
    expect(hint([{ id: 'thesis', date: '2026-10-27' }]).map((l) => l.text)).toContain('Сверх лимита в день: Тезисы · Тезис дня: 2 при лимите 1')
    // тезисы по субботам не выходят
    expect(hint([{ id: 'thesis', date: '2026-10-31' }]).map((l) => l.text)).toContain('По сетке Тезисы · Тезис дня не выходит в Сб')
    const p = smallPlan()
    p.items.push({ ...byId(p, 'thesis'), id: 'upd', ruleId: 'lan_upd', channelId: 'landao', rubricId: 'updates', title: 'Обновление', date: '2026-11-03' })
    expect(hint([{ id: 'upd', date: '2026-10-28' }], p).map((l) => l.text)).toContain('Landao ещё не запущен: стартует 2 ноя')
    expect(hint([{ id: 'thesis', date: '2026-10-28' }], smallPlan(), '2026-10-30').map((l) => l.text)).toContain('Дата уже прошла')
  })
  it('без нарушений — только что едет; на тот же день — ничего не проверяется', () => {
    expect(hint([{ id: 'thesis', date: '2026-10-28' }])).toEqual([])
    expect(hint([{ id: 'thesis', date: '2026-10-26' }])).toEqual([])
  })
  it('несколько карточек — проверка всех новых дней, одно и то же — одной строкой', () => {
    const lines = hint([
      { id: 'thesis', date: '2026-10-31' },
      { id: 'demo', date: '2026-10-31' },
    ])
    expect(lines.filter((l) => l.text.startsWith('По сетке')).length).toBeGreaterThan(0)
    expect(lines.some((l) => l.text.startsWith('Вместе с группой'))).toBe(false)
    expect(new Set(lines.map((l) => l.text)).size).toBe(lines.length)
  })
})
