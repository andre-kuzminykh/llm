// SMM в окне другой страницы — Neuronium открыл его у себя (nr-launch/1). Условие то же, что проверяет
// e2e/nr-launch.mjs: window.top !== window.self. Тогда меню отделов одно — у Neuronium (FR-CP-069).

/** Показан ли SMM во фрейме: у страницы свой top. Браузер не дал заглянуть в top — тоже фрейм. */
export function inFrame(win: Window = window): boolean {
  try {
    return win.top !== win.self
  } catch {
    return true
  }
}

/** Как зовётся меню профиля: на своём адресе — «Профиль» (кружок аккаунта), в окне Neuronium — «Настройки» (шестерёнка:
 *  аккаунт там у Neuronium, FR-CP-070). Слово выбирается здесь, по тому же условию, — подсказки берут его отсюда. */
export function profileName(framed: boolean = inFrame()): 'Профиль' | 'Настройки' {
  return framed ? 'Настройки' : 'Профиль'
}
