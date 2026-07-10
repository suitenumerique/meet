import { describe, it, expect, beforeEach } from 'vitest'
import { bannerStore, showBanner, hideBanner } from './bannerStore'

const ids = (): string[] => bannerStore.banners.map((b) => b.id)

beforeEach(() => {
  bannerStore.banners.splice(0)
})

describe('bannerStore show / hide', () => {
  it('shows a banner and lists it', () => {
    expect(ids()).toEqual([])
    showBanner('a', { text: 'hello' })
    expect(ids()).toEqual(['a'])
    expect(bannerStore.banners[0]).toMatchObject({ id: 'a', text: 'hello' })
  })

  it('carries icon and tone through', () => {
    showBanner('a', { text: 'hi', icon: 'speech_to_text', tone: 'danger' })
    expect(bannerStore.banners[0]).toMatchObject({
      icon: 'speech_to_text',
      tone: 'danger',
    })
  })

  it('carries an optional producer-supplied testId through', () => {
    showBanner('a', { text: 'hi', testId: 'acme-banner' })
    expect(bannerStore.banners[0]).toMatchObject({ testId: 'acme-banner' })
  })

  it('leaves testId undefined when the producer omits it', () => {
    showBanner('a', { text: 'hi' })
    expect(bannerStore.banners[0].testId).toBeUndefined()
  })

  it('hides a banner by id', () => {
    showBanner('a', { text: 'hello' })
    hideBanner('a')
    expect(ids()).toEqual([])
  })

  it('hide is a no-op for an unknown id', () => {
    showBanner('a', { text: 'hello' })
    hideBanner('nope')
    expect(ids()).toEqual(['a'])
  })
})

describe('bannerStore dedup by id', () => {
  it('replaces content in place when re-showing the same id', () => {
    showBanner('a', { text: 'first' })
    showBanner('a', { text: 'second', tone: 'info' })
    expect(ids()).toEqual(['a'])
    expect(bannerStore.banners[0]).toMatchObject({
      text: 'second',
      tone: 'info',
    })
  })

  it('keeps distinct ids as separate entries', () => {
    showBanner('a', { text: 'A' })
    showBanner('b', { text: 'B' })
    expect(ids()).toEqual(['a', 'b'])
  })
})
