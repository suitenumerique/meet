import { describe, expect, it, vi } from 'vitest'
import { buildSdkRoomData } from './buildSdkRoomData'

vi.mock('@/navigation/getRouteUrl', () => ({
  getRouteUrl: (_: string, slug: string) => `https://meet.example.com/${slug}`,
}))

describe('buildSdkRoomData', () => {
  const slug = 'abc-defg-hij'
  const url = `https://meet.example.com/${slug}`
  const telephony = {
    enabled: true,
    internationalPhoneNumber: '+33 1 23 45 67 89',
  }

  it('returns the slug and the room url', () => {
    expect(buildSdkRoomData({ slug })).toEqual({ slug, url })
  })

  it('adds the phone number and pin code when telephony is enabled', () => {
    expect(
      buildSdkRoomData({ slug, pin_code: '1234567890' }, telephony)
    ).toEqual({ slug, url, phone: '+33 1 23 45 67 89', code: '1234567890' })
  })

  it('leaves telephony out when it is disabled', () => {
    expect(
      buildSdkRoomData(
        { slug, pin_code: '1234567890' },
        { ...telephony, enabled: false }
      )
    ).toEqual({ slug, url })
  })

  it('leaves telephony out without a pin code or a phone number', () => {
    expect(buildSdkRoomData({ slug }, telephony)).toEqual({ slug, url })
    expect(
      buildSdkRoomData({ slug, pin_code: '1234567890' }, { enabled: true })
    ).toEqual({ slug, url })
  })

  it('never forwards the raw pin_code field', () => {
    const data = buildSdkRoomData({ slug, pin_code: '1234567890' }, telephony)
    expect(data).not.toHaveProperty('pin_code')
  })
})
