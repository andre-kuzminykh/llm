// План Датаиста для приложения (public/seed.json) — из присланного календаря ../../source/dataist-calendar.html.
// Карточки по датам раскладывает код самой страницы: он запускается как есть, в песочнице node:vm (до хранения правок
// в браузере), — здесь только перевод в формат плана: каналы, рубрики (темы календаря), форматы рубрик в каналах
// (дни недели, время, площадки — как у карточек) и материалы. Запуск: npm run seed
import { readFileSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'

const SRC = new URL('../../source/dataist-calendar.html', import.meta.url)
const OUT = new URL('../public/seed.json', import.meta.url)
export const EXAMPLE = 'dataist-calendar'

// форматы и площадки — как в src/model/types.ts
const FULL_VIDEO = 'Полное горизонтальное видео'
const SHORT_VIDEO = 'Короткое вертикальное видео'
const WEB_PAGE = 'Страница на сайте'
const TEXT_IMAGE = 'Текст с картинкой'
const FORMAT = { short: SHORT_VIDEO, long: FULL_VIDEO, article: WEB_PAGE, post: TEXT_IMAGE }
const FORMAT_SHORT = { [SHORT_VIDEO]: 'Короткое видео', [FULL_VIDEO]: 'Полное видео', [WEB_PAGE]: 'Статья', [TEXT_IMAGE]: 'Текст с картинкой' }
// «YouTube Shorts» календаря — тот же YouTube: что выходит на площадке, говорит тип формата (Shorts)
const PLATFORM = { youtube: 'YouTube', shorts: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', telegram: 'Telegram', linkedin: 'LinkedIn', x: 'X', dataist: 'Web' }
const PLATFORMS = ['Web', 'YouTube', 'Instagram', 'TikTok', 'X', 'Telegram', 'LinkedIn']
const TYPES = {
  [SHORT_VIDEO]: { YouTube: 'Shorts', Instagram: 'Reels', TikTok: 'Видео' },
  [FULL_VIDEO]: { YouTube: 'Видео' },
  [WEB_PAGE]: { Web: 'Статья' },
  [TEXT_IMAGE]: { Telegram: 'Пост', LinkedIn: 'Пост', X: 'Пост' },
}
// цвета — как у каналов в календаре; белая Академия и чёрная Лаборатория — серыми, чтобы карточки читались в обеих темах
const COLORS = { dataist: '#6e7179', live: '#dc3f43', lab: '#48484e', academy: '#a1a1a6', neuron: '#8f5cd3', landao: '#3e9e6b', antropolis: '#4aa5d8' }

// правки владельца поверх календаря (05.11): «Свободное» — канал Датаист Live, выходит ситуативно — без часа, сверху дня
const OWNER = { free: { channel: 'live', allDay: true } }
const channelOf = (c) => c.channel ?? OWNER[c.theme]?.channel ?? null
const allDayOf = (c) => !!OWNER[c.theme]?.allDay

/** Код страницы до хранения правок — в песочнице; наружу — карточки, события, каналы, темы. */
export function runCalendar(html) {
  const json = html.match(/<script id="sourceData" type="application\/json">([\s\S]*?)<\/script>/)?.[1]
  const code = html.match(/<script>\s*'use strict';([\s\S]*?)<\/script>/)?.[1]
  const cut = code?.indexOf('const STORE_KEY=') ?? -1
  if (!json || !code || cut < 0) throw new Error('Не нашёл в странице данные и код календаря')
  const ctx = vm.createContext({ document: { querySelector: (s) => (s === '#sourceData' ? { textContent: json } : null) } })
  vm.runInContext(`${code.slice(0, cut)}\n;globalThis.out={cards:BASE_CARDS,events:EVENTS,channels:CHANNELS,themes:THEME_DEFS,start:iso(START),end:iso(END),channelStart:CHANNEL_START};`, ctx)
  return JSON.parse(JSON.stringify(ctx.out))
}

const weekday = (d) => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7 // Пн = 0
const mode = (xs) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1])[0][0]

/** Название формата рубрики: своя подпись календаря («Новость дня», «Авторские новости»), иначе — формат. */
function ruleName(cards, themeName, format) {
  const labels = new Set(cards.map((c) => c.rubric))
  const only = labels.size === 1 ? [...labels][0] : ''
  const n = only.match(new RegExp(`^${themeName} (\\d+)$`))
  if (n) return `Видео ${n[1]}` // «Обучение 2» → «Обучение · Видео 2»
  if (/^Короткое демо · /.test(cards[0].rubric)) return 'Короткое демо'
  if (!only || only === themeName || themeName.startsWith(only) || only.startsWith(themeName)) return FORMAT_SHORT[format]
  return only
}

function freqOf(cards, days) {
  const dates = new Set(cards.map((c) => c.date))
  if (days.every(Boolean) && dates.size > 300) return 'ежедневно'
  if (dates.size >= 48 && dates.size <= 53) return 'еженедельно'
  if (dates.size >= 10 && dates.size <= 13) return 'ежемесячно'
  return `${dates.size} раз за год`
}

export function buildPlan(cal) {
  const themes = new Map(cal.themes.map((t) => [t.id, t.name]))
  const channelName = new Map(cal.channels.map((c) => [c.id, c.name]))
  // формат рубрики в канале = группа карточек календаря в этом канале
  const groups = new Map()
  for (const c of cal.cards) {
    if (!channelOf(c)) continue // без канала — разовые, в сетку не входят
    const key = `${channelOf(c)}|${c.group}`
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  const rules = []
  const ruleOf = new Map()
  for (const [key, cards] of groups) {
    const [channel, group] = key.split('|')
    const format = FORMAT[cards[0].format]
    const days = [0, 1, 2, 3, 4, 5, 6].map((wd) => cards.some((c) => weekday(c.date) === wd))
    const perDay = cards.reduce((m, c) => m.set(c.date, (m.get(c.date) ?? 0) + 1), new Map())
    const platforms = PLATFORMS.filter((p) => cards[0].platforms.some((x) => PLATFORM[x] === p))
    const rule = {
      id: `dc-${group.replace(/[^a-z0-9-]/gi, '-')}-${channel}`,
      rubricId: cards[0].theme,
      name: ruleName(cards, themes.get(cards[0].theme), format),
      channelId: channel,
      channel: channelName.get(channel),
      what: '',
      format,
      platforms,
      days,
      dayNotes: ['', '', '', '', '', '', ''],
      freq: allDayOf(cards[0]) ? 'ситуативно' : freqOf(cards, days),
      source: 'календарь Датаиста',
      full: false, // длинных видео в день бывает несколько — «один FULL в день» здесь не правило
      limit: Math.max(...perDay.values()),
      time: mode(cards.map((c) => c.time)),
      types: Object.fromEntries(Object.entries(TYPES[format]).filter(([p]) => platforms.includes(p))),
      stream: false,
      ...(allDayOf(cards[0]) ? { allDay: true } : {}),
    }
    rules.push(rule)
    for (const c of cards) ruleOf.set(c.id, rule)
  }
  // события дня — подробности к тематическим и длинным: «Технология: … Связанный кейс: … Авторская мысль: …»
  const events = new Map()
  for (const e of cal.events) events.set(e.date, [...(events.get(e.date) ?? []), e])
  const details = (c) => {
    const special = events.get(c.date) ?? []
    const th = c.id.match(/\|thematic-(\d+)$/)
    if (th) return special.filter((e) => e.kind !== 'education')[+th[1]]?.details ?? ''
    const lg = c.id.match(/\|long-[a-z]+-(\d+)$/)
    if (lg) return special[+lg[1]]?.details ?? ''
    return ''
  }
  const items = cal.cards.map((c) => {
    const rule = ruleOf.get(c.id)
    const format = FORMAT[c.format]
    const title = [c.title, c.context].filter(Boolean).join(' · ') || '…'
    // подпись календаря, которой нет в рубрике и формате: «Короткое демо · Management» — отдел дня
    const note = [rule && c.rubric.startsWith(`${rule.name} · `) ? c.rubric : '', details(c)].filter(Boolean).join('\n')
    const it = {
      id: `dc-${c.id.replace('|', '-')}`,
      date: c.date,
      channelId: channelOf(c) ?? '',
      ruleId: rule?.id ?? '',
      rubricId: c.theme,
      title,
      format,
      platforms: PLATFORMS.filter((p) => c.platforms.some((x) => PLATFORM[x] === p)),
      status: 'planned',
      source: 'календарь Датаиста',
      rank: 50,
    }
    if (allDayOf(c)) it.allDay = true // ситуативно: без часа, сверху дня
    else if (!rule || c.time !== rule.time) it.time = c.time
    if (!rule) it.offGrid = true // без канала — разовый, как созданный в форме
    if (note) it.note = note
    return it
  })
  // одна тема в одном формате в один день — разные материалы (четыре видео Академии): каждому своя карточка;
  // та же тема в другом формате (короткое и пост лайфстайла) — одна карточка, как у программы заведено
  const same = new Map()
  for (const it of items) {
    const k = [it.date, it.channelId, it.rubricId, it.title, it.format].join('|')
    same.set(k, [...(same.get(k) ?? []), it])
  }
  for (const list of same.values()) if (list.length > 1 && list[0].title !== '…') for (const it of list) it.group = `g~${it.id}`
  const channels = cal.channels.map((c) => ({
    id: c.id,
    name: c.name,
    color: COLORS[c.id] ?? '#8e8e93',
    start: cal.channelStart[c.id] ?? cal.start,
    platforms: PLATFORMS.filter((p) => rules.some((r) => r.channelId === c.id && r.platforms.includes(p))),
    sections: [],
  }))
  const rubrics = cal.themes.filter((t) => cal.cards.some((c) => c.theme === t.id)).map((t) => ({ id: t.id, name: t.name, what: '' }))
  return { version: 3, example: EXAMPLE, start: cal.start, end: cal.end, platforms: PLATFORMS, channels, rubrics, rules, items }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const plan = buildPlan(runCalendar(readFileSync(SRC, 'utf-8')))
  writeFileSync(OUT, JSON.stringify(plan))
  console.log(`public/seed.json: ${plan.channels.length} каналов, ${plan.rubrics.length} рубрик, ${plan.rules.length} форматов, ${plan.items.length} материалов, ${plan.start} … ${plan.end}`)
}
