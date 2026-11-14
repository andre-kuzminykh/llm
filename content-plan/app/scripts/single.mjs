// HTML одним файлом — прототип, который открывается без сервера: стили, скрипт, шрифты и демо-видео ленты — внутри,
// план Датаиста (пример для «Загрузить план Датаиста») — тоже. Запуск: npm run single → dist-single/smm-prototype.html
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
let html = readFileSync(join(dist, 'index.html'), 'utf8')
const asset = (p) => join(dist, p.replace(/^\.\//, ''))
// </script> внутри кода и JSON — экранируем, чтобы не закрыл тег раньше времени
const safe = (s) => s.replace(/<\/script/gi, '<\\/script')

// стили: шрифты — data:-адресами
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/, (_, href) => {
  const css = readFileSync(asset(href), 'utf8').replace(/url\(\.\/([^)]+\.woff2)\)/g, (__, f) => `url(data:font/woff2;base64,${readFileSync(join(dist, 'assets', f)).toString('base64')})`)
  return `<style>${css}</style>`
})
// план Датаиста — пример, тот же JSON, что public/seed.json; скрипт модулем — внутри (модуль выполнится после разбора страницы)
const seed = readFileSync(join(dist, 'seed.json'), 'utf8')
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/, (_, src) => {
  // демо-видео ленты — data:-адресами вместо файлов рядом (new URL("v1-….webm", import.meta.url) → new URL("data:…"))
  const js = readFileSync(asset(src), 'utf8').replace(/new URL\("([\w-]+\.(webm|mp4))",import\.meta\.url\)/g, (_, f, ext) =>
    `new URL("data:video/${ext};base64,${readFileSync(join(dist, 'assets', f)).toString('base64')}")`,
  )
  return `<script type="application/json" id="cp-seed">${safe(seed)}</script><script type="module">${safe(js)}</script>`
})
html = html.replace('<title>Контент-план</title>', '<title>SMM — прототип</title>')
mkdirSync(join(root, 'dist-single'), { recursive: true })
const out = join(root, 'dist-single', 'smm-prototype.html')
writeFileSync(out, html)
console.log(`${out} — ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} МБ`)
