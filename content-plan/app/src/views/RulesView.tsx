import { useMemo, useState } from 'react'
import { addMonths, monthKey, SAT, WEEKDAYS } from '../model/dates'
import { weekTemplate, type TemplateLine } from '../model/rules'
import { createSlots } from '../model/store'
import { SPREAD, typeOf, type Channel, type Rubric, type Rule } from '../model/types'
import { ChannelDot, IconButton, PlatformIcon } from '../ui/bits'
import { Icon } from '../ui/Icon'
import { usePlan } from '../ui/ctx'
import { TopBar } from '../ui/TopBar'

/** Сетка: рубрики и их форматы (дни, площадки, лимит), типовая неделя из них и каналы. */
export function RulesView() {
  const { plan } = usePlan()
  return (
    <>
      <TopBar title="Сетка" side={false} />
      <div className="cp-body nr-scroll">
        <div className="cp-rules">
          <section aria-labelledby="rules-h">
            <h2 className="cp-section-title" id="rules-h">Рубрики и форматы</h2>
            <p className="cp-hint" style={{ marginBottom: 10 }}>
              Рубрика — о чём материал, формат — как он выходит: FULL, тизер, анонс, урок, письмо. У каждого формата свои дни, время,
              площадки и что на каждой выходит (YouTube — FULL, Instagram — Reels), лимит в день; по ним считается «Проверка».
              «Слоты» создают пустые места под темы. Нажмите на рубрику, чтобы раскрыть её форматы.
            </p>
            <RuleTable />
          </section>
          <section aria-labelledby="week-h">
            <h2 className="cp-section-title" id="week-h">Типовая неделя</h2>
            <div style={{ overflowX: 'auto' }} className="nr-scroll">
              <TemplateWeek />
            </div>
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
    </>
  )
}

const COLS = 13

function RuleTable() {
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
          <th>Площадки · что выходит</th>
          {WEEKDAYS.map((w, i) => (
            <th key={w} className={`cp-daycell${i === SAT ? ' cp-daycell--rest' : ''}`}>{w}</th>
          ))}
          <th>Время</th>
          <th>Лимит</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {plan.rubrics.map((r) => (
          <RubricRows key={r.id} rubric={r} rules={plan.rules.filter((x) => x.rubricId === r.id)} open={open.has(r.id)} onToggle={() => toggle(r.id)} />
        ))}
        <RubricRows rubric={null} rules={plan.rules.filter((x) => x.rubricId === null)} open={open.has(SPREAD)} onToggle={() => toggle(SPREAD)} />
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
              <button type="submit" className="nr-btn nr-btn--secondary nr-btn--sm" disabled={!name.trim()}>+ Рубрика</button>
            </form>
          </td>
        </tr>
      </tbody>
    </table>
    </div>
  )
}

/** Рубрика и её форматы; rubric = null — форматы, которые выходят с FULL любой рубрики. */
function RubricRows({ rubric, rules, open, onToggle }: { rubric: Rubric | null; rules: Rule[]; open: boolean; onToggle: () => void }) {
  const { plan, dispatch } = usePlan()
  const [name, setName] = useState('')
  const [channelId, setChannelId] = useState(plan.channels.find((c) => c.id === 'dataist')?.id ?? plan.channels[0].id)
  const summary = rules.map((r) => `${r.name} (${r.days.map((on, i) => (on ? WEEKDAYS[i] : '')).filter(Boolean).join(', ') || '—'})`).join(' · ')
  return (
    <>
      <tr className="cp-table__group">
        <td colSpan={COLS}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="nr-btn nr-btn--ghost nr-btn--icon nr-btn--sm cp-fold" aria-expanded={open} aria-label={`${open ? 'Свернуть' : 'Раскрыть'}: ${rubric?.name ?? SPREAD}`} onClick={onToggle}>
              <Icon name="chev-right" size={16} />
            </button>
            {rubric ? (
              <input
                className="nr-field nr-field--sm"
                style={{ maxWidth: 200, fontWeight: 700 }}
                aria-label="Название рубрики"
                value={rubric.name}
                onChange={(e) => dispatch({ type: 'rubric', id: rubric.id, patch: { name: e.target.value } })}
              />
            ) : (
              <span>{SPREAD}</span>
            )}
            <span className="cp-muted" style={{ fontWeight: 450 }}>
              {open ? (rubric ? rubric.what : 'рубрика у них та же, что у FULL') : summary || 'форматов нет'}
            </span>
          </span>
        </td>
      </tr>
      {open && rules.map((r) => (
        <RuleRow key={r.id} rule={r} />
      ))}
      {open && <tr>
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
      </tr>}
    </>
  )
}

function RuleRow({ rule }: { rule: Rule }) {
  const { plan, dispatch, toast, anchor, channels, rubrics } = usePlan()
  const [slots, setSlots] = useState(false)
  const [from, setFrom] = useState(anchor)
  const [to, setTo] = useState(`${addMonths(monthKey(anchor), 3)}-01`)
  const set = (patch: Partial<Rule>) => dispatch({ type: 'rule', id: rule.id, patch })
  const channel = channels.get(rule.channelId)
  const platforms = plan.platforms.filter((p) => channel?.platforms.includes(p) || rule.platforms.includes(p))
  const label = `${rubrics.get(rule.rubricId ?? '')?.name ?? SPREAD} · ${rule.name}`
  return (
    <>
      <tr>
        <td style={{ minWidth: 190 }}>
          <input className="nr-field nr-field--sm" aria-label={`Формат: ${label}`} value={rule.name} onChange={(e) => set({ name: e.target.value })} />
          {rule.what && <div className="cp-muted" style={{ marginTop: 2 }}>{rule.what}</div>}
          <input className="nr-field nr-field--sm cp-freq" aria-label={`Частота: ${label}`} placeholder="Частота" value={rule.freq} onChange={(e) => set({ freq: e.target.value })} />
        </td>
        <td style={{ minWidth: 110 }}>
          <span className="cp-ch" style={{ color: channel?.color, fontWeight: 600 }}>
            <ChannelDot color={channel?.color ?? '#999'} />
            {rule.channel}
          </span>
        </td>
        <td style={{ minWidth: 250 }}>
          <div className="cp-ptypes">
            {platforms.map((p) => {
              const on = rule.platforms.includes(p)
              return (
                <span key={p} className={`cp-ptype${on ? ' cp-ptype--on' : ''}`}>
                  <button
                    type="button"
                    className="nr-pill"
                    aria-pressed={on}
                    aria-label={`${label}: ${p}`}
                    title={p}
                    onClick={() => set({ platforms: on ? rule.platforms.filter((x) => x !== p) : plan.platforms.filter((x) => x === p || rule.platforms.includes(x)) })}
                  >
                    <PlatformIcon platform={p} size={13} />
                    {p}
                  </button>
                  {on && (
                    <input
                      className="cp-ptype__in"
                      aria-label={`Что выходит: ${label}, ${p}`}
                      value={rule.types?.[p] ?? ''}
                      placeholder={typeOf({ ...rule, types: {} }, p)}
                      onChange={(e) => set({ types: { ...rule.types, [p]: e.target.value } })}
                    />
                  )}
                </span>
              )
            })}
          </div>
        </td>
        {rule.days.map((on, i) => (
          <td key={i} className={`cp-daycell${i === SAT ? ' cp-daycell--rest' : ''}`}>
            <button
              type="button"
              className="cp-daytoggle"
              aria-pressed={on}
              aria-label={`${label}: ${WEEKDAYS[i]}`}
              onClick={() => set({ days: rule.days.map((v, j) => (j === i ? !v : v)) })}
            >
              {on ? '●' : ''}
            </button>
            {rule.dayNotes[i] && on && <span className="cp-daynote">{rule.dayNotes[i]}</span>}
          </td>
        ))}
        <td>
          <input className="nr-field nr-field--sm" style={{ width: 118 }} type="time" step={900} aria-label={`Время: ${label}`} value={rule.time} onChange={(e) => e.target.value && set({ time: e.target.value })} />
        </td>
        <td>
          <input className="nr-field nr-field--sm" style={{ width: 56 }} type="number" min={1} max={20} aria-label="Лимит в день" value={rule.limit} onChange={(e) => set({ limit: Math.max(1, Number(e.target.value) || 1) })} />
        </td>
        <td>
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" aria-expanded={slots} onClick={() => setSlots(!slots)}>Слоты…</button>
        </td>
      </tr>
      {slots && (
        <tr>
          <td colSpan={COLS}>
            <form
              style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
              onSubmit={(e) => {
                e.preventDefault()
                const next = createSlots(plan, rule.id, from, to)
                const heads = (p: typeof plan) => p.items.filter((x) => x.ruleId === rule.id && !x.derive).length
                const n = heads(next) - heads(plan)
                if (n) dispatch({ type: 'replace', plan: next })
                setSlots(false)
                toast(n ? `Создано слотов «${label}»: ${n}` : 'Свободных дней в этом периоде нет', n > 0)
              }}
            >
              <span className="cp-muted">Создать слоты «…» на дни формата, где его ещё нет: с</span>
              <input className="nr-field nr-field--sm" style={{ width: 150 }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="С даты" />
              <span className="cp-muted">по</span>
              <input className="nr-field nr-field--sm" style={{ width: 150 }} type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="По дату" />
              <button type="submit" className="nr-btn nr-btn--primary nr-btn--sm">Создать</button>
            </form>
          </td>
        </tr>
      )}
    </>
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
  const rest = wd === SAT ? { background: 'var(--cp-rest)' } : undefined
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
                  {head && <div className="cp-tweek__head" style={{ color: colorOf(l.channelId) }}>{l.header}</div>}
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
    <section className="cp-channel nr-panel" aria-label={channel.name}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input className="cp-color" type="color" value={channel.color} aria-label={`Цвет ${channel.name}`} onChange={(e) => set({ color: e.target.value })} />
        <input className="nr-field nr-field--sm" style={{ fontWeight: 700, color: channel.color }} aria-label="Название канала" value={channel.name} onChange={(e) => set({ name: e.target.value })} />
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
      className="cp-channel nr-panel"
      style={{ borderStyle: 'dashed', boxShadow: 'none' }}
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
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="nr-btn nr-btn--secondary nr-btn--sm" disabled={!name.trim()}>Добавить канал</button>
        <IconButton icon="spark" label="Дальше добавьте ему рубрики в таблице выше" size="sm" onClick={() => document.getElementById('rules-h')?.scrollIntoView({ behavior: 'smooth' })} />
      </div>
    </form>
  )
}
