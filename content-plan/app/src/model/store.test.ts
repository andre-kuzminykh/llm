import { byId, item, smallPlan } from '../test/fixtures'
import { planningSlots } from './planning'
import {
  addChannel,
  addPlatform,
  addRubric,
  assignTopic,
  bankAdd,
  bankOf,
  bankReorder,
  createItem,
  createSlots,
  draftsFor,
  duplicateItem,
  editItem,
  fillSlots,
  initialState,
  moveItem,
  planFill,
  reducer,
  removeChannel,
  removeItem,
  setPeriod,
  takeDraft,
  unassignTopic,
  updateItem,
  updateMany,
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
  it('на другой час: группа сдвигается на ту же разницу', () => {
    const p = moveItem(smallPlan(), 'demo', '2026-10-26', true, '15:00')
    expect(byId(p, 'demo').time).toBe('15:00')
    expect(byId(p, 'teaser').time).toBe('15:00')
    expect(byId(p, 'ait').time).toBe('16:00') // у анонса Andre AIT своё время, на час позже FULL
  })
  it('T-CP-029 растянутая карточка едет на другой час с той же длительностью; конец — не дальше полуночи', () => {
    const plan = smallPlan()
    plan.items = plan.items.map((x) => (x.id === 'demo' ? { ...x, end: '13:30' } : x))
    const p = moveItem(plan, 'demo', '2026-10-27', true, '15:00')
    expect(byId(p, 'demo')).toMatchObject({ date: '2026-10-27', time: '15:00', end: '16:30' })
    expect(byId(p, 'teaser').end).toBeUndefined()
    expect(byId(moveItem(plan, 'demo', '2026-10-26', true, '23:00'), 'demo').end).toBe('24:00')
    expect(byId(moveItem(plan, 'demo', '2026-10-28'), 'demo').end).toBe('13:30') // только день — время то же
  })
  it('после конца плана — план продлевается', () => {
    const p = moveItem(smallPlan(), 'thesis', '2027-01-15')
    expect(p.end).toBe('2027-01-15')
  })
})

describe('T-CP-004 FR-CP-004 производные заголовки', () => {
  it('правка главного пересобирает тизер и анонсы: у группы одна тема', () => {
    const p = updateItem(smallPlan(), 'demo', { title: 'Агент продаж' })
    expect(byId(p, 'teaser').title).toBe('Агент продаж')
    expect(byId(p, 'office').title).toBe('Агент продаж')
    expect(byId(p, 'ait').title).toBe('Агент продаж')
  })
  it('правка производного не трогает главный', () => {
    const p = updateItem(smallPlan(), 'teaser', { title: 'Свой тизер' })
    expect(byId(p, 'demo').title).toBe('Стратегия')
    expect(byId(p, 'teaser').title).toBe('Свой тизер')
  })
  it('статус не пересобирает заголовки', () => {
    const plan = updateItem(smallPlan(), 'teaser', { title: 'Свой тизер' })
    expect(byId(updateItem(plan, 'demo', { status: 'ready' }), 'teaser').title).toBe('Свой тизер')
  })
  it('статус всей карточке одним шагом', () => {
    const p = updateMany(smallPlan(), ['demo', 'teaser', 'office'], { status: 'progress' })
    expect(['demo', 'teaser', 'office', 'ait'].map((id) => byId(p, id).status)).toEqual(['progress', 'progress', 'progress', 'planned'])
  })
})

describe('T-CP-005 FR-CP-005 создать, дублировать, удалить', () => {
  it('правка из формы: заголовок и дата одним шагом, с группой', () => {
    const p = editItem(smallPlan(), 'demo', { title: 'HR', status: 'ready' }, '2026-11-16')
    expect(byId(p, 'demo')).toMatchObject({ title: 'HR', status: 'ready', date: '2026-11-16' })
    expect(byId(p, 'teaser')).toMatchObject({ title: 'HR', date: '2026-11-16' })
  })
  it('новый материал с копией группы по образцу ближайшего', () => {
    const p = createItem(smallPlan(), item({ id: 'new', date: '2026-11-16', ruleId: 'f_demo', title: 'HR', format: 'FULL', platforms: ['YouTube'] }))
    const fresh = p.items.filter((x) => x.date === '2026-11-16')
    expect(fresh.map((x) => x.ruleId).sort()).toEqual(['f_demo', 'sh_teaser'])
    expect(fresh.find((x) => x.ruleId === 'sh_teaser')!.title).toBe('HR')
    expect(new Set(fresh.map((x) => x.group)).size).toBe(1)
  })
  it('без сопутствующих — один материал', () => {
    const p = createItem(smallPlan(), item({ id: 'new', date: '2026-11-16', ruleId: 'f_demo', title: 'HR' }), false)
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
    expect(byId(p, 'slot').title).toBe('Агент продаж')
    expect(byId(p, 'slot-teaser').title).toBe('Агент продаж')
    expect(byId(p, 'slot2').title).toBe('HR')
    expect(bankOf(p, 'f_demo').map((x) => x.title)).toEqual(['Лишняя'])
  })
  it('вернуть тему в банк: слот снова пустой, тема — первой в банке', () => {
    const p0 = fillSlots(bankAdd(smallPlan(), 'f_demo', ['Агент продаж', 'HR', 'Лишняя']), 'f_demo', '2026-10-25')
    const p = unassignTopic(p0, 'slot')
    expect(byId(p, 'slot').title).toBe('…')
    expect(byId(p, 'slot-teaser').title).toBe('…')
    expect(bankOf(p, 'f_demo').map((x) => x.title)).toEqual(['Агент продаж', 'Лишняя'])
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
    expect(p.items.find((x) => x.date === '2026-11-16' && x.ruleId === 'f_demo')!.title).toBe('…')
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
    const p = updateItem(smallPlan(), 'demo', { rubricId: 'tech', title: 'Агенты' })
    expect(byId(p, 'teaser')).toMatchObject({ rubricId: 'tech', title: 'Агенты' })
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

describe('T-CP-027 FR-CP-027 копия и версии для других площадок', () => {
  it('копия на другую дату — вместе с группой, в плане', () => {
    const p = smallPlan()
    const next = reducer({ plan: p, past: [], future: [] }, { type: 'duplicate', id: 'demo', date: '2026-11-16' }).plan!
    const copies = next.items.filter((x) => x.date === '2026-11-16')
    expect(copies.map((x) => x.ruleId).sort()).toEqual(['ait', 'f_demo', 'office', 'sh_teaser'])
    expect(new Set(copies.map((x) => x.group)).size).toBe(1)
    expect(copies.every((x) => x.status === 'planned' && x.title === 'Стратегия')).toBe(true)
  })
  it('вместе с оригиналом — в той же карточке, вне сетки', () => {
    const p = smallPlan()
    const next = reducer({ plan: p, past: [], future: [] }, { type: 'versions', id: 'demo', platforms: ['Instagram', 'Telegram'], after: false }).plan!
    const v = next.items.filter((x) => x.source === 'версия')
    expect(v.map((x) => [x.platforms[0], x.date, x.group, x.offGrid])).toEqual([
      ['Instagram', '2026-10-26', 'full-2026-10-26', true],
      ['Telegram', '2026-10-26', 'full-2026-10-26', true],
    ])
    // переименовали оригинал — версии следом
    const renamed = reducer({ plan: next, past: [], future: [] }, { type: 'update', id: 'demo', patch: { title: 'Агент продаж' } }).plan!
    expect(renamed.items.filter((x) => x.source === 'версия').map((x) => x.title)).toEqual(['Агент продаж', 'Агент продаж'])
  })
  it('автоматически по триггеру: на следующий день и «в работе», когда оригинал вышел', () => {
    const p = smallPlan()
    let s = reducer({ plan: p, past: [], future: [] }, { type: 'versions', id: 'demo', platforms: ['Instagram'], after: true })
    const v = s.plan!.items.find((x) => x.trigger === 'demo')!
    expect([v.date, v.status, v.group]).toEqual(['2026-10-27', 'planned', undefined])
    s = reducer(s, { type: 'updateMany', ids: ['demo', 'teaser', 'office'], patch: { status: 'published' } })
    expect(s.plan!.items.find((x) => x.id === v.id)!.status).toBe('progress')
    // отмена возвращает и оригинал, и версию
    s = reducer(s, { type: 'undo' })
    expect(s.plan!.items.find((x) => x.id === v.id)!.status).toBe('planned')
  })
  it('несколько правок формы — один шаг истории', () => {
    const p = smallPlan()
    let s = reducer({ plan: p, past: [], future: [] }, { type: 'batch', actions: [{ type: 'duplicate', id: 'thesis', date: '2026-10-28' }, { type: 'versions', id: 'thesis', platforms: ['X'], after: false }] })
    expect(s.plan!.items.length).toBe(p.items.length + 2)
    s = reducer(s, { type: 'undo' })
    expect(s.plan!.items.length).toBe(p.items.length)
  })
})

describe('T-CP-031 FR-CP-031 периодичность хэштега, планирование недели, черновики', () => {
  const thesisSlots = (p: ReturnType<typeof smallPlan>) => p.items.filter((x) => x.ruleId === 'sh_thesis' && x.title === '…').map((x) => x.date).sort()
  it('новый день недели ставит слоты без темы до конца плана; снятый — убирает пустые, тема остаётся', () => {
    const p = smallPlan()
    p.items = p.items.filter((x) => x.id !== 'th-slot')
    const sat = [true, true, true, true, true, true, true]
    const on = setPeriod(p, 'sh_thesis', sat, undefined, '2026-10-27')
    expect(on.rules.find((r) => r.id === 'sh_thesis')!.days).toEqual(sat)
    const slots = thesisSlots(on)
    expect(slots[0]).toBe('2026-10-27')
    expect(slots).toContain('2026-10-31')
    expect(slots[slots.length - 1]).toBe('2026-11-30')
    expect(slots).not.toContain('2026-10-26') // тут уже тезис с темой, а раньше from — не трогаем
    const off = setPeriod(on, 'sh_thesis', [true, true, true, true, true, false, true], '10:00', '2026-10-27')
    expect(thesisSlots(off)).not.toContain('2026-10-31')
    expect(thesisSlots(off)).toContain('2026-11-01')
    expect(off.rules.find((r) => r.id === 'sh_thesis')!.time).toBe('10:00')
    expect(byId(off, 'thesis').title).toBe('Я устал от хайпа вокруг ИИ')
  })
  it('без дней — разово: пустые слоты уходят вместе с группой', () => {
    const p = setPeriod(smallPlan(), 'f_demo', [false, false, false, false, false, false, false], undefined, '2026-10-27')
    expect(p.items.some((x) => x.id === 'slot' || x.id === 'slot-teaser' || x.id === 'slot2')).toBe(false)
    expect(byId(p, 'demo').title).toBe('Стратегия')
  })
  it('планирование — пустые слоты до конца следующей недели; ближайший черновик того же хэштега — по порядку дат', () => {
    const p = smallPlan()
    expect(planningSlots(p, '2026-10-24').map((x) => x.id)).toEqual(['th-slot'])
    expect(planningSlots(p, '2026-10-27').map((x) => x.id)).toEqual(['th-slot', 'slot'])
    const withDrafts = bankAdd(p, 'sh_thesis', ['Первая', 'Вторая'])
    const sug = draftsFor(withDrafts, planningSlots(withDrafts, '2026-10-27'))
    expect(sug.get('th-slot')!.title).toBe('Первая')
    expect(sug.has('slot')).toBe(false) // черновиков #демо нет
    const taken = takeDraft(withDrafts, 'th-slot', sug.get('th-slot')!.id)
    expect(byId(taken, 'th-slot').title).toBe('Первая')
    expect(bankOf(taken, 'sh_thesis').map((x) => x.title)).toEqual(['Вторая'])
  })
  it('черновик FULL встаёт в слот и даёт тему всей группе', () => {
    const p = bankAdd(smallPlan(), 'f_demo', ['Агент продаж'])
    const draft = bankOf(p, 'f_demo')[0]
    const next = takeDraft(p, 'slot', draft.id)
    expect(byId(next, 'slot').title).toBe('Агент продаж')
    expect(byId(next, 'slot-teaser').title).toBe('Агент продаж')
  })
  it('новые площадка, канал и хэштег; повтор не заводится', () => {
    const p = addPlatform(smallPlan(), 'VK')
    expect(p.platforms).toContain('VK')
    expect(p.channels.every((c) => c.platforms.includes('VK'))).toBe(true)
    expect(addPlatform(p, 'vk')).toBe(p)
    const c = addChannel(p, 'Антрополис', '2026-10-26', 'anthropolis')
    expect(c.channels.find((x) => x.id === 'anthropolis')).toMatchObject({ name: 'Антрополис', platforms: p.platforms, sections: [] })
    expect(addChannel(c, 'антрополис', '2026-10-26')).toBe(c)
    const r = addRubric(c, '#Агенты', '', 'agents')
    expect(r.rubrics.find((x) => x.id === 'agents')!.name).toBe('Агенты')
    expect(addRubric(r, 'агенты')).toBe(r)
    expect(addRubric(r, 'Тезисы')).toBe(r)
  })
})

describe('T-CP-040 FR-CP-040 канал: удалить', () => {
  it('уходят канал, его форматы и материалы — и материалы других каналов по его форматам; последний канал остаётся', () => {
    const p = smallPlan()
    p.items.push(item({ id: 'x-andre', channelId: 'dataist', ruleId: 'ait', title: 'Чужой формат' })) // материал Dataist по формату Andre AIT
    const r = removeChannel(p, 'andre')
    expect(r.channels.map((c) => c.id)).toEqual(['dataist', 'landao'])
    expect(r.rules.some((x) => x.id === 'ait')).toBe(false)
    expect(r.items.some((x) => x.id === 'ait' || x.id === 'x-andre')).toBe(false)
    expect(r.items.length).toBe(p.items.length - 2)
    const one = { ...p, channels: [p.channels[0]] }
    expect(removeChannel(one, 'dataist')).toBe(one)
  })
  it('удаление — один шаг истории', () => {
    let st = reducer(initialState, { type: 'init', plan: smallPlan() })
    st = reducer(st, { type: 'removeChannel', id: 'andre' })
    expect(st.plan!.channels.some((c) => c.id === 'andre')).toBe(false)
    st = reducer(st, { type: 'undo' })
    expect(st.plan!.channels.some((c) => c.id === 'andre')).toBe(true)
  })
})
