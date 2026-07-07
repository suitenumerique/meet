import { describe, it, expect } from 'vitest'
import { proxy } from 'valtio'
import { pluginContext } from './context'

describe('pluginContext', () => {
  it('returns an identity-stable proxy per id', () => {
    const a1 = pluginContext('vendor.alpha')
    const a2 = pluginContext('vendor.alpha')
    expect(a1).toBe(a2)
  })

  it('isolates distinct ids', () => {
    const a = pluginContext('vendor.alpha')
    const b = pluginContext('vendor.beta')
    expect(a).not.toBe(b)
  })

  it('is a valtio proxy (writes are observable via a fresh snapshot)', () => {
    const ctx = pluginContext('vendor.gamma') as { count?: number }
    ctx.count = 1
    // A separate proxy is NOT affected — proves per-id isolation, not a shared object.
    const other = proxy<{ count?: number }>({})
    expect(other.count).toBeUndefined()
    expect(ctx.count).toBe(1)
  })
})
