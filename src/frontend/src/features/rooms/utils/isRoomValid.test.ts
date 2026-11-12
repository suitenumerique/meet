import { describe, expect, it } from 'vitest'
import { extractRoomId, normalizeRoomId } from './isRoomValid'

describe('extractRoomId', () => {
  const origin = 'https://meet.example.com'

  const plain = { roomId: 'abc-defg-hij', suffix: '' }

  it('accepts a bare room id', () => {
    expect(extractRoomId('abc-defg-hij', origin)).toEqual(plain)
    expect(extractRoomId('  abc-defg-hij  ', origin)).toEqual(plain)
  })

  it('accepts a meeting URL on this origin', () => {
    expect(extractRoomId(`${origin}/abc-defg-hij`, origin)).toEqual(plain)
    expect(extractRoomId(`${origin}/abc-defg-hij/`, origin)).toEqual(plain)
  })

  it('keeps query strings and fragments in the suffix', () => {
    expect(
      extractRoomId(`${origin}/abc-defg-hij?from=outlook-addin`, origin)
    ).toEqual({ roomId: 'abc-defg-hij', suffix: '?from=outlook-addin' })
    expect(
      extractRoomId(
        `${origin}/abc-defg-hij/?utm_source=mail&utm_medium=email#x`,
        origin
      )
    ).toEqual({
      roomId: 'abc-defg-hij',
      suffix: '?utm_source=mail&utm_medium=email#x',
    })
  })

  it('rejects other origins and invalid ids', () => {
    expect(
      extractRoomId('https://evil.example/abc-defg-hij', origin)
    ).toBeNull()
    expect(extractRoomId(`${origin}/not-a-room`, origin)).toBeNull()
    expect(extractRoomId(`${origin}/abc-defg-hij/extra`, origin)).toBeNull()
    expect(extractRoomId('abc-defg-hij?from=x', origin)).toBeNull()
  })
})

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
