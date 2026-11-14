import { loadDataist } from '../test/fixtures'
import { indexByDate } from './filters'
import { editItem, matesOf, moveItem, removeItem } from './store'
import { SHORT_VIDEO, TEXT_IMAGE, WEB_PAGE, type Plan } from './types'
import { cardsOf, unitsOf } from './units'

const seed = loadDataist()
const rules = new Map(seed.rules.map((r) => [r.id, r]))
const order = seed.channels.map((c) => c.id)
const on = (p: Plan, d: string) => indexByDate(p).get(d) ?? []
const research = (p: Plan, d = '2026-11-16') => p.items.filter((it) => it.date === d && it.channelId === 'lab' && it.rubricId === 'research')
const short = research(seed).find((it) => it.format === SHORT_VIDEO)!

describe('T-CP-077 FR-CP-077 один материал в нескольких форматах — одна карточка: тот же день, час, канал, рубрика и тема', () => {
  it('16 ноября: 29 публикаций — 15 карточек; исследование Лаборатории в 09:00 — короткое, пост и статья одной карточкой, главное — видео', () => {
    const cards = cardsOf(on(seed, '2026-11-16'), rules, order)
    expect(cards).toHaveLength(15)
    expect(unitsOf(on(seed, '2026-11-16'), rules, order)).toHaveLength(15)
    const lab = cards.find((u) => u.head.rubricId === 'research' && u.channelId === 'lab')!
    expect([lab.time, ...lab.items.map((it) => it.format)]).toEqual(['09:00', SHORT_VIDEO, TEXT_IMAGE, WEB_PAGE])
    // микроуроки — в разное время: четыре карточки
    expect(cards.filter((u) => u.head.rubricId === 'microlesson').map((u) => u.time)).toEqual(['17:00', '17:15', '17:30', '17:45'])
  })

  it('тема, заметка, черновик и статус — всей карточке; час — тоже, карточка не расходится; без «вместе» — только один формат', () => {
    const next = editItem(seed, short.id, { title: 'Агенты', note: 'идея', status: 'progress', time: '09:30' })
    expect(research(next).map((it) => `${it.format} ${it.title} ${it.note} ${it.status} ${it.time}`).sort()).toEqual(
      [`${SHORT_VIDEO} Агенты идея progress 09:30`, `${TEXT_IMAGE} Агенты идея progress 09:30`, `${WEB_PAGE} Агенты идея progress 09:30`].sort(),
    )
    expect(matesOf(next, next.items.find((it) => it.id === short.id)!)).toHaveLength(2)
    const alone = editItem(seed, short.id, { title: 'Только видео' }, undefined, false)
    expect(research(alone).map((it) => it.title).sort()).toEqual(['Только видео', '…', '…'].sort())
    // темы разные — карточки разные
    expect(cardsOf(on(alone, '2026-11-16'), rules, order)).toHaveLength(16)
  })

  it('перенос и удаление — всей карточкой: на другой день и час едут все форматы; удалили — нет ни одного', () => {
    const moved = moveItem(seed, short.id, '2026-11-17', true, '11:00')
    expect(research(moved, '2026-11-17').filter((it) => it.time === '11:00').map((it) => it.format).sort()).toEqual([SHORT_VIDEO, TEXT_IMAGE, WEB_PAGE].sort())
    expect(research(moved)).toHaveLength(0)
    expect(research(removeItem(seed, short.id))).toHaveLength(0)
    expect(research(removeItem(seed, short.id, false))).toHaveLength(2)
  })
})
