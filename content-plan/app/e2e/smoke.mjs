// T-CP-E1: реальный браузер против собранного приложения (npm run build && npm run preview).
// Проверяет месяц, перенос мышью с группой и отмену, панель дня, неделю, банк тем,
// тёмную тему и ширину телефона. Скриншоты — в e2e/shots (или в $SHOTS).
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

const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => fail(`ошибка на странице: ${e.message}`))

await page.goto(BASE)
await page.getByRole('grid').waitFor()
await page.getByRole('button', { name: 'Следующий месяц' }).click()
await page.getByRole('heading', { name: 'Ноябрь 2026' }).waitFor()
await page.screenshot({ path: `${SHOTS}/1-month.png` })
ok('месяц открылся')

// перенос FULL «Демо / Landao» со 2.11 на 3.11 — группа едет вместе, появляется нарушение
const from = page.locator('[data-date="2026-11-02"] .cp-card')
const to = page.locator('[data-date="2026-11-03"]')
await from.dragTo(to)
const moved = await page.locator('[data-date="2026-11-03"] .cp-card', { hasText: 'Демо / Landao' }).count()
moved ? ok('перенос мышью') : fail('карточка не переехала')
;(await page.locator('[data-date="2026-11-03"] .cp-viol').count()) ? ok('нарушение отмечено') : fail('нет отметки нарушения')
await page.getByRole('status').filter({ hasText: 'вместе с группой' }).waitFor()
await page.screenshot({ path: `${SHOTS}/2-moved.png` })
await page.keyboard.press('Control+z')
;(await page.locator('[data-date="2026-11-02"] .cp-card', { hasText: 'Демо / Landao' }).count()) ? ok('отмена вернула') : fail('отмена не сработала')

// панель дня
await page.getByRole('button', { name: 'Открыть день 2026-11-09' }).click()
await page.getByRole('complementary', { name: /9 ноября 2026/ }).waitFor()
await page.waitForTimeout(400) // лист выезжает 320 мс
// статус значком: ▶ в панели дня → значок на карточке месяца; ещё раз — снова в плане
const dayPanel = page.getByRole('complementary', { name: /9 ноября 2026/ })
await dayPanel.getByRole('group', { name: 'Статус: Демо · FULL: Демо / Neuronium' }).getByRole('button', { name: 'В работе' }).click()
await dayPanel.getByRole('group', { name: 'Статус: Демо · Тизер FULL: Тизер: Демо / Neuronium' }).getByRole('button', { name: 'Готово' }).click()
;(await page.locator('[data-date="2026-11-09"] .cp-card').getByRole('img', { name: 'В работе' }).count()) ? ok('статус ▶ на карточке') : fail('нет значка статуса')
await page.screenshot({ path: `${SHOTS}/3-day.png` })
ok('панель дня')

// форма материала из панели дня
await page.getByRole('complementary', { name: /9 ноября 2026/ }).getByRole('button', { name: /Демо · FULL: Демо \/ Neuronium/ }).click()
await page.getByRole('complementary', { name: 'Материал' }).waitFor()
await page.waitForTimeout(400) // лист выезжает 320 мс
await page.screenshot({ path: `${SHOTS}/4-editor.png` })
await page.getByRole('button', { name: 'Отмена' }).click()
ok('форма материала')
await page.keyboard.press('Escape')

// неделя
await page.getByRole('button', { name: 'Неделя', exact: true }).click()
await page.getByRole('grid', { name: /Неделя/ }).waitFor()
await page.screenshot({ path: `${SHOTS}/5-week.png` })
ok('неделя')

// банк тем: добавить и разложить по слотам
await page.getByRole('button', { name: 'Банк тем', exact: true }).click()
await page.getByLabel('Новые темы: Демо', { exact: true }).fill('Агент продаж\nИИ-бухгалтер')
await page.getByRole('region', { name: 'Банк: Демо', exact: true }).getByRole('button', { name: 'Добавить' }).click()
await page.getByRole('region', { name: 'Банк: Демо', exact: true }).getByRole('button', { name: 'Разложить по слотам' }).click()
const toast = await page.getByRole('status').filter({ hasText: 'Разложено' }).textContent()
toast?.includes('Разложено: 2') ? ok(`банк тем: ${toast.replace('Отменить', '').trim()}`) : fail(`банк: ${toast}`)
await page.screenshot({ path: `${SHOTS}/6-bank.png` })

// план: статус значками в строке, без выпадающего списка
await page.getByRole('button', { name: 'План', exact: true }).click()
await page.getByRole('button', { name: 'Следующий месяц' }).click()
;(await page.locator('.cp-plan select').count()) ? fail('в плане остался выпадающий список статуса') : ok('план: статус значками')
await page.screenshot({ path: `${SHOTS}/6b-plan.png` })

// сетка
await page.getByRole('button', { name: 'Сетка', exact: true }).click()
await page.getByRole('heading', { name: 'Типовая неделя' }).waitFor()
await page.screenshot({ path: `${SHOTS}/7-rules.png` })
;(await page.getByLabel('Формат: Академия · FULL').count()) ? ok('сетка: рубрика Академия, формат FULL') : fail('нет формата FULL у Академии')
ok('сетка')

// тёмная тема
await page.getByRole('button', { name: 'Данные и тема' }).click()
await page.getByRole('radio', { name: 'Тёмная' }).click()
await page.keyboard.press('Escape')
await page.getByRole('button', { name: 'Календарь', exact: true }).click()
;(await page.evaluate(() => document.documentElement.classList.contains('dark'))) ? ok('тёмная тема') : fail('тема не переключилась')
await page.screenshot({ path: `${SHOTS}/8-dark.png` })

// после перезагрузки план тот же (IndexedDB): банк разложен, тема тёмная
await page.waitForTimeout(800)
await page.reload()
await page.getByRole('grid').waitFor()
await page.getByRole('button', { name: 'План', exact: true }).click()
await page.getByLabel('Поиск по плану').fill('Агент продаж')
;(await page.getByRole('button', { name: /Демо \/ Агент продаж/ }).count()) ? ok('правки пережили перезагрузку') : fail('правки потерялись')

// телефон
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true })
await phone.goto(BASE)
await phone.getByRole('grid').waitFor()
const wide = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
wide ? fail('на телефоне страница шире экрана') : ok('телефон без горизонтального скролла страницы')
await phone.screenshot({ path: `${SHOTS}/9-phone.png` })
await phone.getByRole('button', { name: 'Фильтры' }).click()
await phone.getByRole('button', { name: 'Закрыть фильтры' }).click()
;(await phone.locator('.cp-side[data-open="true"]').count()) ? fail('фильтры на телефоне не закрываются') : ok('фильтры на телефоне закрываются')
await phone.getByRole('button', { name: 'Фильтры' }).click()
await phone.mouse.click(370, 400)
;(await phone.locator('.cp-side[data-open="true"]').count()) ? fail('тап мимо фильтров их не закрыл') : ok('тап мимо закрывает фильтры')

await browser.close()
