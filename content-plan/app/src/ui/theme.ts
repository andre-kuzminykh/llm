// Тема как в Neuronium: выбор человека (светлая / тёмная) или системная; хранится в localStorage,
// красится классом html.dark. Недоступное хранилище — выбор живёт до перезагрузки.
import { useEffect, useState } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'
const KEY = 'cp:theme'

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches

export function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark())
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#15151b' : '#f5f5f7')
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(getThemePref)
  useEffect(() => {
    applyTheme(pref)
    if (pref !== 'system' || typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme('system')
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [pref])
  const choose = (p: ThemePref) => {
    try {
      if (p === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, p)
    } catch {
      /* выбор останется до перезагрузки */
    }
    setPref(p)
  }
  return { pref, choose }
}

/** Совпадает ли медиазапрос — например, ширина телефона. В тестах (без matchMedia) — нет. */
export function useMedia(query: string) {
  const get = () => typeof matchMedia === 'function' && matchMedia(query).matches
  const [on, setOn] = useState(get)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia(query)
    const f = () => setOn(mq.matches)
    f()
    mq.addEventListener?.('change', f)
    return () => mq.removeEventListener?.('change', f)
  }, [query])
  return on
}
