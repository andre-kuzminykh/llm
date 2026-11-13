import { loadDataist } from '../test/fixtures'
import { cycleWeek, emptySlot, extendSchedule, HORIZON, scheduleLines, scheduleRule, syncSchedule, unscheduleRule, whenText } from './schedule'
import { addDays } from './dates'
import type { Plan } from './types'

const seed = loadDataist()
const slots = (p: Plan, ruleId: string, from = '2026-11-15', to = '2026-12-31') =>
  p.items.filter((it) => it.ruleId === ruleId && it.date! >= from && it.date! <= to).map((it) => it.date).sort()

describe('T-CP-075 FR-CP-075 расписание: рубрики по дням, неделям цикла и времени — навсегда, пока не убрали', () => {
  it('неделя цикла: I — с воскресенья 15 ноября, через 4 недели — снова I; до начала — тоже по кругу', () => {
    expect(['2026-11-15', '2026-11-21', '2026-11-22', '2026-11-29', '2026-12-06', '2026-12-13', '2026-11-14'].map((d) => cycleWeek(seed, d))).toEqual([1, 1, 2, 3, 4, 1, 4])
  })

  it('«когда» словами: каждый день, Пн–Пт, день и неделя цикла', () => {
    const rule = (id: string) => seed.rules.find((r) => r.id === id)!
    expect([rule('lab-short-research-0900'), rule('academy-short-microlesson-1700'), rule('lab-long-review-1000'), rule('academy-long-lecture-1800'), rule('office-long-technology-1000')].map(whenText)).toEqual([
      'каждый день',
      'Пн–Пт',
      'Пн · I неделя',
      'Ср · I и III недели',
      'Вт',
    ])
  })

  it('поправили время — слоты идут за правилом; поменяли дни — пустые слоты с сегодня по новым дням, вписанное остаётся', () => {
    const today = '2026-11-20'
    const r = seed.rules.find((x) => x.id === 'office-long-technology-1000')!
    // до правки: вторники
    expect(slots(seed, r.id)).toEqual(['2026-11-17', '2026-11-24', '2026-12-01', '2026-12-08', '2026-12-15', '2026-12-22', '2026-12-29'])
    // 24-го вписали тему — это уже материал
    const filled = { ...seed, items: seed.items.map((it) => (it.id === `s-${r.id}-2026-11-24` ? { ...it, title: 'Агенты в продажах' } : it)) }
    const next = scheduleRule(filled, { ...r, days: [false, false, true, false, false, false, false], time: '11:30' }, today)
    expect(next.rules.find((x) => x.id === r.id)?.time).toBe('11:30')
    // прошлое (17-е) — как было; с сегодня — среды; вписанное 24-го осталось
    expect(slots(next, r.id)).toEqual(['2026-11-17', '2026-11-24', '2026-11-25', '2026-12-02', '2026-12-09', '2026-12-16', '2026-12-23', '2026-12-30'])
    expect(next.items.find((it) => it.id === `s-${r.id}-2026-11-24`)?.title).toBe('Агенты в продажах')
  })

  it('неделя цикла: Обзор только в I неделю; отметили и III — слоты и там', () => {
    const r = seed.rules.find((x) => x.id === 'lab-long-review-1000')!
    expect(slots(seed, r.id, '2026-11-15', '2027-01-31')).toEqual(['2026-11-16', '2026-12-14', '2027-01-11'])
    const next = scheduleRule(seed, { ...r, weeks: [1, 3] }, '2026-11-15')
    expect(slots(next, r.id, '2026-11-15', '2027-01-31')).toEqual(['2026-11-16', '2026-11-30', '2026-12-14', '2026-12-28', '2027-01-11', '2027-01-25'])
  })

  it('новая рубрика в расписание — слоты с сегодня на весь план; убрали — пустые слоты с сегодня сняты, вписанное — разовым', () => {
    const base = seed.rules.find((x) => x.id === 'neuron-long-case-1800')!
    const added = scheduleRule(seed, { ...base, id: 'neuron-long-podcast-1900', rubricId: 'case', time: '19:00', days: [false, false, false, false, false, true, false] }, '2026-11-20')
    const sat = slots(added, 'neuron-long-podcast-1900', '2026-11-15', '2026-12-31')
    expect(sat[0]).toBe('2026-11-21')
    expect(sat.length).toBe(6)
    expect(added.items.filter((it) => it.ruleId === 'neuron-long-podcast-1900').at(-1)?.date! <= added.end).toBe(true)
    // вписали тему на 28-е и убрали рубрику из расписания
    const withTopic = { ...added, items: added.items.map((it) => (it.id === 's-neuron-long-podcast-1900-2026-11-28' ? { ...it, title: 'Как мы считаем ROI' } : it)) }
    const removed = unscheduleRule(withTopic, 'neuron-long-podcast-1900', '2026-11-25')
    expect(removed.rules.some((r) => r.id === 'neuron-long-podcast-1900')).toBe(false)
    const left = removed.items.filter((it) => it.id.startsWith('s-neuron-long-podcast-1900-'))
    expect(left.map((it) => `${it.date} ${it.title} ${it.ruleId || '—'} ${it.offGrid ?? ''}`)).toEqual(['2026-11-21 … — true', '2026-11-28 Как мы считаем ROI — true'])
  })

  it('навсегда: прошло время — план сам дописывает слоты на год вперёд от сегодня; план без расписания не трогается', () => {
    const later = '2027-06-01'
    const ext = extendSchedule(seed, later)
    expect(ext.end).toBe(addDays(later, HORIZON))
    expect(slots(ext, 'lab-short-research-0900', '2027-11-15', '2027-11-20')).toEqual(['2027-11-15', '2027-11-16', '2027-11-17', '2027-11-18', '2027-11-19', '2027-11-20'])
    expect(extendSchedule(seed, '2026-11-13')).toBe(seed) // год вперёд уже стоит
    const plain: Plan = { ...seed, rules: seed.rules.map(({ scheduled: _s, ...r }) => r), items: [] }
    expect(extendSchedule(plain, later)).toBe(plain)
  })

  it('синхронизация не плодит дубли и не трогает вписанное; пустой слот — без темы, заметки, файлов и черновика', () => {
    expect(syncSchedule(seed, seed.start, seed.end)).toBe(seed)
    const it0 = seed.items[0]
    expect([emptySlot(it0), emptySlot({ ...it0, note: 'идея' }), emptySlot({ ...it0, draft: { text: 'x', version: 1, at: '' } }), emptySlot({ ...it0, title: 'Тема' })]).toEqual([true, false, false, false])
  })

  it('строки расписания — канал → категория → рубрики по времени, как таблица', () => {
    const lab = scheduleLines(seed)[0]
    expect(lab.channel.name).toBe('Лаборатория Датаиста')
    expect(lab.categories.map((c) => `${c.label}: ${c.rules.map((r) => `${r.time} ${seed.rubrics.find((x) => x.id === r.rubricId)?.name}`).join(', ')}`)).toEqual([
      'Длинное видео: 10:00 Обзор, 10:00 Разработка',
      'Короткое видео: 09:00 Исследование, 10:00 Обзор, 10:00 Разработка',
      'Блог: 09:00 Исследование',
      'Пост: 09:00 Исследование',
    ])
  })
})
