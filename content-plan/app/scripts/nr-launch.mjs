// nr-launch/1 — Neuronium (https://os.neuronium.ai) открывает SMM как приложение: в своём окне (фрейм) или в новой
// вкладке. Один источник — переменная NR_HOST_ORIGINS: точные адреса Neuronium через запятую. Из неё при сборке
// пишется dist/nr-launch.json — паспорт для Neuronium (FR-CP-065), а при установке — заголовки фрейма в конфиге
// nginx или Caddy для https://smm.neuronium.ai (FR-CP-067). Без переменной — "frame": false, а конфиг пускает во
// фрейм только сам сайт (NFR-CP-006). Конфиг — в stdout: node scripts/nr-launch.mjs nginx | caddy (deploy/README.md).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CONTRACT = 'nr-launch/1'
export const DEPARTMENT = { id: 'smm', name: { ru: 'SMM', en: 'SMM' } }
export const PUBLIC_HOST = 'smm.neuronium.ai'
export const LAUNCH_FILE = 'nr-launch.json'
export const LAUNCH_CACHE = 'public, max-age=60'
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOCAL = new Set(['localhost', '127.0.0.1'])

/** Точный адрес: https://хост[:порт] без пути, «/» в конце, звёздочек и логина; http:// — только localhost и 127.0.0.1. */
function isOrigin(entry) {
  let url
  try {
    url = new URL(entry)
  } catch {
    return false
  }
  if (url.origin !== entry || !/^[a-z0-9.-]+$/.test(url.hostname)) return false
  return url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL.has(url.hostname))
}

/** NR_HOST_ORIGINS → адреса Neuronium (FR-CP-066). Неверные пропускаются — одной строкой в журнал. */
export function parseHostOrigins(raw, log = (line) => console.warn(line)) {
  const origins = []
  const rejected = []
  for (const part of String(raw ?? '').split(',')) {
    const entry = part.trim()
    if (!entry) continue
    if (!isOrigin(entry)) rejected.push(entry)
    else if (!origins.includes(entry)) origins.push(entry)
  }
  if (rejected.length) {
    log(
      `nr-launch: NR_HOST_ORIGINS — пропущено ${rejected.map((e) => JSON.stringify(e)).join(', ')}: ` +
        'нужен точный адрес https://хост[:порт] (http:// — только localhost и 127.0.0.1)',
    )
  }
  return { origins, rejected }
}

/** Заголовки фрейма: адреса есть — frame-ancestors с ними и без X-Frame-Options; нет — только сам сайт (FR-CP-067). */
export function frameHeaders(origins) {
  return origins.length
    ? { 'Content-Security-Policy': `frame-ancestors 'self' ${origins.join(' ')}` }
    : { 'Content-Security-Policy': "frame-ancestors 'self'", 'X-Frame-Options': 'SAMEORIGIN' }
}

/** Паспорт nr-launch/1: ни переменных окружения, ни данных плана — только эти поля (FR-CP-065, NFR-CP-006). */
export function launchManifest({ origins, version, commit }) {
  const doc = { contract: CONTRACT, id: DEPARTMENT.id, name: { ...DEPARTMENT.name }, frame: origins.length > 0, version }
  if (commit) doc.commit = commit
  return doc
}

/** Версия SMM — из package.json. */
export function readVersion(root = APP_ROOT) {
  return String(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version)
}

/** Собранный коммит, если сборка идёт в git-копии; иначе — ничего (поле commit тогда не пишется). */
export function gitCommit(cwd = APP_ROOT) {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return /^[0-9a-f]{40}$/.test(sha) ? sha : undefined
  } catch {
    return undefined
  }
}

function readDotenv(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return {}
  }
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (m) out[m[1]] = /^(['"]).*\1$/.test(m[2]) ? m[2].slice(1, -1) : m[2].replace(/\s+#.*$/, '')
  }
  return out
}

/**
 * NR_* и SMM_* — из окружения или из .env рядом с package.json (те же файлы, что читает Vite: .env, .env.local,
 * .env.[mode], .env.[mode].local; окружение главнее). Без зависимостей: конфиг nginx или Caddy делается одним node.
 */
export function readEnv(dir = APP_ROOT, mode = 'production', env = process.env) {
  const files = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`].map((f) => readDotenv(join(dir, f)))
  const out = {}
  for (const [k, v] of [...files.flatMap(Object.entries), ...Object.entries(env)]) {
    if (/^(NR|SMM)_/.test(k) && v !== undefined) out[k] = v
  }
  return out
}

/**
 * Плагин Vite: паспорт пишется при сборке прямо в dist/ (в git ничего не меняется — NFR-CP-007),
 * а в `npm run dev` отдаётся по /nr-launch.json. Параметры — для тестов: env, log, commit().
 */
export function nrLaunch(opts = {}) {
  let root = APP_ROOT
  let env = opts.env
  let log = opts.log
  let text
  const manifest = () =>
    (text ??=
      JSON.stringify(
        launchManifest({
          origins: parseHostOrigins(env?.NR_HOST_ORIGINS, log).origins,
          version: readVersion(root),
          commit: (opts.commit ?? gitCommit)(root),
        }),
        null,
        2,
      ) + '\n')
  return {
    name: 'nr-launch',
    configResolved(config) {
      root = config.root
      env ??= readEnv(config.envDir, config.mode)
      log ??= (line) => config.logger.warn(line)
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? '').split('?')[0] !== `/${LAUNCH_FILE}`) return next()
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', LAUNCH_CACHE)
        res.end(manifest())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: LAUNCH_FILE, source: manifest() })
    },
  }
}

const quoted = (v) => `"${v}"`

/** Конфиг nginx для https://smm.neuronium.ai: статика из dist/, заголовки фрейма — из NR_HOST_ORIGINS (FR-CP-067). */
export function renderNginx({ origins, host = PUBLIC_HOST, root = join(APP_ROOT, 'dist') }) {
  const headers = Object.entries(frameHeaders(origins))
    .map(([k, v]) => `    add_header ${k} ${quoted(v)} always;`)
    .join('\n')
  return `# ${host} — SMM, контент-план: статика из dist/. Сделано: node scripts/nr-launch.mjs nginx (deploy/README.md)
# nr-launch/1: NR_HOST_ORIGINS=${origins.join(',') || '(не задана — во фрейм только сам сайт)'}
# HTTPS: sudo certbot --nginx -d ${host} (допишет listen 443 и сертификат)
server {
    listen 80;
    listen [::]:80;
    server_name ${host};
    root ${root};
    index index.html;

    # кто может показать SMM в своём окне (FR-CP-067)
${headers}

    # паспорт для Neuronium: короткий кэш (expires не сбрасывает add_header выше)
    location = /${LAUNCH_FILE} {
        expires 60s;
    }
    location / {
        try_files $uri $uri/ /index.html;
    }
}
`
}

/** Конфиг Caddy для https://smm.neuronium.ai (HTTPS Caddy делает сам); заголовки фрейма — из NR_HOST_ORIGINS. */
export function renderCaddy({ origins, host = PUBLIC_HOST, root = join(APP_ROOT, 'dist') }) {
  const headers = Object.entries(frameHeaders(origins))
    .map(([k, v]) => `\t\t${k} ${quoted(v)}`)
    .join('\n')
  return `# ${host} — SMM, контент-план: статика из dist/. Сделано: node scripts/nr-launch.mjs caddy (deploy/README.md)
# nr-launch/1: NR_HOST_ORIGINS=${origins.join(',') || '(не задана — во фрейм только сам сайт)'}
${host} {
\troot * ${root}
\tencode gzip
\t# кто может показать SMM в своём окне (FR-CP-067)
\theader {
${headers}
\t}
\t# паспорт для Neuronium: короткий кэш
\theader /${LAUNCH_FILE} Cache-Control ${quoted(LAUNCH_CACHE)}
\ttry_files {path} /index.html
\tfile_server
}
`
}

/** node scripts/nr-launch.mjs nginx | caddy | json — конфиг или паспорт в stdout; журнал — в stderr. */
export function cli(argv, env = readEnv(), log = (line) => console.warn(line)) {
  const what = argv[0]
  const render = { nginx: renderNginx, caddy: renderCaddy }[what]
  const { origins } = parseHostOrigins(env.NR_HOST_ORIGINS, log)
  const where = { origins, host: env.SMM_HOST || PUBLIC_HOST, root: env.SMM_ROOT || join(APP_ROOT, 'dist') }
  if (render) return render(where)
  if (what === 'json') return JSON.stringify(launchManifest({ origins, version: readVersion(), commit: gitCommit() }), null, 2) + '\n'
  throw new Error('Использование: node scripts/nr-launch.mjs nginx | caddy | json  (NR_HOST_ORIGINS, SMM_HOST, SMM_ROOT)')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(cli(process.argv.slice(2)))
  } catch (e) {
    console.error(e.message)
    process.exitCode = 2
  }
}
