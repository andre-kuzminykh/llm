import { byId, item, smallPlan } from '../test/fixtures'
import { catchUpPlan, catchUpQueue, overdueOf, shiftPeriod } from './catchup'
import { initialState, reducer } from './store'

const T = '2026-10-28' // сегодня: 26 окт прошло — FULL «Стратегия» и тезис не вышли

describe('T-CP-041 FR-CP-041 наверстать просроченное — одной кнопкой', () => {
  it('просроченное — дата прошла, «Вышло» не отмечено; без пустых слотов, тизеров и анонсов группы, вышедшего', () => {
    const p = smallPlan()
    p.items.push(item({ id: 'old-pub', ruleId: 'sh_thesis', rubricId: 'thesis', title: 'Уже вышло', status: 'published' }))
    expect(overdueOf(p, T).map((x) => x.id)).toEqual(['demo', 'thesis'])
  })
  // тезисы по сетке Пн–Пт и Вс: A 28 окт, B 29, C 30, пустой слот в Вс 1 ноя, D 2 ноя
  const queued = () => {
    const p = smallPlan()
    const add = (id: string, date: string, title: string, source?: string) =>
      p.items.push(item({ id, date, ruleId: 'sh_thesis', rubricId: 'thesis', title, format: 'Короткое вертикальное видео', platforms: ['YouTube'], rank: 20, ...(source ? { source } : {}) }))
    add('A', '2026-10-28', 'A')
    add('B', '2026-10-29', 'B')
    add('C', '2026-10-30', 'C')
    add('S', '2026-11-01', '…', 'нужна тема')
    add('D', '2026-11-02', 'D')
    return p
  }
  const at = (p: ReturnType<typeof smallPlan>, ids: string[]) => ids.map((id) => `${id} ${p.items.find((x) => x.id === id)?.date ?? '—'}`)

  it('одной кнопкой: просроченное — на ближайшие места сетки, стоявшие там сдвигаются по очереди до пустого слота; дальше всё на месте', () => {
    const r = catchUpQueue(queued(), T)
    expect(at(r.plan, ['thesis', 'A', 'B', 'C', 'S', 'D'])).toEqual([
      'thesis 2026-10-28',
      'A 2026-10-29',
      'B 2026-10-30',
      'C 2026-11-01', // занял пустой слот воскресенья — очередь остановилась
      'S —',
      'D 2026-11-02',
    ])
    expect(r.moved.map((m) => `${m.id}: ${m.from} → ${m.date} ${m.time ?? ''} (${m.how})`)).toEqual(['demo: 2026-10-26 → 2026-11-02 12:00 (slot)', 'thesis: 2026-10-26 → 2026-10-28 11:00 (queue)'])
    expect(r.shifted.map((m) => m.id)).toEqual(['A', 'B', 'C'])
    expect(r.filled).toBe(2) // слот FULL 2 ноября и воскресный слот тезиса
    // FULL — в ближайший пустой слот своего формата, с тизером, анонсом и Andre AIT; пустой слот с тизером-слотом ушёл
    expect(['demo', 'teaser', 'office', 'ait'].map((id) => byId(r.plan, id).date)).toEqual(['2026-11-02', '2026-11-02', '2026-11-02', '2026-11-02'])
    expect(r.plan.items.some((x) => x.id === 'slot' || x.id === 'slot-teaser')).toBe(false)
    expect(byId(r.plan, 'slot2').date).toBe('2026-11-09')
    expect(byId(r.plan, 'th-slot').date).toBe('2026-10-27') // прошедший пустой слот не трогаем
    expect(overdueOf(r.plan, T)).toEqual([])
  })
  it('пустых слотов не хватило — очередь доходит до конца и последние встают на следующие дни сетки', () => {
    const p = queued()
    p.items.push(item({ id: 'thesis2', date: '2026-10-27', ruleId: 'sh_thesis', rubricId: 'thesis', title: 'Агенты вместо отделов', rank: 21 }))
    const r = catchUpQueue(p, T)
    expect(at(r.plan, ['thesis', 'thesis2', 'A', 'B', 'C', 'S', 'D'])).toEqual([
      'thesis 2026-10-28',
      'thesis2 2026-10-29',
      'A 2026-10-30',
      'B 2026-11-01',
      'C 2026-11-02',
      'S —',
      'D 2026-11-03',
    ])
    expect(r.shifted.find((m) => m.id === 'D')!.how).toBe('shift')
  })
  it('«Отменить» — один шаг истории: тот же план до и после', () => {
    const p = queued()
    const r = catchUpQueue(p, T)
    let st = reducer(initialState, { type: 'init', plan: p })
    st = reducer(st, { type: 'batch', actions: r.actions })
    expect(st.plan!.items).toEqual(r.plan.items)
    st = reducer(st, { type: 'undo' })
    expect(st.plan!.items).toEqual(p.items)
  })
  it('у разового формата (без дней в сетке) — ближайший свободный день, нет — вне сетки', () => {
    const p = smallPlan()
    p.rules = p.rules.map((r) => (r.id === 'sh_thesis' ? { ...r, days: r.days.map(() => false) } : r))
    const r = catchUpQueue(p, T)
    expect(r.moved.map((m) => `${m.id} → ${m.date} ${m.how}`)).toEqual(['demo → 2026-11-02 slot', 'thesis → 2026-10-28 off'])
    expect(byId(r.plan, 'thesis').offGrid).toBe(true)
  })
  it('просроченного нет — ничего не делает', () => {
    const p = smallPlan()
    expect(catchUpQueue(p, '2026-10-20').actions).toEqual([])
  })

  it('запасной путь (разовые и «в свободные места»): FULL — в ближайший пустой слот своего формата (слот уходит), тезис — на ближайший свободный по сетке день; остальное на месте', () => {
    const p = smallPlan()
    const steps = catchUpPlan(p, ['demo', 'thesis'], T)
    expect(steps.map((s) => `${s.id}: ${s.from} → ${s.date} (${s.how})`)).toEqual([
      'demo: 2026-10-26 → 2026-11-02 (slot)',
      'thesis: 2026-10-26 → 2026-10-28 (free)',
    ])
    let st = reducer(initialState, { type: 'init', plan: p })
    st = reducer(st, { type: 'catchUp', moves: steps })
    const q = st.plan!
    // FULL переехал с тизером, анонсом и Andre AIT; пустой слот 2 ноября с тизером-слотом ушёл
    expect(['demo', 'teaser', 'office', 'ait'].map((id) => byId(q, id).date)).toEqual(['2026-11-02', '2026-11-02', '2026-11-02', '2026-11-02'])
    expect(q.items.some((x) => x.id === 'slot' || x.id === 'slot-teaser')).toBe(false)
    expect(byId(q, 'thesis').date).toBe('2026-10-28')
    // остальной план — на месте
    expect(byId(q, 'slot2').date).toBe('2026-11-09')
    expect(byId(q, 'th-slot').date).toBe('2026-10-27')
    expect(q.items.length).toBe(p.items.length - 2)
    // один шаг истории
    st = reducer(st, { type: 'undo' })
    expect(byId(st.plan!, 'demo').date).toBe('2026-10-26')
  })
  it('сетка не пускает ни в один день — «вне сетки», по одной лишней карточке формата в день', () => {
    const p = smallPlan()
    p.rules = p.rules.map((r) => (r.id === 'sh_thesis' ? { ...r, days: r.days.map(() => false) } : r))
    p.items.push(item({ id: 'thesis2', date: '2026-10-27', ruleId: 'sh_thesis', rubricId: 'thesis', title: 'Агенты вместо отделов', rank: 20 }))
    const steps = catchUpPlan(p, ['thesis', 'thesis2'], T)
    expect(steps.map((s) => `${s.id} → ${s.date} ${s.how}`)).toEqual(['thesis → 2026-10-28 off', 'thesis2 → 2026-10-29 off'])
    const q = reducer(reducer(initialState, { type: 'init', plan: p }), { type: 'catchUp', moves: steps }).plan!
    expect(byId(q, 'thesis').offGrid).toBe(true)
  })
  it('не просроченное и тизер (едет со своим FULL) — пропускаются; уехавшая с группой — «вместе со своей группой»', () => {
    expect(catchUpPlan(smallPlan(), ['slot2', 'teaser'], T)).toEqual([])
    const p = smallPlan()
    p.items.push(item({ id: 'th-b', ruleId: 'sh_thesis', rubricId: 'thesis', title: 'Второй тезис дня', group: 'day1', rank: 21 }))
    p.items.find((x) => x.id === 'thesis')!.group = 'day1'
    expect(catchUpPlan(p, ['thesis', 'th-b'], T).map((s) => `${s.id} ${s.date} ${s.how}`)).toEqual(['thesis 2026-10-28 free', 'th-b 2026-10-28 group'])
  })
  it('пустой слот дальше трёх недель — уже не «наверстать»: свободный день или вне сетки рядом', () => {
    const p = smallPlan()
    p.items = p.items.filter((x) => x.id !== 'slot' && x.id !== 'slot-teaser' && x.id !== 'slot2')
    p.items.push(item({ id: 'far', date: '2027-03-01', ruleId: 'f_demo', title: '…', format: 'Полное горизонтальное видео', platforms: ['YouTube'], source: 'нужна тема' }))
    const [s] = catchUpPlan(p, ['demo'], T)
    expect(s.how).not.toBe('slot')
    expect(s.date < '2026-12-31').toBe(true)
  })
})

describe('T-CP-042 FR-CP-042 перенести период (отпуск)', () => {
  // тезисы: 26 окт тема, 27 окт пустой слот, дальше темы A–E (по сетке: Пн–Пт и Вс)
  const plan = () => {
    const p = smallPlan()
    const add = (id: string, date: string, title: string) => p.items.push(item({ id, date, ruleId: 'sh_thesis', rubricId: 'thesis', title, format: 'Короткое вертикальное видео', platforms: ['YouTube'], rank: 20 }))
    add('A', '2026-10-28', 'A')
    add('B', '2026-10-29', 'B')
    add('C', '2026-10-30', 'C')
    add('D', '2026-11-01', 'D')
    add('E', '2026-11-02', 'E')
    return p
  }
  const dates = (p: ReturnType<typeof plan>, ids: string[]) => ids.map((id) => `${id} ${p.items.find((x) => x.id === id)?.date ?? '—'}`)

  it('«очередь»: темы встают в следующие слоты своего формата, за ними сдвигается очередь; в периоде пусто; хвост — за конец на длину периода', () => {
    const p = plan()
    const r = shiftPeriod(p, '2026-10-27', '2026-10-28', ['dataist', 'andre', 'landao'], 'queue')
    expect(dates(r.plan, ['th-slot', 'A', 'B', 'C', 'D', 'E'])).toEqual([
      'th-slot 2026-10-29',
      'A 2026-10-30',
      'B 2026-11-01',
      'C 2026-11-02',
      'D 2026-11-03',
      'E 2026-11-04',
    ])
    expect(r.plan.items.filter((x) => x.ruleId === 'sh_thesis' && (x.date === '2026-10-27' || x.date === '2026-10-28'))).toEqual([])
    // FULL по понедельникам в период не попадал — на месте
    expect(dates(r.plan, ['demo', 'slot', 'slot2'])).toEqual(['demo 2026-10-26', 'slot 2026-11-02', 'slot2 2026-11-09'])
    // те же правки одним шагом истории дают тот же план
    const st = reducer(reducer(initialState, { type: 'init', plan: p }), { type: 'batch', actions: r.actions })
    expect(st.plan!.items).toEqual(r.plan.items)
  })
  it('«в свободные места»: материалы периода — в пустые слоты и свободные дни после него, остальное на месте; пустые слоты периода убираются', () => {
    const p = plan()
    const r = shiftPeriod(p, '2026-10-27', '2026-10-28', ['dataist'], 'free')
    expect(r.moved.map((m) => `${m.id}: ${m.from} → ${m.date} (${m.how})`)).toEqual(['A: 2026-10-28 → 2026-11-03 (free)'])
    expect(r.cleared).toBe(1)
    expect(dates(r.plan, ['th-slot', 'B', 'C', 'D', 'E'])).toEqual(['th-slot —', 'B 2026-10-29', 'C 2026-10-30', 'D 2026-11-01', 'E 2026-11-02'])
  })
  it('невыбранные каналы не трогаются', () => {
    const r = shiftPeriod(plan(), '2026-10-27', '2026-10-28', ['andre'], 'queue')
    expect(r.moved).toEqual([])
    expect(r.actions).toEqual([])
  })
})
