// Иконки в манере Neuronium: сетка 24px, линия 1.75, скруглённые концы, цвет — currentColor.
// Иконка — украшение (aria-hidden); подпись несёт кнопка.
import type { ReactElement } from 'react'

const P: Record<string, ReactElement> = {
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ),
  week: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9.2 4.5v15M14.8 4.5v15" />
    </>
  ),
  list: <path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  bank: (
    <>
      <path d="M4 13.5l2.2-7.1A2 2 0 0 1 8.1 5h7.8a2 2 0 0 1 1.9 1.4l2.2 7.1V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z" />
      <path d="M4 13.5h4.5l1 2h5l1-2H20" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.2l8.6 15a1 1 0 0 1-.9 1.5H4.3a1 1 0 0 1-.9-1.5z" />
      <path d="M12 10v4.2M12 17.2h.01" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  'chev-left': <path d="M14.5 6l-6 6 6 6" />,
  'chev-right': <path d="M9.5 6l6 6-6 6" />,
  undo: <path d="M9 7.5L4.5 12 9 16.5M5 12h9.5a5 5 0 0 1 0 10H13" />,
  redo: <path d="M15 7.5l4.5 4.5-4.5 4.5M19 12H9.5a5 5 0 0 0 0 10H11" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  trash: <path d="M5 7h14M10 7V4.8h4V7M7 7l.8 12.2A1.5 1.5 0 0 0 9.3 20.6h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7M10.5 11v6M13.5 11v6" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  download: <path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" />,
  upload: <path d="M12 16V5M7 9.5l5-5 5 5M5 19.5h14" />,
  reset: <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="3.75" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
    </>
  ),
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  more: <path d="M5.5 12h.01M12 12h.01M18.5 12h.01" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  spark: <path d="M12 3.5l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z" />,
  // статусы материала: заливка, чтобы читались в 12 px
  play: <path d="M8.5 6.3v11.4a1 1 0 0 0 1.5.86l9.3-5.7a1 1 0 0 0 0-1.72L10 5.44a1 1 0 0 0-1.5.86z" fill="currentColor" />,
  pause: <path d="M8.5 6.5v11M15.5 6.5v11" strokeWidth={3.5} />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth={2.5} />,
  published: (
    <>
      <circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" />
      <path d="M7.8 12.3l2.9 2.9 5.5-5.6" strokeWidth={2.25} style={{ stroke: 'var(--nr-surface, #fff)' }} />
    </>
  ),
  now: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10.2 8.9v6.2l5-3.1z" fill="currentColor" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" />
    </>
  ),
  // отделы Neuronium на левой панели — те же знаки, что в nr
  briefcase: (
    <>
      <rect x="3.5" y="7" width="17" height="12.5" rx="2" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 19.5c.8-3.2 3.1-5 6-5s5.2 1.8 6 5M16 4.9a3.2 3.2 0 0 1 0 6.2M18 14.8c1.6.6 2.6 2.1 3 4.7" />
    </>
  ),
  megaphone: <path d="M4 10v4a1 1 0 0 0 1 1h2.5l7.5 4.5v-15L7.5 9H5a1 1 0 0 0-1 1zM18.5 9.5a3.5 3.5 0 0 1 0 5" />,
  hash: <path d="M10 4L8 20M16 4l-2 16M4.5 9H20M4 15h15.5" />,
  trending: <path d="M4 16.5l5.5-5.5 3.5 3.5 7-7M15 7.5h5v5" />,
  lifebuoy: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M6 6l3.5 3.5M14.5 14.5L18 18M18 6l-3.5 3.5M9.5 14.5L6 18" />
    </>
  ),
  chart: <path d="M4.5 19.5h15M7.5 16v-4M12 16V8M16.5 16v-6" />,
  palette: <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7h2a4.1 4.1 0 0 0 4.1-4.1C20.5 6.9 16.7 3.5 12 3.5zM7.5 12h.01M9.5 7.8h.01M14.5 7.8h.01" />,
  code: <path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5l-3 14" />,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L4 16.7 7.3 20l5.3-5.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.3-.3-.3-2.3z" />,
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7.5" height="9" rx="2" />
      <rect x="13" y="3.5" width="7.5" height="5.5" rx="2" />
      <rect x="13" y="11" width="7.5" height="9.5" rx="2" />
      <rect x="3.5" y="14.5" width="7.5" height="6" rx="2" />
    </>
  ),
  bolt: <path d="M13 3.5L5.5 13.5H12l-1 7 7.5-10H12z" />,
  pencil: <path d="M4.5 19.5l1-4L15.5 5.5a2.1 2.1 0 0 1 3 3l-10 10zM13.5 7.5l3 3" />,
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7M12 16.8h.01" />
    </>
  ),
  flag: <path d="M6 20.5v-16M6 4.5h10.5l-2 4 2 4H6" />,
  swap: <path d="M7 4.5L3.5 8 7 11.5M3.5 8h13M17 12.5l3.5 3.5-3.5 3.5M20.5 16h-13" />,
  // повтор: стрелки по кругу
  repeat: <path d="M17 3l3 3-3 3M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M7 21l-3-3 3-3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4" />,
  // форматы: горизонталь, вертикаль, веб, пост
  'f-horizontal': (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M10.5 9.6v4.8l4-2.4z" fill="currentColor" />
    </>
  ),
  'f-vertical': (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M10.8 9.6v4.8l3.6-2.4z" fill="currentColor" />
    </>
  ),
  'f-web': (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M3 8.5h18M6 6.5h.01M8.5 6.5h.01M7 12h10M7 15.5h6" />
    </>
  ),
  'f-post': (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
      <path d="M4 13.5l4-3.5 4 3.5 2.5-2 5.5 4.5M8 17.5h6" />
      <circle cx="15.5" cy="7.5" r="1.25" />
    </>
  ),
  // площадки: простые знаки, не логотипы
  'p-Web': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.6 3.5 5.4 3.5 8.5s-1.1 5.9-3.5 8.5c-2.4-2.6-3.5-5.4-3.5-8.5s1.1-5.9 3.5-8.5z" />
    </>
  ),
  'p-YouTube': (
    <>
      <rect x="2.75" y="5.5" width="18.5" height="13" rx="4" />
      <path d="M10.2 9.3v5.4l4.6-2.7z" fill="currentColor" />
    </>
  ),
  'p-Instagram': (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.8" />
      <path d="M17 7h.01" />
    </>
  ),
  'p-TikTok': <path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5M14 4c.4 2.6 2.2 4.2 5 4.4" />,
  'p-Threads': (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M15.2 12v1.4a2.3 2.3 0 0 0 4.6 0V12a7.8 7.8 0 1 0-3.1 6.2" />
    </>
  ),
  'p-X': <path d="M5 4.5h3.6l10.4 15h-3.6zM18.6 4.5l-5.7 6.5M5.4 19.5l5.7-6.5" />,
  'p-Telegram': <path d="M20.5 4.5L3.5 11.3l6 2.2 2.2 6.1 3.3-4.7 4.4 3.5zM9.5 13.5l11-9" />,
  'p-LinkedIn': (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8 10.5v6M8 7.6h.01M11.5 16.5v-6M11.5 13.2c0-1.7 1-2.7 2.4-2.7s2.1 1 2.1 2.7v3.3" />
    </>
  ),
  'p-Mail': (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4 7.5l8 5.8 8-5.8" />
    </>
  ),
  today: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <circle cx="12" cy="14.5" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="M15.5 15.5l4.5 4.5" />
    </>
  ),
  // виды календаря: каналы — вещание, площадки — приложения
  channels: (
    <>
      <circle cx="12" cy="12" r="1.8" />
      <path d="M8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.4 18.6a9.3 9.3 0 0 1 0-13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2" />
    </>
  ),
  platforms: (
    <>
      <path d="M12 3.8l8.5 4.4L12 12.6 3.5 8.2z" />
      <path d="M3.5 12.2l8.5 4.4 8.5-4.4M3.5 16.2l8.5 4.4 8.5-4.4" />
    </>
  ),
  draft: (
    <>
      <path d="M7 3.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" />
      <path d="M13.5 3.5V8.5h5M9 13h6M9 16.5h4" />
    </>
  ),
}

export function Icon({ name, size = 20 }: { name: keyof typeof P | string; size?: number }) {
  return (
    <svg
      className="nr-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {P[name] ?? null}
    </svg>
  )
}
