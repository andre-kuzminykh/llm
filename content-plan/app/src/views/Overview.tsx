// Аналитика на главной — как «Эффективность» в Google Search Console, но сверху минимально: период и основные метрики
// одной строкой (цифра и изменение к прошлому такому же периоду). «Подробнее» раскрывает график (щелчок по метрике —
// линия) и таблицу по разрезам; щелчок по строке таблицы — «провалиться»: фильтр по ней ставится на всю главную.
// Раскрыто или свёрнуто — помнится. Пока данных из соцсетей нет — только в «Демо».
import { useMemo, useState } from 'react'
import { bucketsOf, PERIODS, type Bucket, type Post, type Series } from '../model/metrics'
import { deltaPct, DIMS, KPIS, kpiValues, rowsBy, topicLabel, totals, type Col, type Dim, type Kpi, type Totals } from '../model/overview'
import { FORMAT_ICON } from '../model/types'
import { PlatformIcon } from '../ui/bits'
import type { Who } from '../ui/homeData'
import { Icon } from '../ui/Icon'

const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 })
export const fmtNum = (n: number) => compact.format(n)
export const fmtKpi = (k: Kpi, v: number | null) => (v === null ? '—' : k === 'er' ? `${v.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %` : compact.format(v))

export function kpiTotal(t: Totals, k: Kpi): number | null {
  return k === 'followers' ? t.followers : t[k]
}

export function Overview({ posts, series, followersOk, now, days, setDays, who, onDrill, defaultDim }: {
  posts: Post[]
  series: Series[]
  followersOk: boolean // подписчиков по топику, формату или посту не посчитать
  now: number
  days: number
  setDays: (d: number) => void
  who: Map<string, Who>
  onDrill: (dim: Dim, key: string) => void
  defaultDim: Dim
}) {
  const [on, setOn] = useState<Kpi[]>(['views', 'likes'])
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem('cp:ov-open') === 'true'
    } catch {
      return false
    }
  })
  const setOpen = (v: boolean) => {
    setOpenState(v)
    try {
      localStorage.setItem('cp:ov-open', String(v))
    } catch {
      /* до перезагрузки */
    }
  }
  const [dim, setDim] = useState<Dim>(defaultDim)
  const [sort, setSort] = useState<Col>('views')
  const [all, setAll] = useState(false)
  const buckets = useMemo(() => bucketsOf(now, days), [now, days])
  const from = buckets[0].from
  const t = useMemo(() => totals(posts, series, from, now), [posts, series, from, now])
  const values = useMemo(() => kpiValues(posts, followersOk ? series : [], buckets, now), [posts, series, buckets, now, followersOk])
  const rows = useMemo(() => rowsBy(dim, posts, from, now, sort), [dim, posts, from, now, sort])
  const byId = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts])
  const shown = on.filter((k) => k !== 'followers' || followersOk)
  const toggleKpi = (k: Kpi) => setOn(on.includes(k) ? (on.length > 1 ? on.filter((x) => x !== k) : on) : [...on, k])
  const label = (key: string) => {
    if (dim === 'posts') {
      const p = byId.get(key)
      return (
        <>
          <PlatformIcon platform={p?.platform ?? ''} size={13} />
          <span className="cp-ov__cell">
            {p?.title ?? key}
            <span className="cp-muted"> · {who.get(p?.owner ?? '')?.name ?? ''}, {p ? new Date(p.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : ''}</span>
          </span>
        </>
      )
    }
    if (dim === 'topics') return <span className="cp-ov__cell">{topicLabel(key)}</span>
    if (dim === 'accounts') return (<><PlatformIcon platform={who.get(key)?.platform ?? ''} size={13} /><span className="cp-ov__cell">{who.get(key)?.name ?? key}</span></>)
    if (dim === 'platforms') return (<><PlatformIcon platform={key} size={13} /><span className="cp-ov__cell">{key}</span></>)
    return (<><Icon name={FORMAT_ICON[key]?.icon ?? 'f-post'} size={14} /><span className="cp-ov__cell">{FORMAT_ICON[key]?.label ?? key}</span></>)
  }
  const cols: { id: Col; label: string }[] = [
    { id: 'views', label: 'Просмотры' },
    { id: 'likes', label: 'Лайки' },
    { id: 'comments', label: 'Комменты' },
    { id: 'er', label: 'ER' },
    ...(dim === 'posts' ? [] : [{ id: 'posts' as Col, label: 'Постов' }]),
  ]
  const head = DIMS.find((d) => d.id === dim)!
  return (
    <section className={`cp-ov${open ? ' cp-ov--open' : ''}`} aria-label="Аналитика">
      <div className="cp-ov__bar">
        <div className="nr-seg" role="radiogroup" aria-label="Период">
          {PERIODS.map((p) => (
            <button key={p.days} type="button" role="radio" aria-checked={days === p.days} className="nr-seg__item" onClick={() => setDays(p.days)}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="cp-muted cp-ov__posts">{t.posts ? `${t.posts} постов за период` : 'постов за период нет'}</span>
        <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm cp-ov__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Свернуть' : 'Подробнее'}
          <Icon name="chev-right" size={14} />
        </button>
      </div>
      <div className="cp-ov__kpis" role="group" aria-label="Метрики">
        {KPIS.map((k) => {
          const v = kpiTotal(t, k.id)
          const off = k.id === 'followers' && !followersOk
          const d = k.id === 'followers' ? (v !== null && t.prev.followers !== null ? v - t.prev.followers : null) : deltaPct(v, t.prev[k.id])
          return (
            <button
              key={k.id}
              type="button"
              className={`cp-kpi cp-kpi--${k.id}`}
              aria-pressed={on.includes(k.id) && !off}
              disabled={off}
              title={off ? 'Подписчики — у аккаунта, не у поста: по топику, формату или посту их не посчитать' : `${k.label} — ${k.hint}; щелчок — линия на графике`}
              // свёрнуто — щелчок раскрывает график с этой метрикой; раскрыто — линия вкл/выкл
              onClick={() => (open ? toggleKpi(k.id) : (setOpen(true), !on.includes(k.id) && setOn([...on, k.id])))}
            >
              <span className="cp-kpi__label">
                <span className="cp-kpi__box" aria-hidden="true">
                  <Icon name="check" size={10} />
                </span>
                {k.label}
              </span>
              <b className="cp-kpi__val">{off ? '—' : fmtKpi(k.id, v)}</b>
              {!off && d !== null && (
                <span
                  className={`cp-kpi__delta${d > 0 ? ' cp-kpi__delta--up' : d < 0 ? ' cp-kpi__delta--down' : ''}`}
                  title={k.id === 'followers' ? 'прирост за период' : `к прошлым ${days === 1 ? 'суткам' : `${days} дн.`}`}
                >
                  {k.id === 'followers' ? `${d >= 0 ? '+' : '−'}${fmtNum(Math.abs(d))}` : `${d > 0 ? '↑' : d < 0 ? '↓' : ''} ${Math.abs(d)} %`}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {open && (
        <>
      <KpiChart values={values} on={shown} buckets={buckets} />
      <div className="cp-ov__tabs" role="tablist" aria-label="Разрез">
        {DIMS.map((d) => (
          <button key={d.id} type="button" role="tab" aria-selected={dim === d.id} className="cp-ov__tab" onClick={() => (setDim(d.id), setAll(false))}>
            {d.label}
          </button>
        ))}
      </div>
      {rows.length ? (
        <div className="cp-ov__wrap">
          <table className="cp-ov__table" aria-label={`Разрез: ${head.label}`}>
            <thead>
              <tr>
                <th scope="col">{head.head}</th>
                {cols.map((c) => (
                  <th key={c.id} scope="col" aria-sort={sort === c.id ? 'descending' : 'none'}>
                    <button type="button" className="cp-ov__sort" onClick={() => setSort(c.id)}>
                      {sort === c.id && <span aria-hidden="true">↓ </span>}
                      {c.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, all ? rows.length : 8).map((r) => (
                <tr key={r.key}>
                  <th scope="row">
                    <button type="button" className="cp-ov__drill" title="Провалиться: фильтр по этой строке — на графики и ленту" onClick={() => onDrill(dim, r.key)}>
                      {label(r.key)}
                      <Icon name="chev-right" size={14} />
                    </button>
                  </th>
                  <td>{fmtNum(r.views)}</td>
                  <td>{fmtNum(r.likes)}</td>
                  <td>{fmtNum(r.comments)}</td>
                  <td>{r.er.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %</td>
                  {dim !== 'posts' && <td>{r.posts}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 8 && (
            <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm cp-ov__more" onClick={() => setAll(!all)}>
              {all ? 'Свернуть' : `Показать все — ${rows.length}`}
            </button>
          )}
        </div>
      ) : (
        <p className="cp-hint cp-ov__none">За этот период по фильтру ничего нет.</p>
      )}
        </>
      )}
    </section>
  )
}

/** График: линия на каждую включённую метрику, у каждой — своя шкала (как в Search Console); наведение — значения. */
function KpiChart({ values, on, buckets }: { values: Record<Kpi, (number | null)[]>; on: Kpi[]; buckets: Bucket[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const n = buckets.length
  const W = 1000
  const H = 200
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2)
  const max = (k: Kpi) => Math.max(1, ...values[k].map((v) => v ?? 0)) * 1.1
  const path = (k: Kpi) => {
    const m = max(k)
    let d = ''
    let pen = false
    values[k].forEach((v, i) => {
      if (v === null) return void (pen = false)
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${(H - (v / m) * H).toFixed(1)}`
      pen = true
    })
    return d
  }
  // подписи по оси времени — не больше семи
  const step = Math.max(1, Math.ceil(n / 7))
  const ticks = buckets.map((b, i) => ({ i, label: b.label })).filter((t) => t.i % step === 0)
  const names = on.map((k) => KPIS.find((x) => x.id === k)!.label.toLowerCase()).join(', ')
  return (
    <div className="cp-ov__chart">
      {on.slice(0, 2).map((k, i) => (
        <span key={k} className={`cp-ov__axis cp-ov__axis--${i ? 'r' : 'l'} cp-kpi--${k}`} aria-hidden="true">
          <span>{fmtKpi(k, Math.round(max(k) / 1.1))}</span>
          <span>{fmtKpi(k, Math.round(max(k) / 2.2))}</span>
          <span>0</span>
        </span>
      ))}
      <div
        className="cp-ov__plot"
        role="img"
        aria-label={`График: ${names}, ${buckets[0].label} — ${buckets[n - 1].label}`}
        onPointerMove={(e) => {
          const b = e.currentTarget.getBoundingClientRect()
          if (!b.width) return
          setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - b.left) / b.width) * (n - 1)))))
        }}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {[0.25, 0.5, 0.75, 1].map((g) => (
            <line key={g} x1="0" x2={W} y1={H - g * H / 1.1} y2={H - g * H / 1.1} className="cp-ov__grid" />
          ))}
          {on.map((k) => (
            <path key={k} d={path(k)} className={`cp-ov__line cp-kpi--${k}`} />
          ))}
        </svg>
        {hover !== null && (
          <>
            <span className="cp-ov__cursor" style={{ left: `${(x(hover) / W) * 100}%` }} aria-hidden="true" />
            <span className={`cp-ov__tip${hover > n / 2 ? ' cp-ov__tip--left' : ''}`} style={{ left: `${(x(hover) / W) * 100}%` }} role="status">
              <b>{buckets[hover].label}</b>
              {on.map((k) => (
                <span key={k} className={`cp-ov__tipline cp-kpi--${k}`}>
                  <i aria-hidden="true" />
                  {KPIS.find((x) => x.id === k)!.label}: {fmtKpi(k, values[k][hover])}
                </span>
              ))}
            </span>
          </>
        )}
      </div>
      <div className="cp-ov__ticks" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t.i} style={{ left: `${(x(t.i) / W) * 100}%` }}>{t.label}</span>
        ))}
      </div>
    </div>
  )
}
