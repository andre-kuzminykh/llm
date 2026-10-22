import { useState } from 'react'
import { shortDate, WEEKDAYS, weekday } from '../model/dates'
import { KIND_LABEL, type ViolationKind } from '../model/rules'
import { Seg } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { TopBar } from '../ui/TopBar'

type Kind = ViolationKind | 'all'

/** Все нарушения сетки по датам, с переходом к неделе и дню. */
export function ChecksView() {
  const { violations, goto, openDay } = usePlan()
  const [kind, setKind] = useState<Kind>('all')
  const list = violations.filter((v) => kind === 'all' || v.kind === kind)
  const count = (k: ViolationKind) => violations.filter((v) => v.kind === k).length
  return (
    <>
      <TopBar title="Проверка" side={false}>
        <Seg
          value={kind}
          onChange={setKind}
          label="Тип нарушения"
          options={[
            { id: 'all', label: `Все · ${violations.length}` },
            ...(['full', 'limit', 'weekday', 'start'] as ViolationKind[]).map((k) => ({ id: k, label: `${KIND_LABEL[k]} · ${count(k)}` })),
          ]}
        />
      </TopBar>
      <div className="cp-body nr-scroll">
        {list.length === 0 ? (
          <div className="cp-empty">
            <span className="nr-logo">✓</span>
            <b style={{ color: 'var(--nr-text)' }}>Нарушений нет</b>
            Каждый день соблюдает сетку: один FULL, рубрики в свои дни, каналы после старта.
          </div>
        ) : (
          <div className="cp-checks">
            {list.map((v, i) => (
              <div key={i} className="cp-check">
                <span>
                  <b>{shortDate(v.date)}</b> <span className="cp-muted">{WEEKDAYS[weekday(v.date)]} · {v.date.slice(0, 4)}</span>
                </span>
                <span className="nr-tag nr-tag--danger">{KIND_LABEL[v.kind]}</span>
                <span>{v.text}</span>
                <button
                  type="button"
                  className="nr-btn nr-btn--ghost nr-btn--sm"
                  onClick={() => {
                    goto('week', v.date)
                    openDay(v.date)
                  }}
                >
                  Открыть
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
