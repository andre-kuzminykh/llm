// Данные главной: мои аккаунты и конкуренты из настроек, лента и ряды цифр. Пока API соцсетей нет — пусто, а в «Демо» —
// выдуманные (помечены). Пример собирается раз на час и набор аккаунтов: им пользуются и панель фильтров, и главная.
import { useMemo } from 'react'
import { EMPTY_FEED, hourOf, sampleFeed, tagsOf, type Feed } from '../model/metrics'
import { DEMO_ACCOUNTS, DEMO_RIVALS } from '../model/social'
import type { Account, Competitor } from '../model/types'
import { usePlan } from './ctx'
import { useDemo } from './demo'

export interface Who {
  name: string
  handle: string
  platform: string
}

let cache: { key: string; feed: Feed } | null = null

export function useHomeData() {
  const { plan, home } = usePlan()
  const [demo, setDemo] = useDemo()
  const accounts = plan.analytics?.accounts ?? []
  const rivals = plan.analytics?.competitors ?? []
  // в демо, пока никого не подключили, — демо-аккаунты, чтобы было что листать
  const mine: Account[] = accounts.length ? accounts : demo ? DEMO_ACCOUNTS : []
  const theirs: Competitor[] = rivals.length ? rivals : demo ? DEMO_RIVALS : []
  const now = hourOf(Date.now())
  const key = `${demo}|${now}|${[...mine, ...theirs].map((a) => `${a.id}:${a.platform}`).join('|')}`
  if (!cache || cache.key !== key)
    cache = {
      key,
      feed: demo
        ? sampleFeed(now, [...mine.map((a) => ({ id: a.id, platforms: [a.platform] })), ...theirs.map((c) => ({ id: c.id, platforms: [c.platform], rival: true }))])
        : EMPTY_FEED,
    }
  const feed = cache.feed
  const who = useMemo(() => new Map<string, Who>([...mine, ...theirs].map((a) => [a.id, { name: a.name, handle: a.handle, platform: a.platform }])), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const scope = home.tab === 'mine' ? mine : theirs
  // посты в разрезе вкладки: мои или конкурентов
  const posts = useMemo(() => feed.posts.filter((p) => (home.tab === 'mine' ? p.mine : !p.mine)), [feed, home.tab])
  const series = useMemo(() => {
    const ids = new Set(scope.map((a) => a.id))
    return feed.series.filter((s) => ids.has(s.owner))
  }, [feed, scope])
  const topics = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of posts) for (const t of tagsOf(p.text)) m.set(t, (m.get(t) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [posts])
  return { demo, setDemo, accounts, rivals, mine, theirs, scope, feed, posts, series, who, topics, now }
}
