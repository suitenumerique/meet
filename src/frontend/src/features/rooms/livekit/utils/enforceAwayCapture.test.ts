import { describe, expect, it, vi } from 'vitest'
import { enforceAwayCapture } from './enforceAwayCapture'

function makeParticipant() {
  const participant = {
    isCameraEnabled: true,
    isMicrophoneEnabled: true,
    setCameraEnabled: vi.fn(async (enabled: boolean) => {
      participant.isCameraEnabled = enabled
    }),
    setMicrophoneEnabled: vi.fn(async (enabled: boolean) => {
      participant.isMicrophoneEnabled = enabled
    }),
  }
  return participant
}

describe('away capture failsafe', () => {
  it('retries one failed camera stop and does not retry already stopped mic', async () => {
    const p = makeParticipant()
    p.setCameraEnabled.mockRejectedValueOnce(
      new Error('temporary camera error')
    )
    await enforceAwayCapture(
      p,
      () => true,
      async () => {}
    )
    expect(p.setCameraEnabled).toHaveBeenCalledTimes(2)
    expect(p.setMicrophoneEnabled).toHaveBeenCalledTimes(1)
    expect(p.isCameraEnabled).toBe(false)
    expect(p.isMicrophoneEnabled).toBe(false)
  })

  it('reports failure after three attempts when capture remains active', async () => {
    const p = makeParticipant()
    p.setCameraEnabled.mockRejectedValue(new Error('camera unavailable'))
    await expect(
      enforceAwayCapture(
        p,
        () => true,
        async () => {}
      )
    ).rejects.toThrow('Unable to stop media capture while away')
    expect(p.setCameraEnabled).toHaveBeenCalledTimes(3)
    expect(p.isCameraEnabled).toBe(true)
  })

  it('stops retrying once the away state is cancelled', async () => {
    const p = makeParticipant()
    let active = true
    p.setCameraEnabled.mockRejectedValueOnce(new Error('camera unavailable'))
    await enforceAwayCapture(
      p,
      () => active,
      async () => {
        active = false
      }
    )
    expect(p.setCameraEnabled).toHaveBeenCalledTimes(1)
  })
})
