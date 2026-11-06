import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUpdateAwayStatus } from './updateAwayStatus'

const { fetchApi, getRoomData } = vi.hoisted(() => ({
  fetchApi: vi.fn(),
  getRoomData: vi.fn(),
}))

vi.mock('@/api/fetchApi', () => ({ fetchApi }))
vi.mock('@/features/rooms/livekit/hooks/useRoomData', () => ({
  useRoomData: getRoomData,
}))

describe('away-status API requests', () => {
  beforeEach(() => {
    fetchApi.mockReset().mockResolvedValue({ status: 'success' })
    getRoomData.mockReset()
  })

  it('uses the UUID of a registered room', async () => {
    getRoomData.mockReturnValue({
      id: 'registered-uuid',
      slug: 'caf-paus-oui',
      livekit: { token: 'test-token' },
    })
    await useUpdateAwayStatus().updateAwayStatus(true)
    expect(fetchApi).toHaveBeenCalledWith(
      'rooms/registered-uuid/set-away-status/',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ away: true }),
      })
    )
  })

  it('uses the slug for a spontaneous unregistered room', async () => {
    getRoomData.mockReturnValue({
      id: null,
      slug: 'caf-paus-test',
      livekit: { token: 'test-token' },
    })
    await useUpdateAwayStatus().updateAwayStatus(false)
    expect(fetchApi).toHaveBeenCalledWith(
      'rooms/caf-paus-test/set-away-status/',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ away: false }),
      })
    )
  })

  it('rejects requests without a token', async () => {
    getRoomData.mockReturnValue({ id: null, slug: 'caf-paus-test' })
    await expect(useUpdateAwayStatus().updateAwayStatus(true)).rejects.toThrow(
      'Room authentication unavailable'
    )
    expect(fetchApi).not.toHaveBeenCalled()
  })
})
