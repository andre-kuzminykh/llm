// Разделы NR SMM, кроме ленты, контент-плана и аналитики: «Текст» (посты и статьи — список и редактор), «Картинки»
// (медиа всех постов: фото, инфографика, анимации), «Видео» (студия NR SMM — подключим), «Озвучка», «Автопостинг»,
// «Комменты» — скоро: что там будет.
import { useMemo } from 'react'
import { addDays, dayTitle, today } from '../model/dates'
import { charCount, signs, type PostMedia } from '../model/post'
import { newId } from '../model/store'
import { filesOf, FORMAT_ICON, FULL_VIDEO, isImage, isSlot, MAIL, SHORT_VIDEO, shownTitle, TEXT_IMAGE, timeOf, WEB_PAGE, type Item } from '../model/types'
import { unitsOf, type Unit } from '../model/units'
import { usePlan } from '../ui/ctx'
import { Icon } from '../ui/Icon'
import { MediaView, PostEditor } from './PostEditor'

const TEXT_FORMATS = new Set([TEXT_IMAGE, WEB_PAGE, MAIL])
const VIDEO_FORMATS = new Set([SHORT_VIDEO, FULL_VIDEO])
const short = (d: string) => dayTitle(d).replace(/ \d{4}$/, '')

/** Карточки плана на ближайшие недели и с постом — для «Текста» и «Видео». */
function useCards(days = 28) {
  const { plan, byDate, rules } = usePlan()
  const order = useMemo(() => plan.channels.map((c) => c.id), [plan.channels])
  return useMemo(() => {
    const t = today()
    const out: Unit[] = []
    for (let d = addDays(t, -7); d <= addDays(t, days); d = addDays(d, 1)) out.push(...unitsOf(byDate.get(d) ?? [], rules, order))
    return out
  }, [byDate, rules, order, days])
}

function Row({ u, onOpen, note }: { u: Unit | { head: Item; items: Item[]; date: string | null; time: string }; onOpen: () => void; note: string }) {
  const { channels } = usePlan()
  const ch = channels.get(u.head.channelId)
  const formats = [...new Set(u.items.map((i) => i.format))].filter((f) => FORMAT_ICON[f])
  return (
    <li>
      <button type="button" className="cp-sec__row" onClick={onOpen}>
        <span className="cp-sec__dot" style={{ background: ch?.color ?? 'var(--nr-fill-1)' }} aria-hidden="true" />
        <span className="cp-sec__main">
          <b>{isSlot(u.head) ? 'Нужна тема' : shownTitle(u.head)}</b>
          <span className="cp-muted">{[ch?.name, u.date ? `${short(u.date)}, ${u.time}` : 'черновик'].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="cp-sec__fmts" aria-hidden="true">
          {formats.map((f) => (
            <Icon key={f} name={FORMAT_ICON[f].icon} size={15} />
          ))}
        </span>
        <span className="cp-sec__note">{note}</span>
      </button>
    </li>
  )
}

/** «Текст»: открыт пост — редактор; иначе — список: что уже пишется и что ждёт текста; «Новый текст». */
export function TextView() {
  const { plan, textId, openPost, closePost, dispatch, rules } = usePlan()
  const cards = useCards()
  if (textId) return <PostEditor key={textId} id={textId} onClose={closePost} />
  const written = plan.items
    .filter((it) => it.post && (it.post.body.trim() || it.post.media.length))
    .sort((a, b) => (b.post!.at || '').localeCompare(a.post!.at || ''))
  const seen = new Set<string>()
  const writtenRows = written.filter((it) => {
    const key = `${it.date}|${it.post!.body.slice(0, 80)}|${it.channelId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const t = today()
  const waiting = cards.filter((u) => u.date && u.date >= t && u.items.some((i) => TEXT_FORMATS.has(i.format)) && !u.head.post?.body.trim()).slice(0, 30)
  const create = () => {
    const id = newId()
    dispatch({ type: 'create', item: { id, date: null, title: 'Новый текст', format: TEXT_IMAGE, channelId: '', ruleId: '', rubricId: null, platforms: [], status: 'planned', source: 'черновик', rank: 50 } })
    openPost(id)
  }
  return (
    <div className="cp-sec nr-scroll">
      <header className="cp-sec__head">
        <h1 className="nr-title">Текст</h1>
        <button type="button" className="nr-btn nr-btn--primary" onClick={create}>
          <Icon name="plus" size={16} /> Новый текст
        </button>
      </header>
      <p className="cp-hint cp-sec__lead">Посты, подписи и статьи — с ассистентом: «Пишет» — текст, который вставляете; «Правит» — меняет ваш текст по месту. Картинку, инфографику или анимацию — «Сгенерировать». Пост из карточки плана — кнопкой «Пост» в карточке.</p>
      <section className="cp-sec__block" aria-label="Пишется">
        <h2 className="cp-sec__h">Пишется</h2>
        {writtenRows.length ? (
          <ul className="cp-sec__list">
            {writtenRows.map((it) => (
              <Row key={it.id} u={{ head: it, items: [it], date: it.date, time: timeOf(it, rules.get(it.ruleId)) }} onOpen={() => openPost(it.id)} note={`${signs(charCount(it.post!.body))}${it.post!.media.length ? ` · медиа ${it.post!.media.length}` : ''}`} />
            ))}
          </ul>
        ) : (
          <p className="cp-hint">Пока ничего — откройте карточку плана и нажмите «Пост» или начните «Новый текст».</p>
        )}
      </section>
      {waiting.length > 0 && (
        <section className="cp-sec__block" aria-label="Ждут текста">
          <h2 className="cp-sec__h">Ждут текста — ближайшие четыре недели</h2>
          <ul className="cp-sec__list">
            {waiting.map((u) => (
              <Row key={u.key} u={u} onOpen={() => openPost(u.head.id)} note="написать" />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** «Картинки»: всё, что в постах, — фото, видео, сгенерированные картинки, инфографика и анимации; щелчок — к посту. */
export function ImagesView() {
  const { plan, openPost } = usePlan()
  const all: { m: PostMedia; item: Item }[] = []
  const seen = new Set<string>()
  for (const it of plan.items) {
    for (const m of it.post?.media ?? []) if (!seen.has(m.id)) (seen.add(m.id), all.push({ m, item: it }))
    for (const f of filesOf(it).filter(isImage)) {
      const id = `${it.id}|${f.name}`
      if (!seen.has(id)) (seen.add(id), all.push({ m: { id, kind: 'image', name: f.name, url: f.url }, item: it }))
    }
  }
  return (
    <div className="cp-sec nr-scroll">
      <header className="cp-sec__head">
        <h1 className="nr-title">Картинки</h1>
      </header>
      <p className="cp-hint cp-sec__lead">Фото, видео, сгенерированные картинки, инфографика и анимации из постов и заметок. Новые — в редакторе текста: «Сгенерировать» → картинку, инфографику или анимацию. Отдельная студия картинок — скоро.</p>
      {all.length ? (
        <ul className="cp-gallery" aria-label="Картинки">
          {all.map(({ m, item }) => (
            <li key={m.id} className="cp-gallery__tile">
              <MediaView m={m} />
              <button type="button" className="cp-gallery__open" onClick={() => openPost(item.id)} title="Открыть пост">
                <span>{m.name}</span>
                <small className="cp-muted">{isSlot(item) ? 'Нужна тема' : shownTitle(item)}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="cp-reels__empty">
          <Icon name="image" size={28} />
          <h2>Картинок пока нет</h2>
          <p>Откройте пост в «Тексте» и сгенерируйте картинку, инфографику или анимацию — или прикрепите фото.</p>
        </div>
      )}
    </div>
  )
}

/** «Видео»: студия NR SMM подключится сюда; пока — что она умеет и какие видео ждут в плане. */
export function VideoView() {
  const { openItem } = usePlan()
  const cards = useCards()
  const t = today()
  const videos = cards.filter((u) => u.date && u.date >= t && u.items.some((i) => VIDEO_FORMATS.has(i.format))).slice(0, 30)
  return (
    <div className="cp-sec nr-scroll">
      <header className="cp-sec__head">
        <h1 className="nr-title">Видео</h1>
        <span className="cp-soon">скоро</span>
      </header>
      <div className="cp-soonbox">
        <h2>Студия NR SMM</h2>
        <p>Короткие и длинные ролики — в студии NR SMM, она станет частью Neuronium. Карточка плана откроет её сразу:</p>
        <ul>
          <li>монтаж по дорожкам — видео, звук, HTML, текст;</li>
          <li>анимация Neuronium поверх ролика и приложение в конце;</li>
          <li>обложки с вашим лицом и стилем — ИИ;</li>
          <li>надписи, кейс и MP4 со звуком.</li>
        </ul>
        <p className="cp-muted">Пока готовое видео можно прикрепить к заметке карточки — оно играет в ленте.</p>
      </div>
      {videos.length > 0 && (
        <section className="cp-sec__block" aria-label="Видео в плане">
          <h2 className="cp-sec__h">Видео в плане — ближайшие четыре недели</h2>
          <ul className="cp-sec__list">
            {videos.map((u) => (
              <Row key={u.key} u={u} onOpen={() => openItem(u.head.id)} note={u.items.some((i) => filesOf(i).some((f) => f.type.startsWith('video/'))) ? 'видео прикреплено' : 'в студии — скоро'} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

const SOON: Record<string, { title: string; lead: string; points: string[] }> = {
  voice: {
    title: 'Озвучка',
    lead: 'Озвучка текста и роликов вашим голосом или голосом аватара.',
    points: ['голос — ваш (по образцу) или из библиотеки', 'тон оф войс — по вашим постам: как вы пишете и говорите', 'аватар — ваш портрет в «Настройки → Мой аватар»', 'озвучка поста, сценария ролика или подписи — одной кнопкой'],
  },
  autopost: {
    title: 'Автопостинг',
    lead: 'Карточка «Готово» выходит сама — в своё время, в подключённые соцсети.',
    points: ['очередь по контент-плану: что, куда и когда', 'для каждой площадки — свой текст и формат из карточки', 'повтор при сбое и отчёт: вышло, где и во сколько', 'ручная публикация — одной кнопкой'],
  },
  comments: {
    title: 'Комменты',
    lead: 'Все комментарии из ваших соцсетей — в одном окне.',
    points: ['новые и без ответа — сверху', 'ответ с ассистентом в вашем тоне', 'шаблоны частых ответов', 'вопросы из комментов — в идеи контент-плана'],
  },
}

/** Раздел, которого ещё нет: что там будет. */
export function SoonView({ id }: { id: 'voice' | 'autopost' | 'comments' }) {
  const s = SOON[id]
  return (
    <div className="cp-sec nr-scroll">
      <header className="cp-sec__head">
        <h1 className="nr-title">{s.title}</h1>
        <span className="cp-soon">скоро</span>
      </header>
      <div className="cp-soonbox">
        <p>{s.lead}</p>
        <ul>
          {s.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
