import { describe, expect, it } from 'vitest'
import { stripBidiControls, withoutBidiControls } from './stripBidiControls'

describe('stripBidiControls', () => {
  it('removes a right-to-left override, so the text keeps its typed order', () => {
    expect(stripBidiControls('invoice_\u202exslx.exe')).toBe('invoice_xslx.exe')
  })

  it('removes every embedding, override and isolate', () => {
    const controls = '\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069'
    expect(stripBidiControls(`a${controls}b`)).toBe('ab')
  })

  it('keeps right-to-left text itself', () => {
    expect(stripBidiControls('مرحبا hello')).toBe('مرحبا hello')
  })
})

describe('withoutBidiControls', () => {
  it('cleans the message and keeps the other fields', () => {
    const item = { id: '1', timestamp: 42, message: 'invoice_\u202exslx.exe' }
    expect(withoutBidiControls(item)).toEqual({
      id: '1',
      timestamp: 42,
      message: 'invoice_xslx.exe',
    })
  })

  it('returns the same item when there is nothing to remove', () => {
    const item = { id: '1', timestamp: 42, message: 'مرحبا hello' }
    expect(withoutBidiControls(item)).toBe(item)
  })
})
