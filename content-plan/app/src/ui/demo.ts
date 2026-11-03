// «Демо» — показать прототип на выдуманных данных: соцсетей ещё нет (нужен сервер и API), а листать ленту и смотреть
// графики хочется уже сейчас. Выбор один на всё приложение (главная, панель фильтров, плашки), помнится в этом браузере.
import { useSyncExternalStore } from 'react'

const KEY = 'cp:demo'
const subs = new Set<() => void>()
let value: boolean | null = null

const read = () => {
  if (value === null)
    try {
      value = localStorage.getItem(KEY) === 'true'
    } catch {
      value = false
    }
  return value
}
const set = (v: boolean) => {
  value = v
  try {
    localStorage.setItem(KEY, String(v))
  } catch {
    /* до перезагрузки */
  }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => subs.delete(f)
}
/** Для тестов: забыть выбор, прочитать заново из хранилища. */
export const resetDemo = () => {
  value = null
}

export function useDemo(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, read, read), set]
}
