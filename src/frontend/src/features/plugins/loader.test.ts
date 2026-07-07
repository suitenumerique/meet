import { describe, it, expect, beforeEach, vi } from 'vitest'

// Control the runtime env channel without the real getEnv/window plumbing.
const env = vi.hoisted(() => ({ value: undefined as string | undefined }))
vi.mock('@/utils/getEnv', () => ({ getEnv: () => env.value }))

// Stub the host so importing the loader doesn't pull the whole host graph
// (react-dom/primitives/livekit) into this pure unit test.
vi.mock('./host', () => ({
  HOST_API_VERSION: '1.0.0',
  HOST_PEERS: {
    react: '18',
    'livekit-client': '2',
    '@livekit/components-react': '2',
    valtio: '2',
  },
  buildHost: vi.fn(),
  publishHostGlobals: vi.fn(),
}))

import { parseRefs, isCompatible, type PluginBundleRef } from './loader'

const ref = (over: Partial<PluginBundleRef> = {}): PluginBundleRef => ({
  id: 'vendor.plugin',
  url: 'https://cdn.example/plugin.umd.js',
  apiVersion: '1.0.0',
  ...over,
})

beforeEach(() => {
  env.value = undefined
})

describe('parseRefs', () => {
  it('returns [] when the env var is unset', () => {
    expect(parseRefs()).toEqual([])
  })

  it('returns [] on malformed JSON', () => {
    env.value = '{not json'
    expect(parseRefs()).toEqual([])
  })

  it('returns [] when the JSON is not an array', () => {
    env.value = '{"id":"x"}'
    expect(parseRefs()).toEqual([])
  })

  it('parses a valid array of refs', () => {
    const refs = [ref(), ref({ id: 'vendor.other' })]
    env.value = JSON.stringify(refs)
    expect(parseRefs()).toEqual(refs)
  })
})

describe('isCompatible', () => {
  it('accepts a ref whose apiVersion the host satisfies', () => {
    expect(isCompatible(ref({ apiVersion: '1.0.0' }))).toBe(true)
  })

  it('rejects a ref requiring a newer host apiVersion', () => {
    expect(isCompatible(ref({ apiVersion: '1.1.0' }))).toBe(false)
    expect(isCompatible(ref({ apiVersion: '2.0.0' }))).toBe(false)
  })

  it('accepts matching peer majors', () => {
    expect(isCompatible(ref({ peers: { react: '18', valtio: '2' } }))).toBe(true)
  })

  it('rejects a mismatched peer major', () => {
    expect(isCompatible(ref({ peers: { react: '17' } }))).toBe(false)
  })

  it('ignores peers the host does not know about', () => {
    expect(isCompatible(ref({ peers: { 'some-lib': '9' } }))).toBe(true)
  })
})
