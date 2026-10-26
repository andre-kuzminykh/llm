// Выбранные карточки — панель внизу: сколько выбрано, статус всем, перенести на дату (промежутки сохраняются),
// удалить, снять выделение. Перетащить любую выбранную — поедут все.
import { daysBetween, shortDate } from '../model/dates'
import { plural } from '../model/hint'
import { shownTitle, type Item, type Status } from '../model/types'
import { IconButton, PickText, StatusPicker } from './bits'
import { usePlan } from './ctx'

export function SelectionBar() {
  const { selected, clearSelection, plan, unitsOn, dispatch, toast, moveMany } = usePlan()
  if (!selected.size) return null
  const heads = [...selected].map((id) => plan.items.find((x) => x.id === id)).filter((x): x is Item => !!x?.date)
  // статус — всей карточке, как у одной: главный и его тизеры, анонсы того же канала
  const items = heads.flatMap((h) => unitsOn(h.date!).find((u) => u.head.id === h.id)?.items ?? [h])
  const common = heads.every((h) => h.status === heads[0]?.status) ? heads[0]?.status ?? 'planned' : 'planned'
  const first = heads.map((h) => h.date!).sort()[0]
  const n = heads.length
  const what = `${n} ${plural(n, 'карточка', 'карточки', 'карточек')}`
  return (
    <div className="cp-selbar" role="toolbar" aria-label="Выбранные карточки" title={heads.map((h) => `${shortDate(h.date!)} ${shownTitle(h)}`).join('\n')}>
      <span className="cp-selbar__n">Выбрано: {n}</span>
      <StatusPicker
        size="sm"
        label="Статус выбранных"
        value={common}
        onChange={(s: Status) => {
          dispatch({ type: 'updateMany', ids: items.map((x) => x.id), patch: { status: s } })
          toast(`Статус ${what}: обновлён`, true)
        }}
      />
      <PickText
        type="date"
        label="Перенести выбранные на дату"
        value=""
        text=""
        placeholder="Перенести на дату…"
        onChange={(d) => d && first && moveMany(heads.map((h) => h.id), daysBetween(first, d))}
      />
      <IconButton
        icon="trash"
        size="sm"
        label="Удалить выбранные"
        onClick={() => {
          dispatch({ type: 'batch', actions: heads.map((h) => ({ type: 'remove' as const, id: h.id })) })
          toast(`Удалено: ${what}`, true)
          clearSelection()
        }}
      />
      <IconButton icon="close" size="sm" label="Снять выделение" onClick={clearSelection} />
    </div>
  )
}
