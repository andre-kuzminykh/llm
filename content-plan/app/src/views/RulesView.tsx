import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { addMonths, monthKey, SAT, shortDate, WEEKDAYS } from '../model/dates'
import { weekTemplate, type TemplateLine } from '../model/rules'
import { createSlots } from '../model/store'
import { SPREAD, typeOf, type Channel, type Rubric, type Rule } from '../model/types'
import { IconButton, PickText, PlatformIcon } from '../ui/bits'
import { Icon } from '../ui/Icon'
import { usePlan } from '../ui/ctx'
import { TopBar } from '../ui/TopBar'

/** Дни формата по-человечески: «каждый день», «кроме Сб», «через Ср», «Пн, Вс (спецпроекты)». */
export function daysText(rule: Rule) {
  const on = rule.days.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)
  const notes = [...new Set(on.map((i) => rule.dayNotes[i]).filter(Boolean))]
  if (on.length === 7) return `каждый день${notes.length ? ` · ${notes.join(', ')}` : ''}`
  if (on.length === 6) return `кроме ${WEEKDAYS[rule.days.findIndex((v) => !v)]}${notes.length ? ` · ${notes.join(', ')}` : ''}`
  if (!on.length) return 'не выходит'
  return on
    .map((i) => {
      const n = rule.dayNotes[i]
      if (!n) return WEEKDAYS[i]
      if (n === 'через нед.' || n === 'чередуется') return `через ${WEEKDAYS[i]}`
      if (/^\d-й/.test(n)) return `${n} месяца`
      if (/^\d\d\.\d\d$/.test(n)) return `${WEEKDAYS[i]}, ${n}`
      return `${WEEKDAYS[i]} (${n})`
    })
    .join(', ')
}

/** Сетка: типовая неделя для просмотра, рубрики и форматы строками — правка формата в панели справа; каналы. */
export function RulesView() {
  const { plan } = usePlan()
  const [edit, setEdit] = useState<string | null>(null)
  const rule = plan.rules.find((r) => r.id === edit)
  return (
    <>
      <TopBar title="Сетка" side={false} />
      <div className="cp-body nr-scroll">
        <div className="cp-rules">
          <section aria-labelledby="week-h">
            <h2 className="cp-section-title" id="week-h">Типовая неделя</h2>
            <div style={{ overflowX: 'auto' }} className="nr-scroll">
              <TemplateWeek />
            </div>
          </section>
          <section aria-labelledby="rules-h">
            <h2 className="cp-section-title" id="rules-h">Рубрики и форматы</h2>
            <RuleTable onEdit={setEdit} current={edit} />
          </section>
          <section aria-labelledby="ch-h">
            <h2 className="cp-section-title" id="ch-h">Каналы</h2>
            <div className="cp-channels">
              {plan.channels.map((c) => (
                <ChannelCard key={c.id} channel={c} />
              ))}
              <NewChannel />
            </div>
          </section>
        </div>
      </div>
      {rule && <RuleSheet key={rule.id} rule={rule} onClose={() => setEdit(null)} />}
    </>
  )
}

const COLS = 5

function RuleTable({ onEdit, current }: { onEdit: (id: string) => void; current: string | null }) {
  const { plan, dispatch } = usePlan()
  const [name, setName] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const ids = [...plan.rubrics.map((r) => r.id), SPREAD]
  const toggle = (id: string) => setOpen((o) => {
    const n = new Set(o)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  return (
    <div className="cp-table-wrap nr-scroll">
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" onClick={() => setOpen(open.size === ids.length ? new Set() : new Set(ids))}>
          {open.size === ids.length ? 'Свернуть все' : 'Развернуть все'}
        </button>
      </div>
      <table className="cp-table">
        <thead>
          <tr>
            <th>Формат</th>
            <th>Канал</th>
            <th>Дни</th>
            <th>Время</th>
            <th>Площадки</th>
          </tr>
        </thead>
        <tbody>
          {plan.rubrics.map((r) => (
            <RubricRows key={r.id} rubric={r} rules={plan.rules.filter((x) => x.rubricId === r.id)} open={open.has(r.id)} onToggle={() => toggle(r.id)} onEdit={onEdit} current={current} />
          ))}
          <RubricRows rubric={null} rules={plan.rules.filter((x) => x.rubricId === null)} open={open.has(SPREAD)} onToggle={() => toggle(SPREAD)} onEdit={onEdit} current={current} />
          <tr>
            <td colSpan={COLS}>
              <form
                style={{ display: 'flex', gap: 8, paddingTop: 12 }}
                onSubmit={(e) => {
                  e.preventDefault()
                  dispatch({ type: 'addRubric', name })
                  setName('')
                }}
              >
                <input className="nr-field nr-field--sm" style={{ maxWidth: 280 }} placeholder="Новая рубрика" aria-label="Новая рубрика" value={name} onChange={(e) => setName(e.target.value)} />
                <button type="submit" className="nr-btn nr-btn--ghost nr-btn--sm" disabled={!name.trim()}>+ Рубрика</button>
              </form>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/** Рубрика и её форматы; rubric = null — форматы, которые выходят с FULL любой рубрики. */
function RubricRows({ rubric, rules, open, onToggle, onEdit, current }: { rubric: Rubric | null; rules: Rule[]; open: boolean; onToggle: () => void; onEdit: (id: string) => void; current: string | null }) {
  const { plan, dispatch, channels } = usePlan()
  const [name, setName] = useState('')
  const [channelId, setChannelId] = useState(plan.channels.find((c) => c.id === 'dataist')?.id ?? plan.channels[0].id)
  const summary = rules.map((r) => `${r.name} — ${daysText(r)}`).join(' · ')
  const label = (r: Rule) => `${rubric?.name ?? SPREAD} · ${r.name}`
  return (
    <>
      <tr className="cp-table__group">
        <td colSpan={COLS}>
          <button type="button" className="cp-fold cp-fold--row" aria-expanded={open} aria-label={`${open ? 'Свернуть' : 'Раскрыть'}: ${rubric?.name ?? SPREAD}`} onClick={onToggle}>
            <Icon name="chev-right" size={14} />
            <span className="cp-fold__name">{rubric?.name ?? SPREAD}</span>
            <span className="cp-muted cp-fold__sum">{open ? (rubric ? rubric.what : 'рубрика у них та же, что у FULL') : summary || 'форматов нет'}</span>
          </button>
        </td>
      </tr>
      {open &&
        rules.map((r) => {
          const c = channels.get(r.channelId)
          return (
            <tr key={r.id} className="cp-rule-row" aria-selected={current === r.id} onClick={() => onEdit(r.id)}>
              <td>
                <button
                  type="button"
                  className="cp-link cp-rule-row__name"
                  aria-label={`Править: ${label(r)}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit(r.id)
                  }}
                >
                  {r.name}
                </button>
                {r.what && <div className="cp-muted cp-rule-row__what">{r.what}</div>}
              </td>
              <td className="cp-muted">{r.channel || c?.name}</td>
              <td>
                <span className="cp-dots" role="img" aria-label={daysText(r)} title={r.freq}>
                  {r.days.map((on, i) => (
                    <span key={i} className={`cp-dots__d${on ? ' cp-dots__d--on' : ''}`} />
                  ))}
                </span>
                <span className="cp-rule-row__days">{daysText(r)}</span>
              </td>
              <td className="cp-rule-row__time">{r.time}</td>
              <td className="cp-muted cp-rule-row__plats">{r.platforms.map((p) => `${p} — ${typeOf(r, p)}`).join(' · ')}</td>
            </tr>
          )
        })}
      {open && (
        <tr>
          <td colSpan={COLS}>
            <form
              style={{ display: 'flex', gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault()
                dispatch({ type: 'addRule', rubricId: rubric?.id ?? null, channelId, name })
                setName('')
              }}
            >
              <input className="nr-field nr-field--sm" style={{ maxWidth: 240 }} placeholder="Новый формат" aria-label={`Новый формат: ${rubric?.name ?? SPREAD}`} value={name} onChange={(e) => setName(e.target.value)} />
              <select className="nr-field nr-field--sm" style={{ maxWidth: 160 }} aria-label="Канал нового формата" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                {plan.channels.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button type="submit" className="nr-btn nr-btn--ghost nr-btn--sm" disabled={!name.trim()}>+ Формат</button>
            </form>
          </td>
        </tr>
      )}
    </>
  )
}

/** Правка формата: название, дни, время, площадки и что на каждой выходит, лимит, слоты. */
function RuleSheet({ rule, onClose }: { rule: Rule; onClose: () => void }) {
  const { plan, dispatch, toast, anchor, channels, rubrics } = usePlan()
  const [from, setFrom] = useState(anchor)
  const [to, setTo] = useState(`${addMonths(monthKey(anchor), 3)}-01`)
  const set = (patch: Partial<Rule>) => dispatch({ type: 'rule', id: rule.id, patch })
  const channel = channels.get(rule.channelId)
  const rubric = rubrics.get(rule.rubricId ?? '')
  const platforms = plan.platforms.filter((p) => channel?.platforms.includes(p) || rule.platforms.includes(p))
  const label = `${rubric?.name ?? SPREAD} · ${rule.name}`
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <aside className="cp-sheet" aria-label="Правка формата" style={{ '--cp-c': channel?.color } as CSSProperties}>
      <div className="cp-sheet__head">
        <h2 className="cp-sheet__title">{label}</h2>
        <IconButton icon="close" label="Закрыть" onClick={onClose} />
      </div>
      <div className="cp-sheet__body nr-scroll">
        <div className="cp-field__row">
          {rubric && (
            <label className="cp-field">
              <span className="nr-label">Рубрика</span>
              <input className="nr-field nr-field--sm" aria-label="Название рубрики" value={rubric.name} onChange={(e) => dispatch({ type: 'rubric', id: rubric.id, patch: { name: e.target.value } })} />
            </label>
          )}
          <label className="cp-field">
            <span className="nr-label">Формат</span>
            <input className="nr-field nr-field--sm" aria-label={`Формат: ${label}`} value={rule.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
        </div>
        <label className="cp-field">
          <span className="nr-label">Что это</span>
          <textarea className="nr-field" rows={2} aria-label={`Описание: ${label}`} value={rule.what} onChange={(e) => set({ what: e.target.value })} />
        </label>
        <div className="cp-field">
          <span className="nr-label">Дни · {channel?.name}</span>
          <div className="cp-daypick">
            {rule.days.map((on, i) => (
              <button
                key={i}
                type="button"
                className="cp-daytoggle"
                aria-pressed={on}
                aria-label={`${label}: ${WEEKDAYS[i]}`}
                title={rule.dayNotes[i] || undefined}
                onClick={() => set({ days: rule.days.map((v, j) => (j === i ? !v : v)) })}
              >
                {WEEKDAYS[i]}
              </button>
            ))}
          </div>
          <span className="cp-hint">{daysText(rule)}</span>
        </div>
        <div className="cp-field__row">
          <div className="cp-field">
            <span className="nr-label">Время</span>
            <PickText type="time" label={`Время: ${label}`} value={rule.time} text={rule.time} onChange={(t) => t && set({ time: t })} />
          </div>
          <label className="cp-field">
            <span className="nr-label">Лимит в день</span>
            <input className="nr-field nr-field--sm" type="number" min={1} max={20} aria-label="Лимит в день" value={rule.limit} onChange={(e) => set({ limit: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
        </div>
        <label className="cp-field">
          <span className="nr-label">Частота — словами</span>
          <input className="nr-field nr-field--sm" aria-label={`Частота: ${label}`} placeholder="Частота" value={rule.freq} onChange={(e) => set({ freq: e.target.value })} />
        </label>
        <div className="cp-field">
          <span className="nr-label">Площадки и что на каждой выходит</span>
          <div className="cp-ptypes">
            {platforms.map((p) => {
              const on = rule.platforms.includes(p)
              return (
                <div key={p} className="cp-ptype">
                  <button
                    type="button"
                    className="nr-pill"
                    aria-pressed={on}
                    aria-label={`${label}: ${p}`}
                    onClick={() => set({ platforms: on ? rule.platforms.filter((x) => x !== p) : plan.platforms.filter((x) => x === p || rule.platforms.includes(x)) })}
                  >
                    <PlatformIcon platform={p} size={13} />
                    {p}
                  </button>
                  {on && (
                    <input
                      className="nr-field nr-field--sm"
                      aria-label={`Что выходит: ${label}, ${p}`}
                      value={rule.types?.[p] ?? ''}
                      placeholder={typeOf({ ...rule, types: {} }, p)}
                      onChange={(e) => set({ types: { ...rule.types, [p]: e.target.value } })}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <form
          className="cp-field"
          onSubmit={(e) => {
            e.preventDefault()
            const next = createSlots(plan, rule.id, from, to)
            const heads = (p: typeof plan) => p.items.filter((x) => x.ruleId === rule.id && !x.derive).length
            const n = heads(next) - heads(plan)
            if (n) dispatch({ type: 'replace', plan: next })
            toast(n ? `Создано слотов «${label}»: ${n}` : 'Свободных дней в этом периоде нет', n > 0)
          }}
        >
          <span className="nr-label">Слоты — пустые места под темы в дни формата</span>
          <span className="cp-slots-form">
            с <PickText type="date" label="С даты" value={from} text={from ? `${shortDate(from)} ${from.slice(0, 4)}` : ''} onChange={setFrom} />
            по <PickText type="date" label="По дату" value={to} text={to ? `${shortDate(to)} ${to.slice(0, 4)}` : ''} onChange={setTo} />
            <button type="submit" className="nr-btn nr-btn--tinted nr-btn--sm">Создать слоты</button>
          </span>
        </form>
      </div>
    </aside>
  )
}

function TemplateWeek() {
  const { plan, channels } = usePlan()
  const t = useMemo(() => weekTemplate(plan), [plan])
  return (
    <div className="cp-tweek" role="table" aria-label="Типовая неделя">
      <div className="cp-tweek__h" role="columnheader" />
      {plan.platforms.map((p) => (
        <div key={p} className="cp-tweek__h" role="columnheader">{p}</div>
      ))}
      {WEEKDAYS.map((w, wd) => (
        <TemplateRow key={w} wd={wd} lines={plan.platforms.map((p) => t.get(`${wd}|${p}`) ?? [])} colorOf={(cid) => channels.get(cid)?.color} />
      ))}
    </div>
  )
}

function TemplateRow({ wd, lines, colorOf }: { wd: number; lines: TemplateLine[][]; colorOf: (cid: string) => string | undefined }) {
  const rest = wd === SAT ? { background: 'var(--cp-rest)' } : undefined // суббота — день отдыха, тихим фоном
  return (
    <>
      <div className="cp-tweek__h" style={rest} role="rowheader">{WEEKDAYS[wd]}</div>
      {lines.map((cell, i) => {
        let last = ''
        return (
          <div key={i} style={rest} role="cell">
            {cell.map((l) => {
              const head = l.header !== last
              last = l.header
              return (
                <div key={l.rule.id}>
                  {head && <div className="cp-tweek__head" style={{ '--cp-c': colorOf(l.channelId) } as CSSProperties}>{l.header}</div>}
                  <div className="cp-tweek__line">• {l.label}{l.note ? ` (${l.note})` : ''}</div>
                </div>
              )
            })}
          </div>
        )
      })}
    </>
  )
}

function ChannelCard({ channel }: { channel: Channel }) {
  const { plan, dispatch } = usePlan()
  const set = (patch: Partial<Channel>) => dispatch({ type: 'channel', id: channel.id, patch })
  return (
    <section className="cp-channel" aria-label={channel.name} style={{ '--cp-c': channel.color } as CSSProperties}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input className="cp-color" type="color" value={channel.color} aria-label={`Цвет ${channel.name}`} onChange={(e) => set({ color: e.target.value })} />
        <input className="nr-field nr-field--sm" style={{ fontWeight: 600 }} aria-label="Название канала" value={channel.name} onChange={(e) => set({ name: e.target.value })} />
      </div>
      <label className="cp-field">
        <span className="nr-label">Старт</span>
        <input className="nr-field nr-field--sm" type="date" value={channel.start} onChange={(e) => e.target.value && set({ start: e.target.value })} />
      </label>
      <div className="cp-field">
        <span className="nr-label">Площадки</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {plan.platforms.map((p) => (
            <button
              key={p}
              type="button"
              className="nr-pill"
              style={{ height: 24, fontSize: 11 }}
              aria-pressed={channel.platforms.includes(p)}
              onClick={() => set({ platforms: channel.platforms.includes(p) ? channel.platforms.filter((x) => x !== p) : plan.platforms.filter((x) => x === p || channel.platforms.includes(x)) })}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      {channel.sections.length > 0 && <span className="cp-muted">Разделы: {channel.sections.map((s) => `${s.name} (на сайте — ${s.web})`).join(', ')}</span>}
    </section>
  )
}

function NewChannel() {
  const { plan, dispatch, toast } = usePlan()
  const [name, setName] = useState('')
  const [start, setStart] = useState(plan.start)
  return (
    <form
      className="cp-channel cp-channel--new"
      onSubmit={(e) => {
        e.preventDefault()
        dispatch({ type: 'addChannel', name, start })
        toast(`Канал «${name}» добавлен`, true)
        setName('')
      }}
    >
      <span className="nr-label">Новый канал</span>
      <input className="nr-field nr-field--sm" placeholder="Название" aria-label="Название нового канала" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="nr-field nr-field--sm" type="date" aria-label="Старт нового канала" value={start} onChange={(e) => setStart(e.target.value)} />
      <button type="submit" className="nr-btn nr-btn--ghost nr-btn--sm" style={{ alignSelf: 'flex-start' }} disabled={!name.trim()}>Добавить канал</button>
    </form>
  )
}
