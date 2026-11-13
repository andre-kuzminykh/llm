// План Датаиста (public/seed.json) — из таблицы владельца ../../source/schedule.csv: каналы × категории (длинное видео,
// короткое, блог/статья, пост) × дни недели 4-недельного цикла (I–IV, неделя I — с воскресенья 15 ноября 2026), в ячейке —
// «10:00 Технологии». Каждая рубрика со временем — формат рубрики в расписании (scheduled), слоты «Нужна тема» — на год
// вперёд; дальше программа продлевает их сама (src/model/schedule.ts). Контента нет — тему, заметку и файлы вписывают люди.
// Запуск: npm run seed
import { readFileSync, writeFileSync } from 'node:fs'

const SRC = new URL('../../source/schedule.csv', import.meta.url)
const OUT = new URL('../public/seed.json', import.meta.url)
// метка плана — как DATAIST_EXAMPLE в src/model/types.ts: сохранённый план с другой меткой программа сменит на этот
export const EXAMPLE = 'dataist-schedule-1'
export const START = '2026-11-15' // неделя I
export const END = '2027-11-14' // год вперёд; дальше — программа

// форматы — как в src/model/types.ts
const FULL_VIDEO = 'Полное горизонтальное видео'
const SHORT_VIDEO = 'Короткое вертикальное видео'
const WEB_PAGE = 'Страница на сайте'
const TEXT_IMAGE = 'Текст с картинкой'
const CATEGORY = { 'длинное видео': FULL_VIDEO, 'короткое видео': SHORT_VIDEO, блог: WEB_PAGE, статья: WEB_PAGE, пост: TEXT_IMAGE }
const FORMAT_KEY = { [FULL_VIDEO]: 'long', [SHORT_VIDEO]: 'short', [WEB_PAGE]: 'blog', [TEXT_IMAGE]: 'post' }
// название формата рубрики — общее: подпись карточки — рубрика, формат словами — внизу карточки
const FORMAT_SHORT = { [FULL_VIDEO]: 'Полное видео', [SHORT_VIDEO]: 'Короткое видео', [WEB_PAGE]: 'Страница на сайте', [TEXT_IMAGE]: 'Текст с картинкой' }
// где формат выходит по умолчанию — площадки потом расставляют сами
const PLATFORMS = { [FULL_VIDEO]: ['YouTube'], [SHORT_VIDEO]: ['YouTube', 'Instagram', 'TikTok'], [WEB_PAGE]: ['Web'], [TEXT_IMAGE]: ['X', 'Telegram', 'LinkedIn'] }
const TYPES = {
  [SHORT_VIDEO]: { YouTube: 'Shorts', Instagram: 'Reels', TikTok: 'Видео' },
  [FULL_VIDEO]: { YouTube: 'Видео' },
  [WEB_PAGE]: { Web: 'Статья' },
  [TEXT_IMAGE]: { Telegram: 'Пост', LinkedIn: 'Пост', X: 'Пост' },
}
const ALL_PLATFORMS = ['Web', 'YouTube', 'Instagram', 'TikTok', 'X', 'Telegram', 'LinkedIn']
// каналы — как в таблице: Датаист Медиа (Лаба, Академия, Офис, Live), Нейроний, Ландао, Антрополис
const CHANNELS = [
  { key: 'Датаист|Лаба', id: 'lab', name: 'Лаборатория Датаиста', color: '#48484e' },
  { key: 'Датаист|Академия', id: 'academy', name: 'Академия Датаиста', color: '#a1a1a6' },
  { key: 'Датаист|Офис', id: 'office', name: 'Офис Датаиста', color: '#6e7179' },
  { key: 'Датаист|Live', id: 'live', name: 'Датаист Live', color: '#dc3f43' },
  { key: 'Нейроний|', id: 'neuron', name: 'Нейроний', color: '#8f5cd3' },
  { key: 'Ландао|', id: 'landao', name: 'Ландао', color: '#3e9e6b' },
  { key: 'Антрополис|', id: 'antropolis', name: 'Антрополис', color: '#4aa5d8' },
]
// id рубрик — латиницей, по названию из таблицы; новая рубрика без своего id — «r-<n>»
const RUBRIC_ID = {
  Исследование: 'research', Обзор: 'review', Разработка: 'development', Лекция: 'lecture', Микроурок: 'microlesson',
  Инструкция: 'howto', Советы: 'tips', Анонс: 'announce', Технологии: 'technology', Кейсы: 'cases', Мысли: 'thoughts',
  'ИИ-трансформация': 'ai-transformation', Новости: 'news', Live: 'live', Мнение: 'opinion', Дайджест: 'digest', Кейс: 'case',
  Бизнесхак: 'bizhack', Вэйв: 'wave', Флоу: 'flow',
}
const WEEKDAY = { Пн: 0, Вт: 1, Ср: 2, Чт: 3, Пт: 4, Сб: 5, Вс: 6 }
const WEEK = { I: 1, II: 2, III: 3, IV: 4 }

/** CSV с кавычками и переносами строк в ячейках. */
export function parseCSV(text) {
  const rows = [[]]
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') rows.at(-1).push(cell), (cell = '')
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      rows.at(-1).push(cell)
      cell = ''
      rows.push([])
    } else cell += ch
  }
  rows.at(-1).push(cell)
  return rows.filter((r) => r.some((c) => c.trim()))
}

const clean = (s) => s.replace(/\s+/g, ' ').trim()
const hhmm = (t) => t.padStart(5, '0')

/** Таблица → расписание: строки «канал | категория | рубрика | время» с днями недели и неделями цикла. */
export function readSchedule(text) {
  const [h1, h2, h3, ...body] = parseCSV(text)
  const cols = []
  let group = ''
  let sub = ''
  for (let i = 0; i < h3.length; i++) {
    if (clean(h1[i] ?? '')) group = clean(h1[i])
    if (clean(h2[i] ?? '')) sub = clean(h2[i])
    const format = CATEGORY[clean(h3[i] ?? '').toLowerCase()]
    if (!format) continue
    const channel = CHANNELS.find((c) => c.key === `${group}|${group === 'Датаист' ? sub : ''}`)
    if (!channel) throw new Error(`Не знаю канал «${group} ${sub}» в колонке ${i + 1}`)
    cols[i] = { channel, format }
  }
  const lines = new Map()
  let week = 0
  for (const row of body) {
    if (clean(row[0] ?? '')) week = WEEK[clean(row[0])]
    const wd = WEEKDAY[clean(row[1] ?? '')]
    if (!week || wd === undefined) throw new Error(`Строка без недели или дня: ${row.slice(0, 2).join(' ')}`)
    row.forEach((cell, i) => {
      if (!cols[i]) return
      for (const part of cell.split('\n').map(clean).filter(Boolean)) {
        const m = part.match(/^(\d{1,2}:\d{2})\s+(.+)$/)
        if (!m) throw new Error(`Не разобрал «${part}»: нужно «10:00 Рубрика»`)
        const key = [cols[i].channel.id, cols[i].format, m[2], hhmm(m[1])].join('|')
        const line = lines.get(key) ?? { channel: cols[i].channel, format: cols[i].format, rubric: m[2], time: hhmm(m[1]), cells: [] }
        line.cells.push({ week, wd })
        lines.set(key, line)
      }
    })
  }
  return [...lines.values()]
}

/** Дни и недели строки расписания: дни — где выходит, недели — если не каждую (Обзор — только в I неделю). */
function when(line) {
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => line.cells.some((c) => c.wd === d))
  const weeks = [1, 2, 3, 4].filter((w) => line.cells.some((c) => c.week === w))
  // в таблице у строки по каждой неделе — те же дни: иначе это две разные строки расписания
  for (const w of weeks) for (let d = 0; d < 7; d++) if (days[d] !== line.cells.some((c) => c.week === w && c.wd === d)) throw new Error(`«${line.rubric}» ${line.time}: в неделях разные дни`)
  return { days, weeks: weeks.length < 4 ? weeks : undefined }
}

const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const weekday = (d) => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7

export function buildPlan(text) {
  const lines = readSchedule(text)
  const rubricNames = [...new Set(lines.map((l) => l.rubric))]
  const rubrics = rubricNames.map((name, i) => ({ id: RUBRIC_ID[name] ?? `r-${i + 1}`, name, what: '' }))
  const rubricId = new Map(rubrics.map((r) => [r.name, r.id]))
  const rules = lines.map((l) => {
    const { days, weeks } = when(l)
    const platforms = PLATFORMS[l.format]
    return {
      id: `${l.channel.id}-${FORMAT_KEY[l.format]}-${rubricId.get(l.rubric)}-${l.time.replace(':', '')}`,
      rubricId: rubricId.get(l.rubric),
      name: FORMAT_SHORT[l.format],
      channelId: l.channel.id,
      channel: l.channel.name,
      what: '',
      format: l.format,
      platforms,
      days,
      dayNotes: ['', '', '', '', '', '', ''],
      freq: 'по расписанию',
      source: 'расписание',
      full: false,
      limit: 1,
      time: l.time,
      types: Object.fromEntries(Object.entries(TYPES[l.format]).filter(([p]) => platforms.includes(p))),
      stream: false,
      scheduled: true,
      ...(weeks ? { weeks } : {}),
    }
  })
  // слоты — как syncSchedule в src/model/schedule.ts: день за днём, правила по порядку
  const items = []
  for (let d = START; d <= END; d = addDays(d, 1)) {
    const week = (Math.floor((Date.parse(d) - Date.parse(START)) / 864e5 / 7) % 4) + 1
    for (const r of rules) {
      if (!r.days[weekday(d)] || (r.weeks && !r.weeks.includes(week))) continue
      items.push({ id: `s-${r.id}-${d}`, date: d, channelId: r.channelId, ruleId: r.id, rubricId: r.rubricId, title: '…', format: r.format, platforms: r.platforms, status: 'planned', source: 'расписание', rank: 50 })
    }
  }
  const channels = CHANNELS.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    start: START,
    platforms: ALL_PLATFORMS.filter((p) => rules.some((r) => r.channelId === c.id && r.platforms.includes(p))),
    sections: [],
  }))
  return { version: 3, example: EXAMPLE, cycleStart: START, start: START, end: END, platforms: ALL_PLATFORMS, channels, rubrics, rules, items }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const plan = buildPlan(readFileSync(SRC, 'utf-8'))
  writeFileSync(OUT, JSON.stringify(plan))
  console.log(`public/seed.json: ${plan.channels.length} каналов, ${plan.rubrics.length} рубрик, ${plan.rules.length} строк расписания, ${plan.items.length} слотов, ${plan.start} … ${plan.end}`)
}
