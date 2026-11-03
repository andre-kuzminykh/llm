// Картинки к заметке: файл → data: URL, сжатый до 1600 px по большей стороне (JPEG), чтобы план в браузере не разбухал.
// Где сжать нечем (нет canvas), остаётся как есть.

const MAX_SIDE = 1600

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    setTimeout(() => reject(new Error('долго')), 3000) // не загрузилась — берём как есть
    img.src = src
  })
}

/** Есть чем сжать: canvas с 2d (в тестовом jsdom его нет). */
const canShrink = () => typeof navigator !== 'undefined' && !/jsdom/i.test(navigator.userAgent)

export async function readImage(file: File): Promise<string> {
  const raw = await readAsDataUrl(file)
  if (file.type === 'image/gif' || file.type === 'image/svg+xml' || !canShrink()) return raw // анимация и вектор — как есть
  try {
    const img = await load(raw)
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    if (!img.naturalWidth) return raw
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * k)
    canvas.height = Math.round(img.naturalHeight * k)
    const g = canvas.getContext('2d')
    if (!g) return raw
    g.drawImage(img, 0, 0, canvas.width, canvas.height)
    const out = canvas.toDataURL(file.type === 'image/png' && k === 1 ? 'image/png' : 'image/jpeg', 0.85)
    return out.length < raw.length || k < 1 ? out : raw
  } catch {
    return raw
  }
}

/** Картинки из буфера или перетаскивания. */
export const imageFiles = (list: FileList | null | undefined) => [...(list ?? [])].filter((f) => f.type.startsWith('image/'))

/** Что можно прикрепить к заметке: картинки и тексты. */
export const ACCEPT = 'image/*,.txt,.md,.markdown,.csv,.json,.rtf,.pdf,.doc,.docx,.odt,text/*'
const TEXT_EXT = /\.(txt|md|markdown|csv|json|rtf|pdf|docx?|odt)$/i
export const okFile = (f: File) => f.type.startsWith('image/') || f.type.startsWith('text/') || TEXT_EXT.test(f.name)
/** Файлы из выбора, буфера или перетаскивания — только картинки и тексты. */
export const noteFiles = (list: FileList | null | undefined) => [...(list ?? [])].filter(okFile)

/** Файл заметки: картинка — сжатая, текст — как есть. */
export async function readFile(file: File): Promise<{ name: string; type: string; size: number; url: string }> {
  const url = file.type.startsWith('image/') ? await readImage(file) : await readAsDataUrl(file)
  return { name: file.name, type: file.type || 'application/octet-stream', size: file.size, url }
}
