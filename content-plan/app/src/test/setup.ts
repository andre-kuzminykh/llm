import '@testing-library/jest-dom/vitest'

// в jsdom нет PointerEvent: карточки переносятся указателем — нужен clientX/Y, pointerId и pointerType
if (typeof window.PointerEvent !== 'function') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    pointerType: string
    isPrimary: boolean
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
      this.pointerType = init.pointerType ?? 'mouse'
      this.isPrimary = init.isPrimary ?? true
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent
}

// «Демо» помнится в модуле — каждый тест начинает с того, что лежит в localStorage
import { resetDemo } from '../ui/demo'
beforeEach(() => resetDemo())
