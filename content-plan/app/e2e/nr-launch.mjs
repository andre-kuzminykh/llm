// T-CP-065…068 e2e: настоящая сборка (vite build) без NR_HOST_ORIGINS и с ней, и настоящий браузер: страница-«Neuronium»
// показывает SMM в своём окне, только если её адрес в списке; чужой сайт и сборка без переменной — нет.
// Статику отдаёт node с заголовками из того же frameHeaders(), что пишет конфиги nginx и Caddy (scripts/nr-launch.mjs).
// Запуск: npm run test:nr-launch (Chromium — /opt/pw-browsers, другой путь — CHROME). Скриншот — в e2e/shots.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { build, createLogger } from 'vite'
import { frameHeaders, parseHostOrigins } from '../scripts/nr-launch.mjs'

const APP = fileURLToPath(new URL('..', import.meta.url))
const SHOTS = process.env.SHOTS ?? fileURLToPath(new URL('./shots/', import.meta.url))
const CHROME = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const TMP = mkdtempSync(join(tmpdir(), 'smm-nr-launch-'))
mkdirSync(SHOTS, { recursive: true })

const fail = (msg) => {
  console.error(`✗ ${msg}`)
  process.exitCode = 1
}
const ok = (msg) => console.log(`✓ ${msg}`)
const check = (cond, yes, no) => (cond ? ok(yes) : fail(no))

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }

/** Сервер на свободном порту: статика из dir с заголовками headers, или страница page(адрес запроса). */
function serve({ dir, page, headers = {} }) {
  const server = createServer((req, res) => {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
    if (page) {
      res.setHeader('Content-Type', TYPES['.html'])
      return res.end(page(new URL(req.url ?? '/', 'http://x')))
    }
    const path = decodeURIComponent((req.url ?? '/').split('?')[0])
    const file = normalize(join(dir, path === '/' ? 'index.html' : path))
    if (!file.startsWith(dir)) return res.writeHead(403).end()
    try {
      const body = readFileSync(file)
      res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
      res.end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ server, port: server.address().port })))
}

/** vite build в свою папку с этой NR_HOST_ORIGINS (undefined — без неё); что легло в nr-launch.json и что сказал журнал. */
async function buildWith(raw) {
  const outDir = join(TMP, raw === undefined ? 'off' : 'on')
  if (raw === undefined) delete process.env.NR_HOST_ORIGINS
  else process.env.NR_HOST_ORIGINS = raw
  const logger = createLogger('warn')
  const said = []
  logger.warn = (msg) => said.push(String(msg))
  await build({ root: APP, logLevel: 'warn', customLogger: logger, build: { outDir, emptyOutDir: true } })
  delete process.env.NR_HOST_ORIGINS
  return { outDir, doc: JSON.parse(readFileSync(join(outDir, 'nr-launch.json'), 'utf8')), said: said.filter((m) => m.startsWith('nr-launch:')) }
}

const servers = []
const browser = await chromium.launch({ executablePath: CHROME })
try {
  // «Neuronium» и чужой сайт — страницы с фреймом SMM (/?app=порт); адрес «Neuronium» — в NR_HOST_ORIGINS
  const hostHtml = (url) =>
    `<!doctype html><title>host</title><iframe id="f" src="http://127.0.0.1:${Number(url.searchParams.get('app'))}/" style="width:${Number(url.searchParams.get('w')) || 1200}px;height:${Number(url.searchParams.get('h')) || 760}px;border:0"></iframe>`
  const nr = await serve({ page: hostHtml })
  const evil = await serve({ page: hostHtml })
  servers.push(nr.server, evil.server)
  const NR = `http://localhost:${nr.port}`
  const RAW = `${NR}, https://*.neuronium.ai`

  // T-CP-065: сборка без переменной — "frame": false; с ней — true; неверный адрес — одной строкой и мимо
  const off = await buildWith(undefined)
  const on = await buildWith(RAW)
  const keys = (d) => Object.keys(d).join(',')
  const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8'))
  check(
    off.doc.contract === 'nr-launch/1' && off.doc.id === 'smm' && off.doc.name.ru === 'SMM' && off.doc.frame === false && off.doc.version === pkg.version && off.said.length === 0,
    `сборка без NR_HOST_ORIGINS: dist/nr-launch.json — ${keys(off.doc)}, "frame": false`,
    `сборка без переменной: ${JSON.stringify(off.doc)}, журнал ${off.said.join(' | ')}`,
  )
  check(
    on.doc.frame === true && /^(contract,id,name,frame,version)(,commit)?$/.test(keys(on.doc)) && !JSON.stringify(on.doc).includes('localhost'),
    'сборка с NR_HOST_ORIGINS: "frame": true, адресов и переменных в паспорте нет',
    `сборка с переменной: ${JSON.stringify(on.doc)}`,
  )
  check(
    on.said.length === 1 && on.said[0].includes('"https://*.neuronium.ai"') && !on.said[0].includes(NR),
    'неверный адрес — одна строка в журнале сборки, верный остаётся',
    `журнал сборки: ${JSON.stringify(on.said)}`,
  )

  // T-CP-067: заголовки — из той же переменной, как в конфигах nginx и Caddy
  const { origins } = parseHostOrigins(RAW, () => {})
  const appOn = await serve({ dir: on.outDir, headers: frameHeaders(origins) })
  const appOff = await serve({ dir: off.outDir, headers: frameHeaders([]) })
  servers.push(appOn.server, appOff.server)
  const head = await fetch(`http://127.0.0.1:${appOn.port}/`)
  check(
    head.headers.get('content-security-policy') === `frame-ancestors 'self' ${NR}` && head.headers.get('x-frame-options') === null,
    `ответ SMM: Content-Security-Policy: frame-ancestors 'self' ${NR}, без X-Frame-Options`,
    `заголовки: ${head.headers.get('content-security-policy')} / ${head.headers.get('x-frame-options')}`,
  )
  const launch = await (await fetch(`http://127.0.0.1:${appOn.port}/nr-launch.json`)).json()
  check(launch.frame === true, '/nr-launch.json отдаётся рядом с приложением', `/nr-launch.json: ${JSON.stringify(launch)}`)

  /** Значок-человечек — кружок аккаунта (`user` из src/ui/Icon.tsx); во фрейме он только у Neuronium (T-CP-070). */
  const PERSON = 'svg circle[cx="12"][cy="8.5"][r="3.5"]'
  /** Меню профиля во фрейме — «Настройки»: шестерёнка на кнопке — тот же значок, что у «Настройки: соцсети и
   *  конкуренты» в меню; человечка нет и в открытом меню; строки «Скоро: …» нет. */
  const settingsMenu = async (inside, button) => {
    await button.click()
    const menu = inside.getByRole('menu', { name: 'Настройки' })
    await menu.waitFor({ timeout: 4000 })
    const item = menu.getByRole('menuitem', { name: 'Настройки: соцсети и конкуренты' })
    return {
      settings: await item.count(),
      gear: (await button.locator('svg').innerHTML()) === (await item.locator('svg').innerHTML()),
      peopleOpen: await inside.locator(PERSON).count(),
      note: await menu.getByText(/^Скоро:/).count(),
    }
  }

  /** Что SMM рисует слева во фрейме (T-CP-069, T-CP-070): панель отделов, знак Nr, «— скоро»; «Настройки» внизу колонки
   *  разделов и меню — справа от неё. */
  const shell = async (page, inside, shot) => {
    const smm = inside.getByRole('navigation', { name: 'SMM' })
    const out = {
      rail: await inside.getByRole('navigation', { name: 'Отделы' }).count(),
      brand: await inside.locator('.nr-rail-brand').count(),
      soon: await inside.getByRole('button', { name: /— скоро$/ }).count(),
      items: await smm.getByRole('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label'))),
      people: await inside.locator(PERSON).count(),
    }
    const col = await smm.boundingBox()
    const button = smm.getByRole('button', { name: 'Настройки' })
    if (!(await button.count())) return out
    const btn = await button.boundingBox()
    Object.assign(out, await settingsMenu(inside, button))
    const box = await inside.getByRole('menu', { name: 'Настройки' }).boundingBox()
    out.foot = Math.round(col.y + col.height - (btn.y + btn.height)) // от низа кнопки до низа колонки, px
    out.beside = Math.round(box.x - (col.x + col.width)) // меню справа от колонки, px
    if (shot) await page.screenshot({ path: join(SHOTS, shot) })
    await page.keyboard.press('Escape')
    return out
  }

  /** Что на телефоне видно в документе SMM (выполняется во фрейме): где строка разделов, не меньше ли 44 px кнопки, не
   *  наезжают ли друг на друга, не обрезаны ли подписи и страница вбок, контраст подписей, и нет ли навигации под страницей. */
  const stripGeometry = () => {
    const box = (e) => e.getBoundingClientRect()
    const nav = document.querySelector('nav[aria-label="Разделы"]')
    const buttons = [...nav.querySelectorAll('button')]
    const boxes = buttons.map(box)
    const lum = (c) => {
      const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map((v) => {
        const x = Number(v) / 255
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const ratio = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p)
      return (hi + 0.05) / (lo + 0.05)
    }
    const bg = getComputedStyle(nav).backgroundColor
    const main = box(document.querySelector('main'))
    return {
      top: Math.round(box(nav).top),
      height: Math.round(box(nav).height),
      smallest: Math.round(Math.min(...boxes.map((b) => Math.min(b.width, b.height)))),
      crossing: boxes.some((a, i) => boxes.some((b, j) => j > i && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5)),
      clipped: buttons.some((b) => {
        const label = b.querySelector('span')
        return !!label && label.scrollWidth > label.clientWidth + 0.5
      }),
      outside: boxes.some((b) => b.left < -0.5 || b.right > innerWidth + 0.5),
      wide: document.documentElement.scrollWidth > innerWidth,
      contrast: Math.round(Math.min(...buttons.slice(0, 2).map((b) => ratio(getComputedStyle(b).color, bg))) * 10) / 10,
      below: [...document.querySelectorAll('nav')].filter((n) => box(n).top >= main.bottom - 1).length, // навигация ниже страницы
      bottomBar: document.querySelectorAll('.cp-tabs, nav.nr-rail').length,
      dark: document.documentElement.classList.contains('dark'),
    }
  }

  /** Телефон в окне «Neuronium» (T-CP-070, NFR-CP-009): внизу у SMM панели нет; «Главная», «Календарь» и «Настройки» —
   *  вверху, в шапке (шестерёнкой, без человечка); меню раскрывается под строкой. Тема — светлая или тёмная. */
  const phone = async (hostPort, appPort, shot, colorScheme = 'light') => {
    const page = await browser.newPage({ viewport: { width: 406, height: 860 }, colorScheme })
    await page.goto(`http://localhost:${hostPort}/?app=${appPort}&w=390&h=844`)
    const inside = page.frameLocator('#f')
    const tabs = inside.getByRole('navigation', { name: 'Разделы' })
    const shown = await tabs.waitFor({ timeout: 8000 }).then(() => true, () => false)
    if (!shown) {
      await page.close()
      return { shown }
    }
    const frame = await (await page.$('#f')).contentFrame()
    const button = tabs.getByRole('button', { name: 'Настройки' })
    const out = {
      shown,
      tabs: (await tabs.getByRole('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') ?? b.textContent.trim()))).join('|'),
      people: await inside.locator(PERSON).count(),
      avatar: await inside.locator('.cp-avatar').count(),
      ...(await frame.evaluate(stripGeometry)),
    }
    // раздел переключается из шапки: календарь и обратно на главную
    await tabs.getByRole('button', { name: 'Календарь' }).click()
    // на телефоне календарь открывается лентой по дням (FR-CP-072), неделя по шкале — если её выбрали
    out.calendar = await inside.locator('[aria-label="Лента по дням"], [aria-label="Неделя по времени"]').first().waitFor({ timeout: 4000 }).then(() => true, () => false)
    await tabs.getByRole('button', { name: 'Главная' }).click()
    out.home = await inside.getByRole('heading', { name: 'Главная' }).waitFor({ timeout: 4000 }).then(() => true, () => false)
    if (await button.count()) {
      Object.assign(out, await settingsMenu(inside, button))
      const bar = await frame.evaluate(() => document.querySelector('nav[aria-label="Разделы"]').getBoundingClientRect().bottom)
      const menu = await frame.evaluate(() => {
        const b = document.querySelector('[role="menu"]').getBoundingClientRect()
        return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }
      })
      out.menuUnder = menu.top >= bar && menu.left >= 0 && menu.right <= 390 && menu.bottom <= 844 // под строкой и целиком в окне
      if (shot) await page.screenshot({ path: join(SHOTS, shot) })
    }
    await page.close()
    return out
  }

  /** Хозяйская страница с фреймом SMM: открылось ли приложение внутри, что слева и что сказал браузер. */
  const host = async (hostPort, appPort, shot) => {
    const page = await browser.newPage({ viewport: { width: 1240, height: 800 } })
    const errors = []
    const refused = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => /Refused to (display|frame)/.test(m.text()) && refused.push(m.text()))
    await page.goto(`http://localhost:${hostPort}/?app=${appPort}`)
    const inside = page.frameLocator('#f')
    const shown = await inside
      .getByRole('heading', { name: 'Главная' })
      .waitFor({ timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    const framed = shown ? await (await page.$('#f')).contentFrame().then((f) => f.evaluate(() => window.top !== window.self)) : false
    if (shot) await page.screenshot({ path: join(SHOTS, shot) })
    const left = shown && shot ? await shell(page, inside, shot.replace('.png', '-profile.png')) : null
    await page.close()
    return { shown, framed, errors, refused, left }
  }

  // T-CP-068: «Neuronium» из списка — SMM открыт в его окне и работает как есть (входа нет)
  const yes = await host(nr.port, appOn.port, 'nr-launch-frame.png')
  check(yes.shown && yes.framed && !yes.errors.length, 'Neuronium из списка: SMM во фрейме — «Главная» на месте, ошибок нет', `во фрейме: ${JSON.stringify(yes)}`)
  // T-CP-069: меню отделов одно — у Neuronium; своей панели, знака Nr и «— скоро» у SMM во фрейме нет
  const left = yes.left ?? {}
  check(
    left.rail === 0 && left.brand === 0 && left.soon === 0 && left.items?.slice(0, 2).join('|') === 'Главная — аналитика и лента|Календарь контента',
    'во фрейме своей панели отделов у SMM нет: ни Nr, ни отделов; «Главная» и «Календарь» на месте',
    `слева во фрейме: ${JSON.stringify(left)}`,
  )
  // T-CP-070: меню профиля — «Настройки» шестерёнкой внизу колонки разделов, меню — справа от неё, без «Скоро: …»;
  // значка-человечка у SMM во фрейме нет ни в колонке, ни в меню — кружок аккаунта только у Neuronium
  check(
    left.items?.at(-1) === 'Настройки' && left.gear && left.people === 0 && left.peopleOpen === 0 && left.foot >= 0 && left.foot <= 24 && left.beside >= 0 && left.beside <= 16 && left.note === 0 && left.settings === 1,
    '«Настройки» шестерёнкой — внизу колонки разделов, меню — справа от неё (настройки на месте, «Скоро» нет); человечка во фрейме нет',
    `настройки во фрейме: ${JSON.stringify(left)}`,
  )
  // T-CP-070, телефон: внизу у SMM панели нет (она одна, у Neuronium); «Главная, Календарь, Настройки» — вверху, в шапке:
  // шестерёнкой, человечка и кружка нет, меню то же и раскрывается под строкой
  const small = await phone(nr.port, appOn.port, 'nr-launch-frame-phone.png')
  check(
    small.tabs === 'Главная|Календарь|Настройки' && small.gear && small.people === 0 && small.avatar === 0 && small.peopleOpen === 0 && small.note === 0 && small.settings === 1 && small.menuUnder,
    'телефон во фрейме: «Главная, Календарь, Настройки» — вверху, в шапке; шестерёнкой, человечка нет, меню то же и под строкой',
    `телефон во фрейме: ${JSON.stringify(small)}`,
  )
  check(
    small.top === 0 && small.bottomBar === 0 && small.below === 0 && small.calendar && small.home,
    'телефон во фрейме: внизу у SMM панели нет (она одна, у Neuronium); «Главная» и «Календарь» в шапке переключают разделы',
    `телефон во фрейме, панель: ${JSON.stringify(small)}`,
  )
  // NFR-CP-009: кнопки не меньше 44 px, не наезжают друг на друга, подписи целы, страница вбок не едет, контраст подписей ≥ 4,5
  check(
    small.smallest >= 44 && !small.crossing && !small.clipped && !small.outside && !small.wide && small.contrast >= 4.5 && !small.dark,
    `телефон во фрейме, светлая тема: кнопки от 44 px, без наложений и обрезанных подписей, контраст ${small.contrast}`,
    `телефон во фрейме, размеры: ${JSON.stringify(small)}`,
  )
  const night = await phone(nr.port, appOn.port, 'nr-launch-frame-phone-dark.png', 'dark')
  check(
    night.tabs === 'Главная|Календарь|Настройки' && night.dark && night.smallest >= 44 && !night.crossing && !night.clipped && !night.outside && !night.wide && night.contrast >= 4.5 && night.bottomBar === 0 && night.below === 0 && night.menuUnder,
    `телефон во фрейме, тёмная тема: то же — кнопки от 44 px, без наложений, внизу ничего, контраст ${night.contrast}`,
    `телефон во фрейме, тёмная тема: ${JSON.stringify(night)}`,
  )
  // чужой сайт — браузер не показывает
  const no = await host(evil.port, appOn.port)
  check(!no.shown && no.refused.some((t) => t.includes('frame-ancestors')), 'чужой сайт: браузер не показывает SMM (frame-ancestors)', `чужой сайт: ${JSON.stringify(no)}`)
  // без переменной — как было: во фрейм только сам сайт, и Neuronium открывает SMM в новой вкладке
  const before = await host(nr.port, appOff.port)
  check(!before.shown && before.refused.length > 0, 'без NR_HOST_ORIGINS: во фрейм — только сам сайт (SAMEORIGIN)', `без переменной: ${JSON.stringify(before)}`)
} catch (e) {
  fail(e.stack ?? String(e))
} finally {
  await browser.close()
  for (const s of servers) s.close()
  rmSync(TMP, { recursive: true, force: true })
}
