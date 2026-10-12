import { describe, expect, it } from 'vitest'
import { stripBidiControls } from './stripBidiControls'

describe('stripBidiControls', () => {
  it('removes a right-to-left override, so the text keeps its typed order', () => {
    expect(stripBidiControls('invoice_‮xslx.exe')).toBe('invoice_xslx.exe')
  })

  it('removes every embedding, override and isolate', () => {
    const controls = '‪‫‬‭‮⁦⁧⁨⁩'
    expect(stripBidiControls(`a${controls}b`)).toBe('ab')
  })

  it('keeps right-to-left text itself', () => {
    expect(stripBidiControls('مرحبا hello')).toBe('مرحبا hello')
  })
})
