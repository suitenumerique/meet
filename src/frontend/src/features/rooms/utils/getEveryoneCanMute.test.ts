import { describe, expect, it } from 'vitest'
import { getEveryoneCanMute } from './getEveryoneCanMute'

describe('getEveryoneCanMute', () => {
  it('defaults to enabled when the setting is missing', () => {
    expect(getEveryoneCanMute(undefined)).toBe(true)
  })

  it('returns the stored boolean as is', () => {
    expect(getEveryoneCanMute(true)).toBe(true)
    expect(getEveryoneCanMute(false)).toBe(false)
  })

  it('treats a stored null as disabled, like the backend does', () => {
    expect(getEveryoneCanMute(null)).toBe(false)
  })
})
