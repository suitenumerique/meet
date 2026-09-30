import { describe, expect, it } from 'vitest'
import { normalizeRoomId } from './isRoomValid'

describe('normalizeRoomId', () => {
  it('lowercases and re-inserts the hyphens of a ten-letter id', () => {
    expect(normalizeRoomId('ABCDEFGHIJ')).toBe('abc-defg-hij')
    expect(normalizeRoomId('abc-defghij')).toBe('abc-defg-hij')
  })

  it('returns any other input unchanged', () => {
    expect(normalizeRoomId('abc-def')).toBe('abc-def')
    expect(normalizeRoomId('Not-A-Room')).toBe('Not-A-Room')
  })
})
