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
import { PlanCtx, usePlan, type Ctx, type Drag, type ToastOpts, type View } from './ui/ctx'
import { Icon } from './ui/Icon'
import { DEFAULT_FILTERS, Sidebar } from './ui/Sidebar'
import { useMedia, useTheme, type ThemePref } from './ui/theme'
import { BankView } from './views/BankView'
import { ChecksView } from './views/ChecksView'
import { DayPanel } from './views/DayPanel'
import { HelpSheet } from './views/HelpSheet'
import { ItemEditor } from './views/ItemEditor'
import { MonthView } from './views/MonthView'
import { NowView } from './views/NowView'
import { PlanView } from './views/PlanView'
import { RulesView } from './views/RulesView'
import { TaskSheet } from './views/TaskSheet'
import { WeekView } from './views/WeekView'

type Sheet =
  | { kind: 'day'; date: ISODate }
  | { kind: 'item'; id: string; back?: ISODate }
  | { kind: 'new'; draft: Partial<Item>; back?: ISODate }
  | { kind: 'task'; id: string; back?: ISODate }
  | { kind: 'help' }
  | null

const NAV: { id: View; label: string; icon: string; main?: boolean }[] = [
  { id: 'now', label: 'Сейчас', icon: 'now', main: true },
  { id: 'month', label: 'Календарь', icon: 'calendar', main: true },
  { id: 'week', label: 'Неделя', icon: 'week' },
  { id: 'plan', label: 'План', icon: 'list', main: true },
  { id: 'bank', label: 'Банк тем', icon: 'bank', main: true },
  { id: 'rules', label: 'Сетка', icon: 'grid' },
  { id: 'checks', label: 'Проверка', icon: 'alert' },
]

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
  const [view, setViewState] = useState<View>(() => readLS<View>('cp:view', 'month'))
  // календарь бесконечный: открывается на сегодняшней неделе, если не помнит другую дату
  const [anchor, setAnchorState] = useState<ISODate>(() => readLS('cp:anchor', today()))
  const [jump, setJump] = useState({ date: anchor, n: 0 })
  const [filters, setFiltersState] = useState<Filters>(() => ({ ...DEFAULT_FILTERS, ...readLS<Partial<Filters>>('cp:filters', {}) }))
  const [sheet, setSheet] = useState<Sheet>(null)
  const [toastState, setToast] = useState<({ msg: string; n: number } & ToastOpts) | null>(null)
  const narrow = useMedia('(max-width: 900px)')
  const phone = useMedia('(max-width: 600px)')
  // фильтры — за кнопкой; на большом экране панель помнит, открыта ли, на узком — всегда поверх и закрыта
  const [sideOpen, setSideState] = useState<boolean>(() => !narrow && readLS('cp:side', false))
  const setSideOpen = (v: boolean | ((o: boolean) => boolean)) =>
    setSideState((o) => {
      const next = typeof v === 'function' ? v(o) : v
      if (!narrow) writeLS('cp:side', next)
      return next
    })
  const [menu, setMenu] = useState(false)
  const [more, setMore] = useState(false)
  const theme = useTheme()

  const setView = (v: View) => {
    setViewState(v)
    writeLS('cp:view', v)
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
        setMore(false)
        if (narrow) setSideState(false)
        setSheet((s) => (s && s.kind !== 'day' && s.kind !== 'help' && s.back ? { kind: 'day', date: s.back } : null))
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

  const openDayId = sheet?.kind === 'day' ? sheet.date : sheet && 'back' in sheet ? sheet.back ?? null : null
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
    openItem: (id) => setSheet((s) => ({ kind: 'item', id, back: s?.kind === 'day' ? s.date : s && 'back' in s ? s.back : undefined })),
    openNew: (draft) => setSheet((s) => ({ kind: 'new', draft, back: s?.kind === 'day' ? s.date : undefined })),
    openTask: (id) => setSheet((s) => ({ kind: 'task', id, back: s?.kind === 'day' ? s.date : s && 'back' in s ? s.back : undefined })),
    openDay: (date) => setSheet({ kind: 'day', date }),
    openDayId,
    goto: (v, date) => {
      setView(v)
      if (date) jumpTo(date)
    },
    dropOn,
    setStatus: (unit, status) => {
      dispatch({ type: 'updateMany', ids: unit.items.map((x) => x.id), patch: { status } })
      if (status === 'progress') ctx.openTask(unit.head.id)
    },
    toast,
    toggleSide: () => setSideOpen((o) => !o),
    sideOpen,
    openHelp: () => setSheet({ kind: 'help' }),
    saved,
    phone,
  }

  const closeSheet = () => setSheet(null)
  const back = sheet && sheet.kind !== 'day' && sheet.kind !== 'help' && sheet.back ? () => setSheet({ kind: 'day', date: sheet.back! }) : undefined
  const withSide = view === 'month' || view === 'week' || view === 'plan' || view === 'now'

  return (
    <PlanCtx.Provider value={ctx}>
      <div className="nr-app">
        {phone ? (
          <nav className="nr-rail cp-tabs" aria-label="Разделы">
            {NAV.filter((n) => n.main).map((n) => (
              <button key={n.id} type="button" className="cp-tab" aria-current={view === n.id ? 'page' : undefined} onClick={() => setView(n.id)}>
                <Icon name={n.icon} size={22} />
                <span>{n.id === 'bank' ? 'Банк' : n.label}</span>
              </button>
            ))}
            <button
              type="button"
              className="cp-tab"
              aria-expanded={more}
              aria-current={NAV.some((n) => !n.main && n.id === view) ? 'page' : undefined}
              onClick={() => setMore((m) => !m)}
            >
              <Icon name="more" size={22} />
              <span>Ещё</span>
              {violations.length > 0 && <span className="cp-rail-badge">{violations.length > 99 ? '99+' : violations.length}</span>}
            </button>
            {more && (
              <div className="cp-menu nr-glass" role="menu" aria-label="Ещё">
                {NAV.filter((n) => !n.main).map((n) => (
                  <button key={n.id} type="button" role="menuitem" className="cp-menu__item" onClick={() => { setView(n.id); setMore(false) }}>
                    <Icon name={n.icon} size={18} /> {n.label}
                    {n.id === 'checks' && violations.length > 0 && <span className="cp-menu__count">{violations.length}</span>}
                  </button>
                ))}
                <button type="button" role="menuitem" className="cp-menu__item" onClick={() => { setMore(false); setMenu(true) }}>
                  <Icon name="more" size={18} /> Данные и тема
                </button>
                <button type="button" role="menuitem" className="cp-menu__item" onClick={() => { setMore(false); setSheet({ kind: 'help' }) }}>
                  <Icon name="help" size={18} /> Как пользоваться
                </button>
              </div>
            )}
            {menu && <DataMenu onClose={() => setMenu(false)} seedUrl={seedUrl} theme={theme.pref} onTheme={theme.choose} />}
          </nav>
        ) : (
          <nav className="nr-rail" aria-label="Разделы">
            <div className="nr-rail-brand" aria-hidden="true">КП</div>
            {NAV.map((n) => (
              <button key={n.id} type="button" className="nr-rail-item" aria-current={view === n.id ? 'page' : undefined} aria-label={n.label} onClick={() => setView(n.id)}>
                <Icon name={n.icon} size={22} />
                <span className="cp-rail-tip" aria-hidden="true">{n.label}</span>
                {n.id === 'checks' && violations.length > 0 && <span className="cp-rail-badge">{violations.length > 99 ? '99+' : violations.length}</span>}
              </button>
            ))}
            <span className="nr-rail-spacer" />
            <button type="button" className="nr-rail-item" aria-label="Как пользоваться" aria-pressed={sheet?.kind === 'help'} onClick={() => setSheet((s) => (s?.kind === 'help' ? null : { kind: 'help' }))}>
              <Icon name="help" size={22} />
              <span className="cp-rail-tip" aria-hidden="true">Как пользоваться</span>
            </button>
            <button type="button" className="nr-rail-item" aria-label="Данные и тема" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <Icon name="more" size={22} />
              <span className="cp-rail-tip" aria-hidden="true">Данные и тема</span>
            </button>
            {menu && <DataMenu onClose={() => setMenu(false)} seedUrl={seedUrl} theme={theme.pref} onTheme={theme.choose} />}
          </nav>
        )}
        {withSide && sideOpen && narrow && <div className="cp-scrim" onClick={() => setSideOpen(false)} aria-hidden="true" />}
        {withSide && sideOpen && <Sidebar open={sideOpen} withBank={view === 'month' || view === 'week'} onClose={() => setSideOpen(false)} />}
        <main className="nr-main">
          {view === 'now' && <NowView />}
          {view === 'month' && <MonthView />}
          {view === 'week' && <WeekView />}
          {view === 'plan' && <PlanView />}
          {view === 'bank' && <BankView />}
          {view === 'rules' && <RulesView />}
          {view === 'checks' && <ChecksView />}
          {sheet?.kind === 'day' && <DayPanel date={sheet.date} onClose={closeSheet} />}
          {sheet?.kind === 'item' && <ItemEditor key={sheet.id} id={sheet.id} onClose={back ?? closeSheet} onBack={back} />}
          {sheet?.kind === 'new' && <ItemEditor key={`new-${sheet.draft.date}-${sheet.draft.channelId}-${sheet.draft.time}`} draft={sheet.draft} onClose={back ?? closeSheet} onBack={back} />}
          {sheet?.kind === 'task' && <TaskSheet key={sheet.id} id={sheet.id} onClose={back ?? closeSheet} onBack={back} />}
          {sheet?.kind === 'help' && <HelpSheet view={view} onClose={closeSheet} />}
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

function DataMenu({ onClose, seedUrl, theme, onTheme }: { onClose: () => void; seedUrl: string; theme: ThemePref; onTheme: (p: ThemePref) => void }) {
  const { plan, dispatch, toast, saved } = usePlan()
  const file = useRef<HTMLInputElement>(null)
  const stamp = today()
  return (
    <div className="cp-menu nr-glass" role="menu" aria-label="Данные и тема">
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
