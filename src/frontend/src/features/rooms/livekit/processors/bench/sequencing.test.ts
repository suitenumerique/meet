import { describe, expect, test, vi } from 'vitest'
import { BenchAbortError, initThenAttach, raceAbort } from './sequencing'

describe('initThenAttach', () => {
  test('initialises the processor before attaching the source', async () => {
    // Processors register their `loadeddata` handler at the end of init(),
    // so attaching the source first means the event fires before anyone is
    // listening and their render loop never starts. livekit's setProcessor
    // orders it this way for the same reason.
    const calls: string[] = []

    await initThenAttach({
      init: async () => {
        calls.push('init')
      },
      attach: () => {
        calls.push('attach')
      },
      play: async () => {
        calls.push('play')
      },
    })

    expect(calls).toEqual(['init', 'attach', 'play'])
  })

  test('never attaches the source when init fails', async () => {
    const attach = vi.fn()

    await expect(
      initThenAttach({
        init: async () => {
          throw new Error('model download failed')
        },
        attach,
        play: async () => {},
      })
    ).rejects.toThrow('model download failed')

    expect(attach).not.toHaveBeenCalled()
  })
})

describe('raceAbort', () => {
  test('resolves with the value when the signal never aborts', async () => {
    const controller = new AbortController()

    await expect(
      raceAbort(Promise.resolve('done'), controller.signal)
    ).resolves.toBe('done')
  })

  test('rejects as soon as the signal aborts, even if the promise never settles', async () => {
    const controller = new AbortController()
    const neverSettles = new Promise<string>(() => {})

    const raced = raceAbort(neverSettles, controller.signal)
    controller.abort()

    await expect(raced).rejects.toBeInstanceOf(BenchAbortError)
  })

  test('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      raceAbort(Promise.resolve('done'), controller.signal)
    ).rejects.toBeInstanceOf(BenchAbortError)
  })

  test('resolves normally when no signal is supplied', async () => {
    await expect(raceAbort(Promise.resolve('done'), undefined)).resolves.toBe(
      'done'
    )
  })
})
