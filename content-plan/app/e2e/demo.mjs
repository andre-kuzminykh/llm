// Видеодемо SMM: календарь с фильтрами слева и видом справа от поиска, перенос и растягивание на шкале, «Поменять местами»,
// от пустого слота до «Вышло», черновики во вкладке «+», периодичность хэштега и планирование недели, дашборд справа,
// хэштег с подсказками и версия для другой площадки по триггеру, поиск вверху. Пишет webm в $OUT (по умолчанию e2e/shots/demo);
// в mp4: ffmpeg -i <файл>.webm -c:v libx264 -pix_fmt yuv420p -crf 24 -movflags +faststart demo.mp4
// Запуск — как у smoke.mjs: npm run build && npm run preview, затем node e2e/demo.mjs
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5174/'
const OUT = process.env.OUT ?? new URL('./shots/demo/', import.meta.url).pathname
const CHROME = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
mkdirSync(OUT, { recursive: true })

const size = { width: 1440, height: 900 }
const browser = await chromium.launch({ executablePath: CHROME })
const ctx = await browser.newContext({ viewport: size, recordVideo: { dir: OUT, size } })
// курсор и подписи — в самой странице, чтобы попали в запись
await ctx.addInitScript(() => {
  localStorage.setItem('cp:theme', 'light')
  addEventListener('DOMContentLoaded', () => {
    const css = document.createElement('style')
    css.textContent = `
      #demo-cursor { position: fixed; left: -12px; top: -12px; width: 24px; height: 24px; border-radius: 50%; z-index: 10000; pointer-events: none;
        background: rgba(136, 84, 243, .25); border: 2px solid #8854f3; transition: transform .06s linear, background .15s; }
      #demo-cursor.down { background: rgba(136, 84, 243, .6); }
      #demo-cap { position: fixed; left: 50%; bottom: 88px; transform: translateX(-50%); z-index: 9999; pointer-events: none; max-width: 880px;
        padding: 12px 20px; border-radius: 14px; background: rgba(20, 20, 28, .88); color: #fff; font: 600 19px/1.35 Montserrat, sans-serif;
        text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,.25); transition: opacity .25s; opacity: 0; }`
    document.head.append(css)
    const c = Object.assign(document.createElement('div'), { id: 'demo-cursor' })
    const cap = Object.assign(document.createElement('div'), { id: 'demo-cap' })
    document.body.append(c, cap)
    const at = (e) => (c.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`)
    for (const t of ['mousemove', 'dragover', 'drag']) addEventListener(t, at, true)
    addEventListener('mousedown', () => c.classList.add('down'), true)
    addEventListener('mouseup', () => c.classList.remove('down'), true)
    addEventListener('drop', () => c.classList.remove('down'), true)
  })
})
const page = await ctx.newPage()
const wait = (ms) => page.waitForTimeout(ms)
const cap = async (text, ms = 0) => {
  await page.evaluate((t) => {
    const el = document.getElementById('demo-cap')
    el.textContent = t
    el.style.opacity = t ? '1' : '0'
  }, text)
  if (ms) await wait(ms)
}
const center = async (loc) => {
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }
}
const moveTo = async (loc) => {
  const p = await center(loc)
  await page.mouse.move(p.x, p.y, { steps: 18 })
  return p
}
const click = async (loc, pause = 350) => {
  await moveTo(loc)
  await wait(180)
  await page.mouse.down()
  await page.mouse.up()
  await wait(pause)
}
const type = async (loc, text) => {
  await click(loc, 150)
  await page.keyboard.type(text, { delay: 65 })
}
const drag = async (from, x, y) => {
  await moveTo(from)
  await wait(200)
  await page.mouse.down()
  await page.mouse.move(x, y, { steps: 30 })
  await wait(150)
  await page.mouse.up()
}
const jump = async (date) => {
  await click(page.locator('.cp-jump__btn'), 200)
  await page.keyboard.press('Escape')
  await page.getByLabel('Перейти к дате').fill(date)
  await wait(900)
}

await page.goto(BASE)
await page.getByRole('grid', { name: 'Неделя по времени' }).waitFor()
await page.mouse.move(720, 450)
await wait(600)
const side = page.getByRole('complementary', { name: 'Фильтры' })
const top = page.locator('.cp-top')

// 1. Календарь и панель слева
await cap('SMM в Neuronium: слева — отделы и фильтры', 2400)
await click(side.getByRole('button', { name: 'Свернуть фильтры' }), 900)
await cap('Фильтры сворачиваются — дням больше места', 1600)
await click(top.getByRole('button', { name: 'Фильтры' }), 900)
await moveTo(top.getByRole('searchbox', { name: 'Поиск по плану' }))
await cap('Вверху — поиск темы, вид календаря и значок дашборда', 1600)
await moveTo(top.getByRole('radiogroup', { name: 'Вид календаря' }))
await wait(1200)

// 2. Неделя по времени: перенос, край, лист
await jump('2026-11-09')
const col = page.locator('.cp-tg__col[data-date="2026-11-10"]')
const thesis = col.locator('.cp-card', { hasText: 'Тезисы' }).first()
const t = await center(thesis)
await cap('Взять и вести: карточка встаёт по 15 минутам, время на ней — куда встанет', 600)
await drag(thesis, t.x + t.b.width, t.y + 3 * 64)
await wait(2000)
const moved = page.locator('.cp-tg__col[data-date="2026-11-11"] .cp-card', { hasText: 'Тезисы' }).first()
const grip = await center(moved.locator('.cp-tg__grip'))
await cap('Нижний край — длительность', 600)
await page.mouse.move(grip.x, grip.y, { steps: 18 })
await page.mouse.down()
await page.mouse.move(grip.x, grip.y + 64, { steps: 20 })
await page.mouse.up()
await wait(1600)
await cap('Пустой лист тянут рукой', 600)
const sheet = await page.locator('.cp-body').boundingBox()
await page.mouse.move(sheet.x + sheet.width - 30, sheet.y + sheet.height / 2, { steps: 12 })
await page.mouse.down()
await page.mouse.move(sheet.x + sheet.width - 330, sheet.y + sheet.height / 2 - 80, { steps: 30 })
await page.mouse.up()
await wait(1200)
await click(top.getByRole('radio', { name: 'Каналы' }), 600)
await cap('Или дорожками по каналам — как в исходной таблице', 2600)
await click(top.getByRole('radio', { name: 'Время' }), 600)

// 3. Поменять местами
await jump('2026-11-02')
await cap('FULL на день, где уже есть FULL: одно нарушение и «Поменять местами»', 1200)
const landao = page.locator('.cp-tg__col[data-date="2026-11-02"] .cp-card--main', { hasText: 'Landao' }).first()
const l = await center(landao)
await drag(landao, l.x + (await page.locator('.cp-tg__col[data-date="2026-11-02"]').boundingBox()).width, l.y)
await wait(1600)
await click(page.locator('.cp-toast').getByRole('button', { name: 'Поменять местами' }), 2200)

// 4. Пустой слот → задача → готово → вышло
await jump('2027-03-15')
await click(page.getByRole('button', { name: 'Открыть день 2027-03-15' }), 700)
await cap('День: по каналам, под каждой площадкой — что выходит', 3000)
const day = page.getByRole('complementary', { name: /15 марта 2027/ })
await cap('▶ — начать: открывается задача по созданию контента', 900)
await click(day.locator('.cp-card').filter({ has: page.getByRole('button', { name: /^Демо · FULL: Нужна тема/ }) }).getByRole('button', { name: /^Начать/ }), 900)
const task = page.getByRole('complementary', { name: 'Задача' })
await cap('Пустой слот: вписываю тему — тизер и анонсы получат её же')
await type(task.getByLabel('Тема'), 'ИИ-бухгалтер')
await page.keyboard.press('Enter')
await wait(500)
await cap('Отмечаю, что готово на каждой площадке')
for (const part of await task.locator('.cp-task__part').all()) await click(part, 260)
await cap('Всё сделано — «Готово» одной кнопкой', 700)
await click(task.getByRole('button', { name: /Всё сделано/ }), 900)
await click(task.getByRole('group', { name: 'Статус задачи' }).getByRole('button', { name: 'Вышло' }), 900)
await click(task.getByRole('button', { name: 'Закрыть' }), 600)
await page.keyboard.press('Escape')
await wait(300)

// 5. Черновики во вкладке «+»
await cap('«+» справа внизу: новый контент — или черновики, банк идей', 600)
await click(page.getByRole('button', { name: 'Новый контент' }), 700)
await click(page.getByRole('tab', { name: /^Черновики/ }), 700)
const drafts = page.getByRole('complementary', { name: 'Черновики' })
await click(drafts.getByRole('group', { name: 'Хэштеги черновиков' }).getByRole('button', { name: /^#технологии/ }), 700)
await type(drafts.getByLabel('Новые черновики: #технологии', { exact: true }), 'Агенты вместо отделов\nСколько стоит ИИ-сотрудник')
await click(drafts.getByRole('button', { name: 'Добавить' }), 1400)
await click(drafts.getByRole('button', { name: 'Закрыть' }), 500)

// 6. Дашборд справа: периодичность хэштега и планирование недели
await cap('Дашборд — значок справа вверху, открывается панелью', 600)
await click(top.getByRole('button', { name: 'Дашборд' }), 1400)
const dash = page.getByRole('complementary', { name: 'Дашборд' })
const topics = dash.getByRole('region', { name: 'Темы' })
await topics.scrollIntoViewIfNeeded()
await click(topics.getByRole('button', { name: 'Править' }), 800)
await cap('Периодичность хэштега в канале: дни недели и время — слоты встают в расписание', 600)
await click(topics.getByRole('group', { name: 'Периодичность: #технологии · FULL' }).getByRole('button', { name: 'Чт' }), 2200)
await click(topics.getByRole('button', { name: 'Готово' }), 600)
const ask = dash.getByRole('region', { name: 'Планирование недели' })
await ask.scrollIntoViewIfNeeded()
await cap('За неделю дашборд просит уточнить темы', 1800)
await click(ask.getByRole('button', { name: 'Уточнить' }), 900)
const planning = page.getByRole('complementary', { name: 'Планирование недели' })
await cap('Ближайшие черновики того же хэштега — одной кнопкой', 600)
await click(planning.getByRole('button', { name: /^Подставить из черновиков/ }), 2400)
await click(planning.getByRole('button', { name: 'Закрыть' }), 600)

// 7. «+»: хэштег с подсказками и версия по триггеру
await click(page.getByRole('button', { name: 'Новый контент' }), 700)
const form = page.getByRole('complementary', { name: 'Новый контент' })
await cap('Хэштег подсказывается при вводе, как Т9', 300)
await type(form.getByRole('combobox', { name: 'Хэштег' }), 'тех')
await wait(900)
await click(form.getByRole('option', { name: '#технологии' }), 600)
await type(form.getByRole('textbox', { name: 'Тема' }), 'Как мы собрали ИИ-отдел продаж')
await cap('Пересоздать для других площадок — вместе или автоматически, когда выйдет оригинал', 600)
await click(form.getByRole('button', { name: 'Версия для Instagram' }), 400)
await click(form.getByRole('radio', { name: 'Автоматически после выхода' }), 1400)
await click(form.getByRole('button', { name: 'Создать' }), 2200)

// 8. Поиск вверху
await cap('Поиск — вверху: нажать — и материал открыт', 300)
await type(top.getByRole('searchbox', { name: 'Поиск по плану' }), 'агент')
await wait(1800)
await click(page.getByRole('region', { name: 'Найдено' }).getByRole('button').first(), 1600)
await page.keyboard.press('Escape')

// 9. Конец
await cap('Контент-план SMM — календарь, дашборд и черновики под рукой', 3000)
await cap('')
await wait(500)

const video = page.video()
await ctx.close()
console.log(await video.path())
await browser.close()
