import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../App'
import { resetAssistant } from '../ai/assistant'
import { memoryStorage } from '../model/storage'
import { emptyPlan } from '../model/types'

type Win = { claude?: unknown }
async function open(section = 'text') {
  localStorage.clear()
  localStorage.setItem('cp:section', JSON.stringify(section))
  render(<App storage={async () => memoryStorage()} initialPlan={emptyPlan('2026-11-14')} />)
  await screen.findByRole('navigation', { name: 'SMM' })
}
const nav = () => screen.getByRole('navigation', { name: 'SMM' })

describe('T-CP-083 FR-CP-083 «Текст»: редактор поста — поле ассистента внизу, диалог справа; пишет, правит по месту, генерирует медиа', () => {
  afterEach(() => {
    delete (globalThis as Win).claude
    resetAssistant()
  })

  it('без ИИ: «Новый текст» → редактор; поле внизу — написали, справа диалог; «Вставить»; длина, лимит; «Правит» по месту и «Отменить правки»; инфографика и картинка в медиа; «Как выйдет»', async () => {
    await open()
    expect(screen.getByRole('heading', { name: 'Текст' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Новый текст' }))
    expect(screen.getByRole('heading', { name: 'Новый текст' })).toBeInTheDocument()
    // поле ассистента — внизу по центру; диалога справа ещё нет
    expect(screen.queryByRole('complementary', { name: 'Ассистент' })).toBeNull()
    await userEvent.type(screen.getByRole('textbox', { name: 'Ассистенту' }), 'Черновик по теме{Enter}')
    const aside = screen.getByRole('complementary', { name: 'Ассистент' })
    expect(within(aside).getByText('Без ИИ')).toBeInTheDocument()
    const log = within(aside).getByRole('log', { name: 'Диалог' })
    expect(log).toHaveTextContent('Черновик по теме')
    await userEvent.click(within(log).getByRole('button', { name: 'Вставить' }))
    const text = screen.getByRole('textbox', { name: 'Текст поста' }) as HTMLTextAreaElement
    expect(text.value).toMatch(/^# Новый текст\n\nНовый текст — коротко и по делу\./)
    expect(screen.getByLabelText(/^Знаков: \d+ из 2000$/)).toBeInTheDocument()
    // подпись до 1000 и длинный текст — больше лимита
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Длина' }), '1000')
    const long = Array.from({ length: 8 }, (_, i) => `Абзац ${i + 1}. ${'Длинное предложение про агентов и бухгалтерию. '.repeat(6)}`).join('\n\n')
    fireEvent.change(text, { target: { value: long } })
    expect(screen.getByRole('alert')).toHaveTextContent(/^Больше лимита на/)
    // «Правит»: сократи до лимита — правки по месту, видно что поменялось; «Отменить правки» — как было
    await userEvent.click(within(aside).getByRole('radio', { name: 'Правит' }))
    await userEvent.click(within(aside).getByRole('button', { name: 'Сократи до лимита' }))
    const edits = within(aside).getAllByLabelText('Правки').at(-1)!
    expect(edits.querySelectorAll('del').length).toBeGreaterThan(0)
    const n = Number(screen.getByLabelText(/^Знаков:/).getAttribute('aria-label')!.match(/\d+/)![0])
    expect(n).toBeLessThanOrEqual(1000)
    expect(screen.queryByText(/^Больше лимита на/)).toBeNull()
    await userEvent.click(within(edits).getByRole('button', { name: 'Отменить правки' }))
    expect((screen.getByRole('textbox', { name: 'Текст поста' }) as HTMLTextAreaElement).value).toBe(long)
    // «Сгенерировать»: инфографика — HTML в песочнице без скриптов; картинка — SVG
    await userEvent.click(within(aside).getByRole('button', { name: 'Сгенерировать' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^Инфографику/ }))
    await userEvent.click(within(aside).getByRole('button', { name: 'Сгенерировать' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^Картинку/ }))
    const media = screen.getByRole('list', { name: 'Медиа' })
    expect(within(media).getAllByRole('listitem')).toHaveLength(2)
    expect(media.querySelector('iframe')).toHaveAttribute('sandbox', '')
    expect(media.querySelector('img')!.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    // «Как выйдет» — разметка и медиа
    fireEvent.change(screen.getByRole('textbox', { name: 'Текст поста' }), { target: { value: '# Итоги\n\n**Главное**: агенты закрывают месяц.' } })
    await userEvent.click(screen.getByRole('radio', { name: 'Как выйдет' }))
    const pv = screen.getByRole('article', { name: 'Как выйдет' })
    expect(within(pv).getByRole('heading', { name: 'Итоги' })).toBeInTheDocument()
    expect(pv.querySelector('b')).toHaveTextContent('Главное')
    // назад — в списке «Пишется»; «Картинки» — сгенерированное
    await waitFor(() => expect(screen.getByText('Сохранено', { selector: '.cp-ed__saved' })).toBeInTheDocument(), { timeout: 2000 })
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть редактор' }))
    expect(within(screen.getByRole('region', { name: 'Пишется' })).getByRole('button', { name: /Новый текст[\s\S]*знаков · медиа 2/ })).toBeInTheDocument()
    await userEvent.click(within(nav()).getByRole('button', { name: 'Картинки — фото, инфографика, анимации' }))
    expect(within(screen.getByRole('list', { name: 'Картинки' })).getAllByRole('listitem')).toHaveLength(2)
  })

  it('с Claude: ответ — от модели (метка «Claude»), «Правит» — правки JSON по месту', async () => {
    const sample = Object.assign(async (_input: unknown, opts?: { onText?: (u: { text: string; delta: string }) => void }) => {
      opts?.onText?.({ text: 'Агенты закрывают месяц за день.', delta: 'Агенты закрывают месяц за день.' })
      return { text: 'Агенты закрывают месяц за день.', truncated: false }
    }, { json: async () => ({ edits: [{ find: 'за день', replace: 'за один день' }], note: 'Уточнил срок.' }) })
    ;(globalThis as Win).claude = { use: async () => sample }
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Новый текст' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Ассистенту' }), 'Первая строка про агентов{Enter}')
    const aside = screen.getByRole('complementary', { name: 'Ассистент' })
    await waitFor(() => expect(within(aside).getByText('Claude', { selector: '.cp-ed__engine' })).toBeInTheDocument())
    await userEvent.click(within(aside).getByRole('button', { name: 'В конец' }))
    expect(screen.getByRole('textbox', { name: 'Текст поста' })).toHaveValue('Агенты закрывают месяц за день.')
    await userEvent.click(within(aside).getByRole('radio', { name: 'Правит' }))
    await userEvent.type(within(aside).getByRole('textbox', { name: 'Ассистенту' }), 'Уточни срок{Enter}')
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Текст поста' })).toHaveValue('Агенты закрывают месяц за один день.'))
    expect(within(aside).getByText('Уточнил срок.')).toBeInTheDocument()
  })

  it('«Видео» — студия NR SMM (скоро), «Озвучка», «Автопостинг», «Комменты» — что там будет', async () => {
    await open('feed')
    await userEvent.click(within(nav()).getByRole('button', { name: 'Видео — студия NR SMM' }))
    expect(screen.getByRole('heading', { name: 'Студия NR SMM' })).toBeInTheDocument()
    for (const [label, title] of [['Озвучка (скоро)', 'Озвучка'], ['Автопостинг (скоро)', 'Автопостинг'], ['Комменты (скоро)', 'Комменты']]) {
      await userEvent.click(within(nav()).getByRole('button', { name: label }))
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
      expect(screen.getByText('скоро', { selector: '.cp-sec__head .cp-soon' })).toBeInTheDocument()
    }
  })
})
