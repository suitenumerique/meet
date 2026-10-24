import { describe, expect, it, vi } from 'vitest'
import { reportError } from '@/features/analytics/telemetry'
import { type PreviewTrack, toggleTrack } from './toggleTrack'

vi.mock('@/features/analytics/telemetry', () => ({ reportError: vi.fn() }))

const fakeTrack = (overrides: Partial<Record<'mute' | 'unmute', unknown>>) =>
  ({
    mute: vi.fn().mockResolvedValue(undefined),
    unmute: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as PreviewTrack

describe('toggleTrack', () => {
  it('resolves to false once an enabled track is muted', async () => {
    const save = vi.fn()
    const track = fakeTrack({})

    await expect(toggleTrack(true, save, track)()).resolves.toBe(false)
    expect(track.mute).toHaveBeenCalled()
    expect(save).toHaveBeenCalledWith(false)
  })

  it('resolves to true once a disabled track is unmuted', async () => {
    const save = vi.fn()
    const track = fakeTrack({})

    await expect(toggleTrack(false, save, track)()).resolves.toBe(true)
    expect(track.unmute).toHaveBeenCalled()
    expect(save).toHaveBeenCalledWith(true)
  })

  it('resolves to the initial state when the track fails to toggle', async () => {
    const save = vi.fn()
    const error = new Error('mute failed')
    const track = fakeTrack({ mute: vi.fn().mockRejectedValue(error) })

    await expect(toggleTrack(true, save, track)()).resolves.toBe(true)
    expect(save.mock.calls).toEqual([[false], [true]])
    expect(reportError).toHaveBeenCalledWith('join_preview_failure', error, {
      path: 'join_preview',
    })
  })

  it('resolves to the requested state when there is no track', async () => {
    const save = vi.fn()

    await expect(toggleTrack(false, save)()).resolves.toBe(true)
    expect(save).toHaveBeenCalledWith(true)
  })
})
