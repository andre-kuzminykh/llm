// Черновик материала — из темы, заметки и файлов: сценарий видео, текст поста или статьи. Пока заглушка: настоящий черновик
// будут выдавать другие приложения (подключим позже); здесь — каркас по формату, чтобы было видно, что и где появится.
// «Перегенерировать» — следующая версия.
import { FULL_VIDEO, MAIL, SHORT_VIDEO, TEXT_IMAGE, WEB_PAGE, type Draft } from './types'

const FRAME: Record<string, string[]> = {
  [SHORT_VIDEO]: ['Хук — первые 3 секунды', 'Суть — одна мысль, 20–40 секунд', 'Пример или кадр из заметки', 'Призыв — последние 5 секунд'],
  [FULL_VIDEO]: ['Вступление: о чём и зачем смотреть', 'Часть 1', 'Часть 2', 'Часть 3', 'Итог и призыв'],
  [WEB_PAGE]: ['Заголовок', 'Лид — 2–3 предложения', 'Разделы с подзаголовками', 'Вывод'],
  [TEXT_IMAGE]: ['Первая строка — зацепка', 'Текст поста', 'Картинка — из файлов заметки', 'Призыв'],
  [MAIL]: ['Тема письма', 'Первая фраза', 'Главное', 'Ссылка и призыв'],
}
const KIND: Record<string, string> = { [SHORT_VIDEO]: 'Сценарий короткого видео', [FULL_VIDEO]: 'Сценарий длинного видео', [WEB_PAGE]: 'Статья', [TEXT_IMAGE]: 'Пост', [MAIL]: 'Письмо' }

/** Заглушка черновика: каркас формата с темой, рубрикой и заметкой; версия — какая по счёту. */
export function stubDraft(src: { title: string; note?: string; format: string; files?: number; rubric?: string }, version = 1, at = new Date().toISOString()): Draft {
  const note = (src.note ?? '').trim()
  const lines = [
    `${KIND[src.format] ?? 'Черновик'}${src.rubric ? ` · ${src.rubric}` : ''}`,
    `Тема: ${src.title}`,
    '',
    ...(FRAME[src.format] ?? FRAME[TEXT_IMAGE]).map((x, i) => `${i + 1}. ${x} — …`),
    ...(note ? ['', `Опора из заметки: ${note.length > 280 ? `${note.slice(0, 280)}…` : note}`] : []),
    ...(src.files ? [`Файлы заметки: ${src.files}`] : []),
  ]
  return { text: lines.join('\n'), version, at, stub: true }
}
