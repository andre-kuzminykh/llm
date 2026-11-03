// «Демо» — показать прототип на выдуманных данных: соцсетей ещё нет (нужен сервер и API), а листать ленту и смотреть
// графики хочется уже сейчас. Выбор общий для главной и аналитики, помнится в этом браузере.
import { useState } from 'react'

const KEY = 'cp:demo'

export function useDemo(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY) === 'true'
    } catch {
      return false
    }
  })
  return [
    on,
    (v: boolean) => {
      setOn(v)
      try {
        localStorage.setItem(KEY, String(v))
      } catch {
        /* до перезагрузки */
      }
    },
  ]
}
