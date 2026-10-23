import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotificationType } from '../NotificationType'
import { toastQueue } from './ToastProvider'

vi.mock('./ToastRegion', () => ({ ToastRegion: () => null }))

afterEach(() => {
  toastQueue.clear()
  vi.useRealTimers()
})

const addNotification = (message: string) =>
  toastQueue.add({ type: NotificationType.MessageReceived, message })

describe('notification queue', () => {
  it('keeps only the five newest notifications after a burst', () => {
    for (let index = 0; index < 100; index++) {
      addNotification(`Message ${index}`)
    }

    expect(
      toastQueue.visibleToasts.map((toast) => toast.content.message)
    ).toEqual([
      'Message 99',
      'Message 98',
      'Message 97',
      'Message 96',
      'Message 95',
    ])

    for (const toast of toastQueue.visibleToasts) {
      toastQueue.close(toast.key)
    }

    expect(toastQueue.visibleToasts).toEqual([])
  })

  it('discards the oldest notification without running its close action', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const oldestKey = toastQueue.add(
      { type: NotificationType.MessageReceived, message: 'Oldest' },
      { onClose, timeout: 1000 }
    )
    toastQueue.resumeAll()
    for (const message of ['Second', 'Third', 'Fourth', 'Fifth', 'Newest']) {
      addNotification(message)
    }

    expect(
      toastQueue.visibleToasts.map((toast) => toast.content.message)
    ).toEqual(['Newest', 'Fifth', 'Fourth', 'Third', 'Second'])
    expect(onClose).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)

    toastQueue.close(oldestKey)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('still runs the close action when a retained notification times out', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    toastQueue.add(
      { type: NotificationType.MessageReceived, message: 'Timed message' },
      { onClose, timeout: 1000 }
    )
    toastQueue.resumeAll()

    vi.advanceTimersByTime(1000)

    expect(toastQueue.visibleToasts).toEqual([])
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('uses a free slot after dismissal without removing another notification', () => {
    for (const message of ['First', 'Second', 'Third', 'Fourth', 'Fifth']) {
      addNotification(message)
    }
    toastQueue.close(toastQueue.visibleToasts[0].key)
    addNotification('Newest')

    expect(
      toastQueue.visibleToasts.map((toast) => toast.content.message)
    ).toEqual(['Newest', 'Fourth', 'Third', 'Second', 'First'])
  })
})
