import { describe, expect, it, vi } from 'vitest'
import { startAwaySafePreview } from './awayPreview'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function fakeTrack() {
  return { attach: vi.fn(), detach: vi.fn(), stop: vi.fn() }
}

describe('camera preview lifecycle', () => {
  it('stops late camera acquisition after entering away mode or unmount', async () => {
    const acquisition = deferred<ReturnType<typeof fakeTrack>>()
    const element = {} as HTMLVideoElement
    const dispose = startAwaySafePreview(element, () => acquisition.promise)
    dispose()
    const track = fakeTrack()
    acquisition.resolve(track)
    await acquisition.promise
    await Promise.resolve()
    expect(track.stop).toHaveBeenCalledOnce()
    expect(track.attach).not.toHaveBeenCalled()
  })

  it('detaches and stops an acquired preview on cleanup', async () => {
    const element = {} as HTMLVideoElement
    const track = fakeTrack()
    const dispose = startAwaySafePreview(element, async () => track)
    await Promise.resolve()
    expect(track.attach).toHaveBeenCalledWith(element)
    dispose()
    expect(track.detach).toHaveBeenCalledOnce()
    expect(track.stop).toHaveBeenCalledOnce()
  })
})
