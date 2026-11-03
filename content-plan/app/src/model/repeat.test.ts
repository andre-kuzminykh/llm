import { nthOfMonth, presetOf, presetRule, repeatDates, repeatText, type RepeatRule } from './repeat'

const never = { kind: 'never' } as const
const week = (days: number[], every = 1): RepeatRule => ({ every, unit: 'week', days, end: never })

describe('T-CP-055 FR-CP-055 повтор: каждый день, по неделям, раз в месяц, «Другое…» как в Google Календаре', () => {
  // 2026-10-28 — среда (2), четвёртая в октябре
  it('каждую неделю — по выбранным дням, после первой даты и до конца плана', () => {
    expect(repeatDates('2026-10-28', week([2]), '2026-11-20')).toEqual(['2026-11-04', '2026-11-11', '2026-11-18'])
    expect(repeatDates('2026-10-28', week([0, 2]), '2026-11-10')).toEqual(['2026-11-02', '2026-11-04', '2026-11-09'])
  })
  it('через неделю — каждая вторая неделя от первой даты', () => {
    expect(repeatDates('2026-10-28', week([2, 4], 2), '2026-11-30')).toEqual(['2026-10-30', '2026-11-11', '2026-11-13', '2026-11-25', '2026-11-27'])
  })
  it('раз в месяц — тот же по счёту день недели; если такого нет — месяц пропускается', () => {
    expect(nthOfMonth('2026-10-28')).toBe(4)
    expect(repeatDates('2026-10-28', presetRule('month', '2026-10-28'), '2027-01-31')).toEqual(['2026-11-25', '2026-12-23', '2027-01-27'])
    // пятый четверг: 29 октября 2026 — в ноябре его нет, в декабре — 31-е
    expect(repeatDates('2026-10-29', presetRule('month', '2026-10-29'), '2026-12-31')).toEqual(['2026-12-31'])
  })
  it('каждый день, раз в 3 дня, по будням', () => {
    expect(repeatDates('2026-10-28', presetRule('day', '2026-10-28'), '2026-10-31')).toEqual(['2026-10-29', '2026-10-30', '2026-10-31'])
    expect(repeatDates('2026-10-28', { every: 3, unit: 'day', days: [], end: never }, '2026-11-06')).toEqual(['2026-10-31', '2026-11-03', '2026-11-06'])
    expect(repeatDates('2026-10-30', presetRule('weekdays', '2026-10-30'), '2026-11-04')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04'])
  })
  it('месяц по числу — короткий месяц пропускается; год — тот же день', () => {
    expect(repeatDates('2026-12-31', { every: 1, unit: 'month', days: [], monthBy: 'date', end: never }, '2027-05-31')).toEqual(['2027-01-31', '2027-03-31', '2027-05-31'])
    expect(repeatDates('2026-10-28', { every: 1, unit: 'year', days: [], end: never }, '2028-12-31')).toEqual(['2027-10-28', '2028-10-28'])
  })
  it('окончание: до даты или после N раз (считая первый)', () => {
    expect(repeatDates('2026-10-28', { every: 1, unit: 'day', days: [], end: { kind: 'date', date: '2026-10-30' } }, '2027-01-01')).toEqual(['2026-10-29', '2026-10-30'])
    expect(repeatDates('2026-10-28', { every: 1, unit: 'week', days: [2], end: { kind: 'count', count: 3 } }, '2027-01-01')).toEqual(['2026-11-04', '2026-11-11'])
  })
  it('не повторять или конец раньше — ничего', () => {
    expect(repeatDates('2026-10-28', null, '2026-12-31')).toEqual([])
    expect(repeatDates('2026-10-28', week([2]), '2026-10-28')).toEqual([])
  })
  it('подпись и готовый вариант', () => {
    expect(repeatText(week([3, 0]), '2026-10-28')).toBe('каждую неделю: пн, чт')
    expect(repeatText(presetRule('month', '2026-10-28'), '2026-10-28')).toBe('раз в месяц: 4-я ср')
    expect(repeatText(presetRule('weekdays', '2026-10-28'), '2026-10-28')).toBe('по будням')
    expect(repeatText({ every: 3, unit: 'day', days: [], end: { kind: 'count', count: 10 } }, '2026-10-28')).toBe('раз в 3 дня, 10 раз')
    expect(presetOf(presetRule('biweek', '2026-10-28'))).toBe('biweek')
    expect(presetOf({ every: 3, unit: 'day', days: [], end: never })).toBe('custom')
  })
})
