// Хранение плана в IndexedDB браузера (план ~3 МБ — больше, чем надёжно влезает в localStorage).
// Если IndexedDB нет или он падает — работаем в памяти и честно говорим, что правки не сохранятся.
import type { Plan } from './types'

export interface PlanStorage {
  persistent: boolean
  load(): Promise<Plan | null>
  save(plan: Plan): Promise<void>
  clear(): Promise<void>
}

export function memoryStorage(): PlanStorage {
  let saved: Plan | null = null
  return {
    persistent: false,
    load: async () => saved,
    save: async (plan) => {
      saved = plan
    },
    clear: async () => {
      saved = null
    },
  }
}

const DB = 'content-plan'
const STORE = 'state'
const KEY = 'plan'

function request<T>(r: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

export async function idbStorage(idb: IDBFactory): Promise<PlanStorage> {
  const open = idb.open(DB, 1)
  open.onupgradeneeded = () => open.result.createObjectStore(STORE)
  const db = await request(open)
  const tx = (mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE)
  return {
    persistent: true,
    load: async () => ((await request(tx('readonly').get(KEY))) as Plan | undefined) ?? null,
    save: async (plan) => {
      await request(tx('readwrite').put(plan, KEY))
    },
    clear: async () => {
      await request(tx('readwrite').delete(KEY))
    },
  }
}

export async function openStorage(idb: IDBFactory | undefined = globalThis.indexedDB): Promise<PlanStorage> {
  if (!idb) return memoryStorage()
  try {
    return await idbStorage(idb)
  } catch {
    return memoryStorage()
  }
}
