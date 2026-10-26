// T-CP-029 FR-CP-029 — календарь по времени, перенесённый из nr_management (T-MCL-001…016):
// дни окна, геометрия блоков, колонки пересечений, линия «сейчас», шаг окна,
// привязка к 15 минутам при переносе и растягивании, панорамирование листа, конец жеста.
import {
  applyPan, blockGeometry, calendarDays, gestureEnd, layoutBlocks, minutesFromMidnight, minutesToClock,
  nowLine, reschedule, resizeEnd, shiftAnchor, snapMin, type GestureState,
} from './calendar'

const block = (id: string, start: string, end?: string) => ({ id, start, end })
const place = (list: ReturnType<typeof block>[]) => layoutBlocks(list, (b) => blockGeometry(b.start, b.end))

describe('T-CP-029 дни окна (T-MCL-001)', () => {
  it('день — сам день, три дня — подряд от него, неделя — Пн–Вс той недели', () => {
    expect(calendarDays('2026-11-11', 'day')).toEqual(['2026-11-11'])
    expect(calendarDays('2026-11-11', '3day')).toEqual(['2026-11-11', '2026-11-12', '2026-11-13'])
    const week = calendarDays('2026-11-11', 'week')
    expect(week).toHaveLength(7)
    expect(week[0]).toBe('2026-11-09') // понедельник
    expect(week[6]).toBe('2026-11-15')
  })
  it('любой день недели даёт ту же неделю; воскресенье не уводит на следующую', () => {
    const monday = calendarDays('2026-11-09', 'week')
    expect(calendarDays('2026-11-11', 'week')).toEqual(monday)
    expect(calendarDays('2026-11-15', 'week')).toEqual(monday)
    for (const span of ['day', '3day', 'week'] as const) expect(calendarDays('2026-11-15', span)).toContain('2026-11-15')
  })
})

describe('T-CP-029 геометрия блока (T-MCL-002)', () => {
  it('начало и конец в минутах; без конца — час', () => {
    expect(minutesFromMidnight('09:30')).toBe(570)
    expect(blockGeometry('09:30', '11:00')).toEqual({ topMin: 570, heightMin: 90 })
    expect(blockGeometry('09:00')).toEqual({ topMin: 540, heightMin: 60 })
  })
  it('конец не раньше начала + 15 минут; через полночь не переваливает', () => {
    expect(blockGeometry('09:00', '09:00')).toEqual({ topMin: 540, heightMin: 15 })
    expect(blockGeometry('10:00', '09:00').heightMin).toBe(15)
    const late = blockGeometry('23:50')
    expect(late.topMin + late.heightMin).toBeLessThanOrEqual(1440)
    expect(blockGeometry('23:00', '00:30')).toEqual({ topMin: 1380, heightMin: 15 })
    expect(blockGeometry('23:00', '24:00')).toEqual({ topMin: 1380, heightMin: 60 })
  })
  it('мусор вместо времени — полночь, а не NaN', () => {
    expect(minutesFromMidnight('')).toBe(0)
    expect(minutesFromMidnight(undefined)).toBe(0)
    expect(minutesFromMidnight('24:00')).toBe(1440)
  })
})

describe('T-CP-029 пересечения — рядом, по колонкам (T-MCL-003)', () => {
  it('непересекающиеся — во всю ширину', () => {
    expect(place([block('a', '10:00', '11:00'), block('b', '12:00', '13:00')]).every((p) => p.cols === 1)).toBe(true)
  })
  it('два пересекающихся — две колонки; третий отдельно — снова во всю ширину', () => {
    const placed = place([block('a', '10:00', '11:00'), block('b', '10:30', '11:30'), block('c', '14:00')])
    const by = Object.fromEntries(placed.map((p) => [p.item.id, p]))
    expect([by.a.cols, by.b.cols]).toEqual([2, 2])
    expect(by.a.col).not.toBe(by.b.col)
    expect(by.c.cols).toBe(1)
  })
  it('три сразу — три колонки; освободившуюся колонку занимает следующий, группа не расширяется; видны все', () => {
    const placed = place([block('a', '10:00', '11:00'), block('b', '10:30', '11:30'), block('c', '10:45', '12:00'), block('d', '11:15', '12:00')])
    const by = Object.fromEntries(placed.map((p) => [p.item.id, p]))
    expect([by.a.cols, by.b.cols, by.c.cols]).toEqual([3, 3, 3])
    expect(new Set([by.a.col, by.b.col, by.c.col]).size).toBe(3)
    expect(by.d.col).toBe(by.a.col)
    expect(by.d.cols).toBe(3)
    expect(placed).toHaveLength(4)
  })
  it('пустой день — пусто', () => expect(place([])).toEqual([]))
})

describe('T-CP-029 шаг окна и линия «сейчас» (T-MCL-004/005)', () => {
  it('стрелки двигают на ширину окна; неделя — от понедельника; вперёд-назад возвращает то же окно', () => {
    expect(shiftAnchor('2026-11-11', 'day', 1)).toBe('2026-11-12')
    expect(shiftAnchor('2026-11-11', '3day', 1)).toBe('2026-11-14')
    expect(shiftAnchor('2026-11-11', 'week', 1)).toBe('2026-11-16')
    expect(shiftAnchor('2026-11-11', 'week', -1)).toBe('2026-11-02')
    for (const span of ['day', '3day'] as const) expect(shiftAnchor(shiftAnchor('2026-11-11', span, 1), span, -1)).toBe('2026-11-11')
    expect(calendarDays(shiftAnchor(shiftAnchor('2026-11-11', 'week', 1), 'week', -1), 'week')).toEqual(calendarDays('2026-11-11', 'week'))
  })
  it('линия «сейчас» — только сегодня и внутри суток', () => {
    expect(nowLine('2026-11-11', { date: '2026-11-11', minutes: 615 })).toEqual({ show: true, topMin: 615 })
    expect(nowLine('2026-11-12', { date: '2026-11-11', minutes: 615 }).show).toBe(false)
    expect(nowLine('2026-11-11', { date: '2026-11-11', minutes: 5000 }).topMin).toBe(1440)
    expect(nowLine('2026-11-11', { date: '2026-11-11', minutes: -30 }).topMin).toBe(0)
  })
})

describe('T-CP-029 перенос и растягивание по 15 минут (T-MCL-008)', () => {
  it('привязка к 15 минутам и внутри суток', () => {
    expect(snapMin(0)).toBe(0)
    expect(snapMin(577)).toBe(570)
    expect(snapMin(583)).toBe(585)
    expect(snapMin(2000)).toBe(1425)
    expect(snapMin(-40)).toBe(0)
    expect(minutesToClock(570)).toBe('09:30')
    expect(minutesToClock(1440)).toBe('24:00')
  })
  it('перенос сохраняет длительность; без конца — час; у полуночи конец — 24:00', () => {
    expect(reschedule('09:30', '11:00', '2026-11-13', 612)).toEqual({ date: '2026-11-13', start: '10:15', end: '11:45' })
    expect(reschedule('09:00', undefined, '2026-11-13', 600)).toEqual({ date: '2026-11-13', start: '10:00', end: '11:00' })
    expect(reschedule('09:00', undefined, '2026-11-13', 1439)).toEqual({ date: '2026-11-13', start: '23:45', end: '24:00' })
  })
  it('нижний край: по 15 минут, не короче 15 минут, не дальше полуночи', () => {
    expect(resizeEnd('10:00', 754)).toBe('12:30')
    expect(resizeEnd('10:00', 100)).toBe('10:15')
    expect(resizeEnd('10:00', 0)).toBe('10:15')
    expect(resizeEnd('10:00', 5000)).toBe('24:00')
  })
})

describe('T-CP-029 лист тянут рукой и конец жеста (T-MCL-009/016)', () => {
  it('прокрутка — в обратную сторону от руки, не меньше нуля; шаги складываются', () => {
    expect(applyPan({ left: 200, top: 300 }, 40, 25)).toEqual({ left: 160, top: 275 })
    expect(applyPan({ left: 200, top: 300 }, -40, -25)).toEqual({ left: 240, top: 325 })
    expect(applyPan({ left: 10, top: 5 }, 100, 100)).toEqual({ left: 0, top: 0 })
    const at = { left: 900, top: 400 }
    expect(applyPan(at, 0, 0)).toEqual(at)
    expect(applyPan(applyPan(at, 30, 20), 30, 20)).toEqual(applyPan(at, 60, 40))
  })
  it('записывает только перенос карточки; лист просто отпускают; без жеста — ничего', () => {
    const table: [GestureState, string][] = [
      [{ dragging: false, panning: false }, 'none'],
      [{ dragging: false, panning: true }, 'end-pan'],
      [{ dragging: true, panning: false }, 'commit-drag'],
      [{ dragging: true, panning: true }, 'commit-drag'],
    ]
    for (const [state, decision] of table) expect(gestureEnd(state)).toBe(decision)
  })
})
