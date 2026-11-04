// Настройки — панелью справа (из профиля или из уведомления на главной): мои соцсети, из которых собирается моя лента и
// графики, и конкуренты, за которыми следим каждый час. Из маркетингового анализа конкуренты подтянутся сами — позже.
import { today } from '../model/dates'
import type { Competitor } from '../model/types'
import { AccountList, AddAccount } from '../ui/accounts'
import { IconButton } from '../ui/bits'
import { usePlan } from '../ui/ctx'

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { plan, dispatch, toast } = usePlan()
  const accounts = plan.analytics?.accounts ?? []
  const rivals = plan.analytics?.competitors ?? []
  return (
    <aside className="cp-sheet" aria-label="Настройки">
      <div className="cp-sheet__head">
        <h2 className="nr-title cp-sheet__title">Настройки</h2>
        <IconButton icon="close" label="Закрыть" onClick={onClose} />
      </div>
      <div className="cp-sheet__body nr-scroll">
        <section className="cp-set" aria-labelledby="set-mine">
          <h3 id="set-mine" className="cp-set__h">Мои соцсети</h3>
          <p className="cp-hint">Из них собираются графики и моя лента на главной: посты, теги (топики) и цифры. Контент всегда на двух языках: русская версия уходит в аккаунты RU, английская — в аккаунты EN.</p>
          <AccountList
            items={accounts}
            label="Мои соцсети"
            onRemove={(a) => {
              dispatch({ type: 'analytics', patch: { accounts: accounts.filter((x) => x.id !== a.id) } })
              toast(`«${a.name}» отключён`, true)
            }}
          />
          <AddAccount
            label="Подключить соцсеть"
            button="Подключить"
            namePlaceholder="Мой канал"
            withLang
            onAdd={(a) => {
              dispatch({ type: 'analytics', patch: { accounts: [...accounts, a] } })
              toast(`${a.platform} «${a.name}»${a.lang ? ` (${a.lang.toUpperCase()})` : ''} подключён — посты и цифры придут, когда подключим API площадок`, true)
            }}
          />
        </section>
        <section className="cp-set" aria-labelledby="set-rivals">
          <h3 id="set-rivals" className="cp-set__h">Конкуренты</h3>
          <p className="cp-hint">Проверяем их каждый час: посты с коротким саммери — во вкладке «Поиск» на главной, цифры — в графиках.</p>
          <AccountList
            items={rivals}
            label="Конкуренты"
            onRemove={(c) => {
              dispatch({ type: 'analytics', patch: { competitors: rivals.filter((x) => x.id !== c.id) } })
              toast(`«${c.name}» больше не отслеживаем`, true)
            }}
          />
          <AddAccount
            label="Следить за аккаунтом"
            button="+ Следить"
            namePlaceholder="AI Daily"
            onAdd={(a) => {
              const c: Competitor = { ...a, added: today() }
              dispatch({ type: 'analytics', patch: { competitors: [...rivals, c] } })
              toast(`«${c.name}» — следим каждый час`, true)
            }}
          />
          <div className="cp-an__soon cp-an__soon--sm" aria-disabled="true">
            <span>Из маркетингового анализа — подтянутся сами</span>
            <span className="cp-an__badge">скоро</span>
          </div>
        </section>
      </div>
    </aside>
  )
}
