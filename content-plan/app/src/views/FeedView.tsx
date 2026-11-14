// Лента как в TikTok: по одному материалу на экран, листается вверх-вниз (колесо, стрелки, свайп, кнопки справа).
// «Я выпускаю» — карточки календаря с темой (вид на каждый формат карточки, фото — из заметки) и мои посты;
// «Смотрю других» — посты подписок: ссылку на соцсеть вставили — следите, «Отписаться» — открепились.
// Короткое видео — кадр 9:16 с надписью; длинное — 16:9 в рамке; пост — карточка или карусель с подписью; статья —
// обложка с подписью. Справа — цифры и «Саммери»: одно окно с саммери, главным, топиками и кнопкой «Пересоздать».
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { addDays, dayTitle, today } from '../model/dates'
import { topicLabel } from '../model/overview'
import { followed, parseFollow, reelOfCard, reelOfPost, type Face, type Reel, type Side } from '../model/reel'
import { newId } from '../model/store'
import { isSlot, statusOf, timeOf } from '../model/types'
import { unitsOf } from '../model/units'
import { PlatformIcon, Switch } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { useHomeData } from '../ui/homeData'
import { Icon } from '../ui/Icon'
import { fmtNum } from './Overview'

const PAGE = 12
const FOLLOW_PLATFORMS = ['YouTube', 'Telegram', 'TikTok', 'Instagram', 'X', 'LinkedIn', 'Web']
const readSide = (): Side => {
  try {
    return localStorage.getItem('cp:reel-side') === 'theirs' ? 'theirs' : 'mine'
  } catch {
    return 'mine'
  }
}
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

export function FeedView() {
  const { plan, byDate, rules, channels, rubrics, dispatch, toast, setSection } = usePlan()
  const data = useHomeData()
  const { demo, setDemo, who, now } = data
  const [side, setSideState] = useState<Side>(readSide)
  const setSide = (s: Side) => {
    setSideState(s)
    setOwner(null)
    setLimit(PAGE)
    feedRef.current?.scrollTo?.({ top: 0 })
    try {
      localStorage.setItem('cp:reel-side', s)
    } catch {
      /* без хранилища — просто не запомнится */
    }
  }
  const [owner, setOwner] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const [subsOpen, setSubsOpen] = useState(false)
  const feedRef = useRef<HTMLDivElement>(null)
  const order = useMemo(() => plan.channels.map((c) => c.id), [plan.channels])

  // свои: карточки календаря с темой — что выйдет (ближайшее первым), дальше вышедшее и мои посты — свежие первыми
  const mineReels = useMemo(() => {
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
  const theirsReels = useMemo(() => data.feed.posts.filter((p) => !p.mine).map((p) => reelOfPost(p, who.get(p.owner))), [data.feed, who])
  const all = side === 'mine' ? mineReels : theirsReels
  const list = owner ? all.filter((r) => r.owner === owner) : all

  // подписки: свои (в плане) или пример в демо; ссылка → следить, «Отписаться» — убрать
  const stored = plan.analytics?.competitors ?? []
  const follow = (input: string, platform: string) => {
    const f = parseFollow(input, platform)
    if (!f) return 'Вставьте ссылку на аккаунт (youtube.com/@…, t.me/…, tiktok.com/@…) или @аккаунт'
    if (followed(stored, f)) return `Вы уже следите за ${f.handle} в ${f.platform}`
    dispatch({ type: 'analytics', patch: { competitors: [...stored, { id: newId('c'), name: f.name, platform: f.platform, handle: f.handle, added: today() }] } })
    toast(`Следите: ${f.name} · ${f.platform} — посты появятся в ленте`, true)
    return ''
  }
  const unfollow = (id: string) => {
    const c = stored.find((x) => x.id === id)
    if (!c) return
    dispatch({ type: 'analytics', patch: { competitors: stored.filter((x) => x.id !== id) } })
    if (owner === id) setOwner(null)
    toast(`Отписались: ${c.name} · ${c.platform}`, true)
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
  }
  const onScroll = () => {
    const el = feedRef.current
    if (el && el.scrollTop + el.clientHeight * 3 > el.scrollHeight && limit < list.length) setLimit(limit + PAGE)
  }
  useEffect(() => setLimit(PAGE), [owner])

  return (
    <>
      <header className="cp-top cp-reels__top">
        <div className="cp-top__left">
          <h1 className="nr-title">Лента</h1>
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
      {side === 'theirs' && (
        <Subs
          stored={stored}
          shown={data.theirs}
          owner={owner}
          setOwner={setOwner}
          open={subsOpen}
          setOpen={setSubsOpen}
          onFollow={follow}
          onUnfollow={unfollow}
        />
      )}
      <div className="cp-reels__wrap">
        {list.length ? (
          <div className="cp-reels nr-scroll" ref={feedRef} role="feed" aria-label={side === 'mine' ? 'Лента: я выпускаю' : 'Лента: смотрю других'} aria-busy="false" tabIndex={0} onKeyDown={onKey} onScroll={onScroll}>
            {list.slice(0, limit).map((r, i) => (
              <ReelView
                key={r.id}
                reel={r}
                pos={i + 1}
                size={list.length}
                now={now}
                canUnfollow={stored.some((c) => c.id === r.owner)}
                onUnfollow={() => unfollow(r.owner)}
                onOwner={side === 'theirs' ? () => setOwner(owner === r.owner ? null : r.owner) : undefined}
              />
            ))}
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

/** Один материал на экран: кадр по виду формата, подпись, справа — цифры и «Саммери». */
function ReelView({ reel, pos, size, now, canUnfollow, onUnfollow, onOwner }: {
  reel: Reel
  pos: number
  size: number
  now: number
  canUnfollow: boolean
  onUnfollow: () => void
  onOwner?: () => void
}) {
  const { openItem, openRecreate } = usePlan()
  const [faceIx, setFaceIx] = useState(0)
  const [sheet, setSheet] = useState(false)
  const [liked, setLiked] = useState(false)
  const face = reel.faces[faceIx] ?? reel.faces[0]
  const style = { '--reel-h': reel.hue } as CSSProperties
  const when = reel.planned
    ? `${statusOf(reel.planned.status).label === 'В плане' ? 'Выйдет' : statusOf(reel.planned.status).label} · ${dayShort(reel.planned.date)}${reel.planned.time ? `, ${reel.planned.time}` : ''}`
    : ago(reel.at, now)
  const overlay = face.kind === 'short' || face.kind === 'video'
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
          <Media reel={reel} face={face} />
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
          {overlay && (
            <div className="cp-reel__bar" aria-hidden="true">
              <i style={{ width: `${18 + (reel.hue % 60)}%` }} />
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

/** Кадр по виду: короткое — 9:16 с надписью, длинное — 16:9 в рамке, пост — карточка, карусель — слайды, статья — обложка. */
function Media({ reel, face }: { reel: Reel; face: Face }) {
  const img = reel.images[0]
  const bg = img ? { backgroundImage: `url("${img}")` } : undefined
  if (face.kind === 'short')
    return (
      <div className={`cp-reel__poster${img ? ' cp-reel__poster--img' : ''}`} style={bg} role="img" aria-label={`Короткое видео${reel.duration ? `, ${clock(reel.duration)}` : ''}: ${reel.title}`}>
        <span className="cp-reel__say">{reel.title}</span>
        <span className="cp-reel__play" aria-hidden="true">
          <Icon name="play" size={28} />
        </span>
        {reel.duration ? <span className="cp-reel__dur">{clock(reel.duration)}</span> : null}
      </div>
    )
  if (face.kind === 'video')
    return (
      <div className="cp-reel__wide">
        <div className={`cp-reel__wideimg${img ? ' cp-reel__poster--img' : ''}`} style={bg} role="img" aria-label={`Видео${reel.duration ? `, ${clock(reel.duration)}` : ''}: ${reel.title}`}>
          <span className="cp-reel__widetitle">{reel.title}</span>
          <span className="cp-reel__play" aria-hidden="true">
            <Icon name="play" size={24} />
          </span>
          {reel.duration ? <span className="cp-reel__dur">{clock(reel.duration)}</span> : null}
        </div>
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

/** Подписки строкой сверху, как истории: «Все», аккаунты (щелчок — только он), «Подписаться»; панель — ссылкой. */
function Subs({ stored, shown, owner, setOwner, open, setOpen, onFollow, onUnfollow }: {
  stored: { id: string; name: string; platform: string; handle: string }[]
  shown: { id: string; name: string; platform: string; handle: string }[]
  owner: string | null
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
        <button type="button" className="cp-subs__item" aria-pressed={!owner} onClick={() => setOwner(null)}>
          <span className="cp-subs__ava cp-subs__ava--all">
            <Icon name="people" size={18} />
          </span>
          Все
        </button>
        {shown.map((c) => (
          <button key={c.id} type="button" className="cp-subs__item" aria-pressed={owner === c.id} aria-label={`${c.name}, ${c.platform}`} onClick={() => setOwner(owner === c.id ? null : c.id)}>
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
