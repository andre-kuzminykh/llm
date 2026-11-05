// Главная — первый экран СММ. Сверху — аналитика как в Google Search Console (период, плитки метрик, график, таблица по
// разрезам с провалом), ниже — лента идей: «Моя лента» (что вышло и что ожидается — мои посты и материалы календаря) или
// «Поиск» (лента конкурентов: поиск, сортировка). Листаешь — графики сворачиваются в строку сверху, справа внизу —
// «Вернуться». Фильтры — панелью слева, как в календаре; аккаунты задаются в настройках. У каждого поста — короткое
// саммери в подсвеченном окошке и «Пересоздать» — та же форма, что и новый контент, с постом как контекстом.
// Посты и цифры придут из API соцсетей, когда подключим сервер; пока — «Демо» с выдуманными данными (помечены).
import { useMemo, useRef, useState } from 'react'
import { addDays, dayTitle, today } from '../model/dates'
import { indexByDate } from '../model/filters'
import { bucketsOf, tagsOf, type Post } from '../model/metrics'
import { followersApply, KPIS, postVisible, topicLabel, totals, type Dim, type HomeFilters } from '../model/overview'
import { sortPosts, SORTS, sourceOfItem, type Sort } from '../model/social'
import { filesOf, FORMAT_ICON, FORMATS, isHome, isImage, rubricKey, shownTitle, statusOf, timeOf } from '../model/types'
import { unitsOf, type Unit } from '../model/units'
import { PlatformIcon, Switch } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { useHomeData, type Who } from '../ui/homeData'
import { Icon } from '../ui/Icon'
import { activeHomeFilters } from './HomeSide'
import { fmtKpi, fmtNum, kpiTotal, Overview } from './Overview'

type Show = 'all' | 'upcoming' | 'published'
const PAGE = 20

const ago = (ms: number) => {
  const h = Math.round((Date.now() - ms) / 3600_000)
  if (h < 1) return 'только что'
  if (h < 24) return `${h} ч назад`
  const d = new Date(ms)
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${String(d.getHours()).padStart(2, '0')}:00`
}
const duration = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '')

export function HomeView() {
  const { home, setHome, toggleSide, sideOpen, openSettings } = usePlan()
  const data = useHomeData()
  const { demo, setDemo, scope, who, now } = data
  const f = home.filters
  const mine = home.tab === 'mine'
  const set = (patch: Partial<HomeFilters>) => setHome({ filters: { ...f, ...patch } })
  const posts = useMemo(() => data.posts.filter((p) => postVisible(p, f)), [data.posts, f])
  const series = useMemo(() => data.series.filter((s) => !f.hiddenOwners.includes(s.owner) && !f.hiddenPlatforms.includes(s.platform)), [data.series, f])
  const owners = scope.map((a) => a.id)
  const platforms = [...new Set([...scope.map((a) => a.platform), ...data.posts.map((p) => p.platform)])]
  const chips = activeHomeFilters(f, new Map([...who].map(([k, v]) => [k, v.name])), { owners, platforms, postTitle: data.posts.find((p) => p.id === f.post)?.title })
  const hasData = data.posts.length > 0 || data.series.length > 0
  // провалиться: щелчок по строке таблицы — фильтр по ней на всю главную
  const drill = (dim: Dim, key: string) => {
    if (dim === 'posts') set({ post: key })
    else if (dim === 'topics') set({ pickedTopics: [key] })
    else if (dim === 'accounts') set({ hiddenOwners: owners.filter((x) => x !== key) })
    else if (dim === 'platforms') set({ hiddenPlatforms: platforms.filter((x) => x !== key) })
    else set({ hiddenFormats: FORMATS.flatMap((g) => g.items).filter((x) => x !== key) })
  }
  // листаешь — графики сворачиваются в строку сверху; «Вернуться» — к ним
  const body = useRef<HTMLDivElement>(null)
  const ov = useRef<HTMLDivElement>(null)
  const [folded, setFolded] = useState(false)
  const onScroll = () => {
    const el = body.current
    const box = ov.current
    if (!el) return
    const past = box ? el.scrollTop > box.offsetTop + box.offsetHeight - 24 : el.scrollTop > 400
    if (past !== folded) setFolded(past)
  }
  const back = () => body.current?.scrollTo?.({ top: 0, behavior: "smooth" })
  const followersOk = followersApply(f)
  const t = useMemo(() => totals(posts, followersOk ? series : [], bucketsOf(now, home.days)[0].from, now), [posts, series, now, home.days, followersOk])
  const n = sideOpen ? 0 : chips.length
  return (
    <>
      <header className="cp-top cp-home__top">
        <div className="cp-top__left">
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--icon cp-top__filter" aria-label="Фильтры" title={sideOpen ? 'Свернуть фильтры' : 'Развернуть фильтры'} aria-pressed={sideOpen} aria-expanded={sideOpen} onClick={toggleSide}>
            <Icon name="filter" size={20} />
            {n > 0 && <span className="cp-top__badge" aria-hidden="true">{n}</span>}
          </button>
          <h1 className="nr-title">Главная</h1>
        </div>
        <div className="cp-top__right">
          <Switch checked={demo} onChange={setDemo}>Демо</Switch>
          <div className="nr-seg cp-home__tabs" role="radiogroup" aria-label="Лента">
            <button type="button" role="radio" aria-checked={mine} className="nr-seg__item" onClick={() => setHome({ tab: 'mine' })}>
              <Icon name="home" size={16} />
              Моя лента
            </button>
            <button type="button" role="radio" aria-checked={!mine} className="nr-seg__item" onClick={() => setHome({ tab: 'discover' })}>
              <Icon name="search" size={16} />
              Поиск
            </button>
          </div>
        </div>
      </header>
      <div className="cp-home__wrap">
        <div className="cp-body nr-scroll" ref={body} onScroll={onScroll}>
          <div className="cp-home">
            <Notice />
            {chips.length > 0 && (
              <div className="cp-chips cp-home__chips" role="group" aria-label="Включённые фильтры">
                {chips.map((c) => (
                  <button key={c.id} type="button" className="cp-chip" onClick={() => set(c.patch)} aria-label={`Снять фильтр: ${c.label}`} title="Снять фильтр">
                    {c.label}
                    <Icon name="close" size={12} />
                  </button>
                ))}
              </div>
            )}
            {hasData && (
              <div ref={ov}>
                <Overview
                  key={home.tab}
                  posts={posts}
                  series={series}
                  followersOk={followersOk}
                  now={now}
                  days={home.days}
                  setDays={(days) => setHome({ days })}
                  who={who}
                  onDrill={drill}
                  defaultDim={mine ? 'posts' : 'accounts'}
                />
              </div>
            )}
            {mine ? <MyFeed posts={posts} who={who} /> : <Discover posts={posts} who={who} />}
            {!scope.length && !demo && (
              <p className="cp-hint cp-home__foot">
                <button type="button" className="cp-link cp-link--accent" onClick={openSettings}>
                  {mine ? 'Подключить соцсети' : 'Добавить конкурентов'}
                </button>{' '}
                — в настройках.
              </p>
            )}
          </div>
        </div>
        {/* графики свёрнуты — строкой сверху: цифры за период; щелчок — вернуться к ним */}
        {folded && hasData && (
          <button type="button" className="cp-ov__mini" onClick={back} aria-label="Графики свёрнуты — развернуть">
            {KPIS.filter((k) => k.id !== 'followers' || followersOk).map((k) => (
              <span key={k.id} className={`cp-ov__mini-k cp-kpi--${k.id}`}>
                <i aria-hidden="true" />
                {k.label} <b>{fmtKpi(k.id, kpiTotal(t, k.id))}</b>
              </span>
            ))}
          </button>
        )}
        {folded && (
          <button type="button" className="cp-back nr-glass" onClick={back} aria-label="Вернуться к графикам" title="Наверх — к графикам">
            <Icon name="arrow-up" size={18} />
            <span>Вернуться</span>
          </button>
        )}
      </div>
    </>
  )
}

/** Плашка сверху: демо; или «подключите соцсети» (их задают в настройках); или «подключено — данные придут с сервером». */
function Notice() {
  const { home, openSettings } = usePlan()
  const { demo, accounts, rivals } = useHomeData()
  const mine = home.tab === 'mine'
  const list = mine ? accounts : rivals
  if (demo)
    return (
      <p className="cp-an__sample" role="note">
        Демо: посты, графики и цифры выдуманы — в продукте придут из API соцсетей. Материалы из календаря — ваши настоящие.
      </p>
    )
  if (!list.length)
    return (
      <div className="cp-an__soon cp-home__connect" role="note">
        <Icon name={mine ? 'home' : 'search'} size={18} />
        <div>
          <b>{mine ? 'Подключите соцсети, чтобы видеть ленту и графики' : 'Добавьте конкурентов, чтобы видеть их ленту и кто впереди'}</b>
          <p>{mine ? 'Площадки и аккаунты задаются в настройках. Пока здесь — то, что запланировано в календаре.' : 'Будем проверять их каждый час: посты с коротким саммери — здесь, цифры — в графиках.'} Посмотреть, как это будет, — «Демо» вверху.</p>
        </div>
        <button type="button" className="nr-btn nr-btn--primary nr-btn--sm" onClick={openSettings}>
          {mine ? 'Подключить' : 'Добавить'}
        </button>
      </div>
    )
  return (
    <div className="cp-an__soon" role="note">
      <Icon name="spark" size={18} />
      <div>
        <b>{mine ? `Подключено соцсетей: ${list.length}` : `Следим за аккаунтами: ${list.length}`}</b>
        <p>Посты и цифры появятся, когда подключим API площадок (нужен сервер). Посмотреть, как это будет, — «Демо» вверху.</p>
      </div>
      <span className="cp-an__badge">скоро</span>
    </div>
  )
}

// ── моя лента ────────────────────────────────────────────────────────────────────────────────────────

function MyFeed({ posts, who }: { posts: Post[]; who: Map<string, Who> }) {
  const { plan, rules, rubrics, home, setHome } = usePlan()
  const f = home.filters
  const [show, setShow] = useState<Show>('all')
  const [limit, setLimit] = useState(PAGE)
  const t = today()
  // календарь: что ожидается (30 дней вперёд, ещё не вышло) и что вышло (30 дней назад)
  const { upcoming, published } = useMemo(() => {
    const byDate = indexByDate(plan)
    const order = plan.channels.map((c) => c.id)
    const up: Unit[] = []
    const done: Unit[] = []
    for (let i = -30; i <= 30; i++) {
      const d = addDays(t, i)
      for (const u of unitsOf(byDate.get(d) ?? [], rules, order)) {
        if (u.head.status === 'published') done.push(u)
        else if (d >= t) up.push(u)
      }
    }
    return { upcoming: up, published: done.reverse() }
  }, [plan, rules, t])
  // материалы календаря — по тем же фильтрам: площадки, форматы, топик (рубрика); провалились в пост — их не видно
  const topicOf = (u: Unit) => (u.head.rubricId ? rubricKey(rubrics.get(u.head.rubricId)?.name ?? '') : '')
  const okUnit = (u: Unit) => {
    if (f.post) return false
    const own = u.items.flatMap((it) => it.platforms).filter((p) => !isHome(p))
    if (f.hiddenPlatforms.length && own.length && own.every((p) => f.hiddenPlatforms.includes(p))) return false
    if (f.hiddenFormats.includes(u.head.format)) return false
    if (f.pickedTopics.length && !f.pickedTopics.some((x) => rubricKey(x) === topicOf(u))) return false
    return true
  }
  const up = show === 'published' ? [] : upcoming.filter(okUnit)
  const outPosts = show === 'upcoming' ? [] : posts
  const outPlan = show === 'upcoming' ? [] : published.filter(okUnit)
  // вышедшее — вместе: мои посты и материалы календаря со статусом «Вышло», новые сверху
  const outAll: ({ post: Post } | { unit: Unit })[] = [
    ...outPosts.map((post) => ({ post, at: post.at })),
    ...outPlan.map((unit) => ({ unit, at: new Date(`${unit.date}T${unit.time}:00`).getTime() })),
  ].sort((a, b) => b.at - a.at)
  const onTag = (tag: string) => setHome({ filters: { ...f, pickedTopics: [tag], post: undefined } })
  return (
    <section className="cp-home__feed" aria-label="Лента">
      <div className="cp-home__bar">
        <h2 className="cp-home__h">Лента</h2>
        <div className="nr-seg" role="radiogroup" aria-label="Что показать">
          {(
            [
              ['all', 'Всё'],
              ['upcoming', 'Ожидается'],
              ['published', 'Вышло'],
            ] as [Show, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={show === id} className="nr-seg__item" onClick={() => setShow(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {up.length > 0 && (
        <section aria-label="Ожидается" className="cp-home__sec">
          <h3 className="cp-home__h3">Ожидается <span className="cp-muted">{up.length}</span></h3>
          <ul className="cp-home__list">
            {up.map((u) => (
              <li key={u.key}>
                <PlanPost unit={u} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {outAll.length > 0 && (
        <section aria-label="Вышло" className="cp-home__sec">
          <h3 className="cp-home__h3">Вышло <span className="cp-muted">{outAll.length}</span></h3>
          <ul className="cp-home__list">
            {outAll.slice(0, limit).map((x) => (
              <li key={'post' in x ? x.post.id : x.unit.key}>{'post' in x ? <PostCard post={x.post} who={who.get(x.post.owner)} onTag={onTag} /> : <PlanPost unit={x.unit} />}</li>
            ))}
          </ul>
          {outAll.length > limit && (
            <button type="button" className="nr-btn nr-btn--secondary cp-home__more" onClick={() => setLimit(limit + PAGE)}>
              Показать ещё — {outAll.length - limit}
            </button>
          )}
        </section>
      )}
      {!up.length && !outAll.length && (
        <div className="cp-an__empty">
          <Icon name="home" size={22} />
          <p>{f.post || f.pickedTopics.length || f.hiddenPlatforms.length || f.hiddenFormats.length ? 'По этому фильтру ничего нет.' : 'Пока пусто: запланированное в календаре появится здесь само, а вышедшее — когда подключим соцсети.'}</p>
        </div>
      )}
    </section>
  )
}

/** Материал календаря в ленте: когда выходит (или вышел), канал, формат и площадки, тема; «Открыть» и «Пересоздать». */
function PlanPost({ unit }: { unit: Unit }) {
  const { channels, rubrics, rules, openItem, openRecreate } = usePlan()
  const c = channels.get(unit.channelId)
  const r = unit.head.rubricId ? rubrics.get(unit.head.rubricId) : undefined
  const published = unit.head.status === 'published'
  const formats = [...new Set(unit.items.map((it) => it.format))].filter((f) => FORMAT_ICON[f])
  const where = [...new Set(unit.items.flatMap((it) => it.platforms))].filter((p) => !isHome(p))
  const img = filesOf(unit.head).find(isImage)?.url
  return (
    <article className={`cp-post cp-post--plan${published ? '' : ' cp-post--soon'}`} aria-label={shownTitle(unit.head)}>
      <header className="cp-post__head">
        <span className="cp-post__ava" style={{ background: c?.color ?? 'var(--nr-fill-1)' }} aria-hidden="true" />
        <div className="cp-post__who">
          <b>{c?.name ?? 'Без канала'}</b>
          <span className="cp-muted">
            {published ? 'Вышло' : 'Ожидается'} · {dayTitle(unit.date!)}, {unit.stream ? '24/7' : unit.allDay ? 'весь день' : timeOf(unit.head, rules.get(unit.head.ruleId))}
          </span>
        </div>
        <span className="cp-an__badge">из календаря</span>
      </header>
      {img && <img className="cp-post__img" src={img} alt="" />}
      <h3 className="cp-post__title">{shownTitle(unit.head)}</h3>
      <div className="cp-post__meta">
        {formats.map((f) => (
          <span key={f} className="cp-post__fmt" title={f}>
            <Icon name={FORMAT_ICON[f].icon} size={14} />
            {FORMAT_ICON[f].label}
          </span>
        ))}
        {where.map((p) => (
          <PlatformIcon key={p} platform={p} size={14} />
        ))}
        {r && <span className="cp-tag cp-tag--static">{r.name.toLowerCase()}</span>}
      </div>
      <footer className="cp-post__foot">
        <span className="cp-muted">{statusOf(unit.head.status).label}</span>
        <span className="cp-post__spacer" />
        <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => openItem(unit.head.id)}>
          Открыть
        </button>
        <button type="button" className="nr-btn nr-btn--secondary nr-btn--sm" onClick={() => openRecreate(sourceOfItem(unit.head, c?.name))}>
          <Icon name="spark" size={15} />
          Пересоздать
        </button>
      </footer>
    </article>
  )
}

/** Пост или видео из соцсети: длинное видео — превью на всю ширину карточки, короткое — вертикальное; тема, саммери в
 *  подсвеченном окошке, топики без решётки, цифры; «Пересоздать». */
function PostCard({ post, who, onTag }: { post: Post; who?: Who; onTag?: (t: string) => void }) {
  const { openRecreate } = usePlan()
  const tags = tagsOf(post.text)
  const video = post.kind === 'video' || post.kind === 'short'
  return (
    <article className="cp-post" aria-label={post.title}>
      <header className="cp-post__head">
        <span className="cp-post__ava cp-post__ava--icon" aria-hidden="true">
          <PlatformIcon platform={post.platform} size={16} />
        </span>
        <div className="cp-post__who">
          <b>{who?.name ?? post.owner}</b>
          <span className="cp-muted">
            {who?.handle ? `${who.handle} · ` : ''}
            {ago(post.at)}
          </span>
        </div>
        {post.sample && <span className="cp-an__badge">демо</span>}
      </header>
      {video && (
        <div className={`cp-post__media cp-post__media--${post.kind}`} aria-label={`${post.kind === 'short' ? 'Короткое видео' : 'Видео'} ${post.platform}, ${duration(post.duration)}`} role="img">
          <span className="cp-post__play" aria-hidden="true">
            <Icon name="play" size={22} />
          </span>
          <span className="cp-post__dur">{duration(post.duration)}</span>
          <span className="cp-post__src">{post.platform}</span>
        </div>
      )}
      <h3 className="cp-post__title">{post.title}</h3>
      {/* саммери — без подписи, подсвеченным окошком */}
      <p className="cp-post__sum">{post.summary}</p>
      {tags.length > 0 && (
        <div className="cp-post__tags">
          {tags.map((t) => (
            <button key={t} type="button" className="cp-tag" onClick={() => onTag?.(t)} title="Только этот топик">
              {topicLabel(t)}
            </button>
          ))}
        </div>
      )}
      <footer className="cp-post__foot">
        <span className="cp-post__num" title="Просмотры">
          <Icon name="eye" size={15} />
          {fmtNum(post.views)}
        </span>
        <span className="cp-post__num" title="Лайки">
          <Icon name="heart" size={15} />
          {fmtNum(post.likes)}
        </span>
        <span className="cp-post__num" title="Комментарии">
          <Icon name="comment" size={15} />
          {fmtNum(post.comments)}
        </span>
        <span className="cp-post__num" title="Репосты">
          <Icon name="share" size={15} />
          {fmtNum(post.shares)}
        </span>
        <span className="cp-post__spacer" />
        {post.url && (
          <a className="nr-btn nr-btn--ghost nr-btn--sm" href={post.url} target="_blank" rel="noopener noreferrer">
            Открыть
          </a>
        )}
        <button
          type="button"
          className="nr-btn nr-btn--secondary nr-btn--sm"
          onClick={() => openRecreate({ title: post.title, summary: post.summary, kind: post.kind, platform: post.platform, owner: who?.name, url: post.url })}
        >
          <Icon name="spark" size={15} />
          Пересоздать
        </button>
      </footer>
    </article>
  )
}

// ── поиск: конкуренты ────────────────────────────────────────────────────────────────────────────────

function Discover({ posts, who }: { posts: Post[]; who: Map<string, Who> }) {
  const { home, setHome } = usePlan()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('new')
  const [limit, setLimit] = useState(PAGE)
  const query = q.trim().toLowerCase().replace(/^#/, '')
  const list = sortPosts(
    posts.filter((p) => !query || `${p.title} ${p.text} ${who.get(p.owner)?.name ?? ''} ${who.get(p.owner)?.handle ?? ''}`.toLowerCase().includes(query)),
    sort,
  )
  const onTag = (tag: string) => setHome({ filters: { ...home.filters, pickedTopics: [tag], post: undefined } })
  return (
    <section className="cp-home__feed" aria-label="Лента конкурентов">
      <div className="cp-home__bar">
        <h2 className="cp-home__h">Лента конкурентов</h2>
        <label className="cp-home__search">
          <Icon name="search" size={16} />
          <input type="search" className="nr-field" aria-label="Поиск по конкурентам" placeholder="Тема, топик или аккаунт" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="nr-seg" role="radiogroup" aria-label="Сортировка">
          {SORTS.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={sort === s.id} className="nr-seg__item" onClick={() => setSort(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {list.length ? (
        <>
          <ul className="cp-home__list" aria-label="Посты конкурентов">
            {list.slice(0, limit).map((p) => (
              <li key={p.id}>
                <PostCard post={p} who={who.get(p.owner)} onTag={onTag} />
              </li>
            ))}
          </ul>
          {list.length > limit && (
            <button type="button" className="nr-btn nr-btn--secondary cp-home__more" onClick={() => setLimit(limit + PAGE)}>
              Показать ещё — {list.length - limit}
            </button>
          )}
        </>
      ) : (
        <div className="cp-an__empty">
          <Icon name="search" size={22} />
          <p>{query ? 'Ничего не нашлось — попробуйте другое слово или снимите фильтр.' : 'Пока пусто: посты конкурентов с коротким саммери будут появляться здесь каждый час.'}</p>
        </div>
      )}
    </section>
  )
}
