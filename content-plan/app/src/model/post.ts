// Пост — текст и медиа карточки: пишется в редакторе «Текст» (Markdown: заголовки, жирный, курсив, списки, цитаты,
// ссылки), рядом — ассистент: «Пишет» (текст, который можно вставить) и «Правит» (правки по месту — меняет кусок
// текста, а не пишет заново). Длина — по выбору: подпись до 1000 знаков, пост до 2000 / 4000 / 8000, блог до 16000.
// Медиа — до 10: картинки, видео, анимации (GIF), сгенерированные картинки (SVG), инфографика и анимация (HTML без
// скриптов — показывается в песочнице). Текст человека и ответ модели — данные: в разметку попадают только экранированными.

export const MAX_MEDIA = 10

export const POST_LIMITS: { limit: number; label: string; note: string }[] = [
  { limit: 1000, label: 'Подпись', note: 'к фото, карусели или видео' },
  { limit: 2000, label: 'Пост', note: 'короткий' },
  { limit: 4000, label: 'Пост', note: 'обычный' },
  { limit: 8000, label: 'Пост', note: 'длинный' },
  { limit: 16000, label: 'Блог', note: 'статья на сайте' },
]

export type MediaKind = 'image' | 'video' | 'svg' | 'html'
export interface PostMedia {
  id: string
  kind: MediaKind
  name: string
  url?: string // картинка, видео, SVG — data:-адресом
  html?: string // инфографика и анимация — HTML и CSS без скриптов
  type?: string // MIME у файла
  made?: 'claude' | 'local' // сгенерировано: ИИ или локальным шаблоном
}
export interface Post {
  body: string // Markdown
  media: PostMedia[]
  limit: number
  at: string // когда правили, ISO
}

export const emptyPost = (limit = 2000): Post => ({ body: '', media: [], limit, at: '' })

/** Текст без разметки: решётки заголовков, звёздочки, подчёркивания, маркеры цитат — то, что увидит читатель. */
export const plainText = (md: string) =>
  md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?!\w)/g, '$1$2')
    .replace(/(^|\W)_(?!\s)(.+?)_(?!\w)/g, '$1$2')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1 $2')

/** Сколько знаков видит читатель: по символам, эмодзи — одним. */
export const charCount = (md: string) => [...plainText(md)].length

/** «1 знак», «24 знака», «1 000 знаков» — по-русски. */
export function signs(n: number): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  const w = a > 10 && a < 20 ? 'знаков' : b === 1 ? 'знак' : b >= 2 && b <= 4 ? 'знака' : 'знаков'
  return `${n.toLocaleString('ru-RU')} ${w}`
}

/** Лимит по выбранной длине: подпись, пост, блог. */
export const limitOf = (limit: number) => POST_LIMITS.find((l) => l.limit === limit) ?? POST_LIMITS[1]

// ── правки по месту ─────────────────────────────────────────────────────────────────────────────────────

export interface Edit {
  find: string // точный кусок текста
  replace: string // чем заменить (пусто — удалить)
}
/** Правки по месту: каждый кусок ищется в тексте и меняется — только он; не нашёлся — правка пропущена (её покажут). */
export function applyEdits(body: string, edits: Edit[]): { body: string; applied: Edit[]; missed: Edit[] } {
  let out = body
  const applied: Edit[] = []
  const missed: Edit[] = []
  for (const e of edits) {
    if (!e || typeof e.find !== 'string' || typeof e.replace !== 'string') continue
    if (e.find === '') {
      // пустой «find» — дописать в конец
      out = out.replace(/\s*$/, '') + (out.trim() ? '\n\n' : '') + e.replace
      applied.push(e)
      continue
    }
    const i = out.indexOf(e.find)
    if (i < 0) {
      missed.push(e)
      continue
    }
    out = out.slice(0, i) + e.replace + out.slice(i + e.find.length)
    applied.push(e)
  }
  return { body: out, applied, missed }
}

// ── Markdown → HTML для «Как выйдет»: всё экранируется, ссылки — только http(s) ─────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const inline = (s: string) =>
  esc(s)
    .replace(/\[([^\]]+)\]\((https?:[^)\s"]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/(^|[\s(])#([\p{L}\p{N}_]+)/gu, '$1<span class="cp-md__tag">#$2</span>')

/** Markdown поста → безопасный HTML: заголовки, абзацы, списки, цитаты, жирный, курсив, ссылки, топики. */
export function mdToHtml(md: string): string {
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`)
    para = []
  }
  const close = () => {
    if (list) out.push(`</${list}>`)
    list = null
  }
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd()
    const h = line.match(/^(#{1,3})\s+(.+)/)
    const ul = line.match(/^\s*[-•*]\s+(.+)/)
    const ol = line.match(/^\s*\d+[.)]\s+(.+)/)
    const q = line.match(/^>\s?(.*)/)
    if (!line.trim()) {
      flush()
      close()
    } else if (h) {
      flush()
      close()
      out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`)
    } else if (ul || ol) {
      flush()
      const kind = ul ? 'ul' : 'ol'
      if (list !== kind) {
        close()
        out.push(`<${kind}>`)
        list = kind
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`)
    } else if (q) {
      flush()
      close()
      out.push(`<blockquote>${inline(q[1])}</blockquote>`)
    } else {
      close()
      para.push(line)
    }
  }
  flush()
  close()
  return out.join('')
}

// ── сгенерированное HTML и SVG — без скриптов и внешних адресов ─────────────────────────────────────────────

/** HTML инфографики или анимации: только разметка и CSS — скрипты, обработчики, внешние адреса и фреймы вырезаются. */
export function safeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*>/gi, '')
    .replace(/<\/?(iframe|object|embed|link|meta|base|form)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|xlink:href)\s*=\s*("|')\s*(javascript:|https?:|\/\/)[^"']*\2/gi, '$1=$2#$2')
    .replace(/url\(\s*(['"]?)\s*(https?:|\/\/)[^)]*\)/gi, 'none')
    .replace(/@import[^;]+;/gi, '')
}
/** Документ для песочницы: HTML ответа целиком или фрагмент — в простую страницу. */
export const htmlDoc = (html: string) =>
  /<html[\s>]/i.test(html) ? safeHtml(html) : `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;font-family:system-ui,sans-serif}</style></head><body>${safeHtml(html)}</body></html>`
/** SVG → data:-адрес картинки (без скриптов). */
export const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(safeHtml(svg))}`

/** Из ответа модели — HTML или SVG: из блока ```html / ```svg, иначе от первого тега до последнего. */
export function pickMarkup(text: string, kind: 'svg' | 'html'): string | null {
  const fence = text.match(/```(?:html|svg|xml)?\s*\n([\s\S]*?)```/i)
  const body = fence ? fence[1] : text
  if (kind === 'svg') {
    const m = body.match(/<svg[\s\S]*<\/svg>/i)
    return m ? m[0] : null
  }
  const m = body.match(/<(!doctype|html|div|section|style|svg|main|figure)[\s\S]*>/i)
  return m ? body.slice(body.indexOf(m[0])).trim() : null
}
