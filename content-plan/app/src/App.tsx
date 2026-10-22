import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { clampDate, monthKey, shortDate, today } from './model/dates'
import { indexByDate, NO_FILTERS, type Filters } from './model/filters'
import { calendarCSV, download, exportJSON, isV1, migrateV1, parsePlan, type PlanV1 } from './model/io'
import { checkPlan, type Violation } from './model/rules'
import { openStorage, type PlanStorage } from './model/storage'
import { initialState, reducer } from './model/store'
import { labelOf, type ISODate, type Item, type Plan } from './model/types'
import { Seg } from './ui/bits'
import { PlanCtx, usePlan, type Ctx, type Drag, type View } from './ui/ctx'
import { Icon } from './ui/Icon'
import { Sidebar } from './ui/Sidebar'
import { useTheme, type ThemePref } from './ui/theme'
import { BankView } from './views/BankView'
import { ChecksView } from './views/ChecksView'
import { DayPanel } from './views/DayPanel'
import { ItemEditor } from './views/ItemEditor'
import { MonthView } from './views/MonthView'
import { PlanView } from './views/PlanView'
import { RulesView } from './views/RulesView'
import { WeekView } from './views/WeekView'

type Sheet = { kind: 'day'; date: ISODate } | { kind: 'item'; id: string; back?: ISODate } | { kind: 'new'; draft: Partial<Item>; back?: ISODate } | null

const NAV: { id: View; label: string; icon: string }[] = [
  { id: 'month', label: 'Календарь', icon: 'calendar' },
  { id: 'week', label: 'Неделя', icon: 'week' },
  { id: 'plan', label: 'План', icon: 'list' },
  { id: 'bank', label: 'Банк тем', icon: 'bank' },
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
  if (isV1(p)) throw new Error('Исходный план старого формата — перезапустите ../build.py')
  return p
}

/** План из хранилища или файла; старый формат переводится на рубрики и форматы нового исходного плана. */
async function upgrade(p: Plan | PlanV1, seedUrl: string): Promise<Plan> {
  return isV1(p) ? migrateV1(p, await fetchSeed(seedUrl)) : p
}

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
        const stored = (await st.load().catch(() => null)) as Plan | PlanV1 | null
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
  const [anchor, setAnchorState] = useState<ISODate>(() => clampDate(readLS('cp:anchor', today()), plan.start, plan.end))
  const [filters, setFiltersState] = useState<Filters>(() => ({ ...NO_FILTERS, hideAuto: true, ...readLS<Partial<Filters>>('cp:filters', {}) }))
  const [sheet, setSheet] = useState<Sheet>(null)
  const [toastState, setToast] = useState<{ msg: string; undo: boolean; n: number } | null>(null)
  const [sideOpen, setSideOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const theme = useTheme()

  const setView = (v: View) => {
    setViewState(v)
    writeLS('cp:view', v)
  }
  const setAnchor = (d: ISODate) => {
    const c = clampDate(d, plan.start, plan.end)
    setAnchorState(c)
    writeLS('cp:anchor', c)
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

  const toast = useCallback((msg: string, undo = false) => setToast((t) => ({ msg, undo, n: (t?.n ?? 0) + 1 })), [])
  useEffect(() => {
    if (!toastState) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toastState])

  const dropOn = (date: ISODate, d: Drag) => {
    if (date < plan.start || date > plan.end) return
    if (d.kind === 'item') {
      const it = plan.items.find((x) => x.id === d.id)
      if (!it || it.date === date) return
      if (it.date === null) {
        dispatch({ type: 'assign', bankId: it.id, date })
        toast(`Тема поставлена на ${shortDate(date)}`, true)
        return
      }
      dispatch({ type: 'move', id: d.id, date })
      toast(`Перенесено на ${shortDate(date)}${it.group ? ' вместе с группой' : ''}`, true)
    } else {
      dispatch({ type: 'assign', bankId: d.id, date })
      toast(`Тема поставлена на ${shortDate(date)}`, true)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === 'Escape') {
        setMenu(false)
        setSideOpen(false)
        setSheet((s) => (s && s.kind !== 'day' && s.back ? { kind: 'day', date: s.back } : null))
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
  }, [dispatch])

  const openDayId = sheet?.kind === 'day' ? sheet.date : sheet && 'back' in sheet ? sheet.back ?? null : null
  const ctx: Ctx = {
    plan,
    dispatch,
    canUndo,
    canRedo,
    byDate,
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
    openItem: (id) => setSheet((s) => ({ kind: 'item', id, back: s?.kind === 'day' ? s.date : undefined })),
    openNew: (draft) => setSheet((s) => ({ kind: 'new', draft, back: s?.kind === 'day' ? s.date : undefined })),
    openDay: (date) => {
      setSheet({ kind: 'day', date })
      if (view === 'month' && monthKey(date) !== monthKey(anchor)) setAnchor(date)
      if (view === 'week') setAnchor(date)
    },
    openDayId,
    goto: (v, date) => {
      setView(v)
      if (date) setAnchor(date)
    },
    dropOn,
    toast,
    toggleSide: () => setSideOpen((o) => !o),
    saved,
  }

  const closeSheet = () => setSheet(null)
  const back = sheet && sheet.kind !== 'day' && sheet.back ? () => setSheet({ kind: 'day', date: sheet.back! }) : undefined
  const withSide = view === 'month' || view === 'week' || view === 'plan'

  return (
    <PlanCtx.Provider value={ctx}>
      <div className="nr-app">
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
          <button type="button" className="nr-rail-item" aria-label="Данные и тема" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <Icon name="more" size={22} />
            <span className="cp-rail-tip" aria-hidden="true">Данные и тема</span>
          </button>
          {menu && <DataMenu onClose={() => setMenu(false)} seedUrl={seedUrl} theme={theme.pref} onTheme={theme.choose} />}
        </nav>
        {withSide && sideOpen && <div className="cp-scrim cp-only-phone" onClick={() => setSideOpen(false)} aria-hidden="true" />}
        {withSide && <Sidebar open={sideOpen} withBank={view !== 'plan'} onClose={() => setSideOpen(false)} />}
        <main className="nr-main">
          {view === 'month' && <MonthView />}
          {view === 'week' && <WeekView />}
          {view === 'plan' && <PlanView />}
          {view === 'bank' && <BankView />}
          {view === 'rules' && <RulesView />}
          {view === 'checks' && <ChecksView />}
          {sheet?.kind === 'day' && <DayPanel date={sheet.date} onClose={closeSheet} />}
          {sheet?.kind === 'item' && <ItemEditor key={sheet.id} id={sheet.id} onClose={back ?? closeSheet} onBack={back} />}
          {sheet?.kind === 'new' && <ItemEditor key={`new-${sheet.draft.date}-${sheet.draft.channelId}`} draft={sheet.draft} onClose={back ?? closeSheet} onBack={back} />}
        </main>
        {toastState && (
          <div className="cp-toast nr-glass" role="status" key={toastState.n}>
            {toastState.msg}
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
      <p className="cp-menu__note">
        {saved === 'memory' ? 'Хранилище браузера недоступно: правки живут до перезагрузки — выгрузите JSON.' : 'План хранится в этом браузере. Выгрузка — чтобы перенести или поделиться.'}
      </p>
      <button type="button" role="menuitem" className="cp-menu__item" onClick={() => { download(`content-plan-${stamp}.json`, exportJSON(plan), 'application/json'); onClose() }}>
        <Icon name="download" size={18} /> Выгрузить JSON
      </button>
      <button type="button" role="menuitem" className="cp-menu__item" onClick={() => { download(`calendar-${stamp}.csv`, calendarCSV(plan), 'text/csv;charset=utf-8'); onClose() }}>
        <Icon name="download" size={18} /> CSV-календарь (как 4_calendar.csv)
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
    </div>
  )
}
