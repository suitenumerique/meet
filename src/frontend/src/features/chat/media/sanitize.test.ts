import { describe, expect, it } from 'vitest'
import { MAX_CAPTION_LENGTH } from './constants'
import { sanitizeCaption, sanitizeDimension } from './sanitize'

describe('sanitizeCaption', () => {
  it('keeps the newlines and tabs the sender sees in their own row', () => {
    expect(sanitizeCaption('line one\nline two\tend')).toBe(
      'line one\nline two\tend'
    )
  })

  it('drops other control characters and bidi overrides', () => {
    const rtlOverride = String.fromCharCode(0x202e)
    const leftIsolate = String.fromCharCode(0x2066)
    expect(
      sanitizeCaption(`a\u0000b\u0007c${rtlOverride}d${leftIsolate}e`)
    ).toBe('abcde')
  })

  it('truncates, and takes nothing that is not a string', () => {
    expect(sanitizeCaption('x'.repeat(MAX_CAPTION_LENGTH + 5))).toHaveLength(
      MAX_CAPTION_LENGTH
    )
    expect(sanitizeCaption(42)).toBe('')
  })
})

describe('sanitizeDimension', () => {
  it('keeps a positive integer and drops anything else', () => {
    expect(sanitizeDimension('640')).toBe(640)
    expect(sanitizeDimension('0')).toBeUndefined()
    expect(sanitizeDimension('-3')).toBeUndefined()
    expect(sanitizeDimension('wide')).toBeUndefined()
  })
})
