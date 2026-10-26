// Видеодемо: как вести контент — от «Сейчас» и пустого слота до «Вышло», неделя по времени,
// «Поменять местами», банк тем и сетка. Пишет webm в $OUT (по умолчанию e2e/shots/demo);
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
  localStorage.setItem('cp:view', JSON.stringify('now'))
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
await page.getByRole('heading', { name: 'Что делать сейчас' }).waitFor()
await page.mouse.move(720, 450)
await wait(600)

// 1. Сейчас
await cap('«Сейчас» — что подготовить на две недели вперёд, по сроку подготовки', 3200)
await page.mouse.wheel(0, 420)
await wait(1200)
await page.mouse.wheel(0, -420)
await cap('Строка — время, рубрика словом и тема; ▶ — начать', 2600)

// 2. Календарь без конца и переход к дате
await click(page.getByRole('button', { name: 'Календарь', exact: true }))
await cap('Календарь открывается неделей: по часам, как в Google Календаре', 2600)
await click(page.getByRole('radio', { name: 'Месяц' }), 600)
await cap('Месяц: все материалы строками — время, рубрика, тема; цвет полоски — канал', 2600)
await cap('Листается без конца — неделя за неделей')
for (let i = 0; i < 4; i++) {
  await page.mouse.move(900, 500)
  await page.mouse.wheel(0, 520)
  await wait(650)
}
await cap('Нажать на заголовок — и сразу к нужной дате', 900)
await jump('2027-03-15')
await page.getByRole('heading', { name: 'Март 2027' }).waitFor()
await moveTo(page.locator('[data-date="2027-03-15"] .cp-card--slot').first())
await cap('Пунктир — слот без темы', 2000)

// 3. Пустой слот → задача → готово → вышло
await click(page.getByRole('button', { name: 'Открыть день 2027-03-15' }), 700)
await cap('День: по каналам и по времени, под каждой площадкой — что выходит', 3400)
const day = page.getByRole('complementary', { name: /15 марта 2027/ })
await cap('▶ — начать: открывается задача по созданию контента', 900)
await click(day.locator('.cp-card').filter({ has: page.getByRole('button', { name: /^Демо · FULL: Нужна тема/ }) }).getByRole('button', { name: /^Начать/ }), 900)
const task = page.getByRole('complementary', { name: 'Задача' })
await cap('Пустой слот: вписываю тему — тизер и анонсы получат её же')
await type(task.getByLabel('Тема'), 'ИИ-бухгалтер')
await page.keyboard.press('Enter')
await wait(500)
await cap('Кто делает и к какому дню подготовить')
await type(task.getByLabel('Кто делает'), 'Андрей')
await page.keyboard.press('Tab')
await wait(900)
await cap('Отмечаю, что готово на каждой площадке')
for (const part of await task.locator('.cp-task__part').all()) await click(part, 260)
await wait(400)
await cap('Всё сделано — «Готово» одной кнопкой', 700)
await click(task.getByRole('button', { name: /Всё сделано/ }), 900)
await cap('Вышло — ●', 600)
await click(task.getByRole('group', { name: 'Статус задачи' }).getByRole('button', { name: 'Вышло' }), 900)
await click(task.getByRole('button', { name: 'Закрыть' }), 600)
await cap('На карточке — тема и статус значком', 2800)
await page.keyboard.press('Escape')
await wait(400)

// 4. Неделя по времени
await click(page.getByRole('radio', { name: 'Время' }), 600)
await jump('2026-11-09')
await cap('Неделя по времени: совпадающие — рядом, как в Google Календаре', 3400)
const col = page.locator('.cp-tg__col[data-date="2026-11-10"]')
const thesis = col.locator('.cp-card', { hasText: 'Тезисы' }).first()
const t = await center(thesis)
const colBox = await col.boundingBox()
await cap('Перетащить на другой час — время меняется', 600)
await drag(thesis, t.x, colBox.y + 17 * 64 + (t.y - t.b.y))
await wait(2200)
await cap('Или дорожками по каналам — как в исходной таблице', 300)
await click(page.getByRole('radio', { name: 'Каналы' }), 2800)
await cap('')

// 5. Поменять местами
await click(page.getByRole('radio', { name: 'Месяц' }), 400)
await jump('2026-11-02')
await cap('FULL на день, где уже есть FULL: одно нарушение и «Поменять местами»', 1200)
const target = await center(page.locator('[data-date="2026-11-03"]'))
await drag(page.locator('[data-date="2026-11-02"] .cp-card--main').first(), target.x, target.y + 30)
await wait(1600)
await click(page.locator('.cp-toast').getByRole('button', { name: 'Поменять местами' }), 2200)

// 6. Банк тем
await click(page.getByRole('button', { name: 'Банк тем', exact: true }), 500)
await cap('Банк тем: слева рубрики, справа — темы выбранной', 900)
await click(page.getByRole('navigation', { name: 'Рубрики банка' }).getByRole('button', { name: 'Тезисы · Тезис дня' }), 900)
await type(page.getByLabel('Новые темы: Тезисы · Тезис дня'), 'Агенты вместо отделов\nИИ не отнимет работу\nСколько стоит ИИ-сотрудник')
const bank = page.getByRole('region', { name: 'Банк: Тезисы · Тезис дня' })
await click(bank.getByRole('button', { name: 'Добавить' }), 700)
await cap('«Разложить по слотам» — и сразу видно, куда легли', 600)
await click(bank.getByRole('button', { name: 'Разложить по слотам' }), 2600)
await cap('Любую тему можно вернуть в банк', 600)
await click(bank.getByRole('button', { name: 'Вернуть в банк: ИИ не отнимет работу' }), 2000)

// 7. Сетка
await click(page.getByRole('button', { name: 'Сетка', exact: true }), 500)
await click(page.getByRole('button', { name: 'Раскрыть: Демо' }), 500)
await cap('Сетка: дни, время и площадки — строками; правка — по нажатию на формат', 1400)
await click(page.getByRole('button', { name: 'Править: Демо · FULL' }), 2600)
await page.keyboard.press('Escape')

// 8. Конец
await click(page.getByRole('button', { name: 'Сейчас', exact: true }), 500)
await cap('Весь контент-план — в одном месте, без таблиц', 3000)
await cap('')
await wait(500)

const video = page.video()
await ctx.close()
console.log(await video.path())
await browser.close()
