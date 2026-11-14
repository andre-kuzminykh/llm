import { localEdits, localVisual, localWrite } from '../ai/assistant'
import { applyEdits, charCount, htmlDoc, mdToHtml, pickMarkup, plainText, safeHtml, signs } from './post'

const ctx = (body: string, limit = 2000) => ({ title: 'ИИ-агенты в бухгалтерии', note: 'Кейс: закрытие месяца за день\nСэкономили 40 часов', formats: ['Пост'], limit, body })

describe('T-CP-083 FR-CP-083 пост: длина, правки по месту, безопасная разметка', () => {
  it('знаки — как увидит читатель: без решёток, звёздочек и маркеров цитат; эмодзи — один знак; склонение', () => {
    expect(plainText('# Заголовок\n**жирный** и *курсив*\n> цитата')).toBe('Заголовок\nжирный и курсив\nцитата')
    expect(charCount('👍 да')).toBe(4)
    expect([signs(1), signs(24), signs(5), signs(11), signs(1000)].map((x) => x.replace(/\u00a0/g, ' '))).toEqual(['1 знак', '24 знака', '5 знаков', '11 знаков', '1 000 знаков'])
  })

  it('правки по месту: кусок меняется только он; не нашёлся — пропущен; пустой find — в конец', () => {
    const r = applyEdits('Первое. Второе. Третье.', [
      { find: 'Второе.', replace: 'Второе — важное.' },
      { find: 'Нет такого', replace: 'x' },
      { find: '', replace: 'Пишите в комментарии.' },
    ])
    expect(r.body).toBe('Первое. Второе — важное. Третье.\n\nПишите в комментарии.')
    expect([r.applied.length, r.missed.length]).toEqual([2, 1])
  })

  it('«Как выйдет» — экранировано: теги из текста не становятся разметкой, ссылки — только http(s); заголовки, списки, цитаты, топики', () => {
    const html = mdToHtml('# Тема\n**важно** <script>alert(1)</script>\n- раз\n- два\n> цитата\n[сайт](https://x.ru) [плохо](javascript:alert(1)) #ии')
    expect(html).toContain('<h2>Тема</h2>')
    expect(html).toContain('<b>важно</b> &lt;script&gt;')
    expect(html).toContain('<ul><li>раз</li><li>два</li></ul>')
    expect(html).toContain('<blockquote>цитата</blockquote>')
    expect(html).toContain('<a href="https://x.ru" target="_blank" rel="noopener noreferrer">сайт</a>')
    expect(html).not.toContain('href="javascript')
    expect(html).toContain('<span class="cp-md__tag">#ии</span>')
  })

  it('сгенерированное HTML и SVG — без скриптов, обработчиков, фреймов и внешних адресов; разметка — из блока кода', () => {
    const dirty = '<div onclick="x()"><script>steal()</script><img src="https://evil/x.png"><iframe src="//a"></iframe><style>@import url(https://f.css); .a{background:url(https://b/c.png)}</style>ok</div>'
    const clean = safeHtml(dirty)
    expect(clean).not.toMatch(/script|onclick|https:|iframe|@import/)
    expect(clean).toContain('ok')
    expect(htmlDoc('<div>a</div>')).toMatch(/^<!doctype html>/)
    expect(pickMarkup('Вот:\n```svg\n<svg viewBox="0 0 1 1"></svg>\n```', 'svg')).toBe('<svg viewBox="0 0 1 1"></svg>')
    expect(pickMarkup('```html\n<style>.a{}</style><div class="a">x</div>\n```', 'html')).toBe('<style>.a{}</style><div class="a">x</div>')
    expect(pickMarkup('просто текст', 'svg')).toBeNull()
  })

  it('локальный помощник (без ИИ): набросок по теме и заметке, сокращает до лимита, абзацы, заголовок, список, призыв; картинка и инфографика — без скриптов', () => {
    expect(localWrite('черновик', ctx(''))).toMatch(/^# ИИ-агенты в бухгалтерии[\s\S]*- Кейс: закрытие месяца за день[\s\S]*- Сэкономили 40 часов/)
    const long = Array.from({ length: 8 }, (_, i) => `Абзац ${i + 1}. ${'Длинное предложение про агентов и бухгалтерию. '.repeat(6)}`).join('\n\n')
    const cut = localEdits('Сократи до лимита', ctx(long, 1000))
    const after = applyEdits(long, cut.edits).body
    expect(charCount(long)).toBeGreaterThan(1000)
    expect(charCount(after)).toBeLessThanOrEqual(1000)
    expect(localEdits('Разбей на абзацы', ctx('Раз. Два. Три. Четыре. ' + 'Пять шесть семь восемь девять десять. '.repeat(10))).edits).toHaveLength(1)
    expect(localEdits('Добавь заголовок', ctx('Текст поста.')).edits[0].replace).toBe('# ИИ-агенты в бухгалтерии\n\nТекст поста.')
    expect(localEdits('Сделай из абзаца список', ctx('Раз. Два. Три.')).edits[0].replace).toBe('- Раз\n- Два\n- Три')
    expect(localEdits('Добавь призыв', ctx('Текст.')).edits).toEqual([{ find: '', replace: 'А как у вас? Напишите в комментариях.' }])
    expect(localVisual('picture', '', ctx(''))).toMatch(/^<svg[\s\S]*ИИ-агенты[\s\S]*<\/svg>$/)
    const info = localVisual('infographic', '', ctx(''))
    expect(info).toContain('Кейс: закрытие месяца за день')
    expect(info).not.toMatch(/<script/)
    expect(localVisual('animation', '', ctx(''))).toContain('@keyframes')
  })
})
