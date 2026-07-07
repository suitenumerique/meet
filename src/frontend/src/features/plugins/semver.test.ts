import { describe, it, expect } from 'vitest'
import { satisfies } from './semver'

describe('satisfies (caret-only)', () => {
  it('matches the exact floor', () => {
    expect(satisfies('1.0.0', '^1.0.0')).toBe(true)
  })

  it('matches a higher patch/minor within the same major', () => {
    expect(satisfies('1.0.5', '^1.0.0')).toBe(true)
    expect(satisfies('1.4.0', '^1.2.0')).toBe(true)
    expect(satisfies('1.2.9', '^1.2.3')).toBe(true)
  })

  it('rejects a version below the floor within the same major', () => {
    expect(satisfies('1.1.0', '^1.2.0')).toBe(false)
    expect(satisfies('1.2.2', '^1.2.3')).toBe(false)
  })

  it('rejects a different major (both directions)', () => {
    expect(satisfies('2.0.0', '^1.0.0')).toBe(false)
    expect(satisfies('1.9.9', '^2.0.0')).toBe(false)
  })

  it('rejects a non-caret range or an unparseable version', () => {
    expect(satisfies('1.0.0', '1.0.0')).toBe(false)
    expect(satisfies('1.0.0', '~1.0.0')).toBe(false)
    expect(satisfies('1.0.0', '>=1.0.0')).toBe(false)
    expect(satisfies('not-a-version', '^1.0.0')).toBe(false)
  })

  it('tolerates a version with a prerelease/build suffix on the numeric core', () => {
    expect(satisfies('1.2.3-beta.1', '^1.0.0')).toBe(true)
  })
})
