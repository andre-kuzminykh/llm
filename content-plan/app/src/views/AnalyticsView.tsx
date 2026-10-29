// Аналитика СММ — второй пункт меню СММ после календаря. Свои каналы: какие смотреть (все, что есть в плане) и по каждому —
// сколько вышло, что не вышло вовремя, что впереди, ритм по неделям, форматы, площадки, рубрики. Конкуренты: человек
// заводит их сам (из маркетингового анализа подтянутся позже — пунктиром), мы проверяем их каналы каждый час и кладём
// их контент с саммери ниже, чтобы переиспользовать. Охваты и сбор контента заработают, когда подключим площадки и сервер.
import { useMemo, useState } from 'react'
import { channelStats, type ChannelStats, type Week } from '../model/analytics'
import { shortDate, today } from '../model/dates'
import { plural } from '../model/hint'
import { newId } from '../model/store'
import { FORMAT_ICON, realPlatforms, type Channel, type Competitor } from '../model/types'
import { PlatformIcon } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'

const PERIODS = [
  { days: 7, label: '7 дней' },
  { days: 30, label: '30 дней' },
  { days: 90, label: '90 дней' },
]

export function AnalyticsView() {
  const { plan, dispatch, toast } = usePlan()
  const [days, setDays] = useState(30)
  const now = today()
  const stats = useMemo(() => channelStats(plan, now, days), [plan, now, days])
  const skip = plan.analytics?.skip ?? []
  const competitors = plan.analytics?.competitors ?? []
  const toggle = (c: Channel) => {
    const next = skip.includes(c.id) ? skip.filter((x) => x !== c.id) : [...skip, c.id]
    dispatch({ type: 'analytics', patch: { skip: next } })
  }
  return (
    <>
      <header className="cp-top cp-an__top">
        <div className="cp-top__left">
          <h1 className="nr-title">Аналитика</h1>
        </div>
        <div className="cp-top__right">
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
          <section className="cp-an__sec" aria-labelledby="an-own">
            <div className="cp-an__head">
              <h2 id="an-own">Мои каналы</h2>
              <p className="cp-hint">По карточкам плана за {PERIODS.find((p) => p.days === days)?.label}. Охваты и вовлечённость появятся, когда подключим площадки.</p>
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
              {plan.channels
                .filter((c) => !skip.includes(c.id))
                .map((c) => (
                  <ChannelCard key={c.id} c={c} s={stats.find((x) => x.channelId === c.id)!} />
                ))}
            </div>
          </section>

          <section className="cp-an__sec" aria-labelledby="an-rivals">
            <div className="cp-an__head">
              <h2 id="an-rivals">Конкуренты</h2>
              <p className="cp-hint">Проверяем их каналы каждый час: новые посты и короткое саммери — ниже, понравившееся можно взять в черновики.</p>
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
              <ul className="cp-an__rivals" aria-label="Конкуренты">
                {competitors.map((c) => (
                  <li key={c.id} className="cp-an__rival">
                    <PlatformIcon platform={c.platform} size={18} />
                    <div className="cp-an__rival-main">
                      <b>{c.name}</b>
                      <span className="cp-muted">
                        {c.platform}
                        {c.handle && ` · ${c.handle}`}
                      </span>
                    </div>
                    <span className="cp-an__watch" title="Новые посты и саммери появятся после первой проверки">
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
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cp-an__sec" aria-labelledby="an-feed">
            <div className="cp-an__head">
              <h2 id="an-feed">Контент конкурентов и саммери</h2>
            </div>
            <div className="cp-an__empty">
              <Icon name="list" size={22} />
              <p>
                {competitors.length
                  ? 'Пока пусто: посты и саммери появятся после первой проверки — её запустит сервер мониторинга, его ещё подключаем.'
                  : 'Добавьте конкурентов выше — их посты и короткое саммери будут появляться здесь каждый час.'}
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}

/** Карточка своего канала: цифры периода, ритм по неделям, форматы, площадки, рубрики. */
function ChannelCard({ c, s }: { c: Channel; s: ChannelStats }) {
  const { rubrics } = usePlan()
  return (
    <article className="cp-an__card" aria-label={c.name}>
      <header className="cp-an__card-head">
        <span className="nr-dot" style={{ background: c.color }} aria-hidden="true" />
        <h3>{c.name}</h3>
        <span className="cp-an__plats" aria-label={`Площадки: ${realPlatforms(c.platforms).join(', ')}`}>
          {realPlatforms(c.platforms).map((p) => (
            <PlatformIcon key={p} platform={p} size={13} />
          ))}
        </span>
      </header>
      <dl className="cp-an__stats">
        <Stat label="Карточек" value={s.total} note={`${s.perWeek.toLocaleString('ru-RU')} в неделю`} />
        <Stat label="Вышло" value={s.published} />
        <Stat label="Не вышло вовремя" value={s.late} warn={s.late > 0} />
        <Stat label="Впереди 7 дней" value={s.ahead} />
      </dl>
      <Rhythm weeks={s.weeks} name={c.name} />
      <div className="cp-an__mix">
        {s.formats.length > 0 && (
          <div>
            <span className="nr-label">Форматы</span>
            <ul aria-label="Форматы">
              {s.formats.map(([f, n]) => (
                <li key={f} title={f}>
                  <Icon name={FORMAT_ICON[f].icon} size={14} />
                  {FORMAT_ICON[f].label} <b>{n}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
        {s.platforms.length > 0 && (
          <div>
            <span className="nr-label">Площадки</span>
            <ul aria-label="Площадки">
              {s.platforms.map(([p, n]) => (
                <li key={p}>
                  <PlatformIcon platform={p} size={14} />
                  {p} <b>{n}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
        {s.rubrics.length > 0 && (
          <div>
            <span className="nr-label">Чаще всего</span>
            <ul aria-label="Рубрики">
              {s.rubrics.map(([id, n]) => (
                <li key={id}>
                  {rubrics.get(id)?.name ?? id} <b>{n}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {s.total === 0 && s.ahead === 0 && <p className="cp-hint">За период карточек нет.</p>}
      <div className="cp-an__soon cp-an__soon--sm" aria-disabled="true">
        <span>Охваты, просмотры, вовлечённость — после подключения площадок</span>
      </div>
    </article>
  )
}

function Stat({ label, value, note, warn }: { label: string; value: number; note?: string; warn?: boolean }) {
  return (
    <div className={`cp-an__stat${warn ? ' cp-an__stat--warn' : ''}`}>
      <dt>{label}</dt>
      <dd>
        {value.toLocaleString('ru-RU')}
        {note && <span>{note}</span>}
      </dd>
    </div>
  )
}

/** Ритм — карточек в неделю: 4 недели назад, текущая и 7 вперёд (по плану — бледнее). Наведите — число и неделя. */
function Rhythm({ weeks, name }: { weeks: Week[]; name: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...weeks.map((w) => w.n))
  const W = 12 * 22
  const H = 56
  const label = (w: Week) => `неделя с ${shortDate(w.from)}: ${w.n} ${plural(w.n, 'карточка', 'карточки', 'карточек')}${w.future ? ' по плану' : `, вышло ${w.published}`}`
  const cur = weeks.find((w) => w.current)
  return (
    <figure className="cp-an__rhythm">
      <figcaption>
        <span className="nr-label">Карточек в неделю</span>
        <span className="cp-an__tip" aria-live="polite">{hover !== null ? label(weeks[hover]) : cur ? `эта неделя: ${cur.n}` : ''}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label={`${name}, карточек в неделю: ${weeks.map((w) => `${shortDate(w.from)} — ${w.n}`).join(', ')}`} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} className="cp-an__axis" />
        {weeks.map((w, i) => {
          const h = w.n ? Math.max(3, (w.n / max) * (H - 4)) : 0
          const x = i * 22 + 3
          return (
            <g key={w.from} onMouseEnter={() => setHover(i)}>
              {/* зона наведения — во всю высоту колонки */}
              <rect x={i * 22} y="0" width="22" height={H + 14} fill="transparent" />
              {h > 0 && (
                <path
                  className={`cp-an__bar${w.future ? ' cp-an__bar--plan' : ''}${hover === i ? ' cp-an__bar--hover' : ''}`}
                  d={`M${x} ${H} V${H - h + 4} q0 -4 4 -4 h8 q4 0 4 4 V${H} Z`}
                />
              )}
              {w.current && <text x={x + 8} y={H + 12} textAnchor="middle" className="cp-an__now">сейчас</text>}
            </g>
          )
        })}
      </svg>
    </figure>
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
