import { byId, item, smallPlan } from '../test/fixtures'
import {
  assignTopic,
  bankAdd,
  bankOf,
  bankReorder,
  createItem,
  createSlots,
  duplicateItem,
  editItem,
  fillSlots,
  initialState,
  moveItem,
  planFill,
  reducer,
  removeItem,
  topicOf,
  updateItem,
  updateRule,
} from './store'

describe('T-CP-003 FR-CP-003 перенос', () => {
  it('переносит FULL вместе с группой', () => {
    const p = moveItem(smallPlan(), 'demo', '2026-10-27')
    for (const id of ['demo', 'teaser', 'office', 'ait']) expect(byId(p, id).date).toBe('2026-10-27')
  })
  it('без группы переезжает только сам материал', () => {
    const p = moveItem(smallPlan(), 'demo', '2026-10-27', false)
    expect(byId(p, 'demo').date).toBe('2026-10-27')
    expect(byId(p, 'teaser').date).toBe('2026-10-26')
  })
  it('перенос производного с группой тянет и главный', () => {
    const p = moveItem(smallPlan(), 'teaser', '2026-10-28')
    expect(byId(p, 'demo').date).toBe('2026-10-28')
  })
  it('на тот же день — план не меняется', () => {
    const plan = smallPlan()
    expect(moveItem(plan, 'demo', '2026-10-26')).toBe(plan)
  })
})

describe('T-CP-004 FR-CP-004 производные заголовки', () => {
  it('тема из заголовка', () => {
    expect(topicOf('Демо / Стратегия')).toBe('Стратегия')
    expect(topicOf('Разборы: HR-агентство')).toBe('HR-агентство')
    expect(topicOf('Новости недели 3')).toBe('Новости недели 3')
  })
  it('правка главного пересобирает тизер и анонсы', () => {
    const p = updateItem(smallPlan(), 'demo', { title: 'Демо / Агент продаж' })
    expect(byId(p, 'teaser').title).toBe('Тизер: Демо / Агент продаж')
    expect(byId(p, 'office').title).toBe('Анонс / Агент продаж')
    expect(byId(p, 'ait').title).toBe('Анонс / Агент продаж')
  })
  it('правка производного не трогает главный', () => {
    const p = updateItem(smallPlan(), 'teaser', { title: 'Свой тизер' })
    expect(byId(p, 'demo').title).toBe('Демо / Стратегия')
    expect(byId(p, 'teaser').title).toBe('Свой тизер')
  })
  it('статус не пересобирает заголовки', () => {
    const plan = updateItem(smallPlan(), 'teaser', { title: 'Свой тизер' })
    expect(byId(updateItem(plan, 'demo', { status: 'ready' }), 'teaser').title).toBe('Свой тизер')
  })
})

describe('T-CP-005 FR-CP-005 создать, дублировать, удалить', () => {
  it('правка из формы: заголовок и дата одним шагом, с группой', () => {
    const p = editItem(smallPlan(), 'demo', { title: 'Демо / HR', status: 'ready' }, '2026-11-16')
    expect(byId(p, 'demo')).toMatchObject({ title: 'Демо / HR', status: 'ready', date: '2026-11-16' })
    expect(byId(p, 'teaser')).toMatchObject({ title: 'Тизер: Демо / HR', date: '2026-11-16' })
  })
  it('новый материал с копией группы по образцу ближайшего', () => {
    const p = createItem(smallPlan(), item({ id: 'new', date: '2026-11-16', ruleId: 'f_demo', title: 'Демо / HR', format: 'FULL', platforms: ['YouTube'] }))
    const fresh = p.items.filter((x) => x.date === '2026-11-16')
    expect(fresh.map((x) => x.ruleId).sort()).toEqual(['f_demo', 'sh_teaser'])
    expect(fresh.find((x) => x.ruleId === 'sh_teaser')!.title).toBe('Тизер: Демо / HR')
    expect(new Set(fresh.map((x) => x.group)).size).toBe(1)
  })
  it('без сопутствующих — один материал', () => {
    const p = createItem(smallPlan(), item({ id: 'new', date: '2026-11-16', ruleId: 'f_demo', title: 'Демо / HR' }), false)
    expect(p.items.filter((x) => x.date === '2026-11-16')).toHaveLength(1)
  })
  it('дублирование группы — новая группа на тот же день', () => {
    const p = duplicateItem(smallPlan(), 'demo')
    const day = p.items.filter((x) => x.date === '2026-10-26')
    expect(day).toHaveLength(9) // 4 исходных + 4 копии + Тезис
    expect(new Set(day.filter((x) => x.ruleId === 'f_demo').map((x) => x.group)).size).toBe(2)
  })
  it('удаление с группой и без', () => {
    expect(removeItem(smallPlan(), 'demo').items.some((x) => x.group === 'full-2026-10-26')).toBe(false)
    const one = removeItem(smallPlan(), 'teaser', false)
    expect(one.items.some((x) => x.id === 'teaser')).toBe(false)
    expect(one.items.some((x) => x.id === 'demo')).toBe(true)
  })
})

describe('T-CP-006 FR-CP-006 банк тем', () => {
  it('добавить темы и переставить', () => {
    let p = bankAdd(smallPlan(), 'f_demo', ['Агент продаж', ' ', 'HR'])
    expect(bankOf(p, 'f_demo').map((x) => x.title)).toEqual(['Агент продаж', 'HR'])
    const [a, b] = bankOf(p, 'f_demo')
    p = bankReorder(p, b.id, a.id)
    expect(bankOf(p, 'f_demo').map((x) => x.title)).toEqual(['HR', 'Агент продаж'])
  })
  it('разложить по слотам по порядку дат, производные обновляются', () => {
    const p0 = bankAdd(smallPlan(), 'f_demo', ['Агент продаж', 'HR', 'Лишняя'])
    const { pairs, left } = planFill(p0, 'f_demo', '2026-10-25')
    expect(pairs.map((x) => x.slot.id)).toEqual(['slot', 'slot2'])
    expect(left).toBe(1)
    const p = fillSlots(p0, 'f_demo', '2026-10-25')
    expect(byId(p, 'slot').title).toBe('Демо / Агент продаж')
    expect(byId(p, 'slot-teaser').title).toBe('Тизер: Демо / Агент продаж')
    expect(byId(p, 'slot2').title).toBe('Демо / HR')
    expect(bankOf(p, 'f_demo').map((x) => x.title)).toEqual(['Лишняя'])
  })
  it('тема на день со слотом заполняет слот', () => {
    const p0 = bankAdd(smallPlan(), 'sh_thesis', ['ИИ не заменит вас'])
    const p = assignTopic(p0, bankOf(p0, 'sh_thesis')[0].id, '2026-10-27')
    expect(byId(p, 'th-slot').title).toBe('ИИ не заменит вас')
    expect(bankOf(p, 'sh_thesis')).toHaveLength(0)
  })
  it('тема на день без слота создаёт материал', () => {
    const p0 = bankAdd(smallPlan(), 'sh_thesis', ['Новая'])
    const p = assignTopic(p0, bankOf(p0, 'sh_thesis')[0].id, '2026-10-29')
    expect(p.items.find((x) => x.date === '2026-10-29' && x.ruleId === 'sh_thesis')!.title).toBe('Новая')
  })
  it('слоты на дни рубрики, где её ещё нет', () => {
    const p = createSlots(smallPlan(), 'f_demo', '2026-11-01', '2026-11-30')
    const mondays = p.items.filter((x) => x.ruleId === 'f_demo').map((x) => x.date)
    expect(mondays).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
    expect(p.items.find((x) => x.date === '2026-11-16' && x.ruleId === 'f_demo')!.title).toBe('Демо / …')
  })
  it('слоты не раньше старта канала', () => {
    const p = createSlots(smallPlan(), 'lan_upd', '2026-10-26', '2026-11-03')
    expect(p.items.filter((x) => x.ruleId === 'lan_upd').map((x) => x.date)).toEqual(['2026-11-02', '2026-11-03'])
  })
})

describe('T-CP-008 FR-CP-008 сетка', () => {
  it('правка формата', () => {
    const p = updateRule(smallPlan(), 'f_demo', { days: [false, false, false, false, false, false, true] })
    expect(p.rules.find((r) => r.id === 'f_demo')!.days[6]).toBe(true)
  })
  it('у тизера и анонсов рубрика FULL; смена рубрики FULL переносится на них', () => {
    const p = updateItem(smallPlan(), 'demo', { rubricId: 'tech', title: 'Технологии / Агенты' })
    expect(byId(p, 'teaser')).toMatchObject({ rubricId: 'tech', title: 'Тизер: Технологии / Агенты' })
    expect(byId(p, 'office').rubricId).toBe('tech')
  })
  it('тема из банка получает рубрику формата', () => {
    const p = bankAdd(smallPlan(), 'sh_thesis', ['Новая'])
    expect(bankOf(p, 'sh_thesis')[0].rubricId).toBe('thesis')
  })
})

describe('T-CP-012 FR-CP-012 отмена и повтор', () => {
  it('undo возвращает удалённое, redo снова удаляет', () => {
    let s = reducer(initialState, { type: 'init', plan: smallPlan() })
    s = reducer(s, { type: 'remove', id: 'thesis' })
    expect(s.plan!.items.some((x) => x.id === 'thesis')).toBe(false)
    s = reducer(s, { type: 'undo' })
    expect(s.plan!.items.some((x) => x.id === 'thesis')).toBe(true)
    s = reducer(s, { type: 'redo' })
    expect(s.plan!.items.some((x) => x.id === 'thesis')).toBe(false)
  })
  it('пустое действие не пишет историю', () => {
    let s = reducer(initialState, { type: 'init', plan: smallPlan() })
    s = reducer(s, { type: 'move', id: 'demo', date: '2026-10-26' })
    expect(s.past).toHaveLength(0)
  })
  it('история ограничена', () => {
    let s = reducer(initialState, { type: 'init', plan: smallPlan() })
    for (let i = 0; i < 120; i++) s = reducer(s, { type: 'update', id: 'thesis', patch: { title: `t${i}` } })
    expect(s.past.length).toBe(100)
  })
})
