import { useMemo, useState } from 'react'
import { addMonths, monthKey, SAT, WEEKDAYS } from '../model/dates'
import { weekTemplate, type TemplateLine } from '../model/rules'
import { createSlots } from '../model/store'
import type { Channel, Rubric } from '../model/types'
import { ChannelDot, IconButton } from '../ui/bits'
import { usePlan } from '../ui/ctx'
import { TopBar } from '../ui/TopBar'

/** Сетка: правила рубрик (дни, площадки, лимит), типовая неделя из них и каналы. */
export function RulesView() {
  const { plan } = usePlan()
  return (
    <>
      <TopBar title="Сетка" side={false} />
      <div className="cp-body nr-scroll">
        <div className="cp-rules">
          <section aria-labelledby="rules-h">
            <h2 className="cp-section-title" id="rules-h">Рубрики</h2>
            <p className="cp-hint" style={{ marginBottom: 10 }}>
              Дни, площадки и лимит в день. По ним считается «Проверка»; «Слоты» создают пустые места под темы на дни рубрики.
            </p>
            <div style={{ overflowX: 'auto' }} className="nr-scroll">
              <RubricTable />
            </div>
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

function RubricTable() {
  const { plan } = usePlan()
  return (
    <table className="cp-table" style={{ minWidth: 1100 }}>
      <thead>
        <tr>
          <th>Рубрика</th>
          <th>Площадки</th>
          {WEEKDAYS.map((w, i) => (
            <th key={w} className={`cp-daycell${i === SAT ? ' cp-daycell--rest' : ''}`}>{w}</th>
          ))}
          <th>Лимит</th>
          <th>Частота</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {plan.channels.map((c) => (
          <ChannelRubrics key={c.id} channel={c} rubrics={plan.rubrics.filter((r) => r.channelId === c.id)} />
        ))}
      </tbody>
    </table>
  )
}

function ChannelRubrics({ channel, rubrics }: { channel: Channel; rubrics: Rubric[] }) {
  const { dispatch } = usePlan()
  const [name, setName] = useState('')
  return (
    <>
      <tr className="cp-table__group">
        <td colSpan={12} style={{ color: channel.color }}>
          <span className="cp-ch" style={{ color: channel.color }}>
            <ChannelDot color={channel.color} />
            {channel.name}
          </span>
        </td>
      </tr>
      {rubrics.map((r) => (
        <RubricRow key={r.id} rubric={r} channel={channel} />
      ))}
      <tr>
        <td colSpan={12}>
          <form
            style={{ display: 'flex', gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault()
              dispatch({ type: 'addRubric', channelId: channel.id, name })
              setName('')
            }}
          >
            <input className="nr-field nr-field--sm" style={{ maxWidth: 280 }} placeholder={`Новая рубрика ${channel.name}`} aria-label={`Новая рубрика ${channel.name}`} value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="nr-btn nr-btn--ghost nr-btn--sm" disabled={!name.trim()}>+ Рубрика</button>
          </form>
        </td>
      </tr>
    </>
  )
}

function RubricRow({ rubric, channel }: { rubric: Rubric; channel: Channel }) {
  const { plan, dispatch, toast, anchor } = usePlan()
  const [slots, setSlots] = useState(false)
  const [from, setFrom] = useState(anchor)
  const [to, setTo] = useState(`${addMonths(monthKey(anchor), 3)}-01`)
  const set = (patch: Partial<Rubric>) => dispatch({ type: 'rubric', id: rubric.id, patch })
  const platforms = plan.platforms.filter((p) => channel.platforms.includes(p) || rubric.platforms.includes(p))
  return (
    <>
      <tr>
        <td style={{ minWidth: 220 }}>
          <input className="nr-field nr-field--sm" aria-label="Название рубрики" value={rubric.name} onChange={(e) => set({ name: e.target.value })} />
          {rubric.what && <div className="cp-muted" style={{ marginTop: 2 }}>{rubric.what}</div>}
        </td>
        <td style={{ minWidth: 220 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                className="nr-pill"
                style={{ height: 24, fontSize: 11 }}
                aria-pressed={rubric.platforms.includes(p)}
                onClick={() => set({ platforms: rubric.platforms.includes(p) ? rubric.platforms.filter((x) => x !== p) : plan.platforms.filter((x) => x === p || rubric.platforms.includes(x)) })}
              >
                {p}
              </button>
            ))}
          </div>
        </td>
        {rubric.days.map((on, i) => (
          <td key={i} className={`cp-daycell${i === SAT ? ' cp-daycell--rest' : ''}`}>
            <button
              type="button"
              className="cp-daytoggle"
              aria-pressed={on}
              aria-label={`${rubric.name}: ${WEEKDAYS[i]}`}
              onClick={() => set({ days: rubric.days.map((v, j) => (j === i ? !v : v)) })}
            >
              {on ? '●' : ''}
            </button>
            {rubric.dayNotes[i] && on && <span className="cp-daynote">{rubric.dayNotes[i]}</span>}
          </td>
        ))}
        <td>
          <input className="nr-field nr-field--sm" style={{ width: 56 }} type="number" min={1} max={20} aria-label="Лимит в день" value={rubric.limit} onChange={(e) => set({ limit: Math.max(1, Number(e.target.value) || 1) })} />
        </td>
        <td style={{ minWidth: 170 }}>
          <input className="nr-field nr-field--sm" aria-label="Частота" value={rubric.freq} onChange={(e) => set({ freq: e.target.value })} />
        </td>
        <td>
          <button type="button" className="nr-btn nr-btn--ghost nr-btn--sm" aria-expanded={slots} onClick={() => setSlots(!slots)}>Слоты…</button>
        </td>
      </tr>
      {slots && (
        <tr>
          <td colSpan={12}>
            <form
              style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
              onSubmit={(e) => {
                e.preventDefault()
                const next = createSlots(plan, rubric.id, from, to)
                const heads = (p: typeof plan) => p.items.filter((x) => x.rubricId === rubric.id && !x.derive).length
                const n = heads(next) - heads(plan)
                if (n) dispatch({ type: 'replace', plan: next })
                setSlots(false)
                toast(n ? `Создано слотов «${rubric.name}»: ${n}` : 'Свободных дней рубрики в этом периоде нет', n > 0)
              }}
            >
              <span className="cp-muted">Создать слоты «…» на дни рубрики, где её ещё нет: с</span>
              <input className="nr-field nr-field--sm" style={{ width: 150 }} type="date" value={from} min={plan.start} max={plan.end} onChange={(e) => setFrom(e.target.value)} aria-label="С даты" />
              <span className="cp-muted">по</span>
              <input className="nr-field nr-field--sm" style={{ width: 150 }} type="date" value={to} min={plan.start} max={plan.end} onChange={(e) => setTo(e.target.value)} aria-label="По дату" />
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
                <div key={l.rubric.id}>
                  {head && <div className="cp-tweek__head" style={{ color: colorOf(l.channelId) }}>{l.header}</div>}
                  <div className="cp-tweek__line">• {l.rubric.name}{l.note ? ` (${l.note})` : ''}</div>
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
