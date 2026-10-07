// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useOpenShortcut } from './useOpenShortcut'

const press = (target: Element, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...init })
  )

const mount = (html: string) => {
  document.body.innerHTML = html
  const open = vi.fn()
  renderHook(() => useOpenShortcut(open, true))
  return open
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('useOpenShortcut', () => {
  it('opens on Enter away from any control', () => {
    const open = mount('<p>setup</p>')
    press(document.querySelector('p')!)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('leaves Enter on a button to that button, and opens with a modifier', () => {
    const open = mount('<button>Shuffle</button>')
    const button = document.querySelector('button')!
    press(button)
    expect(open).not.toHaveBeenCalled()
    press(button, { ctrlKey: true })
    press(button, { metaKey: true })
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('opens with a modifier on a button that stops the Enter it presses', () => {
    const open = mount('<button>Shuffle</button>')
    const button = document.querySelector('button')!
    button.addEventListener('keydown', (event) => event.stopPropagation())
    press(button, { ctrlKey: true })
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('leaves plain Enter to a menu item that keeps it', () => {
    const open = mount('<div role="menuitem" tabindex="0">Pin</div>')
    const item = document.querySelector('[role="menuitem"]')!
    const action = vi.fn()
    item.addEventListener('keydown', (event) => {
      event.stopPropagation()
      action()
    })
    press(item)
    expect(action).toHaveBeenCalledTimes(1)
    expect(open).not.toHaveBeenCalled()
  })

  it('never opens from a text field, nor on Shift or Alt with Enter', () => {
    const open = mount('<input /><p>setup</p>')
    press(document.querySelector('input')!, { ctrlKey: true })
    press(document.querySelector('p')!, { shiftKey: true })
    press(document.querySelector('p')!, { altKey: true })
    expect(open).not.toHaveBeenCalled()
  })

  it('stops listening while disabled', () => {
    document.body.innerHTML = '<p>setup</p>'
    const open = vi.fn()
    renderHook(() => useOpenShortcut(open, false))
    press(document.querySelector('p')!)
    expect(open).not.toHaveBeenCalled()
  })
})
