// Главная — лента как в TikTok: по одному материалу на экран, листается вверх-вниз (колесо, стрелки, свайп, кнопки справа).
// «Я выпускаю» — карточки календаря с темой (вид на каждый формат карточки, фото — из заметки) и мои посты;
// «Смотрю других» — посты подписок: ссылку на соцсеть вставили — следите, «Отписаться» — открепились.
// Короткое видео — кадр 9:16 с надписью; длинное — 16:9 в рамке; пост — карточка или карусель с подписью; статья —
// обложка с подписью. Справа — цифры и «Саммери»: одно окно с саммери, главным, топиками и кнопкой «Пересоздать».
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { addDays, dayTitle, today } from '../model/dates'
import { topicLabel } from '../model/overview'
import { faceFor, followed, NO_REEL_FILTERS, parseFollow, REEL_KINDS, reelFilterCount, reelOfCard, reelOfPost, reelPlatforms, reelVisible, type Face, type Reel, type ReelFilters, type ReelKind, type Side } from '../model/reel'
import { newId } from '../model/store'
import { isSlot, statusOf, timeOf } from '../model/types'
import { unitsOf } from '../model/units'
import { IconButton, PlatformIcon, Switch } from '../ui/bits'
import { demoClip, type Source } from '../ui/clips'
import { usePlan } from '../ui/ctx'
import { useHomeData } from '../ui/homeData'
import { setReelState, useReelState } from '../ui/reelState'
import { Icon } from '../ui/Icon'
import { fmtNum } from './Overview'

const PAGE = 12
const FOLLOW_PLATFORMS = ['YouTube', 'Telegram', 'TikTok', 'Instagram', 'X', 'LinkedIn', 'Web']
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
const ago = (ms: number, now = Date.now()) => {
  const h = Math.round((now - ms) / 3600_000)
  if (h >= 0 && h < 1) return 'только что'
  if (h >= 0 && h < 24) return `${h} ч назад`
  const d = new Date(ms)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
const clock = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '')
/** «Пн, 16 ноября» — без года: в ленте год и так понятен. */
const dayShort = (d: string) => dayTitle(d).replace(/ \d{4}$/, '')
const initial = (name: string) => name.replace(/^[@#]/, '').trim().charAt(0).toUpperCase() || '·'

/** Материалы ленты: свои — карточки календаря с темой (что выйдет — ближайшее первым, дальше вышедшее и мои посты —
 *  свежие первыми); чужие — посты подписок. Одни и те же для ленты и панели фильтров. */
export function useReels() {
  const { plan, byDate, rules, channels, rubrics } = usePlan()
  const data = useHomeData()
  const { who, now } = data
  const order = useMemo(() => plan.channels.map((c) => c.id), [plan.channels])
  const mine = useMemo(() => {
    const t = today()
    const cards: Reel[] = []
    for (let d = addDays(t, -30); d <= addDays(t, 90); d = addDays(d, 1)) {
      for (const u of unitsOf(byDate.get(d) ?? [], rules, order)) {
        if (isSlot(u.head) || u.head.derive) continue
        const time = u.allDay ? '' : timeOf(u.head, rules.get(u.head.ruleId))
        const at = new Date(`${d}T${time || '12:00'}:00`).getTime()
        const ch = channels.get(u.channelId)
        cards.push(reelOfCard(u.items, { channelName: ch?.name ?? 'Без канала', color: ch?.color, rubric: rubrics.get(u.head.rubricId ?? '')?.name, time: time || 'весь день', at }))
      }
    }
    const posts = data.feed.posts.filter((p) => p.mine).map((p) => reelOfPost(p, who.get(p.owner)))
    const soon = cards.filter((r) => r.planned && r.at >= now).sort((a, b) => a.at - b.at)
    const past = [...cards.filter((r) => !soon.includes(r)), ...posts].sort((a, b) => b.at - a.at)
    return [...soon, ...past]
  }, [byDate, rules, order, channels, rubrics, data.feed, who, now])
  const theirs = useMemo(() => data.feed.posts.filter((p) => !p.mine).map((p) => reelOfPost(p, who.get(p.owner))), [data.feed, who])
  return { mine, theirs, data }
}

export function FeedView() {
  const { plan, dispatch, toast, setSection, sideOpen, toggleSide } = usePlan()
  const { mine, theirs, data } = useReels()
  const { demo, setDemo, now } = data
  const { side, filters } = useReelState()
  const f = filters[side]
  const setF = (patch: Partial<ReelFilters>) => {
    setReelState({ filters: { ...filters, [side]: { ...f, ...patch } } })
    setLimit(PAGE)
    feedRef.current?.scrollTo?.({ top: 0 })
  }
  const setSide = (s: Side) => {
    setReelState({ side: s })
    setLimit(PAGE)
    feedRef.current?.scrollTo?.({ top: 0 })
  }
  const [limit, setLimit] = useState(PAGE)
  const [subsOpen, setSubsOpen] = useState(false)
  const feedRef = useRef<HTMLDivElement>(null)
  const all = side === 'mine' ? mine : theirs
  const list = useMemo(() => all.filter((r) => reelVisible(r, f)), [all, f])
  // сколько каждого формата при остальных фильтрах — числом на кнопке
  const kindCount = (k: ReelKind) => all.filter((r) => reelVisible(r, f, 'kinds') && r.faces.some((x) => x.kind === k)).length
  const n = sideOpen ? 0 : reelFilterCount(f)

  // подписки: свои (в плане) или пример в демо; ссылка → следить, «Отписаться» — убрать
  const stored = plan.analytics?.competitors ?? []
  const follow = (input: string, platform: string) => {
    const fl = parseFollow(input, platform)
    if (!fl) return 'Вставьте ссылку на аккаунт (youtube.com/@…, t.me/…, tiktok.com/@…) или @аккаунт'
    if (followed(stored, fl)) return `Вы уже следите за ${fl.handle} в ${fl.platform}`
    dispatch({ type: 'analytics', patch: { competitors: [...stored, { id: newId('c'), name: fl.name, platform: fl.platform, handle: fl.handle, added: today() }] } })
    toast(`Следите: ${fl.name} · ${fl.platform} — посты появятся в ленте`, true)
    return ''
  }
  const unfollow = (id: string) => {
    const c = stored.find((x) => x.id === id)
    if (!c) return
    dispatch({ type: 'analytics', patch: { competitors: stored.filter((x) => x.id !== id) } })
    if (filters.theirs.owners.includes(id)) setReelState({ filters: { ...filters, theirs: { ...filters.theirs, owners: filters.theirs.owners.filter((x) => x !== id) } } })
    toast(`Отписались: ${c.name} · ${c.platform}`, true)
  }
  /** Сторис и аватар: только этот аккаунт (ещё раз — все); из «Я выпускаю» — сразу к его постам. */
  const pickOwner = (id: string | null) => {
    const now = filters.theirs.owners
    const owners = !id ? [] : now.length === 1 && now[0] === id && side === 'theirs' ? [] : [id]
    setReelState({ side: 'theirs', filters: { ...filters, theirs: { ...filters.theirs, owners } } })
    setLimit(PAGE)
    feedRef.current?.scrollTo?.({ top: 0 })
  }

  // листать по одному: стрелки, PageUp/PageDown, j/k; у конца — подгрузить ещё
  const go = (dir: 1 | -1) => {
    const el = feedRef.current
    if (!el) return
    const h = el.clientHeight || 1
    const i = Math.round(el.scrollTop / h) + dir
    el.scrollTo?.({ top: Math.max(0, i) * h, behavior: 'smooth' })
  }
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j') (e.preventDefault(), go(1))
    else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k') (e.preventDefault(), go(-1))
    else if (e.key === ' ' && (e.target as HTMLElement) === feedRef.current) {
      // пробел — пауза и пуск видео на экране
      e.preventDefault()
      const el = feedRef.current!
      const i = Math.round(el.scrollTop / (el.clientHeight || 1))
      el.querySelectorAll<HTMLElement>('[data-reel]')[i]?.querySelector<HTMLButtonElement>('.cp-reel__tap')?.click()
    }
  }
  const onScroll = () => {
    const el = feedRef.current
    if (el && el.scrollTop + el.clientHeight * 3 > el.scrollHeight && limit < list.length) setLimit(limit + PAGE)
  }
  const filtered = list.length < all.length

  return (
    <>
      <header className="cp-top cp-reels__top">
        <div className="cp-top__left">
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--icon cp-top__filter" aria-label="Фильтры" title={sideOpen ? 'Свернуть фильтры' : 'Развернуть фильтры'} aria-pressed={sideOpen} aria-expanded={sideOpen} onClick={toggleSide}>
            <Icon name="filter" size={20} />
            {n > 0 && <span className="cp-top__badge" aria-hidden="true">{n}</span>}
          </button>
          <h1 className="nr-title">Главная</h1>
        </div>
        <div className="cp-top__right">
          <Switch checked={demo} onChange={setDemo}>
            Демо
          </Switch>
          <div className="nr-seg" role="radiogroup" aria-label="Чья лента">
            <button type="button" role="radio" aria-checked={side === 'mine'} aria-label="Я выпускаю" className="nr-seg__item" onClick={() => setSide('mine')}>
              <Icon name="megaphone" size={16} />
              <span className="cp-wide">Я выпускаю</span>
              <span className="cp-narrow">Мои</span>
            </button>
            <button type="button" role="radio" aria-checked={side === 'theirs'} aria-label="Смотрю других" className="nr-seg__item" onClick={() => setSide('theirs')}>
              <Icon name="eye" size={16} />
              <span className="cp-wide">Смотрю других</span>
              <span className="cp-narrow">Другие</span>
            </button>
          </div>
        </div>
      </header>
      {/* сторис подписок — сверху всегда, как в Instagram: из «Я выпускаю» щелчок ведёт к постам этого аккаунта */}
      <Subs
        stored={stored}
        shown={data.theirs}
        selected={side === 'theirs' ? filters.theirs.owners : undefined}
        setOwner={pickOwner}
        open={subsOpen}
        setOpen={setSubsOpen}
        onFollow={follow}
        onUnfollow={unfollow}
      />
      {/* формат — строкой над лентой: короткие, длинные, посты, карусели, статьи; выделенное — остаётся только оно */}
      <div className="cp-reels__kinds" role="group" aria-label="Формат">
        <button type="button" className="cp-reels__kind" aria-pressed={!f.kinds.length} onClick={() => setF({ kinds: [] })}>
          Все
        </button>
        {REEL_KINDS.map((k) => {
          const c = kindCount(k.kind)
          return (
            <button key={k.kind} type="button" className="cp-reels__kind" aria-pressed={f.kinds.includes(k.kind)} aria-label={`${k.label}: ${c}`} onClick={() => setF({ kinds: toggle(f.kinds, k.kind) })}>
              <Icon name={k.icon} size={15} />
              {k.label}
              <span className="cp-reels__n">{c}</span>
            </button>
          )
        })}
      </div>
      <div className="cp-reels__wrap">
        {list.length ? (
          <div className="cp-reels nr-scroll" ref={feedRef} role="feed" aria-label={side === 'mine' ? 'Лента: я выпускаю' : 'Лента: смотрю других'} aria-busy="false" tabIndex={0} onKeyDown={onKey} onScroll={onScroll}>
            {list.slice(0, limit).map((r, i) => (
              <ReelView
                key={`${r.id}|${f.kinds.join()}`}
                reel={r}
                face0={faceFor(r, f.kinds)}
                pos={i + 1}
                size={list.length}
                now={now}
                canUnfollow={stored.some((c) => c.id === r.owner)}
                onUnfollow={() => unfollow(r.owner)}
                onOwner={side === 'theirs' ? () => pickOwner(r.owner) : undefined}
              />
            ))}
          </div>
        ) : filtered ? (
          <div className="cp-reels__empty">
            <Icon name="filter" size={28} />
            <h2>По этим фильтрам ничего нет</h2>
            <p>Снимите часть фильтров — или все сразу.</p>
            <div className="cp-reels__emptyact">
              <button type="button" className="nr-btn nr-btn--primary" onClick={() => setF(NO_REEL_FILTERS)}>
                Сбросить фильтры
              </button>
            </div>
          </div>
        ) : (
          <Empty side={side} demo={demo} onDemo={() => setDemo(true)} onCalendar={() => setSection('calendar')} onSubs={() => setSubsOpen(true)} />
        )}
        {list.length > 1 && (
          <div className="cp-reels__nav">
            <button type="button" className="nr-btn nr-btn--secondary nr-btn--icon cp-reels__arrow" aria-label="Предыдущий" title="Предыдущий (↑)" onClick={() => go(-1)}>
              <Icon name="arrow-up" size={18} />
            </button>
            <button type="button" className="nr-btn nr-btn--secondary nr-btn--icon cp-reels__arrow cp-reels__arrow--down" aria-label="Следующий" title="Следующий (↓)" onClick={() => go(1)}>
              <Icon name="arrow-up" size={18} />
            </button>
          </div>
        )}
      </div>
    </>
  )
}

/** Фильтры ленты — той же панелью слева, что в календаре и аналитике: формат, каналы (у чужих — аккаунты), площадки,
 *  топики и (у своих) когда. Выделенное — остаётся только оно; ничего не выделено — всё. */
export function FeedSide({ onClose }: { onClose: () => void }) {
  const { narrow, channels, plan } = usePlan()
  const { mine, theirs, data } = useReels()
  const { side, filters } = useReelState()
  const all = side === 'mine' ? mine : theirs
  const f = filters[side]
  const set = (patch: Partial<ReelFilters>) => setReelState({ filters: { ...filters, [side]: { ...f, ...patch } } })
  const changed = f.kinds.length + reelFilterCount(f) > 0
  // каналы — по порядку плана, дальше мои соцсети; аккаунты — по порядку подписок
  const order = side === 'mine' ? [...plan.channels.map((c) => c.id), ...data.mine.map((a) => a.id)] : data.theirs.map((a) => a.id)
  const rank = (id: string) => (order.indexOf(id) + 1 || 999)
  const owners = [...new Map(all.map((r) => [r.owner, { id: r.owner, name: r.ownerName, platform: r.platform, color: channels.get(r.owner)?.color }])).values()].sort((a, b) => rank(a.id) - rank(b.id))
  const platforms = [...new Set(all.flatMap(reelPlatforms))].filter((p) => p !== 'Mail')
  const tagCount = new Map<string, number>()
  for (const r of all) for (const t of r.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
  const tags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([t]) => t)
  const ownersLabel = side === 'mine' ? 'Каналы' : 'Аккаунты'
  return (
    <aside className="cp-side nr-scroll cp-feedside" aria-label="Фильтры">
      <div className="cp-side__head">
        <span className="cp-side__title">Фильтры</span>
        {changed && (
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => set(NO_REEL_FILTERS)}>
            Сбросить
          </button>
        )}
        {narrow ? <IconButton icon="close" label="Закрыть фильтры" onClick={onClose} size="sm" /> : <IconButton icon="chev-left" label="Свернуть фильтры" onClick={onClose} size="sm" />}
      </div>
      <p className="cp-hint cp-feedside__hint">{side === 'mine' ? 'Лента «Я выпускаю».' : 'Лента «Смотрю других».'} Выделите — останется только выделенное.</p>
      <div className="cp-side__block">
        <span className="nr-label">Форматы</span>
        <div className="cp-pills cp-side__rubrics" role="group" aria-label="Форматы">
          {REEL_KINDS.map((k) => (
            <button key={k.kind} type="button" className="nr-pill" aria-pressed={f.kinds.includes(k.kind)} onClick={() => set({ kinds: toggle(f.kinds, k.kind) })}>
              <Icon name={k.icon} size={14} />
              {k.label}
            </button>
          ))}
        </div>
      </div>
      {owners.length > 0 && (
        <div className="cp-side__block">
          <span className="nr-label">{ownersLabel}</span>
          <div className="cp-pills cp-side__rubrics" role="group" aria-label={ownersLabel}>
            {owners.map((o) => (
              <button key={o.id} type="button" className="nr-pill" aria-pressed={f.owners.includes(o.id)} onClick={() => set({ owners: toggle(f.owners, o.id) })}>
                {o.color ? <span className="nr-dot" style={{ background: o.color }} aria-hidden="true" /> : <PlatformIcon platform={o.platform} size={13} />}
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {platforms.length > 0 && (
        <div className="cp-side__block">
          <span className="nr-label">Площадки</span>
          <div className="cp-pills cp-side__rubrics" role="group" aria-label="Площадки">
            {platforms.map((p) => (
              <button key={p} type="button" className="nr-pill" aria-pressed={f.platforms.includes(p)} onClick={() => set({ platforms: toggle(f.platforms, p) })}>
                <PlatformIcon platform={p} size={13} />
                {p === 'Web' ? 'Сайт' : p}
              </button>
            ))}
          </div>
        </div>
      )}
      {tags.length > 0 && (
        <div className="cp-side__block">
          <span className="nr-label">{side === 'mine' ? 'Рубрики и топики' : 'Топики'}</span>
          <div className="cp-pills cp-side__rubrics" role="group" aria-label="Топики">
            {tags.map((t) => (
              <button key={t} type="button" className="nr-pill" aria-pressed={f.tags.includes(t)} onClick={() => set({ tags: toggle(f.tags, t) })}>
                {topicLabel(t)}
              </button>
            ))}
          </div>
        </div>
      )}
      {side === 'mine' && (
        <div className="cp-side__block">
          <span className="nr-label">Когда</span>
          <div className="nr-seg" role="radiogroup" aria-label="Когда">
            {(
              [
                ['all', 'Всё'],
                ['soon', 'Выйдет'],
                ['out', 'Вышло'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={f.when === id} className="nr-seg__item" onClick={() => set({ when: id })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}

/** Один материал на экран: кадр по виду формата, подпись, справа — цифры и «Саммери». */
function ReelView({ reel, face0 = 0, pos, size, now, canUnfollow, onUnfollow, onOwner }: {
  reel: Reel
  face0?: number
  pos: number
  size: number
  now: number
  canUnfollow: boolean
  onUnfollow: () => void
  onOwner?: () => void
}) {
  const { openItem, openRecreate } = usePlan()
  const [faceIx, setFaceIx] = useState(face0)
  const [sheet, setSheet] = useState(false)
  const [liked, setLiked] = useState(false)
  const face = reel.faces[faceIx] ?? reel.faces[0]
  const style = { '--reel-h': reel.hue } as CSSProperties
  const when = reel.planned
    ? `${statusOf(reel.planned.status).label === 'В плане' ? 'Выйдет' : statusOf(reel.planned.status).label} · ${dayShort(reel.planned.date)}${reel.planned.time ? `, ${reel.planned.time}` : ''}`
    : ago(reel.at, now)
  const overlay = face.kind === 'short' || face.kind === 'video'
  const sources = sourcesOf(reel, face)
  const plats = [...new Set(reel.faces.flatMap((f) => f.platforms))].filter((p) => p !== 'Web' && p !== 'Mail')
  return (
    <article className="cp-reel" aria-label={reel.title} aria-posinset={pos} aria-setsize={size} data-reel={reel.id}>
      <div className="cp-reel__stage">
        <div className={`cp-reel__frame cp-reel__frame--${face.kind}`} style={style}>
          <div className="cp-reel__top">
            {reel.faces.length > 1 ? (
              <div className="cp-reel__faces" role="radiogroup" aria-label="Формат карточки">
                {reel.faces.map((f, i) => (
                  <button key={f.format} type="button" role="radio" aria-checked={i === faceIx} onClick={() => setFaceIx(i)}>
                    {f.label}
                  </button>
                ))}
              </div>
            ) : (
              <span className="cp-reel__pill">{face.label}</span>
            )}
            {reel.planned && <span className="cp-reel__pill cp-reel__pill--soon">{when}</span>}
            {reel.sample && <span className="cp-reel__pill">демо</span>}
          </div>
          <Media reel={reel} face={face} sources={sources} />
          <div className={`cp-reel__cap${overlay ? ' cp-reel__cap--over' : ''}`}>
            <div className="cp-reel__who">
              <b>{reel.handle ?? reel.ownerName}</b>
              <span>
                {reel.handle ? `${reel.ownerName} · ` : ''}
                {reel.planned ? reel.faces.map((f) => f.label).join(' · ') : when}
              </span>
            </div>
            {!overlay && face.kind !== 'article' && <p className="cp-reel__title">{reel.title}</p>}
            <Caption text={reel.caption} />
            {plats.length > 0 && (
              <div className="cp-reel__plats" aria-label={`Площадки: ${plats.join(', ')}`}>
                {plats.map((p) => (
                  <PlatformIcon key={p} platform={p} size={13} />
                ))}
              </div>
            )}
          </div>
          {overlay && !sources && (
            <div className="cp-reel__bar" aria-hidden="true">
              <i style={{ width: '0%' }} />
            </div>
          )}
          {sheet && (
            <SummarySheet
              reel={reel}
              onClose={() => setSheet(false)}
              onRecreate={() => (setSheet(false), openRecreate(reel.source))}
              onOpen={reel.itemId ? () => (setSheet(false), openItem(reel.itemId!)) : undefined}
              onUnfollow={reel.side === 'theirs' && canUnfollow ? () => (setSheet(false), onUnfollow()) : undefined}
            />
          )}
        </div>
        <div className="cp-reel__rail">
          <button type="button" className="cp-reel__ava" style={style} onClick={onOwner} disabled={!onOwner} aria-label={onOwner ? `Только ${reel.ownerName}` : reel.ownerName} title={onOwner ? `Только ${reel.ownerName} — ещё раз: все` : reel.ownerName}>
            {initial(reel.ownerName)}
            <span className="cp-reel__avaplat" aria-hidden="true">
              <PlatformIcon platform={reel.platform} size={11} />
            </span>
          </button>
          {reel.stats ? (
            <>
              <button type="button" className="cp-reel__act" aria-pressed={liked} aria-label={`Нравится: ${fmtNum(reel.stats.likes + (liked ? 1 : 0))}`} onClick={() => setLiked(!liked)}>
                <span className="cp-reel__ico">
                  <Icon name="heart" size={22} />
                </span>
                {fmtNum(reel.stats.likes + (liked ? 1 : 0))}
              </button>
              <span className="cp-reel__act" aria-label={`Комментарии: ${fmtNum(reel.stats.comments)}`}>
                <span className="cp-reel__ico">
                  <Icon name="comment" size={22} />
                </span>
                {fmtNum(reel.stats.comments)}
              </span>
              <span className="cp-reel__act" aria-label={`Репосты: ${fmtNum(reel.stats.shares)}`}>
                <span className="cp-reel__ico">
                  <Icon name="share" size={22} />
                </span>
                {fmtNum(reel.stats.shares)}
              </span>
              <span className="cp-reel__act" aria-label={`Просмотры: ${fmtNum(reel.stats.views)}`}>
                <span className="cp-reel__ico">
                  <Icon name="eye" size={22} />
                </span>
                {fmtNum(reel.stats.views)}
              </span>
            </>
          ) : (
            reel.itemId && (
              <button type="button" className="cp-reel__act" aria-label="Открыть карточку" onClick={() => openItem(reel.itemId!)}>
                <span className="cp-reel__ico">
                  <Icon name="pencil" size={20} />
                </span>
                Открыть
              </button>
            )
          )}
          <button type="button" className="cp-reel__act cp-reel__act--sum" aria-label="Саммери" aria-expanded={sheet} onClick={() => setSheet(!sheet)}>
            <span className="cp-reel__ico">
              <Icon name="spark" size={22} />
            </span>
            Саммери
          </button>
        </div>
      </div>
    </article>
  )
}

/** Что играть: видео из заметки карточки; у примера (демо) — демо-клип; иначе видео ещё нет — кадр-обложка. */
function sourcesOf(reel: Reel, face: Face): { list: Source[]; demo: boolean } | null {
  if (face.kind !== 'short' && face.kind !== 'video') return null
  if (reel.videos.length) return { list: reel.videos, demo: false }
  if (reel.sample) return { list: demoClip(face.kind === 'video', reel.hue), demo: true }
  return null
}

/** Кадр по виду: короткое — 9:16 с надписью, длинное — 16:9 в рамке, пост — карточка, карусель — слайды, статья — обложка.
 *  Видео играет по-настоящему (Player); нет видео — обложка, у своей карточки — «прикрепите видео к заметке». */
function Media({ reel, face, sources }: { reel: Reel; face: Face; sources: { list: Source[]; demo: boolean } | null }) {
  const img = reel.images[0]
  const bg = img ? { backgroundImage: `url("${img}")` } : undefined
  const noVideo = reel.planned && <span className="cp-reel__novideo">Видео ещё нет — прикрепите его к заметке карточки</span>
  if (face.kind === 'short')
    return sources ? (
      <div className="cp-reel__poster cp-reel__poster--video">
        <Player sources={sources.list} title={reel.title} wide={false} sound={!sources.demo} say={sources.demo ? reel.title : undefined} />
      </div>
    ) : (
      <div className={`cp-reel__poster${img ? ' cp-reel__poster--img' : ''}`} style={bg} role="img" aria-label={`Короткое видео${reel.duration ? `, ${clock(reel.duration)}` : ''}: ${reel.title}`}>
        <span className="cp-reel__say">{reel.title}</span>
        {noVideo}
      </div>
    )
  if (face.kind === 'video')
    return (
      <div className="cp-reel__wide">
        {sources ? (
          <div className="cp-reel__wideimg cp-reel__wideimg--video">
            <Player sources={sources.list} title={reel.title} wide sound={!sources.demo} say={sources.demo ? reel.title : undefined} />
          </div>
        ) : (
          <div className={`cp-reel__wideimg${img ? ' cp-reel__poster--img' : ''}`} style={bg} role="img" aria-label={`Видео${reel.duration ? `, ${clock(reel.duration)}` : ''}: ${reel.title}`}>
            <span className="cp-reel__widetitle">{reel.title}</span>
            {noVideo}
          </div>
        )}
      </div>
    )
  if (face.kind === 'carousel') return <Carousel reel={reel} />
  if (face.kind === 'article')
    return (
      <div className="cp-reel__article">
        <div className={`cp-reel__cover${img ? ' cp-reel__poster--img' : ''}`} style={bg} role="img" aria-label={`Обложка статьи: ${reel.title}`}>
          {!img && <Icon name="f-web" size={30} />}
        </div>
        <h3 className="cp-reel__atitle">{reel.title}</h3>
        <p className="cp-reel__lead">{reel.summary}</p>
        <span className="cp-reel__read">
          Читать <Icon name="chev-right" size={14} />
        </span>
      </div>
    )
  return (
    <div className="cp-reel__card">
      <div className={`cp-reel__tile${img ? ' cp-reel__poster--img' : ''}`} style={bg} role="img" aria-label={`Пост: ${reel.title}`}>
        {!img && <span className="cp-reel__tiletext">{reel.title}</span>}
      </div>
    </div>
  )
}

/** Карусель: слайды вбок (свайп, стрелки), точки и «2 / 5»; слайды — фото из заметки или мысли из саммери. */
function Carousel({ reel }: { reel: Reel }) {
  const slides = reel.images.length > 1 ? reel.images.map((url) => ({ url, text: '' })) : reel.slides.map((text) => ({ url: '', text }))
  const [i, setI] = useState(0)
  const track = useRef<HTMLDivElement>(null)
  const to = (n: number) => {
    const k = Math.max(0, Math.min(slides.length - 1, n))
    setI(k)
    const el = track.current
    el?.scrollTo?.({ left: k * el.clientWidth, behavior: 'smooth' })
  }
  const onScroll = () => {
    const el = track.current
    if (el && el.clientWidth) setI(Math.round(el.scrollLeft / el.clientWidth))
  }
  return (
    <div className="cp-reel__card">
      <div className="cp-reel__car" role="group" aria-roledescription="карусель" aria-label={`Карусель: ${slides.length} слайдов`}>
        <div className="cp-reel__track" ref={track} onScroll={onScroll}>
          {slides.map((s, k) => (
            <div
              key={k}
              className={`cp-reel__slide${s.url ? ' cp-reel__poster--img' : ''}`}
              style={{ ...(s.url ? { backgroundImage: `url("${s.url}")` } : {}), '--slide': k } as CSSProperties}
              role="img"
              aria-label={`Слайд ${k + 1} из ${slides.length}${s.text ? `: ${s.text}` : ''}`}
              aria-hidden={k !== i}
            >
              {s.text && <span className={k ? 'cp-reel__slidetext' : 'cp-reel__tiletext'}>{s.text}</span>}
            </div>
          ))}
        </div>
        <span className="cp-reel__count" aria-live="polite">
          {i + 1} / {slides.length}
        </span>
        {i > 0 && (
          <button type="button" className="cp-reel__carbtn cp-reel__carbtn--prev" aria-label="Предыдущий слайд" onClick={() => to(i - 1)}>
            <Icon name="chev-left" size={18} />
          </button>
        )}
        {i < slides.length - 1 && (
          <button type="button" className="cp-reel__carbtn cp-reel__carbtn--next" aria-label="Следующий слайд" onClick={() => to(i + 1)}>
            <Icon name="chev-right" size={18} />
          </button>
        )}
        <div className="cp-reel__dots" aria-hidden="true">
          {slides.map((_, k) => (
            <i key={k} className={k === i ? 'on' : ''} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Подпись: текст, топики — выделены (#ии). */
function Caption({ text }: { text: string }) {
  if (!text.trim()) return null
  const parts = text.split(/(#[\p{L}\p{N}_]+)/u)
  return <p className="cp-reel__text">{parts.map((p, i) => (p.startsWith('#') ? <b key={i}>{p}</b> : p))}</p>
}

/** Саммери — одно окно: о чём, главное по пунктам, топики, цифры и откуда; кнопка «Пересоздать» (у своих — и «Открыть»). */
function SummarySheet({ reel, onClose, onRecreate, onOpen, onUnfollow }: {
  reel: Reel
  onClose: () => void
  onRecreate: () => void
  onOpen?: () => void
  onUnfollow?: () => void
}) {
  const points = reel.slides.slice(1)
  return (
    <div className="cp-reel__sheet" role="dialog" aria-label={`Саммери: ${reel.title}`} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}>
      <div className="cp-reel__sheethead">
        <span className="cp-reel__sheetkicker">
          <Icon name="spark" size={14} /> Саммери
        </span>
        <button type="button" className="nr-btn nr-btn--ghost nr-btn--icon nr-btn--sm" aria-label="Закрыть саммери" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <h3 className="cp-reel__sheettitle">{reel.title}</h3>
      <p className="cp-reel__sheetsum">{reel.summary}</p>
      {points.length > 1 && (
        <ol className="cp-reel__points" aria-label="Главное">
          {points.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      )}
      {reel.tags.length > 0 && (
        <div className="cp-reel__tags" aria-label="Топики">
          {reel.tags.map((t) => (
            <span key={t} className="cp-tag cp-tag--static">
              {topicLabel(t)}
            </span>
          ))}
        </div>
      )}
      <p className="cp-reel__src">
        <PlatformIcon platform={reel.platform} size={13} /> {reel.ownerName}
        {reel.handle ? ` · ${reel.handle}` : ''}
        {reel.stats ? ` · ${fmtNum(reel.stats.views)} просмотров` : reel.planned ? ` · ${dayShort(reel.planned.date)}` : ''}
      </p>
      <div className="cp-reel__sheetfoot">
        {onUnfollow && (
          <button type="button" className="cp-link" onClick={onUnfollow}>
            Отписаться
          </button>
        )}
        <span className="cp-post__spacer" />
        {reel.url && (
          <a className="nr-btn nr-btn--ghost nr-btn--sm" href={reel.url} target="_blank" rel="noopener noreferrer">
            Оригинал
          </a>
        )}
        {onOpen && (
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={onOpen}>
            Открыть карточку
          </button>
        )}
        <button type="button" className="nr-btn nr-btn--primary nr-btn--sm" onClick={onRecreate}>
          <Icon name="spark" size={15} />
          {reel.side === 'theirs' ? 'Пересоздать у себя' : 'Пересоздать'}
        </button>
      </div>
    </div>
  )
}

/** Сторис подписок строкой сверху: «Все», аккаунты (щелчок — только он), «Подписаться»; панель — ссылкой. */
function Subs({ stored, shown, selected, setOwner, open, setOpen, onFollow, onUnfollow }: {
  stored: { id: string; name: string; platform: string; handle: string }[]
  shown: { id: string; name: string; platform: string; handle: string }[]
  selected: string[] | undefined // выбранные аккаунты; undefined — смотрим свою ленту: ничего не выбрано
  setOwner: (id: string | null) => void
  open: boolean
  setOpen: (v: boolean) => void
  onFollow: (input: string, platform: string) => string
  onUnfollow: (id: string) => void
}) {
  const [link, setLink] = useState('')
  const [platform, setPlatform] = useState('YouTube')
  const [error, setError] = useState('')
  const guess = parseFollow(link, platform)
  const sample = !stored.length && shown.length > 0
  const submit = () => {
    const err = onFollow(link, platform)
    setError(err)
    if (!err) setLink('')
  }
  return (
    <div className="cp-subs">
      <div className="cp-subs__row" role="group" aria-label="Подписки">
        <button type="button" className="cp-subs__item" aria-pressed={!!selected && !selected.length} onClick={() => setOwner(null)}>
          <span className="cp-subs__ava cp-subs__ava--all">
            <Icon name="people" size={18} />
          </span>
          Все
        </button>
        {shown.map((c) => (
          <button key={c.id} type="button" className="cp-subs__item" aria-pressed={!!selected?.includes(c.id)} aria-label={`${c.name}, ${c.platform}`} onClick={() => setOwner(c.id)}>
            <span className="cp-subs__ava" style={{ '--reel-h': hueFor(c.id) } as CSSProperties}>
              {initial(c.name)}
              <span className="cp-reel__avaplat">
                <PlatformIcon platform={c.platform} size={10} />
              </span>
            </span>
            <span className="cp-subs__name">{c.name}</span>
          </button>
        ))}
        <button type="button" className="cp-subs__item" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="cp-subs__ava cp-subs__ava--add">
            <Icon name={open ? 'close' : 'plus'} size={18} />
          </span>
          {open ? 'Закрыть' : 'Подписаться'}
        </button>
      </div>
      {open && (
        <div className="cp-subs__panel" role="region" aria-label="Подписки: ссылки на соцсети">
          <form
            className="cp-subs__form"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <input className="nr-field" aria-label="Ссылка или @аккаунт" placeholder="Ссылка на аккаунт: youtube.com/@…, t.me/…, tiktok.com/@… или @аккаунт" value={link} onChange={(e) => (setLink(e.target.value), setError(''))} />
            <select className="nr-field" aria-label="Площадка" value={guess && link.includes('.') ? guess.platform : platform} onChange={(e) => setPlatform(e.target.value)} disabled={!!guess && link.includes('.')}>
              {FOLLOW_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button type="submit" className="nr-btn nr-btn--primary nr-btn--sm" disabled={!link.trim()}>
              Следить
            </button>
          </form>
          {guess && link.trim() && !error && (
            <p className="cp-hint">
              <PlatformIcon platform={guess.platform} size={12} /> {guess.platform} · {guess.handle}
            </p>
          )}
          {error && (
            <p className="cp-hint" role="alert" style={{ color: 'var(--nr-danger)' }}>
              {error}
            </p>
          )}
          {sample && <p className="cp-hint">Сейчас в ленте — пример. Подпишитесь на свои: первая подписка заменит пример.</p>}
          {stored.length > 0 && (
            <ul className="cp-subs__list" aria-label="Вы следите">
              {stored.map((c) => (
                <li key={c.id}>
                  <span className="cp-subs__ava cp-subs__ava--sm" style={{ '--reel-h': hueFor(c.id) } as CSSProperties}>
                    {initial(c.name)}
                  </span>
                  <span className="cp-subs__who">
                    <b>{c.name}</b>
                    <span className="cp-muted">
                      <PlatformIcon platform={c.platform} size={11} /> {c.platform} · {c.handle}
                    </span>
                  </span>
                  <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" aria-label={`Отписаться: ${c.name}`} onClick={() => onUnfollow(c.id)}>
                    Отписаться
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
const hueFor = (id: string) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % 360
}

/** Пусто: своё — «впишите тему в карточку календаря»; чужое — «подпишитесь по ссылке»; или пример в демо. */
function Empty({ side, demo, onDemo, onCalendar, onSubs }: { side: Side; demo: boolean; onDemo: () => void; onCalendar: () => void; onSubs: () => void }) {
  return (
    <div className="cp-reels__empty">
      <Icon name={side === 'mine' ? 'megaphone' : 'eye'} size={28} />
      <h2>{side === 'mine' ? 'Здесь — то, что вы выпускаете' : 'Здесь — то, что выпускают другие'}</h2>
      <p>
        {side === 'mine'
          ? 'Впишите тему в карточку календаря — она появится здесь так, как выйдет: видео, пост или карусель, статья. Вышедшее из подключённых соцсетей — тоже здесь.'
          : 'Вставьте ссылку на аккаунт в соцсети — его посты будут здесь, с саммери и кнопкой «Пересоздать».'}
      </p>
      <div className="cp-reels__emptyact">
        {side === 'mine' ? (
          <button type="button" className="nr-btn nr-btn--primary" onClick={onCalendar}>
            В календарь
          </button>
        ) : (
          <button type="button" className="nr-btn nr-btn--primary" onClick={onSubs}>
            Подписаться по ссылке
          </button>
        )}
        {!demo && (
          <button type="button" className="nr-btn nr-btn--secondary" onClick={onDemo}>
            Показать пример
          </button>
        )}
      </div>
    </div>
  )
}

/** Видео в ленте — играет само, когда материал на экране (без звука — так браузеры разрешают), и встаёт на паузу, когда
 *  ушли; щелчок — пауза и пуск; полоса внизу — перемотка (мышью, пальцем, стрелками); звук — кнопкой (у своих видео). */
function Player({ sources, title, wide, sound, say }: { sources: Source[]; title: string; wide: boolean; sound: boolean; say?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [dur, setDur] = useState(0)
  const [muted, setMuted] = useState(true)
  const [flash, setFlash] = useState<'play' | 'pause' | null>(null)
  const [seeking, setSeeking] = useState(false)
  // на экране — играть, ушли — пауза
  useEffect(() => {
    const v = ref.current
    if (!v || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) v.play()?.catch?.(() => {})
          else v.pause()
        }
      },
      { threshold: [0, 0.6, 1] },
    )
    io.observe(v)
    return () => io.disconnect()
  }, [])
  // полоса — плавно, по кадрам, пока играет
  useEffect(() => {
    if (!playing || typeof requestAnimationFrame === 'undefined') return
    let raf = 0
    const tick = () => {
      if (ref.current) setTime(ref.current.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 650)
    return () => clearTimeout(t)
  }, [flash])
  const toggle = () => {
    const v = ref.current
    if (!v) return
    if (v.paused) {
      v.play()?.catch?.(() => {})
      setFlash('play')
    } else {
      v.pause()
      setFlash('pause')
    }
  }
  const seekTo = (s: number) => {
    const v = ref.current
    if (!v || !dur) return
    const t = Math.max(0, Math.min(dur - 0.05, s))
    v.currentTime = t
    setTime(t)
  }
  const at = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return r.width ? ((e.clientX - r.left) / r.width) * dur : 0
  }
  const pct = dur ? Math.min(100, (time / dur) * 100) : 0
  return (
    <>
      <video
        ref={ref}
        className="cp-reel__video"
        muted={muted}
        playsInline
        loop
        preload="metadata"
        aria-label={`${wide ? 'Видео' : 'Короткое видео'}: ${title}`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDur(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
      >
        {sources.map((s) => (
          <source key={s.src.slice(0, 64) + s.type} src={s.src} type={s.type} />
        ))}
      </video>
      {say && <span className={wide ? 'cp-reel__widetitle' : 'cp-reel__say'}>{say}</span>}
      <button type="button" className={`cp-reel__tap${playing ? '' : ' cp-reel__tap--paused'}`} aria-label={playing ? 'Пауза' : 'Смотреть'} onClick={toggle}>
        <span className={`cp-reel__play${flash ? ' cp-reel__play--flash' : ''}`} aria-hidden="true">
          <Icon name={flash ?? 'play'} size={wide ? 24 : 30} />
        </span>
      </button>
      {sound && (
        <button type="button" className="cp-reel__sound" aria-label={muted ? 'Включить звук' : 'Выключить звук'} aria-pressed={!muted} onClick={() => setMuted(!muted)}>
          <Icon name={muted ? 'sound-off' : 'sound-on'} size={16} />
          <span>{muted ? 'Без звука' : 'Звук'}</span>
        </button>
      )}
      <div
        className={`cp-reel__seek${seeking ? ' cp-reel__seek--on' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label="Перемотка"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${clock(Math.round(time)) || '0:00'} из ${clock(Math.round(dur)) || '0:00'}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId)
          setSeeking(true)
          seekTo(at(e))
        }}
        onPointerMove={(e) => seeking && seekTo(at(e))}
        onPointerUp={() => setSeeking(false)}
        onPointerCancel={() => setSeeking(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') (e.preventDefault(), e.stopPropagation(), seekTo(time + 2))
          else if (e.key === 'ArrowLeft') (e.preventDefault(), e.stopPropagation(), seekTo(time - 2))
        }}
      >
        <span className="cp-reel__seekbar">
          <i style={{ width: `${pct}%` }} />
        </span>
        <span className="cp-reel__time" aria-hidden="true">
          {clock(Math.floor(time)) || '0:00'} / {clock(Math.round(dur)) || '0:00'}
        </span>
      </div>
    </>
  )
}
