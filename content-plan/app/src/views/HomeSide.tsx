// Фильтры главной — той же панелью слева, что и в календаре: аккаунты (мои или конкурентов — по вкладке), площадки,
// форматы, топики. Они же ставятся щелчком по строке таблицы в аналитике («провалиться») — и действуют на графики,
// таблицу и ленту сразу. «+» у аккаунтов — в настройки.
import { FORMAT_ICON, FORMATS, rubricKey, rubricName } from '../model/types'
import { NO_HOME_FILTERS, topicLabel, type HomeFilters } from '../model/overview'
import { newId } from '../model/store'
import { IconButton, PlatformIcon } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { useHomeData } from '../ui/homeData'
import { Icon } from '../ui/Icon'

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

export function HomeSide({ onClose }: { onClose: () => void }) {
  const { plan, narrow, home, setHome, openSettings, dispatch, toast } = usePlan()
  const { scope, topics, posts } = useHomeData()
  const f = home.filters
  const set = (patch: Partial<HomeFilters>) => setHome({ filters: { ...f, ...patch } })
  const changed = activeHomeFilters(f, new Map()).length > 0
  const platforms = [...new Set([...scope.map((a) => a.platform), ...posts.map((p) => p.platform)])]
  const mine = home.tab === 'mine'
  const picked = f.pickedTopics
  const single = picked.length === 1 && !plan.rubrics.some((r) => rubricKey(r.name) === rubricKey(picked[0])) ? picked[0] : null
  return (
    <aside className="cp-side nr-scroll" aria-label="Фильтры">
      <div className="cp-side__head">
        <span className="cp-side__title">Фильтры</span>
        {changed && (
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => setHome({ filters: NO_HOME_FILTERS })}>
            Сбросить
          </button>
        )}
        {narrow ? <IconButton icon="close" label="Закрыть фильтры" onClick={onClose} size="sm" /> : <IconButton icon="chev-left" label="Свернуть фильтры" onClick={onClose} size="sm" />}
      </div>
      <div className="cp-side__block">
        <div className="cp-side__label">
          <span className="nr-label">{mine ? 'Мои соцсети' : 'Конкуренты'}</span>
          <IconButton icon="plus" size="sm" label={mine ? 'Подключить соцсеть' : 'Следить за аккаунтом'} onClick={openSettings} />
        </div>
        {scope.length ? (
          <div className="cp-side__list" role="group" aria-label={mine ? 'Мои соцсети' : 'Конкуренты'}>
            {scope.map((a) => (
              <div key={a.id} className={`cp-side__row${f.hiddenOwners.includes(a.id) ? ' cp-side__row--off' : ''}`}>
                <span className="cp-side__icon" aria-hidden="true">
                  <PlatformIcon platform={a.platform} size={15} />
                </span>
                <button type="button" className="nr-row" aria-pressed={!f.hiddenOwners.includes(a.id)} title={a.handle} onClick={() => set({ hiddenOwners: toggle(f.hiddenOwners, a.id) })}>
                  {a.name}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <button type="button" className="cp-side__empty" onClick={openSettings}>
            {mine ? 'Подключите соцсети в настройках' : 'Добавьте конкурентов в настройках'}
          </button>
        )}
      </div>
      {platforms.length > 0 && (
        <div className="cp-side__block">
          <span className="nr-label">Площадки</span>
          <div className="cp-pills">
            {platforms.map((p) => (
              <button key={p} type="button" className="nr-pill" aria-pressed={!f.hiddenPlatforms.includes(p)} onClick={() => set({ hiddenPlatforms: toggle(f.hiddenPlatforms, p) })}>
                <PlatformIcon platform={p} />
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="cp-side__block">
        <span className="nr-label">Форматы</span>
        {FORMATS.map((g) => (
          <div key={g.group} className="cp-side__group" role="group" aria-label={g.group}>
            <span className="cp-side__sub">{g.group}</span>
            {g.items.map((fm) => (
              <button key={fm} type="button" className="nr-row cp-side__sec" aria-pressed={!f.hiddenFormats.includes(fm)} onClick={() => set({ hiddenFormats: toggle(f.hiddenFormats, fm) })}>
                <Icon name={FORMAT_ICON[fm].icon} size={16} />
                {fm}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="cp-side__block">
        <span className="nr-label">Топики</span>
        {/* топики — теги из текстов, без решётки; щелчок выделяет — видны только выделенные */}
        {topics.length ? (
          <div className="cp-pills cp-side__rubrics" role="group" aria-label="Топики">
            {topics.slice(0, 40).map(([t, n]) => (
              <button key={t} type="button" className="nr-pill" aria-pressed={picked.includes(t)} onClick={() => set({ pickedTopics: toggle(picked, t), post: undefined })}>
                {topicLabel(t)}
                <span className="cp-side__n">{n}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="cp-hint cp-side__hint">Появятся из тегов в текстах постов.</p>
        )}
        <div className="cp-side__picks">
          {picked.length > 0 && (
            <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => set({ pickedTopics: [] })}>
              Снять выделение
            </button>
          )}
          {single && (
            <button
              type="button"
              className="nr-btn nr-btn--ghost nr-btn--sm"
              onClick={() => {
                dispatch({ type: 'addRubric', name: rubricName(topicLabel(single)), id: newId('k') })
                toast(`«${rubricName(topicLabel(single))}» — теперь рубрика календаря`, true)
              }}
            >
              <Icon name="plus" size={14} />В рубрики
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}

/** Включённые фильтры главной словами — метками над графиками; каждую можно снять. */
export function activeHomeFilters(f: HomeFilters, names: Map<string, string>, all: { owners?: string[]; platforms?: string[]; postTitle?: string } = {}) {
  const out: { id: string; label: string; patch: Partial<HomeFilters> }[] = []
  const list = (xs: string[]) => (xs.length <= 2 ? xs.join(', ') : `${xs.slice(0, 2).join(', ')} и ещё ${xs.length - 2}`)
  const fmt = (x: string) => FORMAT_ICON[x]?.label.toLowerCase() ?? x
  const formats = FORMATS.flatMap((g) => g.items)
  // скрыто всё, кроме одного, — «только он» (так ставит щелчок по строке таблицы)
  const only = (hidden: string[], every: string[] | undefined) => (every && every.length > 1 && hidden.length === every.length - 1 ? every.find((x) => !hidden.includes(x)) : undefined)
  if (f.post) out.push({ id: 'post', label: `Пост: ${all.postTitle ?? '…'}`, patch: { post: undefined } })
  if (f.pickedTopics.length) out.push({ id: 'tp', label: `Топик: ${list(f.pickedTopics.map(topicLabel))}`, patch: { pickedTopics: [] } })
  if (f.hiddenOwners.length) {
    const one = only(f.hiddenOwners, all.owners)
    out.push({ id: 'ow', label: one ? `Аккаунт: ${names.get(one) ?? one}` : `Без ${list(f.hiddenOwners.map((id) => names.get(id) ?? id))}`, patch: { hiddenOwners: [] } })
  }
  if (f.hiddenPlatforms.length) {
    const one = only(f.hiddenPlatforms, all.platforms)
    out.push({ id: 'pl', label: one ? `Площадка: ${one}` : `Без ${list(f.hiddenPlatforms)}`, patch: { hiddenPlatforms: [] } })
  }
  if (f.hiddenFormats.length) {
    const one = only(f.hiddenFormats, formats)
    out.push({ id: 'fm', label: one ? `Формат: ${fmt(one)}` : `Без ${list(f.hiddenFormats.map(fmt))}`, patch: { hiddenFormats: [] } })
  }
  return out
}
