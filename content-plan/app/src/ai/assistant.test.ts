import { edit, errorText, getSample, resetAssistant, visual, write } from './assistant'

const ctx = { title: 'Тема', formats: ['Пост'], limit: 2000, body: 'Первое предложение. Второе предложение.' }
type Win = { claude?: unknown }

describe('T-CP-083 FR-CP-083 ассистент: Claude в опубликованной странице, иначе — локальный, честно без ИИ', () => {
  afterEach(() => {
    delete (globalThis as Win).claude
    resetAssistant()
  })

  it('Claude нет (HTML с диска, тесты) — локальный помощник', async () => {
    expect(await getSample()).toBeNull()
    expect((await write([], 'черновик', ctx)).engine).toBe('local')
    expect((await edit('добавь призыв', ctx)).engine).toBe('local')
  })

  it('Claude есть: «Пишет» — потоком; «Правит» — JSON правок по месту; картинка — SVG из блока кода; «не разрешили» — дальше локальный', async () => {
    const calls: unknown[] = []
    const sample = Object.assign(
      async (input: unknown, opts?: { onText?: (u: { text: string; delta: string }) => void }) => {
        calls.push(input)
        if (typeof input === 'string' && input.includes('<svg')) return { text: '```svg\n<svg viewBox="0 0 10 10"><script>x</script><rect/></svg>\n```', truncated: false }
        opts?.onText?.({ text: 'Часть', delta: 'Часть' })
        opts?.onText?.({ text: 'Часть ответа', delta: ' ответа' })
        return { text: 'Часть ответа', truncated: false }
      },
      { json: async () => ({ edits: [{ find: 'Второе предложение.', replace: 'Второе — короче.' }], note: 'Сократил.' }) },
    )
    ;(globalThis as Win).claude = { use: async (n: string) => (n === 'sample' ? sample : null) }
    const seen: string[] = []
    const w = await write([], 'напиши вступление', ctx, { onText: (t) => seen.push(t) })
    expect([w.engine, w.text, seen]).toEqual(['claude', 'Часть ответа', ['Часть', 'Часть ответа']])
    const turns = calls[0] as { role: string; content: string }[]
    expect([turns[0].role, turns.at(-1)!.content]).toEqual(['user', 'напиши вступление'])
    expect(turns[0].content).toContain('<doc>\nПервое предложение. Второе предложение.\n</doc>')
    expect(await edit('сократи', ctx)).toEqual({ edits: [{ find: 'Второе предложение.', replace: 'Второе — короче.' }], note: 'Сократил.', engine: 'claude' })
    const v = await visual('picture', '', ctx)
    expect([v.engine, v.svg, v.markup]).toEqual(['claude', true, '<svg viewBox="0 0 10 10"><script>x</script><rect/></svg>'])
    // зритель не разрешил — дальше локальный, до перезагрузки
    expect(errorText({ code: 'not_granted' })).toMatch(/локальный помощник/)
    expect(await getSample()).toBeNull()
    expect(errorText({ code: 'rate_limited' })).toBe('Слишком часто — попробуйте через минуту.')
  })
})
