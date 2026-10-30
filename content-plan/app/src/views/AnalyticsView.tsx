// Аналитика СММ — второй пункт меню СММ после календаря. Всё — по данным самих соцсетей: подписчики, просмотры,
// вовлечённость за сутки (по часам), 7, 30 или 90 дней — у своих каналов и у конкурентов. Конкурентов человек заводит
// сам (из маркетингового анализа подтянутся позже — пунктиром), мы проверяем их каналы каждый час; их посты с саммери —
// лентой для вдохновения: «Переиспользовать» открывает новый контент с их темой, дальше её видоизменяют.
// Данные придут с сервера, когда подключим площадки; пока их нет — пусто, а на примере видно, как это будет выглядеть.
import { useMemo, useState, type ReactNode } from 'react'
import { today } from '../model/dates'
import { bucketsOf, EMPTY_FEED, hasData, hourOf, METRICS, PERIODS, sampleFeed, valuesOf, type Bucket, type Feed, type Metric, type Post } from '../model/metrics'
import { newId } from '../model/store'
import { realPlatforms, type Channel, type Competitor } from '../model/types'
import { PlatformIcon, Switch } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'

const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 })
const fmt = (n: number, unit?: string) => (unit === '%' ? `${n.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %` : compact.format(n))

export function AnalyticsView() {
  const { plan, dispatch, toast } = usePlan()
  const [days, setDays] = useState(7)
  const [sample, setSample] = useState(false)
  const skip = plan.analytics?.skip ?? []
  const competitors = plan.analytics?.competitors ?? []
  const mine = plan.channels.filter((c) => !skip.includes(c.id))
  const now = hourOf(Date.now())
  const buckets = useMemo(() => bucketsOf(now, days), [now, days])
  // пример — по своим каналам на их площадках (без сайта и рассылки) и по конкурентам
  const ownersKey = [...plan.channels.map((c) => `${c.id}:${c.platforms.join()}`), ...competitors.map((c) => `${c.id}:${c.platform}`)].join('|')
  const feed = useMemo<Feed>(
    () =>
      sample
        ? sampleFeed(now, [
            ...plan.channels.map((c) => ({ id: c.id, platforms: realPlatforms(c.platforms) })),
            ...competitors.map((c) => ({ id: c.id, platforms: [c.platform], rival: true })),
          ])
        : EMPTY_FEED,
    // площадки и конкуренты — через ownersKey: пример пересобирается, только когда они поменялись
    [sample, now, ownersKey],
  )
  const toggle = (c: Channel) => dispatch({ type: 'analytics', patch: { skip: skip.includes(c.id) ? skip.filter((x) => x !== c.id) : [...skip, c.id] } })
  const posts = feed.posts.filter((p) => competitors.some((c) => c.id === p.owner))
  return (
    <>
      <header className="cp-top cp-an__top">
        <div className="cp-top__left">
          <h1 className="nr-title">Аналитика</h1>
        </div>
        <div className="cp-top__right">
          <Switch checked={sample} onChange={setSample}>Пример</Switch>
          <div className="nr-seg" role="radiogroup" aria-label="Период">
            {PERIODS.map((p) => (
              <button key={p.days} type="button" role="radio" aria-checked={days === p.days} className="nr-seg__item" onClick={() => setDays(p.days)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="cp-body nr-scroll">
        <div className="cp-an">
          {sample ? (
            <p className="cp-an__sample" role="note">
              Это пример, не ваши данные: так будут выглядеть графики и лента, когда подключим площадки.
            </p>
          ) : (
            <div className="cp-an__soon" role="note">
              <Icon name="chart" size={18} />
              <div>
                <b>Данные придут из соцсетей</b>
                <p>Подписчики, просмотры и вовлечённость — своих каналов и конкурентов, по часам. Для этого подключим площадки (нужен сервер и доступы к аккаунтам). Посмотреть, как это будет, — «Пример» вверху.</p>
              </div>
              <span className="cp-an__badge">скоро</span>
            </div>
          )}

          <section className="cp-an__sec" aria-labelledby="an-own">
            <div className="cp-an__head">
              <h2 id="an-own">Мои каналы</h2>
              <p className="cp-hint">Все каналы плана; щелчок — убрать из аналитики или вернуть.</p>
            </div>
            <div className="cp-pills cp-pills--flush" role="group" aria-label="Каналы для анализа">
              {plan.channels.map((c) => (
                <button key={c.id} type="button" className="nr-pill cp-an__pick" aria-pressed={!skip.includes(c.id)} onClick={() => toggle(c)}>
                  <span className="nr-dot" style={{ background: c.color }} aria-hidden="true" />
                  {c.name}
                </button>
              ))}
            </div>
            <div className="cp-an__grid">
              {mine.map((c) => (
                <MetricsCard key={c.id} owner={c.id} name={c.name} color={c.color} platforms={realPlatforms(c.platforms)} feed={feed} buckets={buckets} />
              ))}
            </div>
          </section>

          <section className="cp-an__sec" aria-labelledby="an-rivals">
            <div className="cp-an__head">
              <h2 id="an-rivals">Конкуренты</h2>
              <p className="cp-hint">Проверяем их каналы каждый час: цифры — здесь, их посты с саммери — в ленте ниже.</p>
            </div>
            <div className="cp-an__soon" aria-disabled="true">
              <Icon name="megaphone" size={18} />
              <div>
                <b>Из маркетингового анализа</b>
                <p>Конкуренты подтянутся сами, когда будет готов маркетинговый анализ.</p>
              </div>
              <span className="cp-an__badge">скоро</span>
            </div>
            <AddCompetitor
              onAdd={(c) => {
                dispatch({ type: 'analytics', patch: { competitors: [...competitors, c] } })
                toast(`«${c.name}» — следим каждый час`, true)
              }}
            />
            {competitors.length > 0 && (
              <ul className="cp-an__grid cp-an__rivals" aria-label="Конкуренты">
                {competitors.map((c) => (
                  <li key={c.id}>
                    <MetricsCard
                      owner={c.id}
                      name={c.name}
                      platforms={[c.platform]}
                      feed={feed}
                      buckets={buckets}
                      sub={
                        <span className="cp-muted">
                          {c.platform === 'Web' ? 'Сайт' : c.platform}
                          {c.handle && ` · ${c.handle}`}
                        </span>
                      }
                      extra={
                        <>
                          <span className="cp-an__watch" title="Проверяем канал каждый час">
                            <span className="cp-an__pulse" aria-hidden="true" />
                            каждый час
                          </span>
                          <button
                            type="button"
                            className="nr-btn nr-btn--ghost nr-btn--icon nr-btn--sm"
                            aria-label={`Не следить: ${c.name}`}
                            title="Не следить"
                            onClick={() => {
                              dispatch({ type: 'analytics', patch: { competitors: competitors.filter((x) => x.id !== c.id) } })
                              toast(`«${c.name}» больше не отслеживаем`, true)
                            }}
                          >
                            <Icon name="close" size={16} />
                          </button>
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cp-an__sec" aria-labelledby="an-feed">
            <div className="cp-an__head">
              <h2 id="an-feed">Лента для вдохновения</h2>
              <p className="cp-hint">Посты конкурентов с коротким саммери. «Переиспользовать» — новый контент с их темой и саммери в заметке: дальше видоизмените по-своему.</p>
            </div>
            {posts.length ? (
              <ul className="cp-feed" aria-label="Посты конкурентов">
                {posts.map((p) => (
                  <PostItem key={p.id} post={p} owner={competitors.find((c) => c.id === p.owner)!} />
                ))}
              </ul>
            ) : (
              <div className="cp-an__empty">
                <Icon name="list" size={22} />
                <p>
                  {competitors.length
                    ? 'Пока пусто: посты и саммери появятся после первой проверки — её запустит сервер мониторинга, его ещё подключаем.'
                    : 'Добавьте конкурентов выше — их посты с коротким саммери будут появляться здесь каждый час.'}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  )
}

/** Карточка канала (своего или конкурента): площадки — фильтром, три графика: подписчики, просмотры, вовлечённость. */
function MetricsCard({ owner, name, color, platforms, feed, buckets, sub, extra }: {
  owner: string
  name: string
  color?: string
  platforms: string[]
  feed: Feed
  buckets: Bucket[]
  sub?: ReactNode
  extra?: ReactNode
}) {
  const [only, setOnly] = useState<string | null>(null)
  const data = hasData(feed, owner)
  return (
    <article className="cp-an__card" aria-label={name}>
      <header className="cp-an__card-head">
        {color ? <span className="nr-dot" style={{ background: color }} aria-hidden="true" /> : <PlatformIcon platform={platforms[0]} size={16} />}
        <div className="cp-an__card-name">
          <h3>{name}</h3>
          {sub}
        </div>
        {extra}
      </header>
      {platforms.length > 1 && (
        <div className="cp-an__plats" role="radiogroup" aria-label={`Площадки: ${name}`}>
          <button type="button" role="radio" aria-checked={only === null} className="cp-an__plat" onClick={() => setOnly(null)}>
            Все
          </button>
          {platforms.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={only === p} aria-label={p} title={p} className="cp-an__plat" onClick={() => setOnly(p)}>
              <PlatformIcon platform={p} size={14} />
            </button>
          ))}
        </div>
      )}
      {data ? (
        METRICS.map((m) => <MetricChart key={m.id} metric={m.id} values={valuesOf(feed, owner, m.id, only ? [only] : null, buckets)} buckets={buckets} name={name} />)
      ) : (
        <div className="cp-an__soon cp-an__soon--sm">
          <span>
            Нет данных: {platforms.length ? platforms.join(', ') : 'площадки'} — не подключены. Графики появятся, когда подключим.
          </span>
        </div>
      )}
    </article>
  )
}

/** График метрики: подписчики и вовлечённость — линией, просмотры — столбиками. Наведите — значение и время. */
function MetricChart({ metric, values, buckets, name }: { metric: Metric; values: (number | null)[]; buckets: Bucket[]; name: string }) {
  const m = METRICS.find((x) => x.id === metric)!
  const [hover, setHover] = useState<number | null>(null)
  const known = values.filter((v): v is number => v !== null)
  const W = 300
  const H = 64
  const n = values.length
  const slot = W / n
  // столбики — от нуля; линия подписчиков — от своего минимума, иначе рост не видно
  const lo = m.kind === 'columns' || metric === 'er' ? 0 : Math.min(...known)
  const hi = Math.max(...known, lo + 1)
  const y = (v: number) => H - 2 - ((v - lo) / (hi - lo)) * (H - 8)
  const headline =
    metric === 'followers' ? known[known.length - 1] : metric === 'views' ? known.reduce((a, b) => a + b, 0) : known.reduce((a, b) => a + b, 0) / Math.max(1, known.length)
  const delta = metric === 'followers' && known.length > 1 ? known[known.length - 1] - known[0] : null
  const line = values
    .map((v, i) => (v === null ? null : `${(i + 0.5) * slot},${y(v)}`))
    .filter(Boolean)
    .join(' ')
  const hv = hover !== null ? values[hover] : null
  return (
    <figure className="cp-mc">
      <figcaption>
        <span className="cp-mc__label">{m.label}</span>
        <b className="cp-mc__value">{known.length ? fmt(headline, m.unit) : '—'}</b>
        {delta !== null && <span className={`cp-mc__delta${delta < 0 ? ' cp-mc__delta--down' : ''}`}>{delta >= 0 ? '+' : '−'}{fmt(Math.abs(delta))}</span>}
        <span className="cp-mc__tip" aria-live="polite">
          {hover !== null ? `${buckets[hover].label}: ${hv === null ? 'нет данных' : fmt(hv, m.unit)}` : m.note}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H + 12}`} role="img" aria-label={`${name}, ${m.label.toLowerCase()}: ${buckets.map((b, i) => `${b.label} — ${values[i] === null ? 'нет' : fmt(values[i]!, m.unit)}`).join(', ')}`} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} className="cp-mc__axis" />
        {m.kind === 'columns'
          ? values.map((v, i) => {
              if (v === null || v <= 0) return null
              const w = Math.min(24, slot - 2)
              const x = i * slot + (slot - w) / 2
              const top = y(v)
              const r = Math.min(4, w / 2, H - top)
              return <path key={i} className={`cp-mc__bar${hover === i ? ' cp-mc__bar--on' : ''}`} d={`M${x} ${H} V${top + r} Q${x} ${top} ${x + r} ${top} H${x + w - r} Q${x + w} ${top} ${x + w} ${top + r} V${H} Z`} />
            })
          : line && <polyline className="cp-mc__line" points={line} />}
        {hover !== null && hv !== null && (
          <>
            <line className="cp-mc__cross" x1={(hover + 0.5) * slot} x2={(hover + 0.5) * slot} y1="0" y2={H} />
            {m.kind === 'line' && <circle className="cp-mc__dot" cx={(hover + 0.5) * slot} cy={y(hv)} r="4" />}
          </>
        )}
        <text x="0" y={H + 11} className="cp-mc__x">{buckets[0]?.label}</text>
        <text x={W} y={H + 11} textAnchor="end" className="cp-mc__x">{buckets[n - 1]?.label}</text>
        {/* зоны наведения — во всю высоту, шире самих отметок */}
        {values.map((_, i) => (
          <rect key={i} x={i * slot} y="0" width={slot} height={H + 12} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      <table className="nr-visually-hidden">
        <caption>{m.label}</caption>
        <tbody>
          {buckets.map((b, i) => (
            <tr key={b.from}>
              <th scope="row">{b.label}</th>
              <td>{values[i] === null ? 'нет данных' : fmt(values[i]!, m.unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

const when = (ms: number) => {
  const h = Math.round((Date.now() - ms) / 3600_000)
  if (h < 1) return 'только что'
  if (h < 24) return `${h} ч назад`
  const d = new Date(ms)
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${String(d.getHours()).padStart(2, '0')}:00`
}

/** Пост конкурента: тема, саммери, цифры; «Переиспользовать» — новый контент с этой темой, его видоизменяют. */
function PostItem({ post, owner }: { post: Post; owner: Competitor }) {
  const { openNew } = usePlan()
  const topic = post.title.replace(/^Пример: /, '')
  const reuse = () =>
    openNew({
      date: today(),
      title: topic.charAt(0).toUpperCase() + topic.slice(1),
      format: post.format,
      note: `По мотивам: ${owner.name}, ${post.platform}${post.url ? ` — ${post.url}` : ''}\nСаммери: ${post.summary}\nЧто поменять у нас: `,
    })
  return (
    <li className="cp-feed__item">
      <div className="cp-feed__head">
        <PlatformIcon platform={post.platform} size={15} />
        <b>{owner.name}</b>
        <span className="cp-muted">{when(post.at)}</span>
        {post.sample && <span className="cp-an__badge">пример</span>}
      </div>
      <h3 className="cp-feed__title">{post.title}</h3>
      <p className="cp-feed__sum">{post.summary}</p>
      <div className="cp-feed__foot">
        <span className="cp-muted">
          {fmt(post.views)} просмотров · {fmt(post.likes)} реакций
        </span>
        {post.url && (
          <a className="nr-btn nr-btn--ghost nr-btn--sm" href={post.url} target="_blank" rel="noopener noreferrer">
            Открыть
          </a>
        )}
        <button type="button" className="nr-btn nr-btn--secondary nr-btn--sm" onClick={reuse}>
          <Icon name="copy" size={15} />
          Переиспользовать
        </button>
      </div>
    </li>
  )
}

/** Завести конкурента: название, площадка, ссылка или @аккаунт. */
function AddCompetitor({ onAdd }: { onAdd: (c: Competitor) => void }) {
  const { plan } = usePlan()
  const options = [...realPlatforms(plan.platforms), 'Web']
  const [name, setName] = useState('')
  const [platform, setPlatform] = useState(options[0] ?? 'Web')
  const [handle, setHandle] = useState('')
  const [error, setError] = useState('')
  return (
    <form
      className="cp-an__add"
      aria-label="Новый конкурент"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return setError('Как называется канал конкурента?')
        onAdd({ id: newId('c'), name: name.trim(), platform, handle: handle.trim(), added: today() })
        setName('')
        setHandle('')
        setError('')
      }}
    >
      <label className="cp-field">
        <span className="nr-label">Название</span>
        <input className="nr-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, AI Daily" />
      </label>
      <label className="cp-field">
        <span className="nr-label">Площадка</span>
        <select className="nr-field" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          {options.map((p) => (
            <option key={p} value={p}>{p === 'Web' ? 'Сайт' : p}</option>
          ))}
        </select>
      </label>
      <label className="cp-field cp-an__handle">
        <span className="nr-label">Ссылка или @аккаунт</span>
        <input className="nr-field" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@aidaily или https://…" />
      </label>
      <button type="submit" className="nr-btn nr-btn--primary">
        <Icon name="plus" size={16} />
        Следить
      </button>
      {error && <p className="cp-hint cp-an__err" role="alert">{error}</p>}
    </form>
  )
}
