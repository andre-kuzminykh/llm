import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Item, Plan, Rule } from '../model/types'

// тесты запускаются из content-plan/app
export const seedPath = resolve(process.cwd(), 'public/seed.json')
export const loadSeed = (): Plan => JSON.parse(readFileSync(seedPath, 'utf-8'))

const rule = (r: Partial<Rule> & Pick<Rule, 'id' | 'name' | 'rubricId'>): Rule => ({
  channelId: 'dataist',
  channel: 'Dataist',
  what: '',
  format: 'Пост',
  platforms: ['X'],
  days: [true, true, true, true, true, false, true],
  dayNotes: ['', '', '', '', '', '', ''],
  freq: '',
  source: '',
  full: false,
  limit: 1,
  ...r,
})

export const item = (i: Partial<Item> & Pick<Item, 'id' | 'ruleId' | 'title'>): Item => ({
  date: '2026-10-26',
  channelId: 'dataist',
  rubricId: 'demo',
  format: 'Пост',
  platforms: ['X'],
  status: 'planned',
  source: 'исходный план',
  rank: 0,
  ...i,
})

/** Маленький план: Демо по понедельникам с тизером, анонсом и Andre AIT; Тезисы; Landao с 02.11. */
export function smallPlan(): Plan {
  const g = 'full-2026-10-26'
  return {
    version: 2,
    start: '2026-10-25',
    end: '2026-11-30',
    platforms: ['Web', 'YouTube', 'Instagram', 'Telegram', 'X', 'LinkedIn', 'Mail'],
    channels: [
      { id: 'dataist', name: 'Dataist', color: '#1A56B8', start: '2026-10-25', platforms: ['Web', 'YouTube', 'Instagram', 'Telegram', 'X'], sections: [{ id: 'office', name: 'Dataist Office', web: 'Кабинет' }] },
      { id: 'andre', name: 'Andre AIT', color: '#0B7A75', start: '2026-10-25', platforms: ['LinkedIn', 'Mail'], sections: [] },
      { id: 'landao', name: 'Landao', color: '#C2185B', start: '2026-11-02', platforms: ['Telegram'], sections: [] },
    ],
    rubrics: [
      { id: 'demo', name: 'Демо', what: 'Демо продуктов' },
      { id: 'tech', name: 'Технологии', what: '' },
      { id: 'thesis', name: 'Тезисы', what: '' },
      { id: 'updates', name: 'Обновления', what: '' },
    ],
    rules: [
      rule({ id: 'f_demo', rubricId: 'demo', name: 'FULL', format: 'FULL', platforms: ['YouTube'], days: [true, false, false, false, false, false, false], full: true, pattern: 'Демо / {topic}' }),
      rule({ id: 'f_tech', rubricId: 'tech', name: 'FULL', format: 'FULL', platforms: ['YouTube'], days: [false, true, false, false, false, false, false], full: true, pattern: 'Технологии / {topic}' }),
      rule({ id: 'ait', rubricId: 'demo', name: 'Анонс от Andre AIT', channelId: 'andre', platforms: ['LinkedIn', 'Mail'] }),
      rule({ id: 'sh_thesis', rubricId: 'thesis', name: 'Тезис дня', format: 'Shorts', platforms: ['YouTube'], pattern: '{topic}' }),
      rule({ id: 'lan_upd', rubricId: 'updates', name: 'Пост', channelId: 'landao', platforms: ['Telegram'] }),
      rule({ id: 'sh_teaser', rubricId: null, name: 'Тизер FULL', format: 'Shorts', platforms: ['YouTube', 'Instagram'] }),
      rule({ id: 'office', rubricId: null, name: 'Анонс в Кабинете', sectionId: 'office', platforms: ['Web', 'Telegram'] }),
    ],
    items: [
      item({ id: 'demo', ruleId: 'f_demo', title: 'Демо / Стратегия', format: 'FULL', platforms: ['YouTube'], group: g }),
      item({ id: 'teaser', ruleId: 'sh_teaser', title: 'Тизер: Демо / Стратегия', format: 'Shorts', platforms: ['YouTube', 'Instagram'], group: g, derive: 'Тизер: {title}', rank: 60 }),
      item({ id: 'office', ruleId: 'office', sectionId: 'office', title: 'Анонс / Стратегия', platforms: ['Web', 'Telegram'], group: g, derive: 'Анонс / {topic}', rank: 30 }),
      item({ id: 'ait', ruleId: 'ait', channelId: 'andre', title: 'Анонс / Стратегия', platforms: ['LinkedIn', 'Mail'], group: g, derive: 'Анонс / {topic}' }),
      item({ id: 'slot', date: '2026-11-02', ruleId: 'f_demo', title: 'Демо / …', format: 'FULL', platforms: ['YouTube'], group: 'full-2026-11-02', source: 'нужна тема' }),
      item({ id: 'slot-teaser', date: '2026-11-02', ruleId: 'sh_teaser', title: 'Тизер: Демо / …', format: 'Shorts', platforms: ['YouTube', 'Instagram'], group: 'full-2026-11-02', derive: 'Тизер: {title}', rank: 60, source: 'нужна тема' }),
      item({ id: 'slot2', date: '2026-11-09', ruleId: 'f_demo', title: 'Демо / …', format: 'FULL', platforms: ['YouTube'], group: 'full-2026-11-09', source: 'нужна тема' }),
      item({ id: 'thesis', ruleId: 'sh_thesis', rubricId: 'thesis', title: 'Я устал от хайпа вокруг ИИ', format: 'Shorts', platforms: ['YouTube'], rank: 20 }),
      item({ id: 'th-slot', date: '2026-10-27', ruleId: 'sh_thesis', rubricId: 'thesis', title: 'Тезис: …', format: 'Shorts', platforms: ['YouTube'], rank: 20, source: 'нужна тема' }),
    ],
  }
}

export const byId = (plan: Plan, id: string) => plan.items.find((x) => x.id === id)!
