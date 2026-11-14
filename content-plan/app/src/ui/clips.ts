// Демо-видео для ленты: короткие абстрактные клипы по 8 секунд (сделаны ffmpeg: переливы цвета, фрактал, «жизнь»),
// вертикальные — для коротких видео, горизонтальные — для длинных. Каждый — в WebM и MP4 (MP4 — для Safari).
// Настоящие видео — те, что прикрепили к заметке карточки, и посты соцсетей, когда подключим сервер.
import h1m from '../assets/clips/h1.mp4'
import h1w from '../assets/clips/h1.webm'
import h2m from '../assets/clips/h2.mp4'
import h2w from '../assets/clips/h2.webm'
import h3m from '../assets/clips/h3.mp4'
import h3w from '../assets/clips/h3.webm'
import v1m from '../assets/clips/v1.mp4'
import v1w from '../assets/clips/v1.webm'
import v2m from '../assets/clips/v2.mp4'
import v2w from '../assets/clips/v2.webm'
import v3m from '../assets/clips/v3.mp4'
import v3w from '../assets/clips/v3.webm'
import v4m from '../assets/clips/v4.mp4'
import v4w from '../assets/clips/v4.webm'

export interface Source {
  src: string
  type: string
}
const pair = (webm: string, mp4: string): Source[] => [
  { src: webm, type: 'video/webm' },
  { src: mp4, type: 'video/mp4' },
]
const TALL = [pair(v1w, v1m), pair(v2w, v2m), pair(v3w, v3m), pair(v4w, v4m)]
const WIDE = [pair(h1w, h1m), pair(h2w, h2m), pair(h3w, h3m)]

/** Демо-клип для материала: вертикальный или горизонтальный, один и тот же у одного материала. */
export const demoClip = (wide: boolean, seed: number): Source[] => (wide ? WIDE : TALL)[Math.abs(seed) % (wide ? WIDE : TALL).length]
