import { inFrame, profileName } from './frame'

describe('T-CP-069 FR-CP-069 NFR-CP-008 окно Neuronium или свой адрес: window.top !== window.self', () => {
  it('свой адрес — top и self одно окно; в окне другой страницы — разные; top недоступен — тоже окно', () => {
    const own = {} as { top: unknown; self: unknown }
    own.top = own
    own.self = own
    expect(inFrame(own as unknown as Window)).toBe(false)
    expect(inFrame({ top: {}, self: {} } as unknown as Window)).toBe(true)
    const locked = {
      self: {},
      get top(): Window {
        throw new DOMException('Blocked a frame from accessing a cross-origin frame', 'SecurityError')
      },
    }
    expect(inFrame(locked as unknown as Window)).toBe(true)
  })
  it('без аргумента смотрит на эту страницу: в тестах она своя, во фрейме — нет', () => {
    expect(inFrame()).toBe(false)
    const top = vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window)
    expect(inFrame()).toBe(true)
    top.mockRestore()
    expect(inFrame()).toBe(false)
  })
})

describe('T-CP-070 FR-CP-070 как зовётся меню профиля: слово выбирается в одном месте, по тому же условию', () => {
  it('свой адрес — «Профиль», окно Neuronium — «Настройки»', () => {
    expect(profileName(false)).toBe('Профиль')
    expect(profileName(true)).toBe('Настройки')
  })
  it('без аргумента смотрит на эту страницу — как inFrame()', () => {
    expect(profileName()).toBe('Профиль')
    const top = vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window)
    expect(profileName()).toBe('Настройки')
    top.mockRestore()
    expect(profileName()).toBe('Профиль')
  })
})
