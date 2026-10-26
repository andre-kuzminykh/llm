import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { shortDate, today } from './model/dates'
import { indexByDate, visible, type Filters } from './model/filters'
import { calendarCSV, download, exportJSON, isV1, parsePlan, upgradePlan, type AnyPlan } from './model/io'
import { checkPlan, type Violation } from './model/rules'
import { openStorage, type PlanStorage } from './model/storage'
import { initialState, reducer } from './model/store'
import { labelOf, type ISODate, type Item, type Plan } from './model/types'
import { unitsOf, type Unit } from './model/units'
import { Seg } from './ui/bits'
import { PlanCtx, usePlan, type Ctx, type Drag, type Mode, type ToastOpts } from './ui/ctx'
import { Icon } from './ui/Icon'
import { DEFAULT_FILTERS, Sidebar } from './ui/Sidebar'
import { useMedia, useTheme, type ThemePref } from './ui/theme'
import { AgendaView } from './views/AgendaView'
import { DraftsSheet } from './views/BankView'
import { DashboardSheet } from './views/DashboardView'
import { DayPanel } from './views/DayPanel'
import { HelpSheet } from './views/HelpSheet'
import { ItemEditor } from './views/ItemEditor'
import { PlanningSheet } from './views/PlanningSheet'
import { TaskSheet } from './views/TaskSheet'
import { WeekView } from './views/WeekView'

/** Куда вернуться из формы или задачи: к дню, дашборду, черновикам или планированию. */
type Back = { kind: 'day'; date: ISODate } | { kind: 'dashboard' } | { kind: 'drafts' } | { kind: 'planning' }
type Sheet =
  | Back
  | { kind: 'item'; id: string; back?: Back }
  | { kind: 'new'; draft: Partial<Item>; back?: Back }
  | { kind: 'task'; id: string; back?: Back }
  | { kind: 'help' }
  | null

/** Открыли форму или задачу поверх листа — «назад» ведёт к нему. */
const backOf = (s: Sheet): Back | undefined =>
  !s || s.kind === 'help' ? undefined : s.kind === 'item' || s.kind === 'new' || s.kind === 'task' ? s.back : s

const MODES: Mode[] = ['time', 'channels', 'platforms', 'topics', 'feed']
const readMode = (): Mode => {
  try {
    const m = localStorage.getItem('cp:week-mode') as Mode
    return MODES.includes(m) ? m : 'time'
  } catch {
    return 'time'
  }
}

/** Отделы Neuronium на левой панели — как в nr (F20): SMM — это приложение, остальные пока не подключены. */
const DEPARTMENTS: { id: string; label: string; icon: string }[] = [
  { id: 'management', label: 'Менеджмент', icon: 'briefcase' },
  { id: 'hr', label: 'HR', icon: 'people' },
  { id: 'marketing', label: 'Маркетинг', icon: 'megaphone' },
  { id: 'smm', label: 'SMM', icon: 'hash' },
  { id: 'sales', label: 'Продажи', icon: 'trending' },
  { id: 'support', label: 'Поддержка', icon: 'lifebuoy' },
  { id: 'analytics', label: 'Аналитика', icon: 'chart' },
  { id: 'design', label: 'Дизайн', icon: 'palette' },
  { id: 'development', label: 'Разработка', icon: 'code' },
  { id: 'engineering', label: 'Инжиниринг', icon: 'wrench' },
]
const SOON = DEPARTMENTS.filter((d) => d.id !== 'smm').map((d) => d.label)

function readLS<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
function writeLS(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* настройка вида проживёт до перезагрузки */
  }
}

async function fetchSeed(url: string): Promise<Plan> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Не загрузился исходный план (${r.status})`)
  const p = parsePlan(await r.text())
  if (isV1(p) || p.version !== 3) throw new Error('Исходный план старого формата — перезапустите ../build.py')
  return p
}

/** План из хранилища или файла; старые версии переводятся по новому исходному плану. */
const upgrade = (p: AnyPlan, seedUrl: string) => upgradePlan(p, () => fetchSeed(seedUrl))

export interface AppProps {
  storage?: () => Promise<PlanStorage>
  seedUrl?: string
}

export function App({ storage: storageFactory = openStorage, seedUrl = 'seed.json' }: AppProps) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [error, setError] = useState('')
  const storage = useRef<PlanStorage | null>(null)
  const [saved, setSaved] = useState<Ctx['saved']>('idle')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const st = await storageFactory()
        storage.current = st
        const stored = (await st.load().catch(() => null)) as AnyPlan | null
        const plan = stored ? await upgrade(stored, seedUrl) : await fetchSeed(seedUrl)
        if (!alive) return
        dispatch({ type: 'init', plan })
        setSaved(st.persistent ? 'idle' : 'memory')
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [storageFactory, seedUrl])

  // сохранение с задержкой: план большой, а правки идут сериями
  const first = useRef(true)
  useEffect(() => {
    if (!state.plan) return
    if (first.current) {
      first.current = false
      return
    }
    const st = storage.current
    if (!st?.persistent) return
    setSaved('saving')
    const t = setTimeout(() => {
      st.save(state.plan!).then(
        () => setSaved('saved'),
        () => setSaved('error'),
      )
    }, 400)
    return () => clearTimeout(t)
  }, [state.plan])

  if (error) {
    return (
      <div className="cp-loading">
        <div className="cp-empty">
          <span className="nr-logo">КП</span>
          <b style={{ color: 'var(--nr-text)' }}>План не открылся</b>
          {error}
        </div>
      </div>
    )
  }
  if (!state.plan) {
    return (
      <div className="cp-loading" role="status" aria-label="Загрузка плана">
        <span className="nr-logo">КП</span>
      </div>
    )
  }
  return <Workspace plan={state.plan} dispatch={dispatch} canUndo={state.past.length > 0} canRedo={state.future.length > 0} saved={saved} seedUrl={seedUrl} />
}

interface WorkspaceProps {
  plan: Plan
  dispatch: Ctx['dispatch']
  canUndo: boolean
  canRedo: boolean
  saved: Ctx['saved']
  seedUrl: string
}

function Workspace({ plan, dispatch, canUndo, canRedo, saved, seedUrl }: WorkspaceProps) {
  // SMM — это календарь: неделя по часам или дорожками, как оставили; дашборд открывается панелью справа
  const [mode, setModeState] = useState<Mode>(readMode)
  // календарь бесконечный: открывается на сегодняшней неделе, если не помнит другую дату
  const [anchor, setAnchorState] = useState<ISODate>(() => readLS('cp:anchor', today()))
  const [jump, setJump] = useState({ date: anchor, n: 0 })
  const [filters, setFiltersState] = useState<Filters>(() => ({ ...DEFAULT_FILTERS, ...readLS<Partial<Filters>>('cp:filters', {}) }))
  const [sheet, setSheet] = useState<Sheet>(null)
  const [toastState, setToast] = useState<({ msg: string; n: number } & ToastOpts) | null>(null)
  const narrow = useMedia('(max-width: 900px)')
  const phone = useMedia('(max-width: 600px)')
  // фильтры — панелью слева, рядом с отделами: сворачиваются и разворачиваются кнопкой «Фильтры» (большой экран помнит как);
  // на узком экране — поверх календаря и закрыты, пока не откроют
  const [sideOpen, setSideState] = useState<boolean>(() => !narrow && readLS('cp:side', true))
  const setSideOpen = (v: boolean | ((o: boolean) => boolean)) =>
    setSideState((o) => {
      const next = typeof v === 'function' ? v(o) : v
      if (!narrow) writeLS('cp:side', next)
      return next
    })
  // экран сузился — панель уходит под кнопку; расширился — как оставили
  const wasNarrow = useRef(narrow)
  useEffect(() => {
    if (wasNarrow.current === narrow) return
    wasNarrow.current = narrow
    setSideState(narrow ? false : readLS('cp:side', true))
  }, [narrow])
  const [menu, setMenu] = useState(false)
  const theme = useTheme()

  const setMode = (m: Mode) => {
    setModeState(m)
    try {
      localStorage.setItem('cp:week-mode', m)
    } catch {
      /* вид проживёт до перезагрузки */
    }
  }
  const setAnchor = useCallback((d: ISODate) => {
    setAnchorState(d)
    writeLS('cp:anchor', d)
  }, [])
  const jumpTo = (d: ISODate) => {
    setAnchor(d)
    setJump((j) => ({ date: d, n: j.n + 1 }))
  }
  const setFilters = (f: Filters) => {
    setFiltersState(f)
    writeLS('cp:filters', f)
  }

  const byDate = useMemo(() => indexByDate(plan), [plan])
  const violations = useMemo(() => checkPlan(plan, byDate), [plan, byDate])
  const violByDate = useMemo(() => {
    const m = new Map<ISODate, Violation[]>()
    for (const v of violations) m.set(v.date, [...(m.get(v.date) ?? []), v])
    return m
  }, [violations])
  const badIds = useMemo(() => new Set(violations.flatMap((v) => v.itemIds)), [violations])
  const channels = useMemo(() => new Map(plan.channels.map((c) => [c.id, c])), [plan.channels])
  const rubrics = useMemo(() => new Map(plan.rubrics.map((r) => [r.id, r])), [plan.rubrics])
  const rules = useMemo(() => new Map(plan.rules.map((r) => [r.id, r])), [plan.rules])
  const unitCache = useMemo(() => new Map<ISODate, Unit[]>(), [plan, filters]) // eslint-disable-line react-hooks/exhaustive-deps
  const channelOrder = useMemo(() => plan.channels.map((c) => c.id), [plan.channels])
  const unitsOn = (date: ISODate) => {
    let u = unitCache.get(date)
    if (!u) {
      u = unitsOf((byDate.get(date) ?? []).filter((it) => visible(it, filters)), rules, channelOrder)
      unitCache.set(date, u)
    }
    return u
  }

  const toast = useCallback((msg: string, opts?: boolean | ToastOpts) => {
    const o = typeof opts === 'boolean' ? { undo: opts } : opts ?? {}
    setToast((t) => ({ msg, ...o, n: (t?.n ?? 0) + 1 }))
  }, [])
  useEffect(() => {
    if (!toastState) return
    const t = setTimeout(() => setToast(null), toastState.actions?.length ? 9000 : 5000)
    return () => clearTimeout(t)
  }, [toastState])

  const dropOn = (date: ISODate, d: Drag, time?: string) => {
    const it = plan.items.find((x) => x.id === d.id)
    if (!it) return
    if (d.kind === 'bank' || it.date === null) {
      dispatch({ type: 'assign', bankId: it.id, date })
      toast(`Тема поставлена на ${shortDate(date)}`, true)
      return
    }
    const from = it.date
    if (rules.get(it.ruleId)?.stream) time = undefined // у потока нет времени: на шкалу он встаёт только днём
    if (from === date && !time) return
    // FULL на день, где уже есть FULL: перенос сделан, а поменять местами — одной кнопкой
    const isFull = rules.get(it.ruleId)?.full && !it.derive
    const other = isFull && from !== date
      ? (byDate.get(date) ?? []).find((x) => x.id !== it.id && rules.get(x.ruleId)?.full && !x.derive && (!x.group || x.group !== it.group))
      : undefined
    dispatch({ type: 'move', id: d.id, date, time })
    toast(`Перенесено на ${shortDate(date)}${time ? `, ${time}` : ''}${it.group ? ' вместе с группой' : ''}${other ? `. Здесь уже стоит FULL «${other.title}»` : ''}`, {
      undo: true,
      actions: other ? [{ label: 'Поменять местами', run: () => dispatch({ type: 'move', id: other.id, date: from }) }] : undefined,
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === 'Escape') {
        setMenu(false)
        if (narrow) setSideOpen(false)
        setSheet((s) => (s && 'back' in s && s.back ? s.back : null))
      }
      if (typing || !(e.metaKey || e.ctrlKey)) return
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault()
        dispatch({ type: 'redo' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch, narrow])

  const under = backOf(sheet)
  const openDayId = under?.kind === 'day' ? under.date : null
  const ctx: Ctx = {
    plan,
    dispatch,
    canUndo,
    canRedo,
    byDate,
    unitsOn,
    violations,
    violByDate,
    badIds,
    channels,
    rubrics,
    rules,
    labelOf: (it) => labelOf(rubrics.get(it.rubricId ?? ''), rules.get(it.ruleId)),
    filters,
    setFilters,
    anchor,
    setAnchor,
    jump,
    jumpTo,
    openItem: (id) => setSheet((s) => ({ kind: 'item', id, back: backOf(s) })),
    // «+» поверх черновиков — вкладка, а не шаг вглубь: назад ведёт туда же, откуда открыли черновики
    openNew: (draft) => setSheet((s) => ({ kind: 'new', draft, back: s?.kind === 'drafts' ? undefined : backOf(s) })),
    openTask: (id) => setSheet((s) => ({ kind: 'task', id, back: backOf(s) })),
    openDay: (date) => setSheet({ kind: 'day', date }),
    openDayId,
    show: (date) => {
      setSheet(null)
      if (date) jumpTo(date)
    },
    mode: phone || mode !== 'feed' ? mode : 'time',
    setMode,
    openDashboard: () => setSheet({ kind: 'dashboard' }),
    openDrafts: () => setSheet({ kind: 'drafts' }),
    openPlanning: () => setSheet((s) => ({ kind: 'planning', back: s?.kind === 'dashboard' ? { kind: 'dashboard' } : undefined })),
    dropOn,
    setStatus: (unit, status) => {
      dispatch({ type: 'updateMany', ids: unit.items.map((x) => x.id), patch: { status } })
      if (status === 'progress') ctx.openTask(unit.head.id)
    },
    toast,
    toggleSide: () => setSideOpen((o) => !o),
    sideOpen,
    openHelp: () => setSheet({ kind: 'help' }),
    panel: sheet?.kind === 'dashboard' || sheet?.kind === 'drafts' || sheet?.kind === 'planning' ? sheet.kind : null,
    saved,
    phone,
    narrow,
  }

  const closeSheet = () => setSheet(null)
  const back = sheet && 'back' in sheet && sheet.back ? () => setSheet(sheet.back!) : undefined

  return (
    <PlanCtx.Provider value={ctx}>
      <div className="nr-app">
        {phone ? (
          <nav className="nr-rail cp-tabs" aria-label="Разделы">
            <button type="button" className="cp-tab" aria-current={sheet?.kind === 'dashboard' ? 'page' : undefined} onClick={() => setSheet({ kind: 'dashboard' })}>
              <Icon name="dashboard" size={22} />
              <span>Дашборд</span>
            </button>
            <button type="button" className="cp-tab" aria-current={sheet?.kind !== 'dashboard' ? 'page' : undefined} onClick={() => setSheet(null)}>
              <Icon name="calendar" size={22} />
              <span>Календарь</span>
            </button>
            <button type="button" className="cp-tab" aria-label="Профиль" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <span className="cp-avatar cp-avatar--sm" aria-hidden="true"><Icon name="user" size={14} /></span>
              <span>Профиль</span>
            </button>
            {menu && <ProfileMenu onClose={() => setMenu(false)} seedUrl={seedUrl} theme={theme.pref} onTheme={theme.choose} onHelp={() => { setMenu(false); setSheet({ kind: 'help' }) }} />}
          </nav>
        ) : (
          <nav className="nr-rail" aria-label="Отделы">
            <div className="nr-rail-brand" aria-hidden="true">Nr</div>
            {DEPARTMENTS.map((d) =>
              d.id === 'smm' ? (
                <button key={d.id} type="button" className="nr-rail-item" aria-current="page" aria-label="SMM — контент-план" onClick={() => setSheet(null)}>
                  <Icon name={d.icon} size={22} />
                  <span className="cp-rail-tip" aria-hidden="true">SMM — контент-план</span>
                </button>
              ) : (
                <button key={d.id} type="button" className="nr-rail-item cp-rail-soon" aria-disabled="true" tabIndex={-1} aria-label={`${d.label} — скоро`}>
                  <Icon name={d.icon} size={22} />
                  <span className="cp-rail-tip" aria-hidden="true">{d.label} — скоро</span>
                </button>
              ),
            )}
            <span className="nr-rail-spacer" />
            <button type="button" className="nr-rail-item cp-rail-account" aria-label="Профиль" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <span className="cp-avatar" aria-hidden="true"><Icon name="user" size={16} /></span>
              <span className="cp-rail-tip" aria-hidden="true">Профиль</span>
            </button>
            {menu && <ProfileMenu onClose={() => setMenu(false)} seedUrl={seedUrl} theme={theme.pref} onTheme={theme.choose} onHelp={() => { setMenu(false); setSheet({ kind: 'help' }) }} />}
          </nav>
        )}
        {narrow && sideOpen && <div className="cp-scrim" onClick={() => setSideOpen(false)} aria-hidden="true" />}
        {sideOpen && <Sidebar onClose={() => setSideOpen(false)} />}
        <main className="nr-main">
          {ctx.mode === 'feed' ? <AgendaView /> : <WeekView />}
          {sheet?.kind === 'day' && <DayPanel date={sheet.date} onClose={closeSheet} />}
          {sheet?.kind === 'dashboard' && <DashboardSheet onClose={closeSheet} />}
          {sheet?.kind === 'drafts' && <DraftsSheet onClose={closeSheet} />}
          {sheet?.kind === 'planning' && <PlanningSheet onClose={closeSheet} onBack={back} />}
          {sheet?.kind === 'item' && <ItemEditor key={sheet.id} id={sheet.id} onClose={back ?? closeSheet} onBack={back} />}
          {sheet?.kind === 'new' && <ItemEditor key={`new-${sheet.draft.date}-${sheet.draft.channelId}-${sheet.draft.time}`} draft={sheet.draft} onClose={back ?? closeSheet} onBack={back} />}
          {sheet?.kind === 'task' && <TaskSheet key={sheet.id} id={sheet.id} onClose={back ?? closeSheet} onBack={back} />}
          {sheet?.kind === 'help' && <HelpSheet onClose={closeSheet} />}
          {!sheet && (
            <button type="button" className="cp-fab" aria-label="Новый контент" title="Запланировать контент" onClick={() => ctx.openNew({ date: anchor < today() ? today() : anchor })}>
              <Icon name="plus" size={26} />
            </button>
          )}
        </main>
        {toastState && (
          <div className="cp-toast nr-glass" role="status" key={toastState.n}>
            <span className="cp-toast__msg">{toastState.msg}</span>
            {toastState.actions?.map((a) => (
              <button
                key={a.label}
                type="button"
                className="nr-btn nr-btn--secondary nr-btn--sm"
                onClick={() => {
                  a.run()
                  setToast(null)
                }}
              >
                {a.label}
              </button>
            ))}
            {toastState.undo && (
              <button
                type="button"
                className="nr-btn nr-btn--tinted nr-btn--sm"
                onClick={() => {
                  dispatch({ type: 'undo' })
                  setToast(null)
                }}
              >
                Отменить
              </button>
            )}
          </div>
        )}
      </div>
    </PlanCtx.Provider>
  )
}

function ProfileMenu({ onClose, seedUrl, theme, onTheme, onHelp }: { onClose: () => void; seedUrl: string; theme: ThemePref; onTheme: (p: ThemePref) => void; onHelp: () => void }) {
  const { plan, dispatch, toast, saved } = usePlan()
  const file = useRef<HTMLInputElement>(null)
  const stamp = today()
  return (
    <div className="cp-menu nr-glass" role="menu" aria-label="Профиль">
      <div className="cp-menu__head">
        <span className="cp-avatar" aria-hidden="true"><Icon name="user" size={18} /></span>
        <span>
          <b>Профиль</b>
          <span className="cp-muted">SMM · контент-план</span>
        </span>
      </div>
      <p className="cp-menu__note">Скоро: {SOON.join(', ')}</p>
      <button type="button" role="menuitem" className="cp-menu__item" onClick={onHelp}>
        <Icon name="help" size={18} /> Как пользоваться
      </button>
      <button type="button" role="menuitem" className="cp-menu__item" onClick={() => { download(`content-plan-${stamp}.json`, exportJSON(plan), 'application/json'); onClose() }}>
        <Icon name="download" size={18} /> Выгрузить JSON
      </button>
      <button type="button" role="menuitem" className="cp-menu__item" onClick={() => { download(`calendar-${stamp}.csv`, calendarCSV(plan), 'text/csv;charset=utf-8'); onClose() }}>
        <Icon name="download" size={18} /> Календарь для таблицы (CSV)
      </button>
      <button type="button" role="menuitem" className="cp-menu__item" onClick={() => file.current?.click()}>
        <Icon name="upload" size={18} /> Загрузить JSON
      </button>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            dispatch({ type: 'replace', plan: await upgrade(parsePlan(await f.text()), seedUrl) })
            toast(`Загружен план из ${f.name}`, true)
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Не удалось прочитать файл')
          }
          onClose()
        }}
      />
      <button
        type="button"
        role="menuitem"
        className="cp-menu__item"
        onClick={async () => {
          if (!confirm('Вернуть исходный план из генератора? Ваши правки можно будет отменить кнопкой «Отменить».')) return
          try {
            dispatch({ type: 'replace', plan: await fetchSeed(seedUrl) })
            toast('Исходный план восстановлен', true)
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Не удалось загрузить исходный план')
          }
          onClose()
        }}
      >
        <Icon name="reset" size={18} /> Сбросить к исходному плану
      </button>
      <div className="cp-menu__foot">
        <span className="nr-label">Тема</span>
        <Seg
          value={theme}
          onChange={onTheme}
          label="Тема"
          options={[
            { id: 'light', label: 'Светлая' },
            { id: 'dark', label: 'Тёмная' },
            { id: 'system', label: 'Авто' },
          ]}
        />
      </div>
      <p className="cp-menu__note">{saved === 'memory' ? 'Хранилище браузера недоступно — выгрузите JSON до перезагрузки.' : 'План хранится в этом браузере.'}</p>
    </div>
  )
}
