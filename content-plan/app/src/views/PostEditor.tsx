// Редактор «Текст»: пост, статья или подпись карточки. Слева — текст (Markdown-панель: заголовок, жирный, курсив, список,
// цитата, ссылка) и до 10 медиа; «Как выйдет» — как это прочитают. Длина — подпись 1000, пост 2000 / 4000 / 8000, блог 16000.
// Внизу по центру — поле ассистента, как в Neuronium; написали — справа открывается диалог со своими виджетами:
// «Пишет» — ответ с «Вставить» / «В конец»; «Правит» — правки по месту (кусок → кусок) с «Отменить правки»;
// «Сгенерировать» — картинку (SVG), инфографику или анимацию (HTML без скриптов) — сразу в медиа поста.
// Пост — общий у карточки (все форматы), сохраняется сам; в ленте «Я выпускаю» карточка показывает этот текст и медиа.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { applyEdits, charCount, signs, htmlDoc, limitOf, MAX_MEDIA, mdToHtml, POST_LIMITS, svgUrl, type Edit, type Post, type PostMedia } from '../model/post'
import { edit as aiEdit, errorText, getSample, visual as aiVisual, VISUALS, write as aiWrite, type Context, type Engine, type Turn, type VisualKind } from '../ai/assistant'
import { dayTitle } from '../model/dates'
import { matesOf, newId } from '../model/store'
import { FORMAT_ICON, MAIL, shownTitle, timeOf, WEB_PAGE, type Item } from '../model/types'
import { IconButton } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'
import { readFile } from '../ui/images'

type Mode = 'write' | 'edit'
interface Msg {
  id: string
  role: 'user' | 'assistant'
  kind: 'write' | 'edit' | 'visual'
  text: string
  pending?: boolean
  error?: string
  engine?: Engine
  edits?: { applied: Edit[]; missed: Edit[]; before: string; undone?: boolean }
  media?: PostMedia
  used?: boolean
}
const CHIPS: Record<Mode, string[]> = {
  write: ['Черновик по теме и заметке', '3 варианта первой строки', 'Призыв в конце'],
  edit: ['Сократи до лимита', 'Разбей на абзацы', 'Добавь заголовок', 'Сделай из абзаца список', 'Добавь призыв'],
}
const fmt = (n: number) => n.toLocaleString('ru-RU')
const later = (f: () => void) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(f) : setTimeout(f, 0))
/** Длина по умолчанию: у карточки со страницей на сайте — блог, иначе — пост на 2000. */
const defaultLimit = (items: Item[]) => (items.some((i) => i.format === WEB_PAGE || i.format === MAIL) ? 16000 : 2000)

export function PostEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { plan, dispatch, channels, rubrics, rules, narrow, openItem } = usePlan()
  const item = plan.items.find((x) => x.id === id)
  const items = useMemo(() => (item ? [item, ...matesOf(plan, item)] : []), [plan, item])
  const start = item?.post
  const [body, setBody] = useState(start?.body ?? (item?.draft?.text ?? ''))
  const [media, setMedia] = useState<PostMedia[]>(start?.media ?? [])
  const [limit, setLimit] = useState(start?.limit ?? defaultLimit(items))
  const [view, setView] = useState<'text' | 'preview'>('text')
  const [open, setOpen] = useState(false) // диалог справа
  const [mode, setMode] = useState<Mode>('write')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [ask, setAsk] = useState('')
  const [busy, setBusy] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const [engine, setEngine] = useState<Engine | null>(null)
  const [saved, setSaved] = useState(true)
  const ta = useRef<HTMLTextAreaElement>(null)
  const ctl = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    getSample().then((s) => alive && setEngine(s ? 'claude' : 'local'))
    return () => {
      alive = false
    }
  }, [])
  // сохраняется само: пост — всей карточке
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setSaved(false)
    const t = setTimeout(() => {
      const post: Post = { body, media, limit, at: new Date().toISOString() }
      dispatch({ type: 'edit', id, patch: { post }, withGroup: true })
      setSaved(true)
    }, 600)
    return () => clearTimeout(t)
  }, [body, media, limit]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight })
  }, [msgs])
  // текст растёт по содержимому
  useEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    if (el.scrollHeight) el.style.height = `${el.scrollHeight + 2}px`
  }, [body, view])

  if (!item) {
    return (
      <div className="cp-ed cp-ed--empty">
        <p>Карточка не найдена — возможно, её удалили.</p>
        <button type="button" className="nr-btn nr-btn--secondary" onClick={onClose}>
          К списку
        </button>
      </div>
    )
  }
  const head = item
  const rule = rules.get(head.ruleId)
  const ctx: Context = {
    title: shownTitle(head) === 'Нужна тема' ? '' : head.title,
    note: head.note,
    rubric: rubrics.get(head.rubricId ?? '')?.name,
    channel: channels.get(head.channelId)?.name,
    formats: items.map((i) => FORMAT_ICON[i.format]?.label ?? i.format),
    limit,
    body,
  }
  const n = charCount(body)
  const over = n - limit

  // ── текст: панель разметки и вставка ────────────────────────────────────────────────────────────────
  const surround = (pre: string, post = pre, fallback = 'текст') => {
    const el = ta.current
    if (!el) return
    const a = el.selectionStart
    const b = el.selectionEnd
    const sel = body.slice(a, b) || fallback
    const next = body.slice(0, a) + pre + sel + post + body.slice(b)
    setBody(next)
    later(() => {
      el.focus()
      el.setSelectionRange(a + pre.length, a + pre.length + sel.length)
    })
  }
  const linePrefix = (prefix: string) => {
    const el = ta.current
    if (!el) return
    const a = body.lastIndexOf('\n', el.selectionStart - 1) + 1
    const b = el.selectionEnd
    const block = body.slice(a, b) || 'текст'
    const next = body.slice(0, a) + block.split('\n').map((l) => (l.startsWith(prefix) ? l : prefix + l)).join('\n') + body.slice(b)
    setBody(next)
    later(() => el.focus())
  }
  const insert = (text: string, where: 'cursor' | 'end') => {
    const el = ta.current
    if (where === 'end' || !el) {
      setBody((b) => (b.trim() ? `${b.replace(/\s*$/, '')}\n\n${text}` : text))
      return
    }
    const a = el.selectionStart ?? body.length
    const b = el.selectionEnd ?? body.length
    const pre = body.slice(0, a)
    const glue = pre && !pre.endsWith('\n') ? '\n\n' : ''
    setBody(pre + glue + text + body.slice(b))
  }

  // ── медиа: до 10 ───────────────────────────────────────────────────────────────────────────────────
  const addMedia = (m: PostMedia) => setMedia((list) => (list.length >= MAX_MEDIA ? list : [...list, m]))
  const addFiles = async (files: File[]) => {
    const room = MAX_MEDIA - media.length
    const ok = files.filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/')).slice(0, room)
    for (const f of ok) {
      const a = await readFile(f).catch(() => null)
      if (a) addMedia({ id: newId('m'), kind: f.type.startsWith('video/') ? 'video' : 'image', name: a.name, url: a.url, type: a.type })
    }
  }
  const move = (i: number, d: -1 | 1) =>
    setMedia((list) => {
      const j = i + d
      if (j < 0 || j >= list.length) return list
      const next = [...list]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  // ── ассистент ────────────────────────────────────────────────────────────────────────────────────────
  const history = (): Turn[] =>
    msgs
      .filter((m) => m.kind === 'write' && !m.pending && !m.error && m.text)
      .map((m) => ({ role: m.role, content: m.text }))
  const patch = (mid: string, p: Partial<Msg>) => setMsgs((list) => list.map((m) => (m.id === mid ? { ...m, ...p } : m)))
  const run = async (text: string, how: Mode | VisualKind) => {
    const q = text.trim()
    if (busy) return
    if (!q && (how === 'write' || how === 'edit')) return
    setOpen(true)
    setAsk('')
    setGenOpen(false)
    const kind = how === 'write' || how === 'edit' ? how : 'visual'
    const label = kind === 'visual' ? `Сгенерируй ${VISUALS.find((v) => v.kind === how)!.label.toLowerCase()}${q ? `: ${q}` : ' по теме поста'}` : q
    const uid = newId('q')
    const aid = newId('a')
    setMsgs((list) => [...list, { id: uid, role: 'user', kind, text: label }, { id: aid, role: 'assistant', kind, text: '', pending: true }])
    setBusy(true)
    const c = new AbortController()
    ctl.current = c
    try {
      if (how === 'write') {
        const r = await aiWrite(history(), q, ctx, { signal: c.signal, onText: (t) => patch(aid, { text: t }) })
        setEngine(r.engine)
        patch(aid, { text: r.text, pending: false, engine: r.engine })
      } else if (how === 'edit') {
        const r = await aiEdit(q, ctx, { signal: c.signal })
        setEngine(r.engine)
        const before = body
        const res = applyEdits(before, r.edits)
        if (res.applied.length) setBody(res.body)
        patch(aid, { text: r.note || (res.applied.length ? 'Поправил.' : 'Править нечего.'), pending: false, engine: r.engine, edits: { applied: res.applied, missed: res.missed, before } })
      } else {
        const r = await aiVisual(how, q, ctx, { signal: c.signal })
        setEngine(r.engine)
        const name = `${VISUALS.find((v) => v.kind === how)!.name}${q ? ` — ${q.slice(0, 40)}` : ''}`
        const m: PostMedia = r.svg ? { id: newId('m'), kind: 'svg', name, url: svgUrl(r.markup), made: r.engine } : { id: newId('m'), kind: 'html', name, html: r.markup, made: r.engine }
        const room = media.length < MAX_MEDIA
        if (room) addMedia(m)
        patch(aid, { text: room ? 'Готово — добавил в медиа поста.' : `В посте уже ${MAX_MEDIA} медиа — уберите одно, чтобы добавить.`, pending: false, engine: r.engine, media: m, used: room })
      }
    } catch (e) {
      patch(aid, { pending: false, error: errorText(e), text: (e as { text?: string })?.text ?? '' })
      if (errorText(e).includes('локальный')) setEngine('local')
    } finally {
      setBusy(false)
      ctl.current = null
    }
  }
  const send = () => run(ask, mode)
  const onAskKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }
  const undoEdits = (m: Msg) => {
    if (!m.edits) return
    setBody(m.edits.before)
    patch(m.id, { edits: { ...m.edits, undone: true } })
  }

  const composer = (
    <div className={`nr-composer cp-ed__composer${open ? ' cp-ed__composer--side' : ''}`}>
      <textarea
        className="nr-composer__input"
        rows={1}
        aria-label="Ассистенту"
        placeholder={mode === 'write' ? 'Попросите написать: черновик, первую строку, призыв…' : 'Что поправить в тексте: сократи, разбей на абзацы…'}
        value={ask}
        onChange={(e) => setAsk(e.target.value)}
        onKeyDown={onAskKey}
      />
      <div className="cp-ed__composerbar">
        <div className="nr-seg cp-ed__modes" role="radiogroup" aria-label="Режим ассистента">
          <button type="button" role="radio" aria-checked={mode === 'write'} className="nr-seg__item" onClick={() => setMode('write')} title="Пишет текст, который вы вставите">
            Пишет
          </button>
          <button type="button" role="radio" aria-checked={mode === 'edit'} className="nr-seg__item" onClick={() => setMode('edit')} title="Правит ваш текст по месту — кусками, не заново">
            Правит
          </button>
        </div>
        <div className="cp-ed__gen">
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" aria-haspopup="menu" aria-expanded={genOpen} onClick={() => setGenOpen(!genOpen)}>
            <Icon name="image" size={15} /> Сгенерировать
          </button>
          {genOpen && (
            <div className="cp-menu cp-ed__genmenu" role="menu" aria-label="Сгенерировать">
              {VISUALS.map((v) => (
                <button key={v.kind} type="button" role="menuitem" className="cp-menu__item" onClick={() => run(ask, v.kind)}>
                  <span>
                    {v.label}
                    <small className="cp-muted"> — {v.hint}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="cp-post__spacer" />
        {busy ? (
          <button type="button" className="nr-btn nr-btn--secondary nr-btn--sm" onClick={() => ctl.current?.abort()}>
            Стоп
          </button>
        ) : (
          <button type="button" className="nr-btn nr-btn--primary nr-btn--icon nr-btn--sm cp-ed__send" aria-label="Отправить" disabled={!ask.trim()} onClick={send}>
            <Icon name="arrow-up" size={16} />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className={`cp-ed${open ? ' cp-ed--dialog' : ''}`}>
      <header className="cp-ed__top">
        <IconButton icon="chev-left" label="Закрыть редактор" onClick={onClose} />
        <div className="cp-ed__title">
          <h1 className="nr-title">{ctx.title || 'Без темы'}</h1>
          <span className="cp-muted">
            {[ctx.channel, head.date ? `${dayTitle(head.date).replace(/ \d{4}$/, '')}, ${timeOf(head, rule)}` : 'черновик', ctx.formats.join(' · ')].filter(Boolean).join(' · ')}
          </span>
        </div>
        <label className="cp-ed__limit">
          <span className="cp-muted">Длина</span>
          <select className="nr-field" aria-label="Длина" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {POST_LIMITS.map((l) => (
              <option key={l.limit} value={l.limit}>
                {l.label} · до {fmt(l.limit)}
              </option>
            ))}
          </select>
        </label>
        <span className={`cp-ed__count${over > 0 ? ' cp-ed__count--over' : ''}`} aria-label={`Знаков: ${n} из ${limit}`} title={over > 0 ? `Больше на ${fmt(over)} — сократите или попросите ассистента` : limitOf(limit).note}>
          {fmt(n)} / {fmt(limit)}
        </span>
        <div className="nr-seg" role="radiogroup" aria-label="Вид">
          <button type="button" role="radio" aria-checked={view === 'text'} className="nr-seg__item" onClick={() => setView('text')}>
            Текст
          </button>
          <button type="button" role="radio" aria-checked={view === 'preview'} className="nr-seg__item" onClick={() => setView('preview')}>
            Как выйдет
          </button>
        </div>
        <span className="cp-muted cp-ed__saved" role="status">
          {saved ? 'Сохранено' : 'Сохраняю…'}
        </span>
        {!open && (
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => setOpen(true)}>
            <Icon name="spark" size={15} /> Ассистент
          </button>
        )}
      </header>
      <div className="cp-ed__main">
        <div className="cp-ed__doc nr-scroll">
          <div className="cp-ed__page">
            {view === 'text' ? (
              <>
                <div className="cp-ed__tools" role="toolbar" aria-label="Разметка">
                  <button type="button" className="cp-ed__tool" aria-label="Заголовок" title="Заголовок" onClick={() => linePrefix('# ')}>
                    H
                  </button>
                  <button type="button" className="cp-ed__tool" aria-label="Жирный" title="Жирный" onClick={() => surround('**')}>
                    <b>B</b>
                  </button>
                  <button type="button" className="cp-ed__tool" aria-label="Курсив" title="Курсив" onClick={() => surround('*')}>
                    <i>I</i>
                  </button>
                  <button type="button" className="cp-ed__tool" aria-label="Список" title="Список" onClick={() => linePrefix('- ')}>
                    •
                  </button>
                  <button type="button" className="cp-ed__tool" aria-label="Цитата" title="Цитата" onClick={() => linePrefix('> ')}>
                    ❝
                  </button>
                  <button type="button" className="cp-ed__tool" aria-label="Ссылка" title="Ссылка" onClick={() => surround('[', '](https://)', 'текст ссылки')}>
                    ↗
                  </button>
                  <span className="cp-ed__sep" />
                  <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" disabled={media.length >= MAX_MEDIA} onClick={() => fileRef.current?.click()} title="Картинки, GIF, видео — до 10">
                    <Icon name="clip" size={15} /> Фото или видео
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    hidden
                    aria-label="Фото или видео"
                    onChange={(e) => {
                      addFiles([...(e.target.files ?? [])])
                      e.target.value = ''
                    }}
                  />
                </div>
                <textarea
                  ref={ta}
                  className="cp-ed__text"
                  aria-label="Текст поста"
                  placeholder="Пишите здесь — или попросите ассистента внизу"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </>
            ) : (
              <Preview body={body} media={media} channel={ctx.channel} />
            )}
            <MediaStrip media={media} onRemove={(mid) => setMedia((l) => l.filter((m) => m.id !== mid))} onMove={move} />
            {over > 0 && (
              <p className="cp-ed__over" role="alert">
                Больше лимита на {signs(over)} — сократите или попросите ассистента «Сократи до лимита».
              </p>
            )}
            <button type="button" className="cp-link cp-ed__card" onClick={() => openItem(head.id)}>
              Карточка: тема, заметка, форматы, время →
            </button>
          </div>
          {!open && <div className="cp-ed__float">{composer}</div>}
        </div>
        {open && (
          <aside className="cp-ed__aside" aria-label="Ассистент">
            <div className="cp-ed__asidehead">
              <span className="cp-ed__asidetitle">
                <Icon name="spark" size={15} /> Ассистент
              </span>
              <span className={`cp-ed__engine cp-ed__engine--${engine ?? 'local'}`} title={engine === 'claude' ? 'Отвечает Claude — от вашего аккаунта, с вашего согласия' : 'ИИ здесь нет: шаблоны и простые правки. Claude — в опубликованной странице, ИИ NR — с сервером'}>
                {engine === 'claude' ? 'Claude' : 'Без ИИ'}
              </span>
              <span className="cp-post__spacer" />
              <IconButton icon="close" label="Закрыть ассистента" size="sm" onClick={() => setOpen(false)} />
            </div>
            <div className="cp-ed__msgs nr-scroll" ref={listRef} role="log" aria-label="Диалог">
              {!msgs.length && <p className="cp-hint">«Пишет» — текст, который можно вставить; «Правит» — меняет ваш текст по месту, кусками, а не заново. «Сгенерировать» — картинку, инфографику или анимацию в медиа поста.</p>}
              {msgs.map((m) => (
                <Bubble key={m.id} m={m} onInsert={(t, w) => (insert(t, w), patch(m.id, { used: true }))} onUndo={() => undoEdits(m)} onRemoveMedia={(mid) => (setMedia((l) => l.filter((x) => x.id !== mid)), patch(m.id, { used: false }))} onAddMedia={(x) => (addMedia(x), patch(m.id, { used: true }))} full={media.length >= MAX_MEDIA} />
              ))}
            </div>
            <div className="cp-ed__chips" role="group" aria-label="Подсказки">
              {CHIPS[mode].map((c) => (
                <button key={c} type="button" className="cp-chip cp-ed__chip" disabled={busy} onClick={() => run(c, mode)}>
                  {c}
                </button>
              ))}
            </div>
            {composer}
          </aside>
        )}
      </div>
      {narrow && open && <div className="cp-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
    </div>
  )
}

/** Реплика в диалоге — со своими виджетами: текст с «Вставить», правки с «Отменить», медиа с превью. */
function Bubble({ m, onInsert, onUndo, onRemoveMedia, onAddMedia, full }: {
  m: Msg
  onInsert: (text: string, where: 'cursor' | 'end') => void
  onUndo: () => void
  onRemoveMedia: (id: string) => void
  onAddMedia: (m: PostMedia) => void
  full: boolean
}) {
  if (m.role === 'user') return <div className="cp-ed__msg cp-ed__msg--me">{m.text}</div>
  return (
    <div className="cp-ed__msg cp-ed__msg--ai" aria-busy={m.pending || undefined}>
      {m.pending && !m.text && <span className="cp-ed__thinking">Думаю…</span>}
      {m.kind === 'write' && m.text && <div className="cp-md" dangerouslySetInnerHTML={{ __html: mdToHtml(m.text) }} />}
      {m.kind !== 'write' && m.text && !m.pending && <p className="cp-ed__note">{m.text}</p>}
      {m.error && (
        <p className="cp-ed__err" role="alert">
          {m.error}
        </p>
      )}
      {m.kind === 'write' && m.text && !m.pending && !m.error && (
        <div className="cp-ed__acts">
          <button type="button" className="nr-btn nr-btn--secondary nr-btn--sm" onClick={() => onInsert(m.text, 'cursor')}>
            Вставить
          </button>
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => onInsert(m.text, 'end')}>
            В конец
          </button>
          {m.used && <span className="cp-muted">вставлено</span>}
        </div>
      )}
      {m.edits && (
        <div className="cp-ed__edits" aria-label="Правки">
          {m.edits.applied.map((e, i) => (
            <div key={i} className="cp-ed__diff">
              {e.find && <del>{e.find.length > 140 ? `${e.find.slice(0, 140)}…` : e.find}</del>}
              {e.replace && <ins>{e.replace.length > 140 ? `${e.replace.slice(0, 140)}…` : e.replace}</ins>}
            </div>
          ))}
          {m.edits.missed.length > 0 && <p className="cp-muted">Не нашёл в тексте: {m.edits.missed.length} — пропустил.</p>}
          {m.edits.applied.length > 0 && (
            <div className="cp-ed__acts">
              {m.edits.undone ? (
                <span className="cp-muted">Правки отменены</span>
              ) : (
                <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={onUndo}>
                  Отменить правки
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {m.media && (
        <div className="cp-ed__gen1">
          <MediaView m={m.media} />
          <div className="cp-ed__acts">
            {m.used ? (
              <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => onRemoveMedia(m.media!.id)}>
                Убрать из поста
              </button>
            ) : (
              <button type="button" className="nr-btn nr-btn--secondary nr-btn--sm" disabled={full} onClick={() => onAddMedia(m.media!)}>
                Добавить в пост
              </button>
            )}
          </div>
        </div>
      )}
      {m.engine && !m.pending && <span className="cp-ed__by">{m.engine === 'claude' ? 'Claude' : 'без ИИ'}</span>}
    </div>
  )
}

/** Медиа: картинка, SVG, видео — как есть; инфографика и анимация — в песочнице без скриптов. */
export function MediaView({ m, big = false }: { m: PostMedia; big?: boolean }) {
  if (m.kind === 'video') return <video className="cp-ed__mv" src={m.url} muted playsInline controls={big} loop preload="metadata" aria-label={`Видео: ${m.name}`} />
  if (m.kind === 'html') return <iframe className="cp-ed__mv cp-ed__mv--html" sandbox="" srcDoc={htmlDoc(m.html ?? '')} title={m.name} loading="lazy" />
  return <img className="cp-ed__mv" src={m.url} alt={m.name} />
}

function MediaStrip({ media, onRemove, onMove }: { media: PostMedia[]; onRemove: (id: string) => void; onMove: (i: number, d: -1 | 1) => void }) {
  if (!media.length) return null
  return (
    <div className="cp-ed__media">
      <span className="nr-label">
        Медиа {media.length}/{MAX_MEDIA}
      </span>
      <ul className="cp-ed__strip" aria-label="Медиа">
        {media.map((m, i) => (
          <li key={m.id} className="cp-ed__tile" style={{ '--i': i } as CSSProperties}>
            <MediaView m={m} />
            <span className="cp-ed__tilename">{m.name}</span>
            <div className="cp-ed__tileacts">
              {i > 0 && <IconButton icon="chev-left" size="sm" label={`Раньше: ${m.name}`} onClick={() => onMove(i, -1)} />}
              <IconButton icon="close" size="sm" label={`Убрать: ${m.name}`} onClick={() => onRemove(m.id)} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** «Как выйдет»: текст поста с разметкой и медиа — сеткой (одно — во всю ширину). */
function Preview({ body, media, channel }: { body: string; media: PostMedia[]; channel?: string }) {
  return (
    <article className="cp-ed__preview" aria-label="Как выйдет">
      {channel && <div className="cp-ed__pvhead">{channel}</div>}
      {media.length > 0 && (
        <div className={`cp-ed__pvmedia cp-ed__pvmedia--${Math.min(media.length, 4)}`}>
          {media.slice(0, 4).map((m) => (
            <MediaView key={m.id} m={m} big />
          ))}
          {media.length > 4 && <span className="cp-ed__pvmore">+{media.length - 4}</span>}
        </div>
      )}
      {body.trim() ? <div className="cp-md" dangerouslySetInnerHTML={{ __html: mdToHtml(body) }} /> : <p className="cp-hint">Текста пока нет.</p>}
    </article>
  )
}
