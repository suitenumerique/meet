import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Participant } from 'livekit-client'
import { NotificationToastQueue } from './NotificationToastQueue'
import { NoisyNotificationBatcher } from './NoisyNotificationBatcher'
import { NotificationType as Type } from './NotificationType'
import type { ToastData } from './components/ToastProvider'

const participant = (identity: string) =>
  ({ identity, name: identity }) as Participant
let queue: NotificationToastQueue
beforeEach(() => {
  vi.useFakeTimers()
  queue = new NotificationToastQueue()
})
afterEach(() => {
  queue.clear()
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('notification priority and lifecycle', () => {
  it('keeps recording, permissions and action prompts during noisy bursts', () => {
    const action = vi.fn()
    const protectedKeys = [
      queue.add({ type: Type.ScreenRecordingStarted }),
      queue.add({ type: Type.PermissionsRemoved }),
      queue.add({ type: Type.LowerHand }, { onClose: action }),
      queue.add({ type: Type.RoleChanged }),
    ]
    for (let i = 0; i < 100; i++) {
      queue.add({ type: Type.MessageReceived, message: `${i}` })
      queue.add({
        type: Type.ParticipantJoined,
        participant: participant(`${i}`),
      })
    }
    expect(queue.visibleToasts).toHaveLength(5)
    for (const key of protectedKeys) expect(queue.has(key)).toBe(true)
    expect(action).not.toHaveBeenCalled()
    queue.discardWhere((content) => content.type === Type.ParticipantJoined)
    for (const key of protectedKeys) queue.close(key)
    expect(queue.visibleToasts).toEqual([])
    expect(action).toHaveBeenCalledOnce()
  })

  it('never evicts even noisy-typed notifications with a close action', () => {
    const action = vi.fn()
    const keys = Array.from({ length: 5 }, () =>
      queue.add({ type: Type.MessageReceived }, { onClose: action })
    )
    expect(queue.add({ type: Type.MessageReceived })).toBe('')
    expect(queue.visibleToasts.map((toast) => toast.key).sort()).toEqual(
      keys.sort()
    )
    expect(action).not.toHaveBeenCalled()
  })

  it('retains all-important overflow for later display without a noisy backlog', () => {
    const keys = Array.from({ length: 7 }, () =>
      queue.add({ type: Type.RoleChanged })
    )
    expect(queue.add({ type: Type.HandRaised })).toBe('')
    for (const key of keys.reverse()) queue.close(key)
    expect(queue.visibleToasts).toEqual([])
  })

  it('updates a noisy toast in place, preserving its key and paused timer', () => {
    const key = queue.add(
      { type: Type.MessageReceived, count: 1 },
      { timeout: 5000 }
    )
    queue.resumeAll()
    vi.advanceTimersByTime(1000)
    queue.pauseAll()
    const timer = queue.visibleToasts[0].timer
    const notify = vi.fn()
    const unsubscribe = queue.subscribe(notify)
    expect(
      queue.add({ type: Type.MessageReceived, count: 100 }, { timeout: 5000 })
    ).toBe(key)
    expect(queue.visibleToasts[0].timer).toBe(timer)
    expect(queue.visibleToasts[0].content.count).toBe(100)
    expect(notify).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(10000)
    expect(queue.has(key)).toBe(true)
    queue.resumeAll()
    vi.advanceTimersByTime(4000)
    expect(queue.has(key)).toBe(false)
    unsubscribe()
  })

  it('discards an obsolete hidden lower-hand prompt without running its action', () => {
    const action = vi.fn()
    const key = queue.add(
      { type: Type.LowerHand },
      { onClose: action, timeout: 3000 }
    )
    queue.resumeAll()
    for (let i = 0; i < 5; i++) queue.add({ type: Type.RoleChanged })
    queue.discardWhere((content) => content.type === Type.LowerHand)
    expect(queue.has(key)).toBe(false)
    for (const toast of [...queue.visibleToasts]) queue.close(toast.key)
    vi.advanceTimersByTime(5000)
    expect(queue.visibleToasts).toEqual([])
    expect(action).not.toHaveBeenCalled()
  })

  it('clears visible and hidden timers without invoking prompt actions', () => {
    const action = vi.fn()
    for (let i = 0; i < 8; i++) {
      queue.add({ type: Type.LowerHand }, { timeout: 1000, onClose: action })
      queue.visibleToasts[0].timer?.resume()
    }
    queue.clear()
    expect(vi.getTimerCount()).toBe(0)
    vi.runAllTimers()
    expect(action).not.toHaveBeenCalled()
    expect(queue.visibleToasts).toEqual([])
  })

  it('removes a departed/ lowered hand from a summary without losing others', () => {
    const alice = participant('alice')
    const bob = participant('bob')
    const key = queue.add({
      type: Type.HandRaised,
      participant: alice,
      participants: [alice, bob],
      count: 2,
    })
    queue.removeParticipant(alice, Type.HandRaised)
    expect(queue.visibleToasts[0].content).toMatchObject({
      participant: bob,
      count: 1,
    })
    expect(queue.visibleToasts[0].key).toBe(key)
    queue.removeParticipant(bob, Type.HandRaised)
    expect(queue.visibleToasts).toEqual([])
  })
})

describe('room notification batching', () => {
  const setup = () => {
    const soundAndAnnounce = vi.fn()
    const publish = (content: ToastData, notify = true) => {
      const key = queue.add(content, { timeout: 5000 })
      if (key && notify) soundAndAnnounce(content)
      return key
    }
    const batcher = new NoisyNotificationBatcher(publish, (key) =>
      queue.has(key)
    )
    return { batcher, soundAndAnnounce }
  }

  it('shows the first event immediately and coalesces 100 messages into one slot', () => {
    const { batcher, soundAndAnnounce } = setup()
    for (let i = 0; i < 100; i++)
      batcher.add({
        type: Type.MessageReceived,
        participant: participant('alice'),
        message: `${i}`,
      })
    expect(soundAndAnnounce).toHaveBeenCalledTimes(1)
    expect(queue.visibleToasts[0].content.count).toBe(1)
    const key = queue.visibleToasts[0].key
    vi.advanceTimersByTime(1000)
    expect(soundAndAnnounce).toHaveBeenCalledTimes(2)
    expect(queue.visibleToasts).toHaveLength(1)
    expect(queue.visibleToasts[0].key).toBe(key)
    expect(queue.visibleToasts[0].content).toMatchObject({
      count: 100,
      message: '99',
    })
    batcher.clear()
  })

  it('limits a continuous stream to at most one update per second after the first', () => {
    const { batcher, soundAndAnnounce } = setup()
    for (let i = 0; i < 30; i++) {
      batcher.add({ type: Type.MessageReceived, message: `${i}` })
      vi.advanceTimersByTime(100)
    }
    expect(soundAndAnnounce).toHaveBeenCalledTimes(4)
    batcher.clear()
  })

  it('does not resurrect buffered events after dismissal or timeout', () => {
    const { batcher, soundAndAnnounce } = setup()
    batcher.add({ type: Type.MessageReceived, message: 'first' })
    batcher.add({ type: Type.MessageReceived, message: 'buffered' })
    queue.close(queue.visibleToasts[0].key)
    vi.advanceTimersByTime(2000)
    expect(queue.visibleToasts).toEqual([])
    expect(soundAndAnnounce).toHaveBeenCalledTimes(1)
    batcher.add({ type: Type.MessageReceived, message: 'new after dismissal' })
    expect(queue.visibleToasts[0].content.message).toBe('new after dismissal')
    batcher.clear()
  })

  it('drops a pending noisy batch if important alerts evicted it', () => {
    const { batcher, soundAndAnnounce } = setup()
    batcher.add({ type: Type.ParticipantJoined })
    batcher.add({ type: Type.ParticipantJoined })
    for (let i = 0; i < 5; i++) queue.add({ type: Type.PermissionsRemoved })
    vi.advanceTimersByTime(1000)
    expect(soundAndAnnounce).toHaveBeenCalledTimes(1)
    expect(
      queue.visibleToasts.every(
        (toast) => toast.content.type === Type.PermissionsRemoved
      )
    ).toBe(true)
    batcher.clear()
  })

  it('does not replay pending events after disconnect and a new room', () => {
    const { batcher, soundAndAnnounce } = setup()
    batcher.add({ type: Type.MessageReceived })
    batcher.add({ type: Type.MessageReceived })
    batcher.clear()
    queue.clear()
    vi.runAllTimers()
    expect(soundAndAnnounce).toHaveBeenCalledTimes(1)
    expect(queue.visibleToasts).toEqual([])
    batcher.add({ type: Type.MessageReceived, message: 'new room' })
    expect(queue.visibleToasts[0].content.count).toBe(1)
    batcher.clear()
  })

  it('deduplicates raised-hand attributes and removes a lowered pending hand', () => {
    const { batcher } = setup()
    const alice = participant('alice')
    const bob = participant('bob')
    batcher.add({ type: Type.HandRaised, participant: alice })
    batcher.add({ type: Type.HandRaised, participant: bob })
    batcher.add({ type: Type.HandRaised, participant: bob })
    batcher.removeParticipant(bob, Type.HandRaised)
    queue.removeParticipant(bob, Type.HandRaised)
    vi.advanceTimersByTime(1000)
    expect(queue.visibleToasts[0].content.count).toBe(1)
    expect(queue.visibleToasts[0].content.participants).toEqual([alice])
    batcher.clear()
  })
  it('keeps throttling when noisy types repeatedly evict each other', () => {
    const { batcher, soundAndAnnounce } = setup()
    for (let i = 0; i < 4; i++) queue.add({ type: Type.RoleChanged })
    for (let i = 0; i < 100; i++) {
      batcher.add({
        type: Type.ParticipantJoined,
        participant: participant(`${i}`),
      })
      batcher.add({ type: Type.MessageReceived, message: `${i}` })
    }
    expect(soundAndAnnounce).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1000)
    expect(soundAndAnnounce.mock.calls.length).toBeLessThanOrEqual(4)
    expect(queue.visibleToasts).toHaveLength(5)
    batcher.clear()
  })

  it('waits out the cooldown for new events after dismissal', () => {
    const { batcher, soundAndAnnounce } = setup()
    batcher.add({ type: Type.MessageReceived, message: 'old' })
    queue.close(queue.visibleToasts[0].key)
    batcher.add({ type: Type.MessageReceived, message: 'new' })
    expect(queue.visibleToasts).toEqual([])
    expect(soundAndAnnounce).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(queue.visibleToasts[0].content).toMatchObject({
      message: 'new',
      count: 1,
    })
    batcher.clear()
  })

  it('ignores unrelated departures without swallowing pending hand notifications', () => {
    const { batcher, soundAndAnnounce } = setup()
    batcher.add({ type: Type.HandRaised, participant: participant('alice') })
    batcher.add({ type: Type.HandRaised, participant: participant('bob') })
    batcher.removeParticipant(participant('charlie'))
    expect(queue.visibleToasts[0].content.count).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(soundAndAnnounce).toHaveBeenCalledTimes(2)
    expect(queue.visibleToasts[0].content.count).toBe(2)
    batcher.clear()
  })

  it('retains pending hands when the first displayed participant lowers theirs', () => {
    const { batcher } = setup()
    const alice = participant('alice')
    const bob = participant('bob')
    batcher.add({ type: Type.HandRaised, participant: alice })
    batcher.add({ type: Type.HandRaised, participant: bob })
    batcher.removeParticipant(alice, Type.HandRaised)
    queue.removeParticipant(alice, Type.HandRaised)
    vi.advanceTimersByTime(1000)
    expect(queue.visibleToasts[0].content).toMatchObject({
      participant: bob,
      count: 1,
    })
    batcher.clear()
  })

  it('removes departed join representatives but retains important alerts', () => {
    const { batcher } = setup()
    const alice = participant('alice')
    const bob = participant('bob')
    const recording = queue.add({
      type: Type.ScreenRecordingStarted,
      participant: alice,
    })
    batcher.add({ type: Type.ParticipantJoined, participant: alice })
    batcher.add({ type: Type.ParticipantJoined, participant: bob })
    vi.advanceTimersByTime(1000)
    batcher.removeParticipant(alice)
    queue.removeParticipant(alice)
    expect(queue.has(recording)).toBe(true)
    expect(
      queue.visibleToasts.find(
        (item) => item.content.type === Type.ParticipantJoined
      )?.content
    ).toMatchObject({ participant: bob, count: 1 })
    batcher.clear()
  })
})
