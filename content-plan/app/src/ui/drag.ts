// Перенос карточек указателем — как в календаре nr_management: карточку берут и ведут, она едет за курсором,
// под ним подсвечивается день, куда она встанет; отпустили — переносится, Esc — отмена. Мышью перенос
// начинается, когда карточку сдвинули на несколько пикселей (иначе это щелчок), пальцем — после короткого
// удержания (иначе это прокрутка). У края ленты она прокручивается сама. Щелчок, который браузер шлёт
// после переноса, карточку не открывает. Так работают дорожки недели, лента и панель дня;
// на шкале времени — свои жесты (WeekView): там карточку ещё и растягивают.
import type { PointerEvent as ReactPointerEvent } from 'react'
import { minutesToClock, snapMin } from '../model/calendar'
import type { HintLine } from '../model/hint'
import type { ISODate } from '../model/types'

export const SLOP = 4 // px: меньше — щелчок, а не перенос
export const HOLD_MS = 350 // пальцем: столько держать, чтобы взять карточку
const EDGE = 48 // px у края ленты, где она прокручивается сама
const SPEED = 16 // px за кадр у самого края

/** Щелчок сразу после переноса — часть жеста, а не щелчок: его глотаем. */
export function swallowClick() {
  const stop = (e: Event) => {
    e.stopPropagation()
    e.preventDefault()
  }
  window.addEventListener('click', stop, true)
  setTimeout(() => window.removeEventListener('click', stop, true), 0)
}

/** Скорость автопрокрутки: у края — быстрее, дальше EDGE — ноль. */
export function edgeSpeed(pos: number, from: number, to: number): number {
  if (pos < from + EDGE) return -Math.ceil(((from + EDGE - pos) / EDGE) * SPEED)
  if (pos > to - EDGE) return Math.ceil(((pos - (to - EDGE)) / EDGE) * SPEED)
  return 0
}

/** Прокрутить ленту у края; true — если сдвинулась. */
export function autoScroll(el: HTMLElement, x: number, y: number): boolean {
  const r = el.getBoundingClientRect()
  const dx = edgeSpeed(x, r.left, r.right)
  const dy = edgeSpeed(y, r.top, r.bottom)
  if (!dx && !dy) return false
  const { scrollLeft, scrollTop } = el
  el.scrollLeft += dx
  el.scrollTop += dy
  return el.scrollLeft !== scrollLeft || el.scrollTop !== scrollTop
}

export interface Drop {
  date: ISODate
  time?: string
}

/** Куда опустили: [data-drop] — дата дня; если у цели есть data-hour (px на час) — и время по верхнему краю карточки. */
export function dropAt(target: HTMLElement, cardTop: number): Drop {
  const date = target.dataset.drop as ISODate
  const hour = Number(target.dataset.hour)
  if (!hour) return { date }
  const min = ((cardTop - target.getBoundingClientRect().top) / hour) * 60
  return { date, time: minutesToClock(snapMin(min)) }
}

/** Подсказка у указателя, пока карточку ведут: первая строка — куда, дальше — что едет вместе и что отметит проверка. */
export function hintBox() {
  const box = document.createElement('div')
  box.className = 'cp-drag-hint'
  box.setAttribute('aria-live', 'polite')
  box.hidden = true
  document.body.append(box)
  let shown = ''
  return {
    show(lines: HintLine[]) {
      const key = lines.map((l) => `${l.warn ? '!' : ''}${l.text}`).join('\n')
      if (key === shown) return
      shown = key
      box.replaceChildren(
        ...lines.map((l, i) => {
          const row = document.createElement('div')
          row.className = `cp-drag-hint__line${i === 0 ? ' cp-drag-hint__line--where' : ''}${l.warn ? ' cp-drag-hint__line--warn' : ''}`
          row.textContent = l.text
          return row
        }),
      )
      box.hidden = !lines.length
    },
    hide() {
      box.hidden = true
      shown = ''
    },
    /** Рядом с указателем, не вылезая за экран. */
    place(x: number, y: number) {
      if (box.hidden) return
      const w = box.offsetWidth
      const h = box.offsetHeight
      const left = x + 18 + w > innerWidth - 8 ? x - 18 - w : x + 18
      const top = y + 20 + h > innerHeight - 8 ? y - 20 - h : y + 20
      box.style.left = `${Math.max(8, left)}px`
      box.style.top = `${Math.max(8, top)}px`
    },
    remove: () => box.remove(),
  }
}

export interface GrabOpts {
  /** Что будет, если отпустить здесь: строки подсказки (первая — куда). */
  hint?: (d: Drop) => HintLine[]
  /** Пальцем подержали и отпустили, не сдвинув, — выбрать карточку. */
  onSelect?: () => void
}

/** Взять карточку: вызывается из onPointerDown. Куда отпустили — уходит в onDrop. */
export function grabCard(e: ReactPointerEvent<HTMLElement>, onDrop: (d: Drop) => void, opts: GrabOpts = {}) {
  if (e.button !== 0 || e.isPrimary === false) return
  if ((e.target as HTMLElement).closest('.cp-task-btn, .cp-more')) return // у ▶ — своя работа
  e.stopPropagation() // лист под карточкой не тянется
  const el = e.currentTarget
  const id = e.pointerId
  const touch = e.pointerType === 'touch'
  const x0 = e.clientX
  const y0 = e.clientY
  const grabY = y0 - el.getBoundingClientRect().top
  let x = x0
  let y = y0
  let ghost: HTMLElement | null = null
  let over: HTMLElement | null = null
  let cancelled = false
  let raf = 0
  let far = 0 // как далеко увели от места, где взяли
  let tip: ReturnType<typeof hintBox> | null = null
  const hold = touch ? window.setTimeout(() => begin(), HOLD_MS) : 0

  const targetAt = () => (document.elementFromPoint?.(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-drop]') ?? null
  const scroller = () =>
    (document.elementFromPoint?.(x, y) as HTMLElement | null)?.closest<HTMLElement>('.cp-body') ?? el.closest<HTMLElement>('.cp-body')

  function begin() {
    const r = el.getBoundingClientRect()
    ghost = el.cloneNode(true) as HTMLElement
    ghost.classList.add('cp-ghost')
    ghost.removeAttribute('data-unit')
    Object.assign(ghost.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', transform: '' })
    document.body.append(ghost)
    document.body.classList.add('cp-grabbing')
    el.classList.add('cp-card--dragging')
    if (touch) navigator.vibrate?.(8)
    if (opts.hint) tip = hintBox()
    follow()
    raf = requestAnimationFrame(tick)
  }

  function follow() {
    if (!ghost) return
    ghost.style.transform = `translate(${x - x0}px, ${y - y0}px)`
    const t = targetAt()
    if (t !== over) over?.classList.remove('cp-drop-over')
    t?.classList.add('cp-drop-over')
    over = t
    if (tip && opts.hint) {
      if (t) tip.show(opts.hint(dropAt(t, y - grabY)))
      else tip.hide()
      tip.place(x, y)
    }
  }

  function tick() {
    const s = scroller()
    if (s && autoScroll(s, x, y)) follow()
    raf = requestAnimationFrame(tick)
  }

  function move(ev: PointerEvent) {
    if (ev.pointerId !== id || cancelled) return
    x = ev.clientX
    y = ev.clientY
    far = Math.max(far, Math.hypot(x - x0, y - y0))
    if (ghost) return follow()
    if (far <= SLOP * (touch ? 2 : 1)) return
    if (touch) return finish() // палец поехал раньше, чем взял карточку, — это прокрутка
    begin()
  }

  function up(ev: PointerEvent) {
    if (ev.pointerId !== id) return
    x = ev.clientX
    y = ev.clientY
    const started = !!ghost || cancelled
    const t = ghost ? targetAt() : null
    // пальцем подержали и отпустили на месте — это выбор карточки, а не перенос
    const select = touch && !!ghost && !cancelled && far <= SLOP * 2
    finish()
    if (!started) return
    swallowClick()
    if (select) return opts.onSelect?.()
    if (t) onDrop(dropAt(t, y - grabY))
  }

  function key(ev: KeyboardEvent) {
    if (ev.key !== 'Escape' || !ghost) return
    ev.stopPropagation()
    cancelled = true // отпустят потом — щелчок всё равно проглотить
    clear()
  }

  function clear() {
    clearTimeout(hold)
    cancelAnimationFrame(raf)
    ghost?.remove()
    ghost = null
    tip?.remove()
    tip = null
    over?.classList.remove('cp-drop-over')
    over = null
    el.classList.remove('cp-card--dragging')
    document.body.classList.remove('cp-grabbing')
  }

  function finish() {
    clear()
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', key, true)
    window.removeEventListener('touchmove', block)
    window.removeEventListener('contextmenu', block)
  }

  function cancel(ev: PointerEvent) {
    if (ev.pointerId === id) finish()
  }

  // пока карточку держат пальцем, страница не прокручивается и не показывает меню
  function block(ev: Event) {
    if (ghost) ev.preventDefault()
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', key, true)
  if (touch) {
    window.addEventListener('touchmove', block, { passive: false })
    window.addEventListener('contextmenu', block)
  }
}
