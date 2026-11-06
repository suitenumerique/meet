import { describe, expect, it, vi } from 'vitest'
import { updateAwayMode } from './awayTransition'

function setup(camera: boolean, microphone: boolean) {
  const room = {}
  const events: string[] = []
  const participant = {
    isCameraEnabled: camera,
    isMicrophoneEnabled: microphone,
    setCameraEnabled: vi.fn(async (enabled: boolean) => {
      events.push(`camera:${enabled}`)
      participant.isCameraEnabled = enabled
    }),
    setMicrophoneEnabled: vi.fn(async (enabled: boolean) => {
      events.push(`microphone:${enabled}`)
      participant.isMicrophoneEnabled = enabled
    }),
  }
  const publish = vi.fn(async (away: boolean) => {
    events.push(`publish:${away}`)
  })
  return { room, participant, publish, events }
}

describe('secure away transitions', () => {
  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])(
    'restores the exact initial state (camera=%s, mic=%s)',
    async (camera, microphone) => {
      const { room, participant, publish, events } = setup(camera, microphone)
      await updateAwayMode(room, participant, false, publish)
      expect(participant.isCameraEnabled).toBe(false)
      expect(participant.isMicrophoneEnabled).toBe(false)
      expect(events.at(-1)).toBe('publish:true')

      await updateAwayMode(room, participant, true, publish)
      expect(participant.isCameraEnabled).toBe(camera)
      expect(participant.isMicrophoneEnabled).toBe(microphone)
      const endPublish = events.indexOf('publish:false')
      expect(events.slice(endPublish + 1)).not.toContain('camera:false')
      expect(events.slice(endPublish + 1)).not.toContain('microphone:false')
    }
  )

  it('does not publish absent status when stopping the camera fails', async () => {
    const { room, participant, publish } = setup(true, true)
    participant.setCameraEnabled.mockRejectedValueOnce(
      new Error('camera failure')
    )
    await expect(
      updateAwayMode(room, participant, false, publish)
    ).rejects.toThrow('camera failure')
    expect(publish).not.toHaveBeenCalled()
    expect(participant.isMicrophoneEnabled).toBe(false)
  })

  it('does not restore devices when the server refuses the return', async () => {
    const { room, participant, publish } = setup(true, true)
    await updateAwayMode(room, participant, false, publish)
    publish.mockRejectedValueOnce(new Error('network failure'))
    await expect(
      updateAwayMode(room, participant, true, publish)
    ).rejects.toThrow('network failure')
    expect(participant.isCameraEnabled).toBe(false)
    expect(participant.isMicrophoneEnabled).toBe(false)
  })

  it('never reactivates capture without an in-memory snapshot', async () => {
    const { room, participant, publish } = setup(false, false)
    await updateAwayMode(room, participant, true, publish)
    expect(participant.setCameraEnabled).not.toHaveBeenCalled()
    expect(participant.setMicrophoneEnabled).not.toHaveBeenCalled()
    expect(publish).toHaveBeenCalledWith(false)
  })

  it('preserves original devices after a failed API call and a successful retry', async () => {
    const { room, participant, publish } = setup(true, false)
    publish.mockRejectedValueOnce(new Error('network offline'))
    await expect(
      updateAwayMode(room, participant, false, publish)
    ).rejects.toThrow('network offline')
    expect(participant.isCameraEnabled).toBe(false)
    expect(participant.isMicrophoneEnabled).toBe(false)

    await updateAwayMode(room, participant, false, publish)
    await updateAwayMode(room, participant, true, publish)
    expect(participant.isCameraEnabled).toBe(true)
    expect(participant.isMicrophoneEnabled).toBe(false)
  })

  it('keeps media stopped if the return API request fails', async () => {
    const { room, participant, publish } = setup(true, true)
    await updateAwayMode(room, participant, false, publish)
    publish.mockRejectedValueOnce(new Error('service unavailable'))
    await expect(
      updateAwayMode(room, participant, true, publish)
    ).rejects.toThrow('service unavailable')
    expect(participant.setCameraEnabled).toHaveBeenCalledTimes(1)
    expect(participant.setMicrophoneEnabled).toHaveBeenCalledTimes(1)
    await updateAwayMode(room, participant, true, publish)
    expect(participant.isCameraEnabled).toBe(true)
    expect(participant.isMicrophoneEnabled).toBe(true)
  })

  it('does not announce away if a device still reports active capture', async () => {
    const { room, participant, publish } = setup(true, true)
    participant.setCameraEnabled.mockImplementationOnce(async () => {
      // A resolved request is not sufficient evidence of an inactive camera.
    })
    await expect(
      updateAwayMode(room, participant, false, publish)
    ).rejects.toThrow('Media capture is still active')
    expect(publish).not.toHaveBeenCalled()
  })

  it('does not reactivate anything after a rejected stop', async () => {
    const { room, participant, publish } = setup(true, true)
    participant.setCameraEnabled.mockRejectedValueOnce(new Error('stop error'))
    await expect(
      updateAwayMode(room, participant, false, publish)
    ).rejects.toThrow('stop error')
    expect(publish).not.toHaveBeenCalled()
    expect(participant.setCameraEnabled).not.toHaveBeenCalledWith(true)
    expect(participant.setMicrophoneEnabled).not.toHaveBeenCalledWith(true)
  })

  it('does not publish absent when the microphone cannot stop', async () => {
    const { room, participant, publish } = setup(true, true)
    participant.setMicrophoneEnabled.mockRejectedValueOnce(
      new Error('mic failure')
    )
    await expect(
      updateAwayMode(room, participant, false, publish)
    ).rejects.toThrow('mic failure')
    expect(publish).not.toHaveBeenCalled()
  })
})

it('retains partial restoration preferences and retries only failed device', async () => {
  const { room, participant, publish } = setup(true, true)
  await updateAwayMode(room, participant, false, publish)
  participant.setCameraEnabled.mockRejectedValueOnce(
    new Error('camera unavailable')
  )
  await expect(
    updateAwayMode(room, participant, true, publish)
  ).rejects.toThrow('camera unavailable')
  expect(participant.isCameraEnabled).toBe(false)
  expect(participant.isMicrophoneEnabled).toBe(true)
  const { hasPendingMediaRestore } = await import('./awayTransition')
  expect(hasPendingMediaRestore(room)).toBe(true)
  await updateAwayMode(room, participant, false, publish)
  expect(participant.isCameraEnabled).toBe(true)
  expect(participant.isMicrophoneEnabled).toBe(true)
  expect(hasPendingMediaRestore(room)).toBe(false)
  expect(publish).toHaveBeenCalledTimes(2)
})
