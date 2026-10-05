import { fetchApi } from '@/api/fetchApi'

export const fetchRoomCapacity = ({
  roomId,
  token,
}: {
  roomId: string
  token: string
}) => {
  return fetchApi<{ is_full: boolean }>(`rooms/${roomId}/capacity/`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}
