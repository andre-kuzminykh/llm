// T-CP-E1: реальный браузер против собранного приложения (npm run build && npm run preview).
// Проверяет оболочку Neuronium (отделы, фильтры слева — сворачиваются, вид календаря с иконками справа от поиска,
// дашборд — значок в углу и панель справа, поиск вверху),
// неделю по времени из nr_management (перенос указателем на час и день, край, лист рукой, «Поменять местами»),
// дорожки и перенос в них, панель дня, ▶ и задачу, черновики во вкладке «+», периодичность хэштега и планирование недели,
// хэштег с подсказками, «+» с версией по триггеру, «Как пользоваться», тёмную тему, сохранение и телефон.
// Скриншоты — в e2e/shots (или в $SHOTS).
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5174/'
const SHOTS = process.env.SHOTS ?? new URL('./shots/', import.meta.url).pathname
const CHROME = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
mkdirSync(SHOTS, { recursive: true })

const fail = (msg) => {
  console.error(`✗ ${msg}`)
  process.exitCode = 1
}
const ok = (msg) => console.log(`✓ ${msg}`)
const check = (cond, yes, no) => (cond ? ok(yes) : fail(no))

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => fail(`ошибка на странице: ${e.message}`))
const cell = (d) => page.locator(`.cp-tg__col[data-date="${d}"]`)
const toast = () => page.getByRole('status').filter({ has: page.locator('.cp-toast__msg') })
const top = page.locator('.cp-top')
const side = page.getByRole('complementary', { name: 'Фильтры' })
const jump = async (d) => {
  await page.getByLabel('Перейти к дате').fill(d)
  await page.waitForTimeout(900) // плавная прокрутка
}
const dragBy = async (loc, dx, dy) => {
  const b = await loc.boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + 8)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + 8 + dy, { steps: 10 })
  await page.mouse.up()
}

// оболочка: календарь сразу, слева — отделы и фильтры, справа вверху — поиск, вид календаря и дашборд
await page.goto(BASE)
await page.getByRole('grid', { name: 'Неделя по времени' }).waitFor()
const nav = page.getByRole('navigation', { name: 'Отделы' })
check(
  (await nav.getByRole('button', { name: 'SMM — контент-план' }).getAttribute('aria-current')) === 'page' && (await nav.getByRole('button', { name: /— скоро$/ }).count()) === 9,
  'слева — десять отделов Neuronium, открыт SMM',
  'панель отделов не та',
)
const modes = top.getByRole('radiogroup', { name: 'Вид календаря' })
check(
  (await modes.getByRole('radio').allTextContents()).join('|') === 'Время|Каналы|Площадки|Темы' && (await modes.locator('svg').count()) === 4,
  'вид календаря — Время, Каналы, Площадки, Темы с иконками',
  'нет вида календаря с иконками',
)
const placed = () =>
  page.evaluate(() => {
    const x = (sel) => document.querySelector(`.cp-top ${sel}`)?.getBoundingClientRect()
    const [t, l, m, s, v, d] = [x(''), x('.cp-top__left'), x('.cp-top__mid'), x('[role="search"]'), x('[aria-label="Вид календаря"]'), x('[aria-label="Дашборд"]')]
    return {
      // посередине шапки — или, если слева тесно, с отступом от даты; между поиском и видом — заметный промежуток; дашборд — в углу
      ok: m && s && v && d && (Math.abs(m.left + m.width / 2 - (t.left + t.width / 2)) < 30 || m.left - l.right >= 24) && v.left - s.right >= 20 && Math.abs(s.top - v.top) < 12 && d.right > window.innerWidth - 40,
      off: Math.round(m.left + m.width / 2 - (t.left + t.width / 2)),
    }
  })
check((await placed()).ok, 'поиск и вид — посередине шапки, между ними промежуток; в углу — дашборд, в одну строку', 'поиск, вид и дашборд стоят не так')
const bw = await modes.getByRole('radio', { checked: true }).evaluate((el) => {
  const c = getComputedStyle(el)
  const lum = (rgb) => rgb.match(/\d+/g).slice(0, 3).reduce((a, b) => a + Number(b), 0) / 3
  return Math.abs(lum(c.backgroundColor) - lum(c.color)) > 200
})
check(bw, 'выбранный вид — чёрно-белый', 'выбранный вид не чёрно-белый')
// на белом карточку видно: она залита цветом канала, а не только тонкой линией
const tint = await page.locator('.cp-tg .cp-card').first().evaluate((el) => {
  const c = getComputedStyle(el)
  // color-mix браузер отдаёт как color(srgb 0.94 0.90 0.97) — доли, а не 0–255
  const k = c.backgroundColor.startsWith('color(') ? 255 : 1
  const [r, g, b] = c.backgroundColor.match(/[\d.]+/g).slice(0, 3).map((v) => Number(v) * k)
  return { spread: Math.max(r, g, b) - Math.min(r, g, b), stripe: parseFloat(c.borderLeftWidth) }
})
check(tint.spread >= 10 && tint.stripe >= 3, 'карточки залиты цветом канала, полоска 3px — на белом видно', `карточка почти белая: ${JSON.stringify(tint)}`)
check(
  !(await top.getByRole('radio', { name: 'Месяц' }).count()) && !(await page.getByRole('radiogroup', { name: /Сколько дней/ }).count()) && !(await page.getByRole('group', { name: 'Лента дней' }).count()),
  'нет «Месяца», «День · 3 дня · Неделя» и ленты дней',
  'остались месяц, окна дней или лента дней',
)
check(!(await top.getByRole('button', { name: /Отменить/ }).count()), 'в шапке нет кнопки «Отменить»', 'кнопка «Отменить» в шапке')
check(!(await side.getByText('Банк идей').count()), 'в фильтрах нет банка идей', 'банк идей в фильтрах')
check(await top.getByRole('searchbox', { name: 'Поиск по плану' }).count(), 'поиск — вверху', 'нет поиска в шапке')
await page.screenshot({ path: `${SHOTS}/1-week.png` })
// фильтры сворачиваются и разворачиваются; свёрнутые — метками в шапке; помнится после перезагрузки
await side.getByRole('button', { name: 'Neuronium', exact: true }).click()
await side.getByRole('button', { name: 'Свернуть фильтры' }).click()
const colW = (await page.locator('.cp-tg__col').first().boundingBox()).width
check(
  !(await side.count()) && (await top.getByRole('button', { name: 'Снять фильтр: Без Neuronium' }).count()) && (await top.locator('.cp-top__badge').textContent()) === '1',
  'фильтры сворачиваются; включённые — меткой и числом на кнопке',
  'фильтры не свернулись или не видно, что включено',
)
await page.screenshot({ path: `${SHOTS}/1b-collapsed.png` })
const centered = await placed()
check(Math.abs(centered.off) < 30, 'фильтры свёрнуты — поиск и вид ровно посередине', `середина смещена на ${centered.off} px`)
await page.reload()
await page.getByRole('grid', { name: 'Неделя по времени' }).waitFor()
check(!(await side.count()), 'свёрнутые фильтры помнятся после перезагрузки', 'фильтры снова развернулись')
await top.getByRole('button', { name: 'Фильтры' }).click()
await side.waitFor()
const colW2 = (await page.locator('.cp-tg__col').first().boundingBox()).width
check(colW > colW2, `без фильтров дни шире: ${Math.round(colW)} px против ${Math.round(colW2)} px`, 'ширина дней не поменялась')
await side.getByRole('button', { name: 'Сбросить' }).click()

// неделя по времени — календарь из nr_management: карточку берут и ведут указателем, тянут за край, лист тянут рукой
await jump('2026-11-09')
await page.screenshot({ path: `${SHOTS}/6-week.png` })
const sheet = page.locator('.cp-body')
const scrolled = await sheet.evaluate((el) => el.scrollTop)
check(scrolled > 0 && Math.round(scrolled) % 64 === 32, 'шкала открыта за полчаса до часа первого материала недели', `шкала прокручена на ${scrolled}px`)
const col = page.locator('.cp-tg__col[data-date="2026-11-10"]')
const thesis = col.locator('.cp-card', { hasText: 'Тезисы' }).first()
const box = await col.boundingBox()
const clock = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const [h0, m0] = (await thesis.locator('.cp-card__time').textContent()).split(':').map(Number)
const later = clock(h0 * 60 + m0 + 120)
const tb = await thesis.boundingBox()
await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2)
await page.mouse.down()
await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2 + 2 * 64, { steps: 10 })
check(
  await col.locator('.cp-card--lifted .cp-card__time', { hasText: later }).count(),
  'карточка едет за указателем по 15 минутам, на ней — время, куда встанет',
  'на переносимой карточке нет нового времени',
)
const tipText = (await page.locator('.cp-drag-hint').textContent()) ?? ''
check(tipText.startsWith(`Вт, 10 ноя · ${later}`), `подсказка у указателя словами: «${tipText}»`, `нет подсказки при переносе: «${tipText}»`)
await page.mouse.up()
check(!(await page.locator('.cp-drag-hint').count()), 'отпустили — подсказка ушла', 'подсказка осталась')
const moved = new RegExp(`^Тезисы · Тезис дня: .*, ${later}`)
check(await col.getByRole('button', { name: moved }).count(), 'перенос на другой час указателем', 'время не поменялось')
check(!(await page.getByRole('complementary', { name: 'Материал' }).count()), 'после переноса карточка не открывается', 'перенос открыл форму')
// на другой день — колонка под указателем
const mb = await col.getByRole('button', { name: moved }).boundingBox()
await page.mouse.move(mb.x + mb.width / 2, mb.y + 6)
await page.mouse.down()
await page.mouse.move(mb.x + mb.width / 2 + box.width, mb.y + 6, { steps: 10 })
await page.mouse.up()
const next = page.locator('.cp-tg__col[data-date="2026-11-11"]')
check(await next.getByRole('button', { name: moved }).count(), 'перенос на другой день указателем', 'карточка не переехала на другой день')
await page.keyboard.press('Control+z')
await page.keyboard.press('Control+z')
check(await col.getByRole('button', { name: /^Тезисы · Тезис дня: / }).count(), 'отмена вернула перенос', 'отмена не вернула')
// нижний край — длительность по 15 минутам
const grip = col.locator('.cp-card', { hasText: 'Тезисы' }).first().locator('.cp-tg__grip')
const gb = await grip.boundingBox()
await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2)
await page.mouse.down()
await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2 + 64, { steps: 8 })
await page.mouse.up()
const range = await col.locator('.cp-card', { hasText: 'Тезисы' }).first().locator('.cp-card__time').textContent()
check(range === `${clock(h0 * 60 + m0)}–${clock(h0 * 60 + m0 + 120)}`, 'нижний край тянут — карточка длиннее, «начало–конец»', `после растягивания: ${range}`)
await page.keyboard.press('Control+z')
// пустой лист — рукой в обе стороны (правый край колонки свободен от карточек)
const sb = await sheet.boundingBox()
const before = await sheet.evaluate((el) => [el.scrollLeft, el.scrollTop])
await page.mouse.move(box.x + box.width - 2, sb.y + sb.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width - 152, sb.y + sb.height / 2 - 60, { steps: 8 })
await page.mouse.up()
const after = await sheet.evaluate((el) => [el.scrollLeft, el.scrollTop])
check(after[0] - before[0] > 100 && after[1] - before[1] > 40, 'пустой лист тянут рукой в обе стороны', `лист не тянется: ${before} → ${after}`)
const sideBySide = await page.evaluate(() =>
  [...document.querySelectorAll('.cp-tg__col')].some((c) => {
    // вторая колонка группы пересечений — карточка не с левого края
    return [...c.querySelectorAll(':scope > .cp-card')].some((x) => parseFloat(x.style.left) > 4)
  }),
)
check(sideBySide && !(await page.locator('.cp-more').count()), 'совпавшие по времени — рядом, все видны, без «+N»', 'совпавшие спрятаны или наложены')
// лента Neuronium — поток 24/7: строкой над шкалой, без времени; авто-публикации видны по умолчанию и скрываются фильтром слева
const allday = page.getByLabel('Круглосуточно, 2026-11-10')
check(
  (await allday.getByRole('button', { name: /^Новости: Все новости, 24\/7/ }).count()) && !(await col.getByRole('button', { name: /Все новости/ }).count()),
  'лента Neuronium — «24/7» над шкалой, не в часах',
  'лента Neuronium стоит на шкале времени',
)
await side.getByRole('switch', { name: 'Ежедневные авто-публикации' }).click()
check(!(await allday.count()), 'фильтр слева скрывает авто-публикации', 'авто-публикации не скрылись')
await side.getByRole('switch', { name: 'Ежедневные авто-публикации' }).click()
check(box && box.width > 120, 'неделя по ширине экрана', 'колонки дней узкие')

// перенос FULL «Демо: Landao» со 2.11 на 3.11, где уже стоит FULL «Кейсы: Сбер»: группа едет вместе,
// нарушение одно, а «Поменять местами» ставит Сбер на 2.11
await jump('2026-11-02')
const landao = cell('2026-11-02').locator('.cp-card--main', { hasText: 'Landao' }).first()
const lnd = await landao.boundingBox()
await page.mouse.move(lnd.x + lnd.width / 2, lnd.y + 8)
await page.mouse.down()
await page.mouse.move(lnd.x + lnd.width / 2 + (await cell('2026-11-02').boundingBox()).width, lnd.y + 8, { steps: 10 })
const fullTip = (await page.locator('.cp-drag-hint').textContent()) ?? ''
check(
  fullTip.includes('Вместе с группой') && fullTip.includes('Здесь уже FULL') && fullTip.includes('Сбер') && fullTip.includes('можно поменять местами'),
  'подсказка до переноса: что едет с FULL и что здесь уже FULL',
  `подсказка FULL: «${fullTip}»`,
)
await page.screenshot({ path: `${SHOTS}/2a-hint.png` })
await page.mouse.up()
check(await cell('2026-11-03').locator('.cp-card--main', { hasText: 'Landao' }).count(), 'FULL — на другой день указателем', 'FULL не переехал')
await toast().filter({ hasText: 'вместе с группой' }).waitFor()
const viol = page.locator('.cp-tg__day').filter({ has: page.getByRole('button', { name: 'Открыть день 2026-11-03' }) }).locator('.cp-viol')
check((await viol.getAttribute('title')) === 'Нарушений: 1', 'два FULL в день — одно нарушение, а не шесть', `после переноса: ${await viol.getAttribute('title')}`)
await page.screenshot({ path: `${SHOTS}/2-moved.png` })
await toast().getByRole('button', { name: 'Поменять местами' }).click()
check(
  (await cell('2026-11-02').locator('.cp-card--main', { hasText: 'Сбер' }).count()) && (await cell('2026-11-03').locator('.cp-card--main', { hasText: 'Landao' }).count()),
  '«Поменять местами»',
  'FULL не поменялись местами',
)
await page.keyboard.press('Control+z')
await page.keyboard.press('Control+z')
check(await cell('2026-11-02').locator('.cp-card--main', { hasText: 'Landao' }).count(), 'отмена вернула', 'отмена не сработала')

// несколько карточек: Shift-щелчок выбирает, перенос выбранной везёт все на тот же сдвиг, Esc снимает
const pick1 = cell('2026-11-02').locator('.cp-card', { hasText: 'Тезисы' }).first()
const pick2 = cell('2026-11-03').locator('.cp-card', { hasText: 'Тезисы' }).first()
const [t1, t2] = [await pick1.locator('.cp-card__title').textContent(), await pick2.locator('.cp-card__title').textContent()]
await pick1.locator('.cp-card__open').click({ modifiers: ['Shift'] })
await pick2.locator('.cp-card__open').click({ modifiers: ['Shift'] })
const selbar = page.getByRole('toolbar', { name: 'Выбранные карточки' })
check(
  (await selbar.textContent())?.includes('Выбрано: 2') && !(await page.getByRole('complementary', { name: 'Материал' }).count()) && (await page.locator('.cp-card--picked').count()) === 2,
  'Shift-щелчок выбирает карточки, а не открывает; внизу — «Выбрано: 2»',
  'выбор нескольких карточек не работает',
)
await page.screenshot({ path: `${SHOTS}/2b-selected.png` })
const p1 = await pick1.boundingBox()
await page.mouse.move(p1.x + p1.width / 2, p1.y + 8)
await page.mouse.down()
await page.mouse.move(p1.x + p1.width / 2 + 2 * (await cell('2026-11-02').boundingBox()).width, p1.y + 8, { steps: 10 })
const manyTip = (await page.locator('.cp-drag-hint').textContent()) ?? ''
check(manyTip.startsWith('2 карточки · +2 дня') && (await page.locator('.cp-card--lifted').count()) === 2, `выбранные едут вместе, подсказка: «${manyTip.split('\n')[0]}»`, `перенос выбранных: «${manyTip}»`)
await page.mouse.up()
check(
  (await cell('2026-11-04').locator('.cp-card__title', { hasText: t1 }).count()) && (await cell('2026-11-05').locator('.cp-card__title', { hasText: t2 }).count()),
  'обе выбранные переехали на два дня',
  'выбранные не переехали',
)
await page.keyboard.press('Control+z')
check(await cell('2026-11-02').locator('.cp-card__title', { hasText: t1 }).count(), 'перенос выбранных отменяется одним шагом', 'отмена не вернула выбранные')
await page.keyboard.press('Escape')
check(!(await selbar.count()) && !(await page.locator('.cp-card--picked').count()), 'Esc снимает выделение', 'выделение не снялось')

// дорожки по каналам — вид выбирается слева; карточку переносят указателем на другой день
await modes.getByRole('radio', { name: 'Каналы' }).click()
await page.getByRole('grid', { name: /Неделя по каналам/ }).waitFor()
await jump('2026-11-09')
await page.screenshot({ path: `${SHOTS}/7-week-lanes.png` })
const laneCard = page.locator('.cp-cell[data-date="2026-11-10"] .cp-card').first()
const lane = await laneCard.evaluate((el) => el.closest('[data-lane]').dataset.lane)
const laneTitle = await laneCard.locator('.cp-card__title').textContent()
const target = page.locator(`.cp-cell[data-date="2026-11-12"][data-lane="${lane}"]`)
const tgt = await target.boundingBox()
const lb = await laneCard.boundingBox()
await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2)
await page.mouse.down()
await page.mouse.move(tgt.x + tgt.width / 2, tgt.y + 10, { steps: 12 })
check(await page.locator('.cp-ghost').count(), 'в дорожках карточка едет за указателем', 'нет карточки под указателем')
check(((await page.locator('.cp-drag-hint').textContent()) ?? '').startsWith('Чт, 12 ноя'), 'в дорожках — та же подсказка словами', 'в дорожках нет подсказки')
await page.mouse.up()
check(await target.locator('.cp-card__title', { hasText: laneTitle }).count(), 'перенос в дорожках указателем', 'в дорожках карточка не переехала')
await page.keyboard.press('Control+z')
await modes.getByRole('radio', { name: 'Время' }).click()
await page.getByRole('grid', { name: 'Неделя по времени' }).waitFor()

// панель дня: карточки по каналам, под площадками — что выходит
await page.getByRole('button', { name: 'Открыть день 2026-11-09' }).click()
const day = page.getByRole('complementary', { name: /9 ноября 2026/ })
await day.waitFor()
await page.waitForTimeout(400) // лист выезжает 320 мс
const full = day.getByRole('button', { name: /^Демо · FULL: Neuronium, 12:00/ })
check((await full.getByText('Тизер · Shorts').count()) && (await full.getByText('Анонс · Офис').count()), 'панель дня: площадки и что на них выходит', 'в карточке нет типов контента')
await page.screenshot({ path: `${SHOTS}/3-day.png` })

// у карточки один значок статуса; ▶ — «в работе» и задача по созданию контента
check(!(await day.getByRole('group', { name: /^Статус/ }).count()), 'панель дня: без ряда кнопок статуса', 'в панели дня остались кнопки статуса')
await day.locator('.cp-card').filter({ has: page.getByRole('button', { name: /^Демо · FULL: Neuronium/ }) }).getByRole('button', { name: 'Начать: Neuronium' }).click()
const task = page.getByRole('complementary', { name: 'Задача' })
await task.waitFor()
await task.getByText(/YouTube — FULL/).click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${SHOTS}/4-task.png` })
check(await task.getByRole('checkbox', { name: /YouTube — FULL/ }).isChecked(), 'галочка части задачи', 'галочка не ставится')
check((await task.getByRole('textbox', { name: 'Тема' }).inputValue()) === 'Neuronium' && (await task.getByRole('button', { name: 'Пн, 9 ноя' }).count()), 'задача: тема заголовком, дата текстом', 'в задаче нет темы или даты текстом')
check(await cell('2026-11-09').getByRole('button', { name: 'Задача: Neuronium (в работе)' }).count(), '▶ открыл задачу, статус на карточке', 'нет статуса на карточке')
await task.getByRole('button', { name: 'Открыть материал' }).click()
const form = page.getByRole('complementary', { name: 'Материал' })
await form.waitFor()
check(!(await form.getByRole('button', { name: 'YouTube' }).count()), 'форма: тема и дата сверху, остальное — в «Подробнее»', 'форма показывает всё сразу')
await form.getByRole('button', { name: 'Подробнее' }).click()
check(await form.getByRole('button', { name: 'YouTube' }).count(), '«Подробнее» раскрывает площадки', 'нет площадок в «Подробнее»')
const fmtSelect = form.getByRole('combobox', { name: /^Формат/ })
check(
  (await fmtSelect.locator('optgroup').evaluateAll((gs) => gs.map((g) => g.label).join('|'))) === 'Видео|Текст' &&
    (await fmtSelect.inputValue()) === 'Полное горизонтальное видео',
  'форма: формат — из четырёх в группах «Видео» и «Текст»; у FULL — полное горизонтальное видео',
  `формат в форме не тот: ${await fmtSelect.inputValue()}`,
)
await page.waitForTimeout(400)
await page.screenshot({ path: `${SHOTS}/5-editor.png` })
await form.getByRole('button', { name: 'Отмена' }).click()
ok('форма материала')
await page.keyboard.press('Escape')


// черновики — банк идей во вкладке «+»: добавить списком
await page.getByRole('button', { name: 'Новый контент' }).click()
await page.getByRole('tab', { name: /^Черновики/ }).click()
const drafts = page.getByRole('complementary', { name: 'Черновики' })
const tags = drafts.getByRole('group', { name: 'Хэштеги черновиков' })
await tags.getByRole('button', { name: /^#технологии/ }).click()
check(await drafts.getByRole('region', { name: 'Черновики: #технологии', exact: true }).count(), 'черновики во вкладке «+»: хэштег — кнопкой', 'хэштеги черновиков не работают')
await drafts.getByLabel('Новые черновики: #технологии', { exact: true }).fill('Агент продаж\nИИ-бухгалтер')
await drafts.getByRole('button', { name: 'Добавить' }).click()
check(await drafts.getByRole('button', { name: 'ИИ-бухгалтер' }).count(), 'черновики добавлены', 'черновики не добавились')
await page.screenshot({ path: `${SHOTS}/9-drafts.png` })
await drafts.getByRole('button', { name: 'Закрыть' }).click()

// дашборд — значок справа вверху, панель справа; периодичность хэштега ставит слоты, за неделю — «уточните темы»
await top.getByRole('button', { name: 'Дашборд' }).click()
const dash = page.getByRole('complementary', { name: 'Дашборд' })
await dash.waitFor()
check((await dash.getByRole('region', { name: 'Что делать' }).count()) && (await page.getByRole('grid', { name: 'Неделя по времени' }).isVisible()), 'дашборд — панелью справа, календарь под ним', 'дашборд не панелью')
await page.screenshot({ path: `${SHOTS}/8-dashboard.png` })
// «Расписание» переворачивает дашборд: каналы → хэштеги → что и когда выходит, время подписью
await dash.getByRole('radio', { name: 'Расписание' }).click()
const schedDataist = dash.getByRole('region', { name: 'Расписание: Офис Датаиста' })
check(
  (await schedDataist.getByRole('group', { name: 'Офис Датаиста: #тезисы' }).getByRole('button').count()) >= 5 &&
    (await dash.getByRole('region', { name: 'Расписание: Лаборатория Датаиста' }).count()) &&
    !(await dash.getByRole('region', { name: 'Что делать' }).count()),
  'дашборд → «Расписание»: каналы, в них хэштеги, по каждому — когда что выходит',
  'нет расписания в дашборде',
)
await page.screenshot({ path: `${SHOTS}/8b-schedule.png` })
// общая тема над несколькими материалами разных форматов: отметить строки → тема → «Темы» показывают их вместе
const thesisRow = schedDataist.getByRole('group', { name: 'Офис Датаиста: #тезисы' }).getByRole('checkbox').first()
const fullRow = schedDataist.getByRole('group', { name: 'Офис Датаиста: #демо' }).getByRole('checkbox').first()
await thesisRow.check()
await fullRow.check()
await dash.getByRole('combobox', { name: 'Общая тема выбранных' }).fill('ИИ-агенты в продажах')
await dash.getByRole('button', { name: 'Поставить тему' }).click()
await dash.getByRole('radio', { name: 'Темы' }).click()
const themeBlock = dash.getByRole('region', { name: 'Тема: ИИ-агенты в продажах' })
const themeFmts = new Set(await themeBlock.locator('.cp-sched__fmt').allTextContents())
check(
  (await themeBlock.getByRole('checkbox').count()) === 2 && themeFmts.has('Полное видео') && themeFmts.has('Короткое видео'),
  'общая тема: у материалов разных форматов одна тема — в «Расписании → Темы» вместе',
  `общая тема не собрала материалы: ${[...themeFmts].join(', ')}`,
)
await page.screenshot({ path: `${SHOTS}/8c-themes.png` })
await dash.getByRole('radio', { name: 'Хэштеги' }).click()
await dash.getByRole('radio', { name: 'Сводка' }).click()
const topics = dash.getByRole('region', { name: 'Темы' })
check(
  (await topics.getByRole('group', { name: 'Темы: Лаборатория Датаиста' }).getByRole('button', { name: /^#исследования/ }).count()) &&
    (await topics.getByRole('group', { name: 'Темы: Академия Датаиста' }).count()),
  'темы-хэштеги по каналам и разделам',
  'нет хэштегов разделов',
)
await topics.getByRole('button', { name: 'Править' }).click()
const period = topics.getByRole('group', { name: 'Периодичность: #технологии · FULL' })
await period.getByRole('button', { name: 'Чт' }).click()
check(/слотов без темы \+\d+/.test((await toast().textContent()) ?? ''), 'периодичность: новый день ставит слоты без темы', `периодичность: ${await toast().textContent()}`)
await page.screenshot({ path: `${SHOTS}/10-topics.png` })
await topics.getByRole('button', { name: 'Готово' }).click()
const ask = dash.getByRole('region', { name: 'Планирование недели' })
check(await ask.count(), 'за неделю дашборд просит уточнить темы', 'нет просьбы уточнить темы')
await ask.getByRole('button', { name: 'Уточнить' }).click()
const planning = page.getByRole('complementary', { name: 'Планирование недели' })
await planning.waitFor()
await planning.getByRole('button', { name: 'Из черновиков: Агент продаж' }).click()
check(await planning.getByRole('img', { name: 'Тема есть' }).count(), 'планирование: ближайший черновик того же хэштега — в слот', 'черновик не встал в слот')
const rest = planning.locator('.cp-planrow:not(.cp-planrow--done) input').first()
if (await rest.count()) {
  await rest.fill('Сколько стоит ИИ-сотрудник')
  await rest.press('Enter')
}
await page.screenshot({ path: `${SHOTS}/10b-planning.png` })
await planning.getByRole('button', { name: 'Назад' }).click()
await dash.getByRole('region', { name: 'Темы' }).getByRole('group', { name: 'Темы: Офис Датаиста' }).getByRole('button', { name: /^#демо/ }).first().click()
check(
  !(await dash.count()) && (await side.getByRole('button', { name: '#демо', exact: true }).getAttribute('aria-pressed')) === 'true' && (await side.getByRole('button', { name: '#тезисы', exact: true }).getAttribute('aria-pressed')) === 'false',
  'хэштег в «Темах» — календарь только по этой теме',
  'фильтр по хэштегу не встал',
)
await side.getByRole('button', { name: 'Сбросить' }).click()

// «+»: хэштег с подсказками (как Т9), новый контент с версией для Instagram — автоматически после выхода оригинала
await page.getByRole('button', { name: 'Новый контент' }).click()
const newForm = page.getByRole('complementary', { name: 'Новый контент' })
const tagIn = newForm.getByRole('combobox', { name: 'Хэштег' })
await tagIn.fill('тех')
check(await newForm.getByRole('option', { name: '#технологии' }).count(), 'хэштег подсказывается при вводе', 'нет подсказки хэштега')
await tagIn.fill('агенты')
check(await newForm.getByRole('option', { name: 'Новый хэштег #агенты' }).count(), 'нового хэштега нет — предлагается завести', 'нет «Новый хэштег»')
await newForm.getByRole('option', { name: 'Новый хэштег #агенты' }).click()
await page.screenshot({ path: `${SHOTS}/5b-new.png` })
await newForm.getByRole('textbox', { name: 'Тема' }).fill('Пересоздать для Instagram')
await newForm.getByRole('button', { name: 'Версия для Instagram' }).click()
await newForm.getByRole('radio', { name: 'Автоматически после выхода' }).click()
await newForm.getByRole('button', { name: 'Создать' }).click()
check(await toast().filter({ hasText: 'версий: 1, после выхода' }).count(), '«+»: новый контент с новым хэштегом и версией по триггеру', 'версия не создалась')
check(await side.getByRole('button', { name: '#агенты', exact: true }).count(), 'новый хэштег — в фильтрах', 'нового хэштега нет в фильтрах')
await page.keyboard.press('Control+z')

// поиск вверху: найденное под полем, нажать — материал открыт
await top.getByRole('searchbox', { name: 'Поиск по плану' }).fill('Landao')
const found = page.getByRole('region', { name: 'Найдено' })
check(/Найдено: \d+/.test((await found.locator('.cp-search__count').first().textContent()) ?? ''), 'поиск вверху находит тему', 'поиск ничего не нашёл')
await page.screenshot({ path: `${SHOTS}/12-search.png` })
await found.getByRole('button').first().click()
check(await page.getByRole('complementary', { name: 'Материал' }).count(), 'из поиска — к материалу', 'поиск не открыл материал')
await page.keyboard.press('Escape')

// панель слева: площадку и канал добавляют «+», разделы канала фильтруются
await side.getByRole('button', { name: 'Добавить площадку' }).click()
await side.getByRole('textbox', { name: 'Новая площадка' }).fill('VK')
await side.getByRole('textbox', { name: 'Новая площадка' }).press('Enter')
check(await side.getByRole('button', { name: 'VK', exact: true }).count(), 'площадка добавляется в панели слева', 'площадка не добавилась')
await page.keyboard.press('Control+z')
await side.getByRole('button', { name: 'Лаборатория Датаиста', exact: true }).click()
check((await side.getByRole('button', { name: 'Лаборатория Датаиста', exact: true }).getAttribute('aria-pressed')) === 'false', 'фильтр по каналу (Лаборатория Датаиста)', 'каналы Датаиста не фильтруются')
await side.getByRole('button', { name: 'Сбросить' }).click()

// Датаист — три отдельных серых канала, без вложенности; цвет канала меняется палитрой; у площадок — иконки
const dotBg = (name) => side.getByRole('button', { name }).locator('.cp-colorpick__dot').evaluate((el) => getComputedStyle(el).backgroundColor)
const dataist = ['Лаборатория Датаиста', 'Академия Датаиста', 'Офис Датаиста']
const grays = await Promise.all(dataist.map((n) => dotBg(`Цвет: ${n}`)))
check(
  grays.every((c) => c === 'rgb(142, 142, 147)') && !(await side.getByRole('button', { name: 'Dataist', exact: true }).count()) && !(await side.locator('.cp-side__row--sec').count()),
  'Датаист — три отдельных серых канала: Лаборатория, Академия, Офис, без вложенности',
  `каналы Датаиста не те: ${grays.join(', ')}`,
)
const neuCard = () => page.locator('.cp-card').filter({ has: page.getByRole('button', { name: /^Новости: Все новости/ }) }).first()
await side.getByRole('button', { name: 'Цвет: Neuronium' }).click()
await side.getByRole('group', { name: 'Цвет: Neuronium' }).getByRole('button', { name: 'Зелёный' }).click()
const recolored = await neuCard().evaluate((el) => el.style.getPropertyValue('--cp-c'))
await side.getByRole('button', { name: 'Цвет: Neuronium' }).click()
await side.getByRole('group', { name: 'Цвет: Neuronium' }).getByRole('button', { name: 'Фиолетовый' }).click()
check(recolored === '#34c759', 'цвет канала меняется палитрой в фильтрах — карточки перекрашиваются', `цвет не сменился: ${recolored}`)
const pills = side.locator('.cp-pills').first()
check((await pills.locator('svg').count()) === (await pills.getByRole('button').count()), 'у площадок в фильтрах — иконки', 'у площадок нет иконок')
const fmts = async (g) => (await side.getByRole('group', { name: g }).getByRole('button').allTextContents()).join('|')
check(
  (await fmts('Видео')) === 'Полное горизонтальное видео|Короткое вертикальное видео' && (await fmts('Текст')) === 'Страница на сайте|Текст с картинкой',
  'форматы в фильтрах: Видео (полное горизонтальное, короткое вертикальное), Текст (страница на сайте, текст с картинкой)',
  `форматы не те: ${await fmts('Видео')} / ${await fmts('Текст')}`,
)

// профиль: «Как пользоваться» и тёмная тема
await page.getByRole('button', { name: 'Профиль' }).click()
await page.getByRole('menuitem', { name: 'Как пользоваться' }).click()
check(await page.getByRole('complementary', { name: 'Как пользоваться' }).getByRole('region', { name: 'Календарь' }).count(), 'подсказки — в профиле, «Как пользоваться»', 'нет справки')
await page.keyboard.press('Escape')
await page.getByRole('button', { name: 'Профиль' }).click()
await page.getByRole('radio', { name: 'Тёмная' }).click()
await page.keyboard.press('Escape')
check(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'тёмная тема', 'тема не переключилась')
await page.waitForTimeout(500)
await page.screenshot({ path: `${SHOTS}/11-dark.png` })

// после перезагрузки план тот же (IndexedDB): тема из черновика на месте
await page.waitForTimeout(800)
await page.reload()
await top.waitFor()
await top.getByRole('searchbox', { name: 'Поиск по плану' }).fill('Агент продаж')
check(await page.getByRole('region', { name: 'Найдено' }).getByRole('button', { name: /Агент продаж/ }).count(), 'правки пережили перезагрузку', 'правки потерялись')

// телефон: внизу Дашборд, Календарь, Профиль; фильтры — за кнопкой; вид — меню, в нём лента по дням; поиск — значком
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await phone.goto(BASE)
await phone.getByRole('grid', { name: 'Неделя по времени' }).waitFor()
const tabs = await phone.getByRole('navigation', { name: 'Разделы' }).getByRole('button').allTextContents()
check(tabs.join('|') === 'ДашбордКалендарьПрофиль'.replace(/(?<=.)(?=[А-Я])/g, '|'), 'телефон: внизу Дашборд, Календарь, Профиль', `телефон: внизу ${tabs.join(', ')}`)
const head = await phone.locator('.cp-top').boundingBox()
check(head && head.height < 70, 'телефон: шапка в одну строку', `телефон: шапка ${head?.height}px`)
check(!(await phone.locator('.cp-side').count()), 'телефон: фильтры свёрнуты', 'телефон: фильтры открыты сами')
await phone.getByRole('button', { name: 'Поиск', exact: true }).click()
await phone.getByRole('searchbox', { name: 'Поиск по плану' }).fill('Landao')
check(await phone.getByRole('region', { name: 'Найдено' }).count(), 'телефон: поиск значком, поле — поверх шапки', 'телефон: поиск не открылся')
await phone.keyboard.press('Escape')
await phone.getByRole('button', { name: 'Вид', exact: true }).click()
await phone.getByRole('menuitemradio', { name: 'Лента по дням' }).click()
await phone.getByRole('feed', { name: 'Лента по дням' }).waitFor()
const head2 = await phone.locator('.cp-top').boundingBox()
check(head2 && head2.height < 70, 'телефон: шапка ленты — в одну строку', `телефон: шапка ленты ${head2?.height}px`)
check(!(await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'телефон: лента по дням без горизонтального скролла', 'на телефоне страница шире экрана')
await phone.waitForTimeout(500)
await phone.screenshot({ path: `${SHOTS}/13-phone.png` })
await phone.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'Дашборд' }).click()
check(await phone.getByRole('complementary', { name: 'Дашборд' }).count(), 'телефон: дашборд — вкладкой внизу', 'на телефоне нет дашборда')
await phone.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'Календарь' }).click()
await phone.getByRole('button', { name: 'Фильтры' }).click()
await phone.getByRole('button', { name: 'Закрыть фильтры' }).click()
check(!(await phone.locator('.cp-side').count()), 'фильтры на телефоне закрываются', 'фильтры на телефоне не закрываются')
await phone.getByRole('button', { name: 'Фильтры' }).click()
await phone.mouse.click(370, 400)
check(!(await phone.locator('.cp-side').count()), 'тап мимо закрывает фильтры', 'тап мимо фильтров их не закрыл')

await browser.close()
