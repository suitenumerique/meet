import { describe, expect, it } from 'vitest'
import { canDetachParticipants } from './canDetachParticipants'

describe('canDetachParticipants', () => {
  it('enables the separate window on a desktop with a mouse', () => {
    expect(canDetachParticipants(false, false)).toBe(true)
  })

  it('hides the control on a mobile browser', () => {
    expect(canDetachParticipants(true, true)).toBe(false)
    expect(canDetachParticipants(true, false)).toBe(false)
  })

  it('hides the control on touch-first tablets', () => {
    expect(canDetachParticipants(false, true)).toBe(false)
  })
})
