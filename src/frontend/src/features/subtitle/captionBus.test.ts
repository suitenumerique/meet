import { describe, it, expect, beforeEach } from 'vitest'
import {
  captionBus,
  claim,
  currentOwnerId,
  push,
  release,
  type NormalizedCaption,
} from './captionBus'

/** Build a minimal caption; overrides let a test tweak id/text/final. */
const cap = (
  id: string,
  opts: { text?: string; final?: boolean; key?: string } = {}
): NormalizedCaption => ({
  id,
  text: opts.text ?? id,
  final: opts.final ?? false,
  firstReceivedTime: 0,
  lastReceivedTime: 0,
  speaker: { key: opts.key ?? 'alice', name: opts.key ?? 'alice' },
})

const ids = (): string[] => captionBus.stream.map((c) => c.id)
const texts = (): string[] => captionBus.stream.map((c) => c.text)

beforeEach(() => {
  captionBus.owners.splice(0)
  captionBus.stream.splice(0)
})

describe('captionBus claim / currentOwnerId', () => {
  it('claims an idle bus and reports the current owner', () => {
    expect(currentOwnerId()).toBeNull()
    const token = claim('native', { priority: 0 })
    expect(token).not.toBeNull()
    expect(currentOwnerId()).toBe('native')
  })

  it('defaults priority to 10 when omitted', () => {
    claim('a') // priority 10
    // native (0) cannot override a strictly-higher (10) top owner.
    expect(claim('native', { priority: 0 })).toBeNull()
    expect(currentOwnerId()).toBe('a')
  })
})

describe('captionBus priority', () => {
  it('an equal-or-higher priority claim overrides the top owner', () => {
    claim('native', { priority: 0 })
    const token = claim('plugin', { priority: 5 })
    expect(token).not.toBeNull()
    expect(currentOwnerId()).toBe('plugin')
  })

  it('refuses a strictly-lower priority claim (returns null)', () => {
    claim('plugin', { priority: 5 })
    expect(claim('native', { priority: 0 })).toBeNull()
    expect(currentOwnerId()).toBe('plugin')
  })
})

describe('captionBus push gate', () => {
  it('accepts writes from the top owner only', () => {
    const native = claim('native', { priority: 0 })!
    const plugin = claim('plugin', { priority: 5 })!

    // native is no longer the top owner -> ignored
    push(native, [cap('n1')])
    expect(ids()).toEqual([])

    push(plugin, [cap('p1')])
    expect(ids()).toEqual(['p1'])
  })

  it('ignores writes from a stale token after release', () => {
    const token = claim('native', { priority: 0 })!
    release(token)
    push(token, [cap('x')])
    expect(ids()).toEqual([])
  })
})

describe('captionBus dedup / partial→final', () => {
  it('replaces a caption pushed again under the same id', () => {
    const token = claim('native', { priority: 0 })!
    push(token, [cap('s1', { text: 'hel' })])
    push(token, [cap('s1', { text: 'hello' })])
    expect(ids()).toEqual(['s1'])
    expect(texts()).toEqual(['hello'])
  })

  it('upgrades a seen partial to its final version in place', () => {
    const token = claim('native', { priority: 0 })!
    push(token, [cap('s1', { text: 'partial', final: false })])
    push(token, [cap('s2', { text: 'next', final: false })])
    push(token, [cap('s1', { text: 'final', final: true })])
    expect(ids()).toEqual(['s1', 's2'])
    expect(captionBus.stream[0]).toMatchObject({ text: 'final', final: true })
  })
})

describe('captionBus stream reset', () => {
  it('resets the stream when a new owner claims', () => {
    const native = claim('native', { priority: 0 })!
    push(native, [cap('n1')])
    expect(ids()).toEqual(['n1'])

    claim('plugin', { priority: 5 })
    expect(ids()).toEqual([])
  })

  it('keeps the stream when a non-top owner releases', () => {
    const native = claim('native', { priority: 0 })!
    const plugin = claim('plugin', { priority: 5 })!
    push(plugin, [cap('p1')])

    release(native)
    expect(ids()).toEqual(['p1'])
    expect(currentOwnerId()).toBe('plugin')
  })

  it('resets the stream on release so the owner below resumes clean', () => {
    const native = claim('native', { priority: 0 })!
    const plugin = claim('plugin', { priority: 5 })!
    push(plugin, [cap('p1')])
    expect(ids()).toEqual(['p1'])

    release(plugin)
    expect(ids()).toEqual([])
    expect(currentOwnerId()).toBe('native')

    // native resumes as the top owner and can push again
    push(native, [cap('n1')])
    expect(ids()).toEqual(['n1'])
  })
})
