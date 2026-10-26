// T-CP-E1: реальный браузер против собранного приложения (npm run build && npm run preview).
// Проверяет панель отделов Neuronium, дашборд и календарь, бесконечный месяц и переход к дате, карточки
// с хэштегом, перенос мышью с группой, «Поменять местами» и отмену, панель дня, ▶ и задачу, неделю по времени
// и перенос на час, банк идей и темы на дашборде, «+» с версией по триггеру, фильтры за кнопкой,
// «Как пользоваться», тёмную тему и телефон. Скриншоты — в e2e/shots (или в $SHOTS).
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
await page.getByRole('heading', { name: 'Дашборд' }).waitFor()
const nav = page.getByRole('navigation', { name: 'Отделы' })
check(
  (await nav.getByRole('button', { name: 'SMM — контент-план' }).getAttribute('aria-current')) === 'page' && (await nav.getByRole('button', { name: /— скоро$/ }).count()) === 9,
  'слева — десять отделов Neuronium, открыт SMM',
  'панель отделов не та',
)
await page.locator('.cp-top').getByRole('button', { name: 'Календарь' }).click()
await page.getByRole('grid', { name: 'Неделя по времени' }).waitFor()
ok('дашборд → «Календарь» справа вверху → неделя')
await page.getByRole('radio', { name: 'Месяц' }).click()
await page.getByRole('button', { name: 'Следующий месяц' }).click()
await page.getByRole('heading', { name: 'Ноябрь 2026' }).waitFor()
await page.waitForTimeout(700) // плавная прокрутка
await page.screenshot({ path: `${SHOTS}/1-month.png` })
ok('месяц открылся')
const card = cell('2026-11-02').locator('.cp-card--main').first()
check((await cell('2026-11-02').locator('.cp-card').count()) > 5 && !(await cell('2026-11-02').getByText(/^ещё/).count()), 'месяц: в дне все единицы контента, без «ещё N»', 'месяц показывает не всё')
check(
  (await card.getByLabel('Хэштег: #демо').count()) && (await card.locator('.cp-card__title').textContent()) === 'Landao',
  'карточка: тема хэштегом, название — только тема',
  'карточка без метки рубрики или с рубрикой в названии',
)

// перенос FULL «Демо: Landao» со 2.11 на 3.11, где уже стоит FULL «Кейсы: Сбер»: группа едет вместе,
// нарушение одно, а «Поменять местами» ставит Сбер на 2.11
await card.dragTo(cell('2026-11-03'))
check(await cell('2026-11-03').locator('.cp-card--main', { hasText: 'Landao' }).count(), 'перенос мышью', 'карточка не переехала')
check((await cell('2026-11-03').locator('.cp-viol').count()) === 1, 'нарушение отмечено', 'нет отметки нарушения')
await toast().filter({ hasText: 'вместе с группой' }).waitFor()
await page.screenshot({ path: `${SHOTS}/2-moved.png` })
const v = await cell('2026-11-03').locator('.cp-viol').getAttribute('title')
check(v === 'Нарушений: 1', 'два FULL в день — одно нарушение, а не шесть', `после переноса: ${v}`)
await toast().getByRole('button', { name: 'Поменять местами' }).click()
check(
  (await cell('2026-11-02').locator('.cp-card--main', { hasText: 'Сбер' }).count()) && (await cell('2026-11-03').locator('.cp-card--main', { hasText: 'Landao' }).count()),
  '«Поменять местами»',
  'FULL не поменялись местами',
)
await page.keyboard.press('Control+z')
await page.keyboard.press('Control+z')
check(await cell('2026-11-02').locator('.cp-card--main', { hasText: 'Landao' }).count(), 'отмена вернула', 'отмена не сработала')

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
await page.waitForTimeout(400)
await page.screenshot({ path: `${SHOTS}/5-editor.png` })
await page.getByRole('button', { name: 'Отмена' }).click()
ok('форма материала')
await page.keyboard.press('Escape')

// неделя по времени — календарь из nr_management: карточку берут и ведут указателем, тянут за край, лист тянут рукой
await page.getByRole('radio', { name: 'Время' }).click()
await page.getByRole('grid', { name: 'Неделя по времени' }).waitFor()
await page.getByLabel('Перейти к дате').fill('2026-11-09')
await page.waitForTimeout(900)
await page.screenshot({ path: `${SHOTS}/6-week.png` })
const sheet = page.locator('.cp-body')
const top = await sheet.evaluate((el) => el.scrollTop)
check(top > 0 && Math.round(top) % 64 === 32, 'шкала открыта за полчаса до часа первого материала недели', `шкала прокручена на ${top}px`)
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
await page.mouse.up()
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
// день, три дня или неделя; лента дней
const spans = page.getByRole('radiogroup', { name: 'Сколько дней на экране' })
await spans.getByRole('radio', { name: 'День' }).click()
await page.getByRole('group', { name: 'Лента дней' }).getByRole('button', { name: /^Чт, 12 ноября 2026/ }).click()
await page.waitForTimeout(900)
const one = await page.locator('.cp-tg__col[data-date="2026-11-12"]').boundingBox()
const jumpText = await page.locator('.cp-jump__btn').textContent()
check(one && one.width > 800 && /12 ноя/.test(jumpText), 'день на экран; лента дней переходит к дню', `день: ширина ${one?.width}, заголовок «${jumpText}»`)
await page.screenshot({ path: `${SHOTS}/6b-day.png` })
await spans.getByRole('radio', { name: 'Неделя' }).click()
await page.getByLabel('Перейти к дате').fill('2026-11-09')
await page.waitForTimeout(900)
// лента Neuronium — поток 24/7: строкой над шкалой, без времени; авто-публикации видны по умолчанию и скрываются фильтром
const allday = page.getByLabel('Круглосуточно, 2026-11-10')
check(
  (await allday.getByRole('button', { name: /^Новости: Все новости, 24\/7/ }).count()) && !(await col.getByRole('button', { name: /Все новости/ }).count()),
  'лента Neuronium — «24/7» над шкалой, не в часах',
  'лента Neuronium стоит на шкале времени',
)
await page.getByRole('button', { name: 'Фильтры' }).click()
await page.getByRole('switch', { name: 'Ежедневные авто-публикации' }).click()
check(!(await allday.count()) && (await page.getByRole('button', { name: 'Снять фильтр: Без авто-публикаций' }).count()), 'фильтр скрывает авто-публикации', 'авто-публикации не скрылись')
await page.getByRole('switch', { name: 'Ежедневные авто-публикации' }).click()
await page.getByRole('button', { name: 'Закрыть фильтры' }).click()
check(box && box.width > 120, 'неделя по ширине экрана', 'колонки дней узкие')
await page.getByRole('radio', { name: 'Каналы' }).click()
await page.getByRole('grid', { name: /Неделя по каналам/ }).waitFor()
await page.screenshot({ path: `${SHOTS}/7-week-lanes.png` })
ok('неделя дорожками')
await page.getByRole('radio', { name: 'Время' }).click()

// дашборд: что делать, банк идей (разложить, показать, вернуть), темы
await page.locator('.cp-top').getByRole('button', { name: 'Дашборд' }).click()
await page.getByRole('heading', { name: 'Дашборд' }).waitFor()
check(await page.getByRole('region', { name: 'Что делать' }).count(), 'дашборд: «Что делать»', 'нет списка дел')
await page.screenshot({ path: `${SHOTS}/8-dashboard.png` })
const tags = page.getByRole('group', { name: 'Хэштеги банка' })
await tags.getByRole('button', { name: /^#технологии/ }).click()
check(await page.getByRole('region', { name: 'Банк: #технологии', exact: true }).count(), 'банк идей: хэштег выбирается кнопкой', 'хэштеги банка не работают')
await tags.getByRole('button', { name: /^#демо/ }).click()
await page.getByLabel('Новые темы: #демо', { exact: true }).fill('Агент продаж\nИИ-бухгалтер')
const bank = page.getByRole('region', { name: 'Банк: #демо', exact: true })
await bank.getByRole('button', { name: 'Добавить' }).click()
await bank.getByRole('button', { name: 'Разложить по слотам' }).click()
const t = await toast().textContent()
check(/Разложено: 2 · \d+ \S+ – \d+ \S+ \d{4}/.test(t ?? ''), `банк: ${t?.replace(/Показать|Отменить/g, '').trim()}`, `банк: ${t}`)
await page.screenshot({ path: `${SHOTS}/9-bank.png` })
await bank.getByRole('button', { name: 'Вернуть в банк: ИИ-бухгалтер' }).click()
check(await bank.getByRole('button', { name: 'ИИ-бухгалтер' }).count(), 'тема вернулась в банк', 'тема не вернулась')
const topics = page.getByRole('region', { name: 'Темы' })
check(
  (await topics.getByRole('group', { name: 'Темы: Лаборатория' }).getByRole('button', { name: /^#исследования/ }).count()) &&
    (await topics.getByRole('group', { name: 'Темы: Academy' }).count()) + (await topics.getByRole('group', { name: 'Темы: Академия' }).count()),
  'темы-хэштеги по каналам и разделам',
  'нет хэштегов разделов',
)
await topics.getByRole('group', { name: 'Темы: Dataist' }).getByRole('button', { name: /^#демо/ }).first().click()
await page.getByRole('grid').first().waitFor()
const only = page.getByRole('button', { name: 'Снять фильтр: Только #демо' })
check(await only.count(), 'хэштег открывает календарь только по этой теме', 'фильтр по хэштегу не встал')
await only.click()

// «+» справа внизу: новый контент, версия для Instagram — автоматически после выхода оригинала
await page.getByRole('button', { name: 'Новый контент' }).click()
const newForm = page.getByRole('complementary', { name: 'Новый контент' })
await newForm.getByRole('textbox', { name: 'Тема' }).fill('Пересоздать для Instagram')
await newForm.getByRole('button', { name: 'Версия для Instagram' }).click()
await newForm.getByRole('radio', { name: 'Автоматически после выхода' }).click()
await newForm.getByRole('button', { name: 'Создать' }).click()
check(await toast().filter({ hasText: 'версий: 1, после выхода' }).count(), '«+»: новый контент с версией по триггеру', 'версия не создалась')
await page.keyboard.press('Control+z')

// фильтры — за кнопкой; включённые видны метками и снимаются; у Dataist — разделы
check(!(await page.locator('.cp-side').count()), 'фильтры спрятаны за кнопку', 'панель фильтров открыта сама')
await page.getByRole('button', { name: 'Фильтры' }).click()
await page.locator('.cp-side').getByRole('button', { name: 'Neuronium', exact: true }).click()
const chip = page.getByRole('button', { name: 'Снять фильтр: Без Neuronium' })
check(await chip.count(), 'включённый фильтр — меткой в шапке', 'нет метки фильтра')
await chip.click()
check(!(await chip.count()), 'метка снимает фильтр', 'фильтр не снялся')
await page.locator('.cp-side').getByRole('button', { name: 'Лаборатория', exact: true }).click()
const sec = page.getByRole('button', { name: /^Снять фильтр: Без Лаборатория/ })
check(await sec.count(), 'фильтр по разделу канала (Лаборатория)', 'разделы канала не фильтруются')
await sec.click()
await page.getByRole('button', { name: 'Закрыть фильтры' }).click()

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

// после перезагрузки план тот же (IndexedDB): разложенная тема на месте
await page.waitForTimeout(800)
await page.reload()
await page.locator('.cp-top').waitFor()
if (await page.locator('.cp-top').getByRole('button', { name: 'Дашборд' }).count()) await page.locator('.cp-top').getByRole('button', { name: 'Дашборд' }).click()
await page.getByLabel('Поиск по плану').fill('Агент продаж')
check(await page.getByRole('button', { name: 'Агент продаж' }).count(), 'правки пережили перезагрузку', 'правки потерялись')

// телефон: лента по дням
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await phone.goto(BASE)
await phone.getByRole('heading', { name: 'Дашборд' }).waitFor()
await phone.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'Календарь' }).click()
await phone.getByRole('button', { name: 'Вид', exact: true }).click()
await phone.getByRole('menuitemradio', { name: 'Лента' }).click()
await phone.getByRole('feed', { name: 'Лента по дням' }).waitFor()
check(!(await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'телефон: лента по дням без горизонтального скролла', 'на телефоне страница шире экрана')
await phone.waitForTimeout(500)
await phone.screenshot({ path: `${SHOTS}/12-phone.png` })
const tabs = await phone.getByRole('navigation', { name: 'Разделы' }).getByRole('button').allTextContents()
check(tabs.join('|') === 'ДашбордКалендарьПрофиль'.replace(/(?<=.)(?=[А-Я])/g, '|'), 'телефон: внизу Дашборд, Календарь, Профиль', `телефон: внизу ${tabs.join(', ')}`)
await phone.getByRole('button', { name: 'Вид', exact: true }).click()
await phone.getByRole('menuitemradio', { name: 'Время' }).click()
await phone.getByRole('grid', { name: 'Неделя по времени' }).waitFor()
const head = await phone.locator('.cp-top').boundingBox()
check(head && head.height < 70, 'телефон: шапка недели в одну строку, вид — в меню «Вид»', `телефон: шапка недели ${head?.height}px`)
await phone.getByRole('button', { name: 'Фильтры' }).click()
await phone.getByRole('button', { name: 'Закрыть фильтры' }).click()
check(!(await phone.locator('.cp-side[data-open="true"]').count()), 'фильтры на телефоне закрываются', 'фильтры на телефоне не закрываются')
await phone.getByRole('button', { name: 'Фильтры' }).click()
await phone.mouse.click(370, 400)
check(!(await phone.locator('.cp-side[data-open="true"]').count()), 'тап мимо закрывает фильтры', 'тап мимо фильтров их не закрыл')

await browser.close()
