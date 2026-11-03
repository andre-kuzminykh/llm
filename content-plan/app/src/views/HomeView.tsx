// Главная — первый экран СММ. «Моя лента»: что вышло и что ожидается — посты из моих соцсетей и материалы календаря;
// топики — из тегов в текстах (#ии, #кейсы), их можно взять в рубрики. «Поиск» (дискавери): лента конкурентов, «+ Следить»,
// кто впереди по просмотрам, лайкам и комментариям, сортировка и фильтры. У каждого поста и видео — короткое саммери и
// «Пересоздать»: сделать из него пост, короткие видео, длинное видео или статью.
// Посты и цифры придут из API соцсетей, когда подключим сервер; пока — «Демо» с выдуманными данными (помечены).
import { useMemo, useState, type ReactNode } from 'react'
import { addDays, dayTitle, today } from '../model/dates'
import { indexByDate } from '../model/filters'
import { EMPTY_FEED, hourOf, sampleFeed, tagsOf, type Feed, type Post } from '../model/metrics'
import { DEMO_ACCOUNTS, DEMO_RIVALS, leaders, sortPosts, SORTS, sourceOfItem, type Sort } from '../model/social'
import { newId } from '../model/store'
import { FORMAT_ICON, isHome, realPlatforms, rubricKey, rubricName, shownTitle, statusOf, timeOf, type Account, type Competitor } from '../model/types'
import { unitsOf, type Unit } from '../model/units'
import { PlatformIcon, Switch } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { useDemo } from '../ui/demo'
import { Icon } from '../ui/Icon'

type Tab = 'mine' | 'discover'
type Show = 'all' | 'upcoming' | 'published'

const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 })
const fmt = (n: number) => compact.format(n)
const ago = (ms: number) => {
  const h = Math.round((Date.now() - ms) / 3600_000)
  if (h < 1) return 'только что'
  if (h < 24) return `${h} ч назад`
  const d = new Date(ms)
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${String(d.getHours()).padStart(2, '0')}:00`
}
const duration = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '')

interface Who {
  name: string
  handle: string
  platform: string
}

export function HomeView() {
  const { plan, dispatch, toast } = usePlan()
  const [demo, setDemo] = useDemo()
  const [tab, setTab] = useState<Tab>('mine')
  const accounts = plan.analytics?.accounts ?? []
  const rivals = plan.analytics?.competitors ?? []
  // в демо, пока никого не подключили, — демо-аккаунты, чтобы было что листать
  const mine: Account[] = accounts.length ? accounts : demo ? DEMO_ACCOUNTS : []
  const theirs: Competitor[] = rivals.length ? rivals : demo ? DEMO_RIVALS : []
  const now = hourOf(Date.now())
  const ownersKey = [...mine, ...theirs].map((a) => `${a.id}:${a.platform}`).join('|')
  const feed = useMemo<Feed>(
    () =>
      demo
        ? sampleFeed(now, [...mine.map((a) => ({ id: a.id, platforms: [a.platform] })), ...theirs.map((c) => ({ id: c.id, platforms: [c.platform], rival: true }))])
        : EMPTY_FEED,
    // аккаунты — через ownersKey: демо пересобирается, только когда они поменялись
    [demo, now, ownersKey],
  )
  const who = new Map<string, Who>([...mine, ...theirs].map((a) => [a.id, { name: a.name, handle: a.handle, platform: a.platform }]))
  const patch = (p: { accounts?: Account[]; competitors?: Competitor[] }) => dispatch({ type: 'analytics', patch: p })
  return (
    <>
      <header className="cp-top cp-home__top">
        <div className="cp-top__left">
          <h1 className="nr-title">Главная</h1>
        </div>
        <div className="cp-top__right">
          <Switch checked={demo} onChange={setDemo}>Демо</Switch>
          <div className="nr-seg cp-home__tabs" role="radiogroup" aria-label="Лента">
            <button type="button" role="radio" aria-checked={tab === 'mine'} className="nr-seg__item" onClick={() => setTab('mine')}>
              <Icon name="home" size={16} />
              Моя лента
            </button>
            <button type="button" role="radio" aria-checked={tab === 'discover'} className="nr-seg__item" onClick={() => setTab('discover')}>
              <Icon name="search" size={16} />
              Поиск
            </button>
          </div>
        </div>
      </header>
      <div className="cp-body nr-scroll">
        <div className="cp-home">
          {demo ? (
            <p className="cp-an__sample" role="note">
              Демо: посты и цифры выдуманы — в продукте придут из API соцсетей. Материалы из календаря — ваши настоящие.
            </p>
          ) : (
            <div className="cp-an__soon" role="note">
              <Icon name="spark" size={18} />
              <div>
                <b>Посты и цифры придут из соцсетей</b>
                <p>Подключим API площадок (нужен сервер) — и лента соберётся сама: ваши посты, их теги и цифры, посты конкурентов с саммери. Сейчас в ленте — материалы из календаря; посмотреть, как будет, — «Демо» вверху.</p>
              </div>
              <span className="cp-an__badge">скоро</span>
            </div>
          )}
          {tab === 'mine' ? (
            <MyFeed feed={feed} who={who} accounts={accounts} demoAccounts={!accounts.length && demo} onAccounts={(a) => patch({ accounts: a })} />
          ) : (
            <Discover
              feed={feed}
              who={who}
              rivals={rivals}
              demoRivals={!rivals.length && demo}
              onRivals={(c) => patch({ competitors: c })}
              onFollow={(c) => toast(`«${c.name}» — следим каждый час`, true)}
            />
          )}
        </div>
      </div>
    </>
  )
}

// ── моя лента ────────────────────────────────────────────────────────────────────────────────────────

function MyFeed({ feed, who, accounts, demoAccounts, onAccounts }: { feed: Feed; who: Map<string, Who>; accounts: Account[]; demoAccounts: boolean; onAccounts: (a: Account[]) => void }) {
  const { plan, rules, rubrics, dispatch, toast } = usePlan()
  const [show, setShow] = useState<Show>('all')
  const [platform, setPlatform] = useState<string | null>(null)
  const [topic, setTopic] = useState<string | null>(null)
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
  const posts = feed.posts.filter((p) => p.mine)
  // топики: теги из текстов моих постов и рубрики материалов календаря
  const topics = useMemo(() => {
    const m = new Map<string, { label: string; n: number; rubric: boolean }>()
    for (const p of posts) for (const tag of tagsOf(p.text)) m.set(tag, { label: tag, n: (m.get(tag)?.n ?? 0) + 1, rubric: plan.rubrics.some((r) => rubricKey(r.name) === rubricKey(tag)) })
    for (const u of [...upcoming, ...published]) {
      const r = u.head.rubricId ? rubrics.get(u.head.rubricId) : undefined
      if (!r) continue
      const k = rubricKey(r.name)
      m.set(k, { label: r.name.toLowerCase(), n: (m.get(k)?.n ?? 0) + 1, rubric: true })
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n)
  }, [posts, upcoming, published, plan.rubrics, rubrics])
  const platforms = [...new Set([...posts.map((p) => p.platform), ...[...upcoming, ...published].flatMap((u) => u.items.flatMap((it) => it.platforms))])].filter((p) => !isHome(p))
  const unitTopic = (u: Unit) => (u.head.rubricId ? rubricKey(rubrics.get(u.head.rubricId)?.name ?? '') : '')
  const okUnit = (u: Unit) => (!platform || u.items.some((it) => it.platforms.includes(platform))) && (!topic || unitTopic(u) === topic)
  const okPost = (p: Post) => (!platform || p.platform === platform) && (!topic || tagsOf(p.text).includes(topic))
  const up = show === 'published' ? [] : upcoming.filter(okUnit)
  const outPosts = show === 'upcoming' ? [] : posts.filter(okPost)
  const outPlan = show === 'upcoming' ? [] : published.filter(okUnit)
  // вышедшее — вместе: мои посты и материалы календаря со статусом «Вышло», новые сверху
  const outAll: ({ post: Post } | { unit: Unit })[] = [
    ...outPosts.map((post) => ({ post, at: post.at })),
    ...outPlan.map((unit) => ({ unit, at: new Date(`${unit.date}T${unit.time}:00`).getTime() })),
  ].sort((a, b) => b.at - a.at)
  const empty = !up.length && !outAll.length
  return (
    <div className="cp-home__grid">
      <div className="cp-home__main">
        <div className="cp-home__bar">
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
          <PlatformFilter platforms={platforms} value={platform} onChange={setPlatform} />
        </div>
        {topic && (
          <p className="cp-home__filter">
            Топик <b>#{topic}</b>
            <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => setTopic(null)}>
              Снять
            </button>
          </p>
        )}
        {up.length > 0 && (
          <section aria-label="Ожидается" className="cp-home__sec">
            <h2 className="cp-home__h">Ожидается <span className="cp-muted">{up.length}</span></h2>
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
            <h2 className="cp-home__h">Вышло <span className="cp-muted">{outAll.length}</span></h2>
            <ul className="cp-home__list">
              {outAll.map((x) => (
                <li key={'post' in x ? x.post.id : x.unit.key}>{'post' in x ? <PostCard post={x.post} who={who.get(x.post.owner)} onTag={setTopic} /> : <PlanPost unit={x.unit} />}</li>
              ))}
            </ul>
          </section>
        )}
        {empty && (
          <div className="cp-an__empty">
            <Icon name="home" size={22} />
            <p>
              {topic || platform
                ? 'По этому фильтру ничего нет.'
                : 'Пока пусто. Подключите свои соцсети справа — здесь будет ваша лента: что вышло и что ожидается к постингу. Запланированное в календаре появится здесь само. Посмотреть, как это будет, — «Демо» вверху.'}
            </p>
          </div>
        )}
      </div>
      <aside className="cp-home__side" aria-label="Мои соцсети и топики">
        <Block title="Мои соцсети" hint="Из них собирается лента: посты, теги и цифры.">
          {demoAccounts && <p className="cp-hint">Демо-аккаунты — пока свои не подключены.</p>}
          <AccountList
            items={demoAccounts ? DEMO_ACCOUNTS : accounts}
            label="Мои соцсети"
            onRemove={
              demoAccounts
                ? undefined
                : (a) => {
                    onAccounts(accounts.filter((x) => x.id !== a.id))
                    toast(`«${a.name}» отключён`, true)
                  }
            }
          />
          <AddAccount
            label="Подключить соцсеть"
            button="Подключить"
            namePlaceholder="Мой канал"
            onAdd={(a) => {
              onAccounts([...accounts, a])
              toast(`${a.platform} «${a.name}» подключён — посты придут, когда подключим API`, true)
            }}
          />
        </Block>
        <Block title="Топики" hint="Из тегов в текстах и рубрик календаря. Щелчок — отфильтровать; «+» — взять тег в рубрики.">
          {topics.length ? (
            <ul className="cp-htags" aria-label="Топики">
              {topics.slice(0, 24).map(([k, v]) => (
                <li key={k} className="cp-htag">
                  <button type="button" className="cp-tag" aria-pressed={topic === k} onClick={() => setTopic(topic === k ? null : k)}>
                    #{v.label} <span className="cp-muted">{v.n}</span>
                  </button>
                  {!v.rubric && (
                    <button
                      type="button"
                      className="cp-htag__add"
                      aria-label={`В рубрики: ${v.label}`}
                      title="Взять в рубрики календаря"
                      onClick={() => {
                        dispatch({ type: 'addRubric', name: rubricName(v.label), id: newId('k') })
                        toast(`«${rubricName(v.label)}» — теперь рубрика календаря`, true)
                      }}
                    >
                      <Icon name="plus" size={12} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="cp-hint">Появятся из тегов в ваших постах.</p>
          )}
        </Block>
      </aside>
    </div>
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
  return (
    <article className={`cp-post cp-post--plan${published ? '' : ' cp-post--soon'}`} aria-label={shownTitle(unit.head)}>
      <header className="cp-post__head">
        <span className="cp-post__ava" style={{ background: c?.color }} aria-hidden="true" />
        <div className="cp-post__who">
          <b>{c?.name ?? 'Канал'}</b>
          <span className="cp-muted">
            {published ? 'Вышло' : 'Ожидается'} · {dayTitle(unit.date!)}, {unit.stream ? '24/7' : timeOf(unit.head, rules.get(unit.head.ruleId))}
          </span>
        </div>
        <span className="cp-an__badge">из календаря</span>
      </header>
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
        {r && <span className="cp-tag cp-tag--static">#{r.name.toLowerCase()}</span>}
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

/** Пост или видео из соцсети: видео — превью с длительностью; тема, саммери, теги, цифры; «Пересоздать». */
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
            <button key={t} type="button" className="cp-tag" onClick={() => onTag?.(t)}>
              #{t}
            </button>
          ))}
        </div>
      )}
      <footer className="cp-post__foot">
        <span className="cp-post__num" title="Просмотры">
          <Icon name="eye" size={15} />
          {fmt(post.views)}
        </span>
        <span className="cp-post__num" title="Лайки">
          <Icon name="heart" size={15} />
          {fmt(post.likes)}
        </span>
        <span className="cp-post__num" title="Комментарии">
          <Icon name="comment" size={15} />
          {fmt(post.comments)}
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

function Discover({ feed, who, rivals, demoRivals, onRivals, onFollow }: {
  feed: Feed
  who: Map<string, Who>
  rivals: Competitor[]
  demoRivals: boolean
  onRivals: (c: Competitor[]) => void
  onFollow: (c: Competitor) => void
}) {
  const { toast } = usePlan()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('new')
  const [platform, setPlatform] = useState<string | null>(null)
  const [owner, setOwner] = useState<string | null>(null)
  const all = feed.posts.filter((p) => !p.mine)
  const query = q.trim().toLowerCase()
  const posts = sortPosts(
    all.filter(
      (p) =>
        (!platform || p.platform === platform) &&
        (!owner || p.owner === owner) &&
        (!query || `${p.title} ${p.text} ${who.get(p.owner)?.name ?? ''} ${who.get(p.owner)?.handle ?? ''}`.toLowerCase().includes(query.replace(/^#/, ''))),
    ),
    sort,
  )
  const board = leaders(all.filter((p) => !platform || p.platform === platform), sort)
  const list = demoRivals ? DEMO_RIVALS : rivals
  return (
    <div className="cp-home__grid">
      <div className="cp-home__main">
        <div className="cp-home__bar">
          <label className="cp-home__search">
            <Icon name="search" size={16} />
            <input type="search" className="nr-field" aria-label="Поиск по конкурентам" placeholder="Тема, тег или аккаунт" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="nr-seg" role="radiogroup" aria-label="Сортировка">
            {SORTS.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={sort === s.id} className="nr-seg__item" onClick={() => setSort(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          <PlatformFilter platforms={[...new Set(all.map((p) => p.platform))]} value={platform} onChange={setPlatform} />
        </div>
        {owner && (
          <p className="cp-home__filter">
            Аккаунт <b>{who.get(owner)?.name}</b>
            <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => setOwner(null)}>
              Снять
            </button>
          </p>
        )}
        {posts.length ? (
          <ul className="cp-home__list" aria-label="Посты конкурентов">
            {posts.map((p) => (
              <li key={p.id}>
                <PostCard post={p} who={who.get(p.owner)} onTag={(t) => setQ(`#${t}`)} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="cp-an__empty">
            <Icon name="search" size={22} />
            <p>
              {query || platform || owner
                ? 'Ничего не нашлось — попробуйте другое слово или снимите фильтр.'
                : list.length
                  ? 'Пока пусто: посты и саммери появятся после первой проверки — её запустит сервер мониторинга. Посмотреть, как будет, — «Демо» вверху.'
                  : 'Добавьте конкурентов — «+ Следить» справа: их посты с коротким саммери будут появляться здесь каждый час.'}
            </p>
          </div>
        )}
      </div>
      <aside className="cp-home__side" aria-label="Конкуренты">
        <Block title="Кто впереди" hint={`В среднем на пост — по ${sort === 'new' ? 'просмотрам' : SORTS.find((s) => s.id === sort)!.label.toLowerCase()}. Щелчок — только его посты.`}>
          {board.length ? (
            <div className="cp-lead__wrap">
              <table className="cp-lead" aria-label="Кто впереди">
                <thead>
                  <tr>
                    <th scope="col">Аккаунт</th>
                    <th scope="col" title="Просмотры в среднем">
                      <Icon name="eye" size={14} />
                    </th>
                    <th scope="col" title="Лайки в среднем">
                      <Icon name="heart" size={14} />
                    </th>
                    <th scope="col" title="Комментарии в среднем">
                      <Icon name="comment" size={14} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {board.map((l, i) => (
                    <tr key={l.owner} aria-selected={owner === l.owner} onClick={() => setOwner(owner === l.owner ? null : l.owner)}>
                      <th scope="row">
                        <span className="cp-lead__n">{i + 1}</span>
                        <PlatformIcon platform={who.get(l.owner)?.platform ?? ''} size={13} />
                        <button type="button" className="cp-lead__name">{who.get(l.owner)?.name ?? l.owner}</button>
                      </th>
                      <td>{fmt(l.views)}</td>
                      <td>{fmt(l.likes)}</td>
                      <td>{fmt(l.comments)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="cp-hint">Появится, когда придут посты.</p>
          )}
        </Block>
        <Block title="Слежу" hint="Проверяем каждый час. Из маркетингового анализа подтянутся сами — позже.">
          {demoRivals && <p className="cp-hint">Демо-конкуренты — пока свои не добавлены.</p>}
          <AccountList
            items={list}
            label="Слежу"
            onRemove={
              demoRivals
                ? undefined
                : (c) => {
                    onRivals(rivals.filter((x) => x.id !== c.id))
                    toast(`«${c.name}» больше не отслеживаем`, true)
                  }
            }
          />
          <AddAccount
            label="Следить за аккаунтом"
            button="+ Следить"
            namePlaceholder="AI Daily"
            onAdd={(a) => {
              const c: Competitor = { ...a, added: today() }
              onRivals([...rivals, c])
              onFollow(c)
            }}
          />
          <div className="cp-an__soon cp-an__soon--sm" aria-disabled="true">
            <span>Из маркетингового анализа — подтянутся сами</span>
            <span className="cp-an__badge">скоро</span>
          </div>
        </Block>
      </aside>
    </div>
  )
}

// ── общее ────────────────────────────────────────────────────────────────────────────────────────────

/** Блок справа; на узком экране — свёрнут (лента важнее), раскрывается по заголовку. */
const WIDE = typeof matchMedia !== 'function' || matchMedia('(min-width: 1001px)').matches
function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <details className="cp-home__block" aria-label={title} open={WIDE}>
      <summary className="cp-home__h">{title}</summary>
      {hint && <p className="cp-hint">{hint}</p>}
      {children}
    </details>
  )
}

function PlatformFilter({ platforms, value, onChange }: { platforms: string[]; value: string | null; onChange: (p: string | null) => void }) {
  if (platforms.length < 2) return null
  return (
    <div className="cp-an__plats" role="radiogroup" aria-label="Площадка">
      <button type="button" role="radio" aria-checked={value === null} className="cp-an__plat" onClick={() => onChange(null)}>
        Все
      </button>
      {platforms.map((p) => (
        <button key={p} type="button" role="radio" aria-checked={value === p} aria-label={p} title={p} className="cp-an__plat" onClick={() => onChange(value === p ? null : p)}>
          <PlatformIcon platform={p} size={14} />
        </button>
      ))}
    </div>
  )
}

function AccountList<T extends Account>({ items, label, onRemove }: { items: T[]; label: string; onRemove?: (a: T) => void }) {
  if (!items.length) return null
  return (
    <ul className="cp-accs" aria-label={label}>
      {items.map((a) => (
        <li key={a.id} className="cp-acc">
          <PlatformIcon platform={a.platform} size={16} />
          <span className="cp-acc__main">
            <b>{a.name}</b>
            <span className="cp-muted">{a.handle || a.platform}</span>
          </span>
          {onRemove && (
            <button type="button" className="nr-btn nr-btn--ghost nr-btn--icon nr-btn--sm" aria-label={`Убрать: ${a.name}`} title="Убрать" onClick={() => onRemove(a)}>
              <Icon name="close" size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Подключить свою соцсеть или следить за конкурентом: площадка, название, @аккаунт. */
function AddAccount({ label, button, namePlaceholder, onAdd }: { label: string; button: string; namePlaceholder: string; onAdd: (a: Account) => void }) {
  const { plan } = usePlan()
  const options = [...realPlatforms(plan.platforms.length ? plan.platforms : ['YouTube', 'Telegram']), 'Web']
  const [platform, setPlatform] = useState(options[0])
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  return (
    <form
      className="cp-accadd"
      aria-label={label}
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim() && !handle.trim()) return
        onAdd({ id: newId('a'), platform, name: name.trim() || handle.trim(), handle: handle.trim() })
        setName('')
        setHandle('')
      }}
    >
      <select className="nr-field" aria-label="Площадка" value={platform} onChange={(e) => setPlatform(e.target.value)}>
        {options.map((p) => (
          <option key={p} value={p}>{p === 'Web' ? 'Сайт' : p}</option>
        ))}
      </select>
      <input className="nr-field" aria-label="Название" placeholder={namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
      <input className="nr-field" aria-label="@аккаунт или ссылка" placeholder="@аккаунт или ссылка" value={handle} onChange={(e) => setHandle(e.target.value)} />
      <button type="submit" className="nr-btn nr-btn--primary nr-btn--sm" disabled={!name.trim() && !handle.trim()}>
        {button}
      </button>
    </form>
  )
}
