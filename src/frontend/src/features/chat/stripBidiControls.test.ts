import { describe, expect, it } from 'vitest'
import { stripBidiControls } from './stripBidiControls'

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
