// T-CP-065…068: nr-launch/1 — паспорт для Neuronium, NR_HOST_ORIGINS, заголовки фрейма в конфигах nginx и Caddy.
// Настоящая сборка и настоящий браузер во фрейме — e2e/nr-launch.mjs.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cli,
  frameHeaders,
  launchManifest,
  nrLaunch,
  parseHostOrigins,
  readEnv,
  readVersion,
  renderCaddy,
  renderNginx,
} from './nr-launch.mjs'

const APP = process.cwd() // npm test — из content-plan/app, как у io.test.ts
const PKG = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8'))
const NR = 'https://os.neuronium.ai'
const SHA = '622e642defb56c7b31ac7974e0fd2836d894e29b'
const KEYS = ['contract', 'id', 'name', 'frame', 'version']

/** Плагин как в сборке: configResolved → generateBundle; что он положил в dist/. */
function build(opts, resolved = {}) {
  const plugin = nrLaunch(opts)
  const warn = vi.fn()
  plugin.configResolved({ root: APP, mode: 'production', envDir: APP, logger: { warn }, ...resolved })
  const emitted = []
  plugin.generateBundle.call({ emitFile: (f) => emitted.push(f) })
  return { emitted, warn, doc: JSON.parse(emitted[0].source) }
}

let saved
beforeEach(() => {
  saved = process.env.NR_HOST_ORIGINS
  delete process.env.NR_HOST_ORIGINS
})
afterEach(() => {
  if (saved === undefined) delete process.env.NR_HOST_ORIGINS
  else process.env.NR_HOST_ORIGINS = saved
})

describe('T-CP-066 FR-CP-066 NR_HOST_ORIGINS — точные адреса Neuronium', () => {
  it('не задана или пустая — адресов нет, в журнале тихо', () => {
    const log = vi.fn()
    for (const raw of [undefined, '', ' , ']) expect(parseHostOrigins(raw, log)).toEqual({ origins: [], rejected: [] })
    expect(log).not.toHaveBeenCalled()
  })

  it('через запятую, с пробелами, без повторов; http:// — только localhost и 127.0.0.1', () => {
    const raw = ` ${NR} ,https://os.neuronium.ai:8443,${NR}, http://localhost:5173,http://127.0.0.1:8090 `
    expect(parseHostOrigins(raw, vi.fn()).origins).toEqual([
      NR,
      'https://os.neuronium.ai:8443',
      'http://localhost:5173',
      'http://127.0.0.1:8090',
    ])
  })

  it('неверный адрес пропускается — одной строкой в журнале, верные остаются', () => {
    const bad = [
      'os.neuronium.ai',
      'https://os.neuronium.ai/',
      'https://os.neuronium.ai/app',
      'http://os.neuronium.ai',
      'https://*.neuronium.ai',
      'HTTPS://OS.NEURONIUM.AI',
      "'self'",
      '*',
      'https://user@os.neuronium.ai',
      'javascript:alert(1)',
    ]
    const log = vi.fn()
    const { origins, rejected } = parseHostOrigins([NR, ...bad].join(','), log)
    expect(origins).toEqual([NR])
    expect(rejected).toEqual(bad)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toMatch(/^nr-launch: NR_HOST_ORIGINS — пропущено "os\.neuronium\.ai", .*нужен точный адрес/)
    expect(log.mock.calls[0][0]).not.toContain('\n')
  })
})

describe('T-CP-065 FR-CP-065 NFR-CP-006 паспорт /nr-launch.json', () => {
  it('поля контракта nr-launch/1 и только они; frame — есть ли адреса', () => {
    const off = launchManifest({ origins: [], version: '0.1.0' })
    expect(off).toEqual({ contract: 'nr-launch/1', id: 'smm', name: { ru: 'SMM', en: 'SMM' }, frame: false, version: '0.1.0' })
    const on = launchManifest({ origins: [NR], version: '0.1.0', commit: SHA })
    expect(Object.keys(on)).toEqual([...KEYS, 'commit'])
    expect(on.frame).toBe(true)
    expect(on.commit).toBe(SHA)
  })

  it('сборка без переменной — dist/nr-launch.json с "frame": false, версия из package.json, коммита нет — поля нет', () => {
    const { emitted, doc, warn } = build({ commit: () => undefined })
    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toMatchObject({ type: 'asset', fileName: 'nr-launch.json' })
    expect(doc).toEqual({ contract: 'nr-launch/1', id: 'smm', name: { ru: 'SMM', en: 'SMM' }, frame: false, version: PKG.version })
    expect(readVersion(APP)).toBe(PKG.version)
    expect(warn).not.toHaveBeenCalled()
  })

  it('сборка с адресами — "frame": true и коммит; ни адресов, ни переменных, ни секретов в паспорте', () => {
    const env = { NR_HOST_ORIGINS: `${NR},https://*.neuronium.ai`, NR_SECRET_TOKEN: 'tok-9f1c', SMM_ROOT: '/srv/smm' }
    const { emitted, doc, warn } = build({ env, commit: () => SHA })
    expect(doc.frame).toBe(true)
    expect(doc.commit).toBe(SHA)
    expect(Object.keys(doc)).toEqual([...KEYS, 'commit'])
    for (const leak of ['tok-9f1c', 'neuronium.ai', '/srv/smm', 'NR_']) expect(emitted[0].source).not.toContain(leak)
    expect(warn).toHaveBeenCalledTimes(1) // неверный адрес — одной строкой, через журнал Vite
  })

  it('переменная берётся и из .env рядом с package.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nr-launch-'))
    try {
      writeFileSync(join(dir, '.env'), `NR_HOST_ORIGINS=${NR}\n`)
      expect(build({ commit: () => undefined }, { envDir: dir }).doc.frame).toBe(true)
      expect(build({ commit: () => undefined }, { envDir: APP }).doc.frame).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('npm run dev отдаёт тот же паспорт по /nr-launch.json с коротким кэшем, остальное — дальше', () => {
    const plugin = nrLaunch({ env: { NR_HOST_ORIGINS: NR }, commit: () => undefined })
    plugin.configResolved({ root: APP, mode: 'development', envDir: APP, logger: { warn: vi.fn() } })
    let handler
    plugin.configureServer({ middlewares: { use: (fn) => (handler = fn) } })
    const res = { headers: {}, setHeader: (k, v) => (res.headers[k] = v), end: (b) => (res.body = b) }
    const next = vi.fn()
    handler({ url: '/nr-launch.json?x=1' }, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.headers['Cache-Control']).toBe('public, max-age=60')
    expect(res.headers['Content-Type']).toMatch(/^application\/json/)
    expect(JSON.parse(res.body)).toMatchObject({ contract: 'nr-launch/1', id: 'smm', frame: true })
    handler({ url: '/' }, {}, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('плагин подключён в vite.config.ts — паспорт пишет каждая сборка (настоящая сборка — e2e/nr-launch.mjs)', () => {
    const conf = readFileSync(join(APP, 'vite.config.ts'), 'utf8')
    expect(conf).toContain("import { nrLaunch } from './scripts/nr-launch.mjs'")
    expect(conf).toMatch(/plugins: \[[^\]]*nrLaunch\(\)[^\]]*\]/)
  })

  it('.env читается как у Vite: комментарии мимо, окружение главнее, чужие переменные не берутся', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nr-launch-'))
    try {
      writeFileSync(join(dir, '.env'), `# NR_HOST_ORIGINS=https://old.example\nNR_HOST_ORIGINS="${NR}"\nSMM_ROOT=/srv/a # путь\nOPENAI_API_KEY=sk-x\n`)
      writeFileSync(join(dir, '.env.production.local'), 'SMM_ROOT=/srv/b\n')
      expect(readEnv(dir, 'production', {})).toEqual({ NR_HOST_ORIGINS: NR, SMM_ROOT: '/srv/b' })
      expect(readEnv(dir, 'production', { NR_HOST_ORIGINS: '' }).NR_HOST_ORIGINS).toBe('')
      expect(readEnv(join(dir, 'нет'), 'production', {})).toEqual({})
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('T-CP-067 FR-CP-067 NFR-CP-006 NFR-CP-007 заголовки фрейма в конфигах smm.neuronium.ai', () => {
  it('не задана — как было: только сам сайт, X-Frame-Options SAMEORIGIN', () => {
    expect(frameHeaders([])).toEqual({ 'Content-Security-Policy': "frame-ancestors 'self'", 'X-Frame-Options': 'SAMEORIGIN' })
    const nginx = renderNginx({ origins: [], root: '/srv/smm/dist' })
    expect(nginx).toContain(`add_header Content-Security-Policy "frame-ancestors 'self'" always;`)
    expect(nginx).toContain('add_header X-Frame-Options "SAMEORIGIN" always;')
    const caddy = renderCaddy({ origins: [], root: '/srv/smm/dist' })
    expect(caddy).toContain(`Content-Security-Policy "frame-ancestors 'self'"`)
    expect(caddy).toContain('X-Frame-Options "SAMEORIGIN"')
  })

  it('задана — frame-ancestors с адресами Neuronium и без X-Frame-Options', () => {
    const origins = [NR, 'http://localhost:5173']
    expect(frameHeaders(origins)).toEqual({ 'Content-Security-Policy': `frame-ancestors 'self' ${NR} http://localhost:5173` })
    for (const conf of [renderNginx({ origins }), renderCaddy({ origins })]) {
      expect(conf).toContain(`"frame-ancestors 'self' ${NR} http://localhost:5173"`)
      expect(conf).not.toMatch(/X-Frame-Options/i)
    }
  })

  it('адрес — smm.neuronium.ai, статика из dist/, SPA и паспорт с коротким кэшем', () => {
    const nginx = renderNginx({ origins: [NR], root: '/srv/smm/dist' })
    expect(nginx).toMatch(/server_name smm\.neuronium\.ai;/)
    expect(nginx).toMatch(/root \/srv\/smm\/dist;/)
    expect(nginx).toMatch(/location = \/nr-launch\.json \{\s+expires 60s;\s+\}/)
    expect(nginx).toContain('try_files $uri $uri/ /index.html;')
    const caddy = renderCaddy({ origins: [NR], root: '/srv/smm/dist' })
    expect(caddy).toMatch(/^smm\.neuronium\.ai \{$/m)
    expect(caddy).toContain('root * /srv/smm/dist')
    expect(caddy).toContain('header /nr-launch.json Cache-Control "public, max-age=60"')
    expect(caddy).toContain('try_files {path} /index.html')
  })

  it('node scripts/nr-launch.mjs nginx | caddy | json — из той же переменной; неверный адрес в конфиг не попадает', () => {
    const log = vi.fn()
    const env = { NR_HOST_ORIGINS: `${NR}, https://evil.example/;add_header X 1`, SMM_ROOT: '/srv/smm/dist' }
    const nginx = cli(['nginx'], env, log)
    expect(nginx).toContain(`"frame-ancestors 'self' ${NR}"`)
    expect(nginx).not.toContain('evil')
    expect(log).toHaveBeenCalledTimes(1)
    expect(cli(['caddy'], { SMM_HOST: 'smm.localhost' }, log)).toMatch(/^smm\.localhost \{$/m)
    expect(JSON.parse(cli(['json'], {}, log))).toMatchObject({ contract: 'nr-launch/1', frame: false })
    expect(() => cli([], {}, log)).toThrow(/nginx \| caddy \| json/)
  })
})
