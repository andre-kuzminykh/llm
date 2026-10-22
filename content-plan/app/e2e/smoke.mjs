// T-CP-E1: реальный браузер против собранного приложения (npm run build && npm run preview).
// Проверяет бесконечный месяц и переход к дате, карточки с рубрикой и площадками, перенос мышью
// с группой, «Поменять местами» и отмену, панель дня, ▶ и задачу, неделю по времени и перенос на час,
// «Сейчас», банк тем с галочками и возвратом темы, сетку, тёмную тему и телефон. Скриншоты — в e2e/shots (или в $SHOTS).
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
const cell = (d) => page.locator(`[data-date="${d}"]`)
const toast = () => page.getByRole('status').filter({ has: page.locator('.cp-toast__msg') })

await page.goto(BASE)
await page.getByRole('grid').first().waitFor()
await page.getByRole('button', { name: 'Следующий месяц' }).click()
await page.getByRole('heading', { name: 'Ноябрь 2026' }).waitFor()
await page.waitForTimeout(700) // плавная прокрутка
await page.screenshot({ path: `${SHOTS}/1-month.png` })
ok('месяц открылся')
const card = cell('2026-11-02').locator('.cp-card').first()
check(
  (await card.getByLabel('Рубрика: Демо').count()) && (await card.locator('.cp-card__title').textContent()) === 'Landao',
  'карточка: рубрика меткой, название — только тема',
  'карточка без метки рубрики или с рубрикой в названии',
)

// перенос FULL «Демо: Landao» со 2.11 на 3.11, где уже стоит FULL «Кейсы: Сбер»: группа едет вместе,
// нарушение одно, а «Поменять местами» ставит Сбер на 2.11
await card.dragTo(cell('2026-11-03'))
check(await cell('2026-11-03').locator('.cp-card', { hasText: 'Landao' }).count(), 'перенос мышью', 'карточка не переехала')
check((await cell('2026-11-03').locator('.cp-viol').count()) === 1, 'нарушение отмечено', 'нет отметки нарушения')
await toast().filter({ hasText: 'вместе с группой' }).waitFor()
await page.screenshot({ path: `${SHOTS}/2-moved.png` })
const v = await page.getByRole('button', { name: 'Проверка' }).locator('.cp-rail-badge').textContent()
check(v === '1', 'два FULL в день — одно нарушение, а не шесть', `нарушений после переноса: ${v}`)
await toast().getByRole('button', { name: 'Поменять местами' }).click()
check(
  (await cell('2026-11-02').locator('.cp-card', { hasText: 'Сбер' }).count()) && (await cell('2026-11-03').locator('.cp-card', { hasText: 'Landao' }).count()),
  '«Поменять местами»',
  'FULL не поменялись местами',
)
await page.keyboard.press('Control+z')
await page.keyboard.press('Control+z')
check(await cell('2026-11-02').locator('.cp-card', { hasText: 'Landao' }).count(), 'отмена вернула', 'отмена не сработала')

// бесконечный месяц и переход к дате
await page.getByLabel('Перейти к дате').fill('2029-03-14')
await page.getByRole('heading', { name: 'Март 2029' }).waitFor()
await page.waitForTimeout(300)
check(await cell('2029-03-14').count(), 'переход к дате за концом плана: месяц бесконечный', 'нет дня 2029-03-14')
await page.getByRole('button', { name: 'Сегодня' }).click()
await page.waitForTimeout(700)
await page.getByRole('button', { name: 'Следующий месяц' }).click()
await page.getByRole('heading', { name: 'Ноябрь 2026' }).waitFor()
await page.waitForTimeout(700)

// панель дня: карточки по каналам, под площадками — что выходит
await page.getByRole('button', { name: 'Открыть день 2026-11-09' }).click()
const day = page.getByRole('complementary', { name: /9 ноября 2026/ })
await day.waitFor()
await page.waitForTimeout(400) // лист выезжает 320 мс
const full = day.getByRole('button', { name: /^Демо · FULL: Neuronium, 12:00/ })
check((await full.getByText('Тизер · Shorts').count()) && (await full.getByText('Анонс · Кабинет').count()), 'панель дня: площадки и что на них выходит', 'в карточке нет типов контента')
await page.screenshot({ path: `${SHOTS}/3-day.png` })

// ▶ — статус «в работе» и задача по созданию контента
await day.getByRole('group', { name: 'Статус: Демо · FULL: Neuronium' }).getByRole('button', { name: 'В работе' }).click()
const task = page.getByRole('complementary', { name: 'Задача' })
await task.waitFor()
await task.getByText(/YouTube — FULL/).click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${SHOTS}/4-task.png` })
check(await task.getByRole('checkbox', { name: /YouTube — FULL/ }).isChecked(), 'галочка части задачи', 'галочка не ставится')
check(await cell('2026-11-09').getByRole('button', { name: 'Задача: Neuronium (в работе)' }).count(), '▶ открыл задачу, статус на карточке', 'нет статуса на карточке')
await task.getByRole('button', { name: 'Открыть материал' }).click()
await page.getByRole('complementary', { name: 'Материал' }).waitFor()
await page.waitForTimeout(400)
await page.screenshot({ path: `${SHOTS}/5-editor.png` })
await page.getByRole('button', { name: 'Отмена' }).click()
ok('форма материала')
await page.keyboard.press('Escape')

// неделя по времени: перенос на другой час
await page.getByRole('button', { name: 'Неделя', exact: true }).click()
await page.getByRole('radio', { name: 'Время' }).click()
await page.getByRole('grid', { name: 'Неделя по времени' }).waitFor()
await page.getByLabel('Перейти к дате').fill('2026-11-09')
await page.waitForTimeout(900)
await page.screenshot({ path: `${SHOTS}/6-week.png` })
const col = page.locator('.cp-tg__col[data-date="2026-11-10"]')
const thesis = col.locator('.cp-card', { hasText: 'Тезисы' }).first()
const box = await col.boundingBox()
// карточку берут за середину; встаёт она верхним краем туда, куда опустили
const grabY = (await thesis.boundingBox()).height / 2
await thesis.dragTo(col, { targetPosition: { x: 40, y: 16 * 64 + grabY } })
check(await col.locator('.cp-card', { hasText: '16:00' }).count(), 'перенос на другой час', 'время не поменялось')
await page.keyboard.press('Control+z')
check(box && box.width > 120, 'неделя по ширине экрана', 'колонки дней узкие')
await page.getByRole('radio', { name: 'Каналы' }).click()
await page.getByRole('grid', { name: /Неделя по каналам/ }).waitFor()
await page.screenshot({ path: `${SHOTS}/7-week-lanes.png` })
ok('неделя дорожками')
await page.getByRole('radio', { name: 'Время' }).click()

// «Сейчас»
await page.getByRole('button', { name: 'Сейчас', exact: true }).click()
await page.getByRole('heading', { name: 'Что делать сейчас' }).waitFor()
await page.screenshot({ path: `${SHOTS}/8-now.png` })
ok('«Сейчас»')

// банк тем: галочки, разложить, показать, вернуть
await page.getByRole('button', { name: 'Банк тем', exact: true }).click()
const pick = page.getByRole('group', { name: 'Какие рубрики показывать' })
await pick.getByRole('button', { name: 'Снять все' }).click()
await pick.locator('label').filter({ hasText: /^Демо\s*\d/ }).click()
check((await page.locator('.cp-bank__col').count()) === 1, 'банк: рубрики выбираются галочками', 'галочки не фильтруют банк')
await page.getByLabel('Новые темы: Демо', { exact: true }).fill('Агент продаж\nИИ-бухгалтер')
const bank = page.getByRole('region', { name: 'Банк: Демо', exact: true })
await bank.getByRole('button', { name: 'Добавить' }).click()
await bank.getByRole('button', { name: 'Разложить по слотам' }).click()
const t = await toast().textContent()
check(/Разложено: 2 · \d+ \S+ – \d+ \S+ \d{4}/.test(t ?? ''), `банк: ${t?.replace(/Показать|Отменить/g, '').trim()}`, `банк: ${t}`)
await page.screenshot({ path: `${SHOTS}/9-bank.png` })
await bank.getByRole('button', { name: 'Вернуть в банк: ИИ-бухгалтер' }).click()
check(await bank.getByRole('button', { name: 'ИИ-бухгалтер' }).count(), 'тема вернулась в банк', 'тема не вернулась')
await pick.getByRole('button', { name: 'Выбрать все' }).click()

// сетка
await page.getByRole('button', { name: 'Сетка', exact: true }).click()
await page.getByRole('heading', { name: 'Типовая неделя' }).waitFor()
await page.getByRole('button', { name: 'Раскрыть: Академия' }).click()
check(await page.getByLabel('Формат: Академия · FULL').count(), 'сетка: рубрика Академия, формат FULL', 'нет формата FULL у Академии')
check(await page.getByLabel('Что выходит: Академия · FULL, YouTube').count(), 'сетка: что выходит на каждой площадке', 'нет типов по площадкам')
const wide = await page.evaluate(() => { const b = document.querySelector('.cp-body'); return b.scrollWidth > b.clientWidth + 1 })
check(!wide, 'сетка помещается по ширине', 'сетка шире экрана')
await page.screenshot({ path: `${SHOTS}/10-rules.png` })

// тёмная тема
await page.getByRole('button', { name: 'Данные и тема' }).click()
await page.getByRole('radio', { name: 'Тёмная' }).click()
await page.keyboard.press('Escape')
await page.getByRole('button', { name: 'Календарь', exact: true }).click()
check(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'тёмная тема', 'тема не переключилась')
await page.waitForTimeout(500)
await page.screenshot({ path: `${SHOTS}/11-dark.png` })

// после перезагрузки план тот же (IndexedDB): разложенная тема на месте
await page.waitForTimeout(800)
await page.reload()
await page.getByRole('grid').first().waitFor()
await page.getByRole('button', { name: 'План', exact: true }).click()
await page.getByLabel('Поиск по плану').fill('Агент продаж')
check(await page.getByRole('button', { name: 'Агент продаж' }).count(), 'правки пережили перезагрузку', 'правки потерялись')

// телефон: лента по дням
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await phone.goto(BASE)
await phone.getByRole('feed', { name: 'Лента по дням' }).waitFor()
check(!(await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'телефон: лента по дням без горизонтального скролла', 'на телефоне страница шире экрана')
await phone.waitForTimeout(500)
await phone.screenshot({ path: `${SHOTS}/12-phone.png` })
await phone.getByRole('button', { name: 'Фильтры' }).click()
await phone.getByRole('button', { name: 'Закрыть фильтры' }).click()
check(!(await phone.locator('.cp-side[data-open="true"]').count()), 'фильтры на телефоне закрываются', 'фильтры на телефоне не закрываются')
await phone.getByRole('button', { name: 'Фильтры' }).click()
await phone.mouse.click(370, 400)
check(!(await phone.locator('.cp-side[data-open="true"]').count()), 'тап мимо закрывает фильтры', 'тап мимо фильтров их не закрыл')

await browser.close()
