import { fetchApi } from '@/api/fetchApi'

export type ApiParticipants = {
  count: number
  names: string[]
}

export const fetchParticipants = ({
  roomId,
  names,
}: {
  roomId: string
  names: number
}) => fetchApi<ApiParticipants>(`/rooms/${roomId}/participants/?names=${names}`)
