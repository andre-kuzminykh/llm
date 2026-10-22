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
  today: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <circle cx="12" cy="14.5" r="1.6" fill="currentColor" stroke="none" />
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
