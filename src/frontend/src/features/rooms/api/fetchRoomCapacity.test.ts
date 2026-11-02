import { expect, test, vi } from 'vitest'
import { fetchRoomCapacity } from './fetchRoomCapacity'
import { getLiveKitAuthHeaders } from '../utils/getLiveKitAuthHeaders'

test('asks for capacity with the LiveKit token scheme', async () => {
  vi.stubGlobal('document', { cookie: '' })
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({ is_full: true })
  )
  vi.stubGlobal('fetch', fetchMock)
  await fetchRoomCapacity({ roomId: 'room-id', token: 'lk-token' })
  const init = fetchMock.mock.calls[0][1] as RequestInit
  expect((init.headers as Record<string, string>).Authorization).toBe(
    getLiveKitAuthHeaders('lk-token').Authorization
  )
})
